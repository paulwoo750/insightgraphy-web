-- STEP 25: push notifications for the member phone app.
--
--   devices      ig_private.push_subscriptions: one row per phone (web push endpoint + keys),
--                saved by the logged-in member through public.member_save_push_subscription().
--   preferences  ig_private.push_prefs: per account, which kinds to receive
--                (attendance, deadline, best, record). Everything is on by default.
--   outbox       ig_private.push_outbox: one row per person per notification. dedupe_key makes every
--                notification go out at most once.
--   cycle        ig_private.run_push_cycle(), every 5 minutes with pg_cron:
--                  · 출석 열림 (attendance_start) and 지각 10분 전 (session_start) — only to members
--                    without an attendance record for that week
--                  · 기획서·슬라이드·영상 마감 하루 전·3시간 전 — only to members who have not submitted
--                  · 기획서 피드백·정성 피드백·셀프 피드백 마감 3시간 전 — to everyone in the semester
--                  · 벌금 부과, 사유서 결재 결과 — from triggers on pr_fines / absence_forms (the
--                    triggers only append to ig_private.push_events and never block the original write)
--                then calls the site (pg_net) at /api/push/send, which sends the outbox with the VAPID
--                key kept in the hosting environment.
--   best         public.admin_queue_best_presenter_push(week, winners): the admin vote page button.
--
-- Site URL and the shared secret are set after this step, in the SQL Editor only:
--   select ig_private.set_push_config('https://insightgraphy.org', '<PUSH_CRON_SECRET>');
-- The same secret goes into the hosting environment as PUSH_CRON_SECRET.
--
-- Existing tables only get two AFTER triggers. No existing rows are changed. Safe to re-run.

begin;

select pg_advisory_xact_lock(hashtextextended('insightgraphy-step-25', 0));

do $$
declare
  missing text;
begin
  select string_agg(t, ', ')
  into missing
  from unnest(array['members', 'semesters', 'pr_config', 'pr_deadlines', 'pr_attendance', 'pr_fines', 'absence_forms', 'files_metadata']) t
  where to_regclass('public.' || t) is null;
  if missing is not null then
    raise exception 'STEP 25: table(s) not found: %', missing;
  end if;
  if to_regprocedure('ig_private.attendance_setup(uuid)') is null then
    raise exception 'STEP 25: run STEP 24 first (ig_private.attendance_setup not found).';
  end if;
  if to_regprocedure('public.is_admin(text[])') is null then
    raise exception 'STEP 25: public.is_admin(text[]) not found. Run STEP 7 first.';
  end if;
end;
$$;

create schema if not exists ig_private;
revoke all on schema ig_private from public;

-- 1. 저장소 ------------------------------------------------------------------
create table if not exists ig_private.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  platform text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  failures integer not null default 0
);
create index if not exists push_subscriptions_user_idx on ig_private.push_subscriptions (user_id);

create table if not exists ig_private.push_prefs (
  user_id uuid primary key,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists ig_private.push_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  kind text not null,
  dedupe_key text not null unique,
  title text not null,
  body text not null,
  url text not null default '/app',
  tag text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error text
);
create index if not exists push_outbox_pending_idx on ig_private.push_outbox (created_at) where sent_at is null;

create table if not exists ig_private.push_events (
  id bigint generated always as identity primary key,
  kind text not null,
  member_id uuid,
  user_name text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists push_events_pending_idx on ig_private.push_events (created_at) where processed_at is null;

create table if not exists ig_private.push_config (
  id integer primary key default 1 check (id = 1),
  site_url text,
  secret text,
  last_cycle_at timestamptz,
  last_cycle_note text,
  updated_at timestamptz not null default now()
);
insert into ig_private.push_config (id) values (1) on conflict (id) do nothing;

revoke all on all tables in schema ig_private from public;

-- 2. 도움 함수 ---------------------------------------------------------------
-- 사이트 주소와 발송 비밀값 저장 (SQL Editor에서만)
create or replace function ig_private.set_push_config(p_site_url text, p_secret text)
returns text
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(p_site_url, '') !~ '^https?://[^/]+' then
    raise exception '사이트 주소는 https://로 시작해야 합니다';
  end if;
  if char_length(coalesce(p_secret, '')) < 24 then
    raise exception '비밀값은 24자 이상이어야 합니다 (.env.local의 PUSH_CRON_SECRET)';
  end if;
  update ig_private.push_config
  set site_url = rtrim(p_site_url, '/'), secret = p_secret, updated_at = now()
  where id = 1;
  return '알림 발송 설정을 저장했습니다';
end;
$$;

-- 알림 받을 학회원: 운영 학기 활동 학회원 중 기기를 등록한 사람 (학기 명단이 있으면 명단 기준)
create or replace function ig_private.push_recipients(p_semester_id uuid)
returns table (user_id uuid, member_id uuid, name text)
language sql
stable
set search_path = ''
as $$
  select m.auth_user_id, m.id, m.name
  from public.members m
  where m.auth_user_id is not null
    and m.status = 'active'
    and exists (select 1 from ig_private.push_subscriptions s where s.user_id = m.auth_user_id)
    and (
      not exists (select 1 from public.semester_memberships sm where sm.semester_id = p_semester_id)
      or exists (
        select 1 from public.semester_memberships sm
        where sm.semester_id = p_semester_id and sm.member_id = m.id and sm.participation_status = 'active'
      )
    )
$$;

create or replace function ig_private.queue_push(p_user_id uuid, p_kind text, p_dedupe text, p_title text, p_body text, p_url text, p_tag text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  added integer;
begin
  insert into ig_private.push_outbox (user_id, kind, dedupe_key, title, body, url, tag)
  values (p_user_id, p_kind, p_dedupe, left(p_title, 120), left(p_body, 300), coalesce(p_url, '/app'), p_tag)
  on conflict (dedupe_key) do nothing;
  get diagnostics added = row_count;
  return added;
end;
$$;

create or replace function ig_private.kst_label(p_at timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_at at time zone 'Asia/Seoul', 'FMMM.FMDD HH24:MI')
$$;

create or replace function ig_private.deadline_label(p_category text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_category
    when 'proposal' then '기획서'
    when 'slide' then '슬라이드'
    when 'video' then '발표영상'
    when 'proposal_comment' then '기획서 피드백'
    when 'vote_feedback' then '정성 피드백'
    when 'video_comment' then '셀프 피드백'
    else p_category
  end
$$;

-- 그 주차에 이 학회원(또는 팀)이 낸 제출물이 있나
create or replace function ig_private.has_submitted(p_semester_code text, p_setup jsonb, p_week integer, p_category text, p_member_id uuid, p_name text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.files_metadata f
    cross join lateral (
      select case when p_setup -> p_week::text ->> 'evalMode' = 'team'
        then coalesce(p_setup -> p_week::text -> 'memberTeams' ->> p_name, p_setup -> p_week::text -> 'members' ->> p_name) end as team
    ) t
    where f.semester = p_semester_code
      and f.week = p_week
      and (case when f.file_category = 'plan' then 'proposal' else f.file_category end) = p_category
      and (
        f.uploader_member_id = p_member_id
        or f.uploader = p_name
        or (t.team is not null and f.uploader in ('Team ' || t.team, 'Team #' || t.team))
      )
  )
$$;

-- 3. 알림 만들기 (5분마다) ----------------------------------------------------
create or replace function ig_private.queue_due_pushes()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  sem public.semesters%rowtype;
  setup jsonb;
  total integer := 0;
  d record;
  r record;
  e record;
begin
  select * into sem from public.semesters s where s.status = 'active' order by s.code desc limit 1;

  if sem.id is not null then
    setup := ig_private.attendance_setup(sem.id);

    -- 주차별 마감 (이 학기 행 우선)
    for d in
      select distinct on (x.week, x.category) x.week, x.category, x.deadline_time as at
      from public.pr_deadlines x
      where (x.semester_id = sem.id or x.semester_id is null)
        and x.week is not null and x.deadline_time is not null
        and x.deadline_time between now() - interval '15 minutes' and now() + interval '24 hours'
      order by x.week, x.category, (x.semester_id is null)
    loop
      -- 출석 열림 (열린 뒤 15분 안)
      if d.category = 'attendance_start' and d.at <= now() then
        for r in select * from ig_private.push_recipients(sem.id) p
          where not exists (
            select 1 from public.pr_attendance a
            where a.week = d.week and coalesce(a.session_type, 'regular') = 'regular'
              and (a.member_id = p.member_id or (a.member_id is null and a.user_name = p.name))
              and (a.semester_id = sem.id or (a.semester_id is null and a.semester = sem.code))
          )
        loop
          total := total + ig_private.queue_push(r.user_id, 'attendance', format('att-open:%s:%s:%s', sem.id, d.week, r.user_id),
            '📍 출석이 열렸어요', format('W%s 세션 출석을 지금 할 수 있어요. 눌러서 출석하기', d.week), '/app/attendance', 'attendance');
        end loop;
      -- 지각 10분 전 (출석이 열려 있을 때)
      elsif d.category = 'session_start' and d.at > now() and d.at <= now() + interval '10 minutes' then
        for r in select * from ig_private.push_recipients(sem.id) p
          where exists (
            select 1 from public.pr_deadlines o
            where o.week = d.week and o.category = 'attendance_start' and o.deadline_time <= now()
              and (o.semester_id = sem.id or o.semester_id is null)
          )
          and not exists (
            select 1 from public.pr_attendance a
            where a.week = d.week and coalesce(a.session_type, 'regular') = 'regular'
              and (a.member_id = p.member_id or (a.member_id is null and a.user_name = p.name))
              and (a.semester_id = sem.id or (a.semester_id is null and a.semester = sem.code))
          )
        loop
          total := total + ig_private.queue_push(r.user_id, 'attendance', format('att-late:%s:%s:%s', sem.id, d.week, r.user_id),
            '⏰ 곧 지각 처리돼요', format('%s부터 지각이에요. 아직 출석 전이라면 지금 눌러 주세요.', to_char(d.at at time zone 'Asia/Seoul', 'HH24:MI')), '/app/attendance', 'attendance');
        end loop;
      -- 제출 마감: 하루 전(3시간보다 많이 남았을 때)·3시간 전, 안 낸 사람만
      elsif d.category in ('proposal', 'slide', 'video') and d.at > now() then
        for r in select * from ig_private.push_recipients(sem.id) p
          where not ig_private.has_submitted(sem.code, setup, d.week, d.category, p.member_id, p.name)
        loop
          if d.at > now() + interval '3 hours' then
            total := total + ig_private.queue_push(r.user_id, 'deadline', format('dl24:%s:%s:%s:%s', sem.id, d.week, d.category, r.user_id),
              format('📝 W%s %s 마감 하루 전', d.week, ig_private.deadline_label(d.category)),
              format('%s까지예요. 아직 안 냈다면 미리 올려 주세요.', ig_private.kst_label(d.at)),
              format('/dashboard/%s?week=%s', d.category, d.week), 'deadline');
          else
            total := total + ig_private.queue_push(r.user_id, 'deadline', format('dl3:%s:%s:%s:%s', sem.id, d.week, d.category, r.user_id),
              format('🔥 W%s %s 마감 3시간 전', d.week, ig_private.deadline_label(d.category)),
              format('%s까지예요. 아직 안 냈다면 지금 올려 주세요.', ig_private.kst_label(d.at)),
              format('/dashboard/%s?week=%s', d.category, d.week), 'deadline');
          end if;
        end loop;
      -- 피드백 마감 3시간 전: 모두에게
      elsif d.category in ('proposal_comment', 'vote_feedback', 'video_comment') and d.at > now() and d.at <= now() + interval '3 hours' then
        for r in select * from ig_private.push_recipients(sem.id) loop
          total := total + ig_private.queue_push(r.user_id, 'deadline', format('fb3:%s:%s:%s:%s', sem.id, d.week, d.category, r.user_id),
            format('💬 W%s %s 마감 3시간 전', d.week, ig_private.deadline_label(d.category)),
            format('%s까지예요. 아직 안 했다면 지금 남겨 주세요.', ig_private.kst_label(d.at)),
            case d.category when 'vote_feedback' then format('/vote/feedback?week=%s', d.week)
              when 'proposal_comment' then format('/dashboard/proposal?week=%s', d.week)
              else format('/dashboard/video?week=%s', d.week) end,
            'deadline');
        end loop;
      end if;
    end loop;
  end if;

  -- 벌금: 학회원별로 묶어서 한 번 (최근 2일 안에 생긴 것만)
  for e in
    select coalesce(ev.member_id, m.id) as member_id,
      max(ev.id) as last_id,
      count(*) as n,
      sum(coalesce((ev.payload ->> 'amount')::numeric, 0)) as amount,
      (array_agg(ev.payload order by ev.id))[1] as first_payload
    from ig_private.push_events ev
    left join lateral (
      select mm.id from public.members mm
      where ev.member_id is null and mm.name = ev.user_name
      limit 1
    ) m on true
    where ev.kind = 'fine' and ev.processed_at is null and ev.created_at > now() - interval '2 days'
    group by coalesce(ev.member_id, m.id)
  loop
    for r in select mm.auth_user_id as user_id from public.members mm where mm.id = e.member_id and mm.auth_user_id is not null loop
      total := total + ig_private.queue_push(r.user_id, 'record', format('fine:%s:%s', e.last_id, r.user_id),
        '💸 벌금이 부과됐어요',
        case when e.n = 1
          then format('W%s %s ₩%s', coalesce(e.first_payload ->> 'week', '?'), coalesce(e.first_payload ->> 'category', '벌금'), to_char(e.amount, 'FM999,999,999'))
          else format('%s건 · 합계 ₩%s', e.n, to_char(e.amount, 'FM999,999,999')) end,
        '/app/me', 'record');
    end loop;
  end loop;

  -- 사유서 결재 결과: 한 건마다
  for e in
    select ev.*, coalesce(ev.member_id, (select mm.id from public.members mm where mm.name = ev.user_name limit 1)) as resolved_member
    from ig_private.push_events ev
    where ev.kind = 'absence' and ev.processed_at is null and ev.created_at > now() - interval '2 days'
  loop
    for r in select mm.auth_user_id as user_id from public.members mm where mm.id = e.resolved_member and mm.auth_user_id is not null loop
      total := total + ig_private.queue_push(r.user_id, 'record', format('absence:%s:%s', e.id, r.user_id),
        '📮 사유서 결재가 끝났어요',
        format('W%s %s 사유서: %s', coalesce(e.payload ->> 'week', '?'), coalesce(e.payload ->> 'type', ''), coalesce(e.payload ->> 'status', '')),
        '/app/me', 'record');
    end loop;
  end loop;

  update ig_private.push_events set processed_at = now() where processed_at is null;
  return total;
end;
$$;

-- 4. 5분마다 실행: 알림을 만들고, 보낼 것이 있으면 사이트의 발송 주소를 부른다
create or replace function ig_private.run_push_cycle()
returns text
language plpgsql
set search_path = ''
as $$
declare
  cfg ig_private.push_config%rowtype;
  queued integer := 0;
  pending integer;
  note text;
begin
  begin
    queued := ig_private.queue_due_pushes();
  exception when others then
    note := 'queue error: ' || sqlerrm;
  end;

  select count(*) into pending from ig_private.push_outbox where sent_at is null and attempts < 3 and created_at > now() - interval '1 day';
  select * into cfg from ig_private.push_config where id = 1;

  if pending > 0 then
    if cfg.site_url is null or cfg.secret is null then
      note := concat_ws(' / ', note, 'not configured (set_push_config)');
    elsif to_regnamespace('net') is null then
      note := concat_ws(' / ', note, 'pg_net not enabled');
    else
      begin
        execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 20000)'
          using cfg.site_url || '/api/push/send', '{}'::jsonb, jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', cfg.secret);
        note := concat_ws(' / ', note, format('called site (%s pending)', pending));
      exception when others then
        note := concat_ws(' / ', note, 'http error: ' || sqlerrm);
      end;
    end if;
  end if;

  update ig_private.push_config
  set last_cycle_at = now(), last_cycle_note = coalesce(note, format('ok (queued %s)', queued))
  where id = 1;
  return coalesce(note, format('ok (queued %s)', queued));
end;
$$;

-- 5. 벌금·사유서 기록이 생기면 알림 재료만 남긴다 (원래 저장은 절대 막지 않는다)
create or replace function ig_private.on_fine_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.voided_at is null and not coalesce(new.is_paid, false) and coalesce(new.amount, 0) > 0 then
      insert into ig_private.push_events (kind, member_id, user_name, payload)
      values ('fine', new.member_id, new.user_name, jsonb_build_object('week', new.week, 'category', new.category, 'amount', new.amount));
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;

create or replace function ig_private.on_absence_resolved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if coalesce(old.status, '대기') = '대기' and coalesce(new.status, '대기') <> '대기' then
      insert into ig_private.push_events (kind, member_id, user_name, payload)
      values ('absence', new.member_id, new.user_name, jsonb_build_object('week', new.week, 'type', new.type, 'status', new.status));
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists ig_push_fine_event on public.pr_fines;
create trigger ig_push_fine_event after insert on public.pr_fines
for each row execute function ig_private.on_fine_insert();

drop trigger if exists ig_push_absence_event on public.absence_forms;
create trigger ig_push_absence_event after update of status on public.absence_forms
for each row execute function ig_private.on_absence_resolved();

revoke all on all functions in schema ig_private from public;

-- 6. 학회원 앱이 부르는 함수 ---------------------------------------------------
create or replace function public.member_save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_platform text default null, p_user_agent text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'LOGIN_REQUIRED';
  end if;
  if not exists (select 1 from public.members m where m.auth_user_id = auth.uid() and m.status in ('active', 'leave', 'inactive', 'alumni')) then
    raise exception 'NOT_MEMBER';
  end if;
  if coalesce(p_endpoint, '') !~ '^https://' or char_length(p_endpoint) > 2000 or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'BAD_SUBSCRIPTION';
  end if;
  insert into ig_private.push_subscriptions (user_id, endpoint, p256dh, auth, platform, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_platform, 20), left(p_user_agent, 300))
  on conflict (endpoint) do update set
    user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    platform = excluded.platform, user_agent = excluded.user_agent, last_seen_at = now(), failures = 0;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.member_remove_push_subscription(p_endpoint text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with removed as (
    delete from ig_private.push_subscriptions s where s.endpoint = p_endpoint and s.user_id = auth.uid() returning 1
  )
  select jsonb_build_object('ok', true, 'removed', (select count(*) from removed))
$$;

create or replace function public.member_push_settings(p_endpoint text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'device_saved', exists (select 1 from ig_private.push_subscriptions s where s.user_id = auth.uid() and s.endpoint = p_endpoint),
    'devices', (select count(*) from ig_private.push_subscriptions s where s.user_id = auth.uid()),
    'prefs', coalesce((select p.prefs from ig_private.push_prefs p where p.user_id = auth.uid()), '{}'::jsonb)
  )
$$;

create or replace function public.member_set_push_prefs(p_prefs jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean jsonb;
begin
  if auth.uid() is null then
    raise exception 'LOGIN_REQUIRED';
  end if;
  select coalesce(jsonb_object_agg(k, (p_prefs ->> k)::boolean), '{}'::jsonb)
  into clean
  from unnest(array['attendance', 'deadline', 'best', 'record']) k
  where p_prefs ? k and p_prefs ->> k in ('true', 'false');
  insert into ig_private.push_prefs (user_id, prefs) values (auth.uid(), clean)
  on conflict (user_id) do update set prefs = excluded.prefs, updated_at = now();
  return jsonb_build_object('ok', true, 'prefs', clean);
end;
$$;

-- 알림 테스트: 내 기기로 한 번 (1분에 한 번까지)
create or replace function public.member_send_test_push()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  added integer;
begin
  if auth.uid() is null then
    raise exception 'LOGIN_REQUIRED';
  end if;
  if not exists (select 1 from ig_private.push_subscriptions s where s.user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'code', 'NO_DEVICE');
  end if;
  added := ig_private.queue_push(auth.uid(), 'test', format('test:%s:%s', auth.uid(), to_char(now(), 'YYYYMMDDHH24MI')),
    '🔔 알림 테스트', '알림이 잘 와요! 출석·마감 알림도 이렇게 와요.', '/app', 'test');
  return jsonb_build_object('ok', true, 'queued', added);
end;
$$;

-- 7. 운영진: 베스트 프레젠터 발표 알림 -------------------------------------------
create or replace function public.admin_queue_best_presenter_push(p_week integer, p_winners text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sem public.semesters%rowtype;
  r record;
  queued integer := 0;
  recipients integer := 0;
  body text := coalesce(nullif(trim(left(p_winners, 120)), ''), '클러스터별 1위를 확인해 보세요');
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required';
  end if;
  if p_week is null or p_week < 0 or p_week > 52 then
    raise exception 'BAD_WEEK';
  end if;
  select * into sem from public.semesters s where s.status = 'active' order by s.code desc limit 1;
  if sem.id is null then
    raise exception 'NO_SEMESTER';
  end if;
  for r in select * from ig_private.push_recipients(sem.id) loop
    recipients := recipients + 1;
    queued := queued + ig_private.queue_push(r.user_id, 'best', format('best:%s:%s:%s', sem.id, p_week, r.user_id),
      format('🏆 W%s 베스트 프레젠터 발표!', p_week), body, '/app/best', 'best');
  end loop;
  return jsonb_build_object('ok', true, 'recipients', recipients, 'queued', queued, 'already', recipients - queued);
end;
$$;

create or replace function public.admin_push_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(array['super_admin', 'admin', 'operator', 'viewer']) then
    raise exception 'Administrator access is required';
  end if;
  return jsonb_build_object(
    'devices', (select count(*) from ig_private.push_subscriptions),
    'members_with_devices', (select count(distinct user_id) from ig_private.push_subscriptions),
    'by_platform', coalesce((select jsonb_object_agg(coalesce(platform, 'other'), n) from (select platform, count(*) n from ig_private.push_subscriptions group by platform) x), '{}'::jsonb),
    'sent_24h', (select count(*) from ig_private.push_outbox where sent_at > now() - interval '24 hours'),
    'pending', (select count(*) from ig_private.push_outbox where sent_at is null and attempts < 3 and created_at > now() - interval '1 day'),
    'last_cycle_at', (select last_cycle_at from ig_private.push_config where id = 1),
    'last_cycle_note', (select last_cycle_note from ig_private.push_config where id = 1),
    'configured', (select site_url is not null and secret is not null from ig_private.push_config where id = 1)
  );
end;
$$;

-- 8. 발송 주소(/api/push/send)가 부르는 함수: 비밀값이 맞아야 한다 ------------------
create or replace function public.push_claim_outbox(p_secret text, p_limit integer default 300)
returns table (outbox_id bigint, subscription_id bigint, endpoint text, p256dh text, auth text, title text, body text, url text, tag text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_ids bigint[];
begin
  if p_secret is null or not exists (select 1 from ig_private.push_config c where c.id = 1 and c.secret is not null and c.secret = p_secret) then
    raise exception 'PUSH_FORBIDDEN';
  end if;

  with picked as (
    select o.id
    from ig_private.push_outbox o
    where o.sent_at is null and o.attempts < 3 and o.created_at > now() - interval '1 day'
      and (o.claimed_at is null or o.claimed_at < now() - interval '2 minutes')
    order by o.created_at
    limit greatest(1, least(coalesce(p_limit, 300), 1000))
    for update skip locked
  ), claimed as (
    update ig_private.push_outbox o
    set claimed_at = now(), attempts = o.attempts + 1
    from picked
    where o.id = picked.id
    returning o.id
  )
  select coalesce(array_agg(claimed.id), '{}') into claimed_ids from claimed;

  -- 받을 기기가 없거나 그 종류를 껐으면 보낸 것으로 정리한다
  update ig_private.push_outbox o
  set sent_at = now(), last_error = 'no eligible device'
  where o.id = any (claimed_ids)
    and not exists (
      select 1 from ig_private.push_subscriptions s
      left join ig_private.push_prefs p on p.user_id = s.user_id
      where s.user_id = o.user_id and (o.kind = 'test' or coalesce((p.prefs ->> o.kind)::boolean, true))
    );

  return query
  select o.id, s.id, s.endpoint, s.p256dh, s.auth, o.title, o.body, o.url, o.tag
  from ig_private.push_outbox o
  join ig_private.push_subscriptions s on s.user_id = o.user_id
  left join ig_private.push_prefs p on p.user_id = o.user_id
  where o.id = any (claimed_ids)
    and o.sent_at is null
    and (o.kind = 'test' or coalesce((p.prefs ->> o.kind)::boolean, true));
end;
$$;

-- 결과 보고: [{outbox_id, subscription_id, ok, status, error}]
create or replace function public.push_report(p_secret text, p_results jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  sent integer := 0;
  removed integer := 0;
  deleted integer;
begin
  if p_secret is null or not exists (select 1 from ig_private.push_config c where c.id = 1 and c.secret is not null and c.secret = p_secret) then
    raise exception 'PUSH_FORBIDDEN';
  end if;
  for item in select * from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    if (item ->> 'ok')::boolean then
      update ig_private.push_outbox set sent_at = coalesce(sent_at, now()), last_error = null where id = (item ->> 'outbox_id')::bigint;
      update ig_private.push_subscriptions set failures = 0, last_seen_at = now() where id = (item ->> 'subscription_id')::bigint;
      sent := sent + 1;
    elsif (item ->> 'status') in ('404', '410') then
      -- 기기가 구독을 끊었다 (앱 삭제·권한 해제)
      delete from ig_private.push_subscriptions where id = (item ->> 'subscription_id')::bigint;
      get diagnostics deleted = row_count;
      removed := removed + deleted;
    else
      update ig_private.push_outbox set last_error = left(coalesce(item ->> 'error', item ->> 'status'), 300) where id = (item ->> 'outbox_id')::bigint;
      update ig_private.push_subscriptions set failures = failures + 1 where id = (item ->> 'subscription_id')::bigint;
      delete from ig_private.push_subscriptions where id = (item ->> 'subscription_id')::bigint and failures >= 5;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'sent', sent, 'removed', removed);
end;
$$;

revoke all on function public.member_save_push_subscription(text, text, text, text, text) from public, anon;
revoke all on function public.member_remove_push_subscription(text) from public, anon;
revoke all on function public.member_push_settings(text) from public, anon;
revoke all on function public.member_set_push_prefs(jsonb) from public, anon;
revoke all on function public.member_send_test_push() from public, anon;
revoke all on function public.admin_queue_best_presenter_push(integer, text) from public, anon;
revoke all on function public.admin_push_status() from public, anon;
revoke all on function public.push_claim_outbox(text, integer) from public;
revoke all on function public.push_report(text, jsonb) from public;
grant execute on function public.member_save_push_subscription(text, text, text, text, text) to authenticated;
grant execute on function public.member_remove_push_subscription(text) to authenticated;
grant execute on function public.member_push_settings(text) to authenticated;
grant execute on function public.member_set_push_prefs(jsonb) to authenticated;
grant execute on function public.member_send_test_push() to authenticated;
grant execute on function public.admin_queue_best_presenter_push(integer, text) to authenticated;
grant execute on function public.admin_push_status() to authenticated;
-- 발송 주소는 로그인 없이 공개 키로 부른다. 비밀값이 맞아야만 동작한다.
grant execute on function public.push_claim_outbox(text, integer) to anon, authenticated;
grant execute on function public.push_report(text, jsonb) to anon, authenticated;

-- 9. pg_cron·pg_net 켜기와 5분 예약 (권한이 없으면 건너뛰고 결과에 알린다) ------------
create table if not exists ig_private.step25_setup (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  item text not null,
  result text not null
);
revoke all on ig_private.step25_setup from public;

do $$
declare
  r_cron text := 'ok';
  r_net text := 'ok';
  r_job text := 'skipped';
begin
  if to_regnamespace('cron') is null then
    begin
      execute 'create extension if not exists pg_cron with schema pg_catalog';
    exception when others then
      begin
        execute 'create extension if not exists pg_cron';
      exception when others then
        r_cron := 'not enabled: ' || sqlerrm;
      end;
    end;
  end if;
  if to_regnamespace('net') is null then
    begin
      execute 'create extension if not exists pg_net with schema extensions';
    exception when others then
      r_net := 'not enabled: ' || sqlerrm;
    end;
  end if;

  if to_regnamespace('cron') is not null then
    begin
      execute $q$select cron.unschedule(jobid) from cron.job where jobname = 'ig-push-cycle'$q$;
      execute $q$select cron.schedule('ig-push-cycle', '*/5 * * * *', 'select ig_private.run_push_cycle()')$q$;
      r_job := 'scheduled every 5 minutes';
    exception when others then
      r_job := 'error: ' || sqlerrm;
    end;
  end if;

  insert into ig_private.step25_setup (item, result) values ('pg_cron', r_cron), ('pg_net', r_net), ('cron_job', r_job);
end;
$$;

-- 10. 확인: 가상 학회원·기기·벌금·사유서·마감으로 알림이 만들어지는지 보고 항상 되돌린다
create table if not exists ig_private.step25_probe (
  id bigint generated always as identity primary key,
  probed_at timestamptz not null default now(),
  check_name text not null,
  result text not null
);
revoke all on ig_private.step25_probe from public;

do $$
declare
  probe_user uuid := gen_random_uuid();
  probe_member uuid;
  sem public.semesters%rowtype;
  r_fine text := 'skipped';
  r_absence text := 'skipped';
  r_deadline text := 'skipped';
  r_cycle text := 'skipped';
  failure text;
  absence_id bigint;
  stage text := 'start';
begin
  select * into sem from public.semesters s where s.status = 'active' order by s.code desc limit 1;
  begin
    stage := 'account';
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, invited_at, created_at, updated_at)
    values (probe_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'ig-step25-probe-' || probe_user || '@example.invalid', '{}'::jsonb, '{"provider": "email", "providers": ["email"]}'::jsonb, now(), now(), now());
    stage := 'member';
    insert into public.members (auth_user_id, name, generation, role, status, requested_status, is_public)
    values (probe_user, 'IG STEP25 확인용', '999기', '일반', 'active', 'active', false)
    returning id into probe_member;
    if sem.id is not null and to_regclass('public.semester_memberships') is not null then
      insert into public.semester_memberships (semester_id, member_id) values (sem.id, probe_member) on conflict do nothing;
    end if;
    insert into ig_private.push_subscriptions (user_id, endpoint, p256dh, auth, platform)
    values (probe_user, 'https://example.invalid/push/' || probe_user, 'probe-key', 'probe-auth', 'android');

    stage := 'fine';
    insert into public.pr_fines (user_name, week, category, amount, reason, is_paid, member_id)
    values ('IG STEP25 확인용', 1, '확인용 벌금', 1000, '확인', false, probe_member);
    r_fine := case when exists (select 1 from ig_private.push_events where member_id = probe_member and kind = 'fine') then 'ok' else 'no event' end;

    stage := 'absence';
    insert into public.absence_forms (user_name, week, target_date, type, reason, status, member_id)
    values ('IG STEP25 확인용', 1, current_date, '결석', '확인', '대기', probe_member)
    returning id into absence_id;
    update public.absence_forms set status = '완전인정' where id = absence_id;
    r_absence := case when exists (select 1 from ig_private.push_events where member_id = probe_member and kind = 'absence') then 'ok' else 'no event' end;

    if sem.id is not null then
      stage := 'deadline';
      insert into public.pr_deadlines (week, category, deadline_time, semester_id)
      values (51, 'proposal', now() + interval '2 hours', sem.id);
    end if;

    stage := 'cycle';
    perform ig_private.queue_due_pushes();
    r_cycle := 'ok';
    r_fine := r_fine || case when exists (select 1 from ig_private.push_outbox where user_id = probe_user and dedupe_key like 'fine:%') then ' → queued' else ' → not queued' end;
    r_absence := r_absence || case when exists (select 1 from ig_private.push_outbox where user_id = probe_user and dedupe_key like 'absence:%') then ' → queued' else ' → not queued' end;
    if sem.id is not null then
      r_deadline := case when exists (select 1 from ig_private.push_outbox where user_id = probe_user and dedupe_key like 'dl3:%:51:proposal:%') then 'ok (3시간 전 알림)' else 'not queued' end;
    end if;

    raise exception 'ig_step25_probe_rollback';
  exception when others then
    if sqlerrm <> 'ig_step25_probe_rollback' then
      failure := stage || ': ' || sqlstate || ' ' || sqlerrm;
    end if;
  end;

  if failure is not null and stage in ('fine', 'absence', 'deadline', 'cycle') then
    raise exception 'STEP 25: probe failed at %. Nothing was applied.', failure;
  end if;
  if r_fine like 'no event%' or r_absence like 'no event%' or r_fine like '%not queued' or r_absence like '%not queued' or r_deadline = 'not queued' then
    raise exception 'STEP 25: probe result unexpected (fine %, absence %, deadline %). Nothing was applied.', r_fine, r_absence, r_deadline;
  end if;

  insert into ig_private.step25_probe (check_name, result) values
    ('fine_push', coalesce(r_fine, 'skipped') || case when failure is not null then ' (' || failure || ')' else '' end),
    ('absence_push', r_absence),
    ('deadline_push', r_deadline),
    ('queue_cycle', r_cycle);
end;
$$;

commit;

-- 확인: 10행. ok가 false인 행이 없어야 한다 (ok가 비어 있는 행은 정보)
with last_probe as (
  select * from ig_private.step25_probe where probed_at = (select max(probed_at) from ig_private.step25_probe)
), last_setup as (
  select * from ig_private.step25_setup where ran_at = (select max(ran_at) from ig_private.step25_setup)
)
select item, result, ok
from (
  select 1 as sort_order, 'functions' as item,
    format('%s개', (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('member_save_push_subscription', 'member_remove_push_subscription', 'member_push_settings', 'member_set_push_prefs', 'member_send_test_push', 'admin_queue_best_presenter_push', 'admin_push_status', 'push_claim_outbox', 'push_report'))) as result,
    (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname in ('member_save_push_subscription', 'member_remove_push_subscription', 'member_push_settings', 'member_set_push_prefs', 'member_send_test_push', 'admin_queue_best_presenter_push', 'admin_push_status', 'push_claim_outbox', 'push_report')) = 9 as ok
  union all
  select 2, 'triggers',
    coalesce((select string_agg(tgname, ', ' order by tgname) from pg_trigger where tgname in ('ig_push_fine_event', 'ig_push_absence_event')), '없음'),
    (select count(*) from pg_trigger where tgname in ('ig_push_fine_event', 'ig_push_absence_event')) = 2
  union all
  select 3, l.check_name, l.result, l.result like 'ok%' or l.result = 'skipped'
  from last_probe l
  union all
  select 4, s.item, s.result, case when s.item = 'cron_job' then s.result like 'scheduled%' else s.result = 'ok' end
  from last_setup s
  union all
  select 5, 'push_config',
    case when (select site_url is not null and secret is not null from ig_private.push_config where id = 1) then '설정됨 ' || (select site_url from ig_private.push_config where id = 1) else '미설정' end,
    null
) result
order by sort_order, item;
