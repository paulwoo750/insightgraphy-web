-- STEP 24: attendance is decided by the database, not by the phone.
--
-- Until now the attendance page computed the distance in the browser and inserted
-- pr_attendance (status '출석완료' or '지각') directly. An approved member could insert a row
-- without being at the venue. After this step the phone only sends its coordinates:
--
--   public.member_attendance_context()  this week's attendance window, venue and my record for the
--                                        logged-in member (regular session, and the member's
--                                        weekday group in a vacation semester). Same week choice
--                                        as the old page: open window → next window → last week.
--   public.member_check_in(type, lat, lng, accuracy)
--                                        checks the window with the server clock, the distance to
--                                        the venue (radius, default 100 m) and the GPS accuracy,
--                                        then writes my row (member_id, name, week, semester).
--                                        '지각' after the session start time. Returns a reason code
--                                        instead of failing, so the app can explain it.
--   ig_private.attendance_attempts       every attempt with its result (for "why can't I check in").
--
-- The web page and the phone app both use these functions. Direct inserts by members stay
-- possible until STEP 26 (run it after the new site is deployed).
--
-- Adds three nullable columns to pr_attendance (distance_m if missing, location_accuracy_m,
-- checked_in_via). No existing rows are changed. Safe to re-run.

begin;

select pg_advisory_xact_lock(hashtextextended('insightgraphy-step-24', 0));

do $$
declare
  missing text;
begin
  select string_agg(t, ', ')
  into missing
  from unnest(array['members', 'semesters', 'pr_config', 'pr_deadlines', 'pr_attendance']) t
  where to_regclass('public.' || t) is null;
  if missing is not null then
    raise exception 'STEP 24: table(s) not found: %', missing;
  end if;
  if to_regprocedure('public.try_parse_jsonb(text)') is null then
    raise exception 'STEP 24: public.try_parse_jsonb(text) not found. Run STEP 15 first.';
  end if;
end;
$$;

alter table public.pr_attendance add column if not exists distance_m integer;
alter table public.pr_attendance add column if not exists location_accuracy_m integer;
alter table public.pr_attendance add column if not exists checked_in_via text;

create schema if not exists ig_private;
revoke all on schema ig_private from public;

create table if not exists ig_private.attendance_attempts (
  id bigint generated always as identity primary key,
  attempted_at timestamptz not null default now(),
  user_id uuid,
  member_id uuid,
  semester_id uuid,
  week integer,
  session_type text,
  code text not null,
  distance_m integer,
  accuracy_m integer
);
create index if not exists attendance_attempts_member_idx on ig_private.attendance_attempts (member_id, attempted_at desc);
revoke all on all tables in schema ig_private from public;

-- 'YYYY-MM-DD' + 'HH:MM' (한국 시간) → timestamptz. 형식이 틀리면 null
create or replace function ig_private.kst_at(p_date text, p_time text)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
begin
  if coalesce(trim(p_date), '') = '' or coalesce(trim(p_time), '') = '' then
    return null;
  end if;
  return (trim(p_date) || ' ' || trim(p_time))::timestamp at time zone 'Asia/Seoul';
exception when others then
  return null;
end;
$$;

-- 'YYYY-MM-DD' → date. 틀린 날짜면 null
create or replace function ig_private.safe_date(p_date text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if coalesce(p_date, '') !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return p_date::date;
exception when others then
  return null;
end;
$$;

-- 두 좌표 사이 거리 (m, 내림). 웹 출석 화면과 같은 계산
create or replace function ig_private.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns integer
language sql
immutable
set search_path = ''
as $$
  select floor(6371000 * 2 * atan2(sqrt(a), sqrt(1 - a)))::integer
  from (
    select sin(radians(lat2 - lat1) / 2) ^ 2
      + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lng2 - lng1) / 2) ^ 2 as a
  ) x
$$;

-- {lat, lng, radius} → 숫자로 정리한 장소. 좌표가 없거나 틀리면 null
create or replace function ig_private.venue(p_location jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  lat double precision;
  lng double precision;
  radius double precision;
begin
  if p_location is null or jsonb_typeof(p_location) <> 'object' then
    return null;
  end if;
  lat := nullif(trim(p_location ->> 'lat'), '')::double precision;
  lng := nullif(trim(p_location ->> 'lng'), '')::double precision;
  radius := coalesce(nullif(trim(p_location ->> 'radius'), '')::double precision, 100);
  if lat is null or lng is null or lat not between -90 and 90 or lng not between -180 and 180 then
    return null;
  end if;
  return jsonb_build_object('lat', lat, 'lng', lng, 'radius', greatest(radius, 10));
exception when others then
  return null;
end;
$$;

-- 운영 학기의 조 편성·장소 (작업본 pr_config.weekly_setup → 학기 저장본)
create or replace function ig_private.attendance_setup(p_semester_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    case when s.status = 'active' then (select public.try_parse_jsonb(pc.value) from public.pr_config pc where pc.key = 'weekly_setup') end,
    s.weekly_setup,
    '{}'::jsonb
  )
  from public.semesters s
  where s.id = p_semester_id
$$;

-- 한 학회원의 이번 출석 세션 (정규 또는 평일). 없으면 null
create or replace function ig_private.attendance_session(p_member_id uuid, p_name text, p_semester_id uuid, p_session_type text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  sem public.semesters%rowtype;
  setup jsonb;
  pick record;
  now_ts timestamptz := now();
  today date := (now() at time zone 'Asia/Seoul')::date;
  result jsonb;
  record_row public.pr_attendance%rowtype;
  state text;
begin
  select * into sem from public.semesters where id = p_semester_id;
  if sem.id is null then
    return null;
  end if;
  setup := ig_private.attendance_setup(sem.id);

  if p_session_type = 'regular' then
    -- 주차별 출석 시간 (같은 주차·종류가 겹치면 이 학기 행을 우선)
    select w.week, w.s, w.l, w.e
    into pick
    from (
      select dl.week,
        max(dl.deadline_time) filter (where dl.category = 'attendance_start') as s,
        max(dl.deadline_time) filter (where dl.category = 'session_start') as l,
        max(dl.deadline_time) filter (where dl.category = 'attendance_end') as e
      from (
        select distinct on (d.week, d.category) d.week, d.category, d.deadline_time
        from public.pr_deadlines d
        where (d.semester_id = sem.id or d.semester_id is null)
          and d.category in ('attendance_start', 'session_start', 'attendance_end')
          and d.week is not null and d.deadline_time is not null
        order by d.week, d.category, (d.semester_id is null)
      ) dl
      group by dl.week
    ) w
    order by
      case when w.s <= now_ts and now_ts <= w.e then 0 when w.s > now_ts then 1 else 2 end,
      case when w.s > now_ts then w.s end asc nulls last,
      case when w.s <= now_ts and now_ts <= w.e then w.week else -w.week end
    limit 1;

    if pick.week is null then
      return null;
    end if;

    result := jsonb_build_object(
      'session_type', 'regular',
      'week', pick.week,
      'start', pick.s,
      'late', pick.l,
      'end', pick.e,
      'location', ig_private.venue(setup -> pick.week::text -> 'location')
    );
  elsif p_session_type = 'weekday' then
    if sem.semester_type <> 'vacation' then
      return null;
    end if;
    -- 내가 배정된 평일 조의 일정: 출석 중 → 오늘 → 가장 가까운 앞날 → 가장 최근
    select c.week, c.grp, c.day, c.s, c.l, c.e, c.loc
    into pick
    from (
      select w.key::integer as week,
        g.grp,
        ig_private.safe_date(t ->> 'date') as day,
        ig_private.kst_at(t ->> 'date', t ->> 'attOpen') as s,
        ig_private.kst_at(t ->> 'date', t ->> 'sessionStart') as l,
        ig_private.kst_at(t ->> 'date', t ->> 'attEnd') as e,
        ig_private.venue(t) as loc
      from jsonb_each(setup) w
      cross join lateral (
        select coalesce(w.value -> 'weekdayMembers' ->> p_name, w.value -> 'members' ->> p_name) as raw
      ) r
      cross join lateral (
        select case when r.raw ~ '^\s*[0-9]+\s*$' then trim(r.raw) end as grp
      ) g
      cross join lateral (
        select w.value -> 'weekday' -> g.grp as t
      ) tt
      where w.key ~ '^[0-9]+$'
        and jsonb_typeof(w.value) = 'object'
        and coalesce(w.value ->> 'weekdaySession', '') not in ('', 'false', '0', 'null')
        and g.grp is not null
    ) c
    where c.day is not null
    order by
      case
        when c.s is not null and c.e is not null and c.s <= now_ts and now_ts <= c.e then 0
        when c.day = today then 1
        when c.day > today then 2
        else 3
      end,
      case when c.day > today then c.day end asc nulls last,
      c.day desc
    limit 1;

    if pick.week is null then
      return null;
    end if;

    result := jsonb_build_object(
      'session_type', 'weekday',
      'week', pick.week,
      'group', pick.grp::integer,
      'date', pick.day,
      'start', pick.s,
      'late', pick.l,
      'end', pick.e,
      'location', pick.loc
    );
  else
    return null;
  end if;

  select a.* into record_row
  from public.pr_attendance a
  where a.week = (result ->> 'week')::integer
    and coalesce(a.session_type, 'regular') = p_session_type
    and (a.member_id = p_member_id or (a.member_id is null and a.user_name = p_name))
    and (a.semester_id = sem.id or (a.semester_id is null and a.semester = sem.code))
  order by a.created_at
  limit 1;

  state := case
    when (result ->> 'start') is null or (result ->> 'end') is null then 'no_setting'
    when now_ts < (result ->> 'start')::timestamptz then 'before'
    when now_ts > (result ->> 'end')::timestamptz then 'closed'
    when (result ->> 'late') is not null and now_ts > (result ->> 'late')::timestamptz then 'late'
    else 'open'
  end;

  return result || jsonb_build_object(
    'state', state,
    'record', case when record_row.id is null then null else jsonb_build_object(
      'status', record_row.status,
      'created_at', record_row.created_at,
      'distance_m', record_row.distance_m
    ) end
  );
end;
$$;

revoke all on all functions in schema ig_private from public;

-- 학회원 화면·앱: 이번 출석 세션들
create or replace function public.member_attendance_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me public.members%rowtype;
  sem public.semesters%rowtype;
  sessions jsonb := '[]'::jsonb;
  item jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'LOGIN_REQUIRED');
  end if;
  select * into me
  from public.members m
  where m.auth_user_id = auth.uid() and m.status in ('active', 'leave', 'inactive', 'alumni')
  limit 1;
  if me.id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_MEMBER');
  end if;
  select * into sem from public.semesters s where s.status = 'active' order by s.code desc limit 1;
  if sem.id is null then
    return jsonb_build_object('ok', false, 'code', 'NO_SEMESTER');
  end if;

  foreach item in array array[
    ig_private.attendance_session(me.id, me.name, sem.id, 'regular'),
    ig_private.attendance_session(me.id, me.name, sem.id, 'weekday')
  ] loop
    if item is not null then
      sessions := sessions || jsonb_build_array(item);
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'now', now(),
    'member', jsonb_build_object('id', me.id, 'name', me.name),
    'semester', jsonb_build_object('id', sem.id, 'code', sem.code, 'name', sem.name, 'type', sem.semester_type),
    'sessions', sessions
  );
end;
$$;

-- 출석하기: 휴대폰은 좌표만 보내고 판단은 여기서 한다
create or replace function public.member_check_in(
  p_session_type text,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me public.members%rowtype;
  sem public.semesters%rowtype;
  session jsonb;
  venue jsonb;
  dist integer;
  accuracy integer := case when p_accuracy is null or p_accuracy < 0 then null else least(p_accuracy, 1000000)::integer end;
  week_no integer;
  status_text text;
  saved public.pr_attendance%rowtype;
  code text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'LOGIN_REQUIRED');
  end if;
  if p_session_type not in ('regular', 'weekday') then
    return jsonb_build_object('ok', false, 'code', 'BAD_REQUEST');
  end if;

  select * into me
  from public.members m
  where m.auth_user_id = auth.uid() and m.status in ('active', 'leave', 'inactive', 'alumni')
  limit 1;
  if me.id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_MEMBER');
  end if;
  select * into sem from public.semesters s where s.status = 'active' order by s.code desc limit 1;
  if sem.id is null then
    return jsonb_build_object('ok', false, 'code', 'NO_SEMESTER');
  end if;

  -- 같은 사람이 동시에 두 번 누르는 경우를 막는다
  perform pg_advisory_xact_lock(hashtextextended('ig-check-in:' || me.id::text || ':' || p_session_type, 0));

  session := ig_private.attendance_session(me.id, me.name, sem.id, p_session_type);
  week_no := (session ->> 'week')::integer;
  venue := session -> 'location';

  if session is null or session ->> 'state' = 'no_setting' then
    code := 'NO_SETTING';
  elsif session -> 'record' is not null and jsonb_typeof(session -> 'record') = 'object' then
    return jsonb_build_object('ok', true, 'code', 'ALREADY', 'week', week_no, 'session_type', p_session_type, 'record', session -> 'record');
  elsif session ->> 'state' = 'before' then
    code := 'NOT_OPEN';
  elsif session ->> 'state' = 'closed' then
    code := 'CLOSED';
  elsif venue is null or jsonb_typeof(venue) <> 'object' then
    code := 'NO_LOCATION';
  elsif p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    code := 'BAD_LOCATION';
  elsif accuracy is not null and accuracy > 1000 then
    code := 'LOW_ACCURACY';
  else
    dist := ig_private.distance_m((venue ->> 'lat')::double precision, (venue ->> 'lng')::double precision, p_lat, p_lng);
    if dist > (venue ->> 'radius')::double precision then
      code := 'TOO_FAR';
    end if;
  end if;

  if code is not null then
    insert into ig_private.attendance_attempts (user_id, member_id, semester_id, week, session_type, code, distance_m, accuracy_m)
    values (auth.uid(), me.id, sem.id, week_no, p_session_type, code, dist, accuracy);
    return jsonb_build_object(
      'ok', false, 'code', code, 'week', week_no, 'session_type', p_session_type,
      'distance_m', dist, 'radius_m', (venue ->> 'radius')::double precision, 'accuracy_m', accuracy,
      'start', session -> 'start', 'end', session -> 'end'
    );
  end if;

  status_text := case when session ->> 'state' = 'late' then '지각' else '출석완료' end;

  begin
    insert into public.pr_attendance (user_name, week, status, session_type, semester, member_id, semester_id, distance_m, location_accuracy_m, checked_in_via)
    values (me.name, week_no, status_text, p_session_type, sem.code, me.id, sem.id, dist, accuracy, 'server')
    returning * into saved;
  exception when unique_violation then
    -- 이름 기준 예전 기록 등으로 이미 행이 있으면 그 기록을 돌려준다
    select a.* into saved
    from public.pr_attendance a
    where a.week = week_no and coalesce(a.session_type, 'regular') = p_session_type
      and (a.member_id = me.id or a.user_name = me.name)
      and (a.semester_id = sem.id or a.semester = sem.code)
    order by a.created_at
    limit 1;
    insert into ig_private.attendance_attempts (user_id, member_id, semester_id, week, session_type, code, distance_m, accuracy_m)
    values (auth.uid(), me.id, sem.id, week_no, p_session_type, 'ALREADY', dist, accuracy);
    return jsonb_build_object('ok', true, 'code', 'ALREADY', 'week', week_no, 'session_type', p_session_type,
      'record', case when saved.id is null then null else jsonb_build_object('status', saved.status, 'created_at', saved.created_at, 'distance_m', saved.distance_m) end);
  end;

  insert into ig_private.attendance_attempts (user_id, member_id, semester_id, week, session_type, code, distance_m, accuracy_m)
  values (auth.uid(), me.id, sem.id, week_no, p_session_type, case when status_text = '지각' then 'LATE' else 'OK' end, dist, accuracy);

  return jsonb_build_object(
    'ok', true,
    'code', case when status_text = '지각' then 'LATE' else 'OK' end,
    'week', week_no,
    'session_type', p_session_type,
    'record', jsonb_build_object('status', saved.status, 'created_at', saved.created_at, 'distance_m', saved.distance_m)
  );
end;
$$;

revoke all on function public.member_attendance_context() from public, anon;
revoke all on function public.member_check_in(text, double precision, double precision, double precision) from public, anon;
grant execute on function public.member_attendance_context() to authenticated;
grant execute on function public.member_check_in(text, double precision, double precision, double precision) to authenticated;

comment on function public.member_check_in(text, double precision, double precision, double precision) is
  'STEP 24: 출석 시간·장소 반경·GPS 정확도를 서버에서 확인하고 본인 출석 행을 쓴다. 결과는 code로 돌려준다 (OK, LATE, ALREADY, NOT_OPEN, CLOSED, TOO_FAR, LOW_ACCURACY, NO_LOCATION, NO_SETTING, BAD_LOCATION, NOT_MEMBER, NO_SEMESTER).';

-- 확인: 거리·시간 계산, 그리고 실제 학회원 한 명으로 출석 정보를 읽어 본다 (기록은 쓰지 않고 되돌린다)
create table if not exists ig_private.step24_probe (
  id bigint generated always as identity primary key,
  probed_at timestamptz not null default now(),
  check_name text not null,
  result text not null
);
revoke all on ig_private.step24_probe from public;

do $$
declare
  probe_user uuid;
  ctx jsonb;
  attempt jsonb;
  attempts_before bigint;
  old_claims text := current_setting('request.jwt.claims', true);
  old_sub text := current_setting('request.jwt.claim.sub', true);
  r_distance text;
  r_time text;
  r_context text := 'skipped';
  r_guard text := 'skipped';
begin
  -- 서울시청 ↔ 광화문 약 1.3km (계산식 확인)
  r_distance := case when ig_private.distance_m(37.5665, 126.9780, 37.5759, 126.9768) between 1000 and 1100 then 'ok' else 'unexpected ' || ig_private.distance_m(37.5665, 126.9780, 37.5759, 126.9768) end;
  r_time := case when ig_private.kst_at('2026-10-31', '14:00') = '2026-10-31 05:00:00+00'::timestamptz then 'ok' else 'unexpected' end;

  select m.auth_user_id into probe_user
  from public.members m
  where m.auth_user_id is not null and m.status = 'active'
  limit 1;

  if probe_user is not null then
    begin
      perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', probe_user)::text, true);
      perform set_config('request.jwt.claim.sub', probe_user::text, true);
      ctx := public.member_attendance_context();
      r_context := case when (ctx ->> 'ok')::boolean then 'ok (' || jsonb_array_length(ctx -> 'sessions') || '개 세션)' else 'returned ' || coalesce(ctx ->> 'code', '?') end;
      -- 좌표 없이 부르면 기록 없이 거절되어야 한다
      select count(*) into attempts_before from public.pr_attendance;
      attempt := public.member_check_in('regular', null, null, null);
      r_guard := case
        when (attempt ->> 'ok')::boolean and attempt ->> 'code' <> 'ALREADY' then 'wrote a record without coordinates'
        when (select count(*) from public.pr_attendance) <> attempts_before then 'row count changed'
        else 'ok (' || (attempt ->> 'code') || ')'
      end;
      raise exception 'ig_step24_probe_rollback';
    exception when others then
      if sqlerrm <> 'ig_step24_probe_rollback' then
        r_context := 'error ' || sqlstate || ' ' || sqlerrm;
      end if;
    end;
  end if;

  perform set_config('request.jwt.claims', coalesce(old_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(old_sub, ''), true);

  if r_distance <> 'ok' or r_time <> 'ok' or r_context like 'error%' or r_guard not like 'ok%' and r_guard <> 'skipped' then
    raise exception 'STEP 24: probe failed (distance %, time %, context %, guard %). Nothing was applied.', r_distance, r_time, r_context, r_guard;
  end if;

  insert into ig_private.step24_probe (check_name, result) values
    ('distance', r_distance), ('kst_time', r_time), ('member_context', r_context), ('no_coordinates_refused', r_guard);
end;
$$;

commit;

-- 확인: 7행. ok가 false인 행이 없어야 한다 (ok가 비어 있는 행은 정보)
with last_probe as (
  select * from ig_private.step24_probe where probed_at = (select max(probed_at) from ig_private.step24_probe)
),
active as (
  select s.* from public.semesters s where s.status = 'active' order by s.code desc limit 1
),
regular as (
  select dl.week,
    max(dl.deadline_time) filter (where dl.category = 'attendance_start') as s,
    max(dl.deadline_time) filter (where dl.category = 'attendance_end') as e
  from public.pr_deadlines dl, active a
  where (dl.semester_id = a.id or dl.semester_id is null) and dl.category in ('attendance_start', 'attendance_end')
  group by dl.week
)
select item, result, ok
from (
  select 1 as sort_order, 'functions' as item,
    concat_ws(', ',
      case when to_regprocedure('public.member_attendance_context()') is not null then 'context' end,
      case when to_regprocedure('public.member_check_in(text,double precision,double precision,double precision)') is not null then 'check_in' end) as result,
    to_regprocedure('public.member_attendance_context()') is not null
      and to_regprocedure('public.member_check_in(text,double precision,double precision,double precision)') is not null as ok
  union all
  select 2, 'anon_cannot_check_in',
    case when has_function_privilege('anon', 'public.member_check_in(text,double precision,double precision,double precision)', 'execute') then '공개 키로 실행 가능' else '막힘' end,
    not has_function_privilege('anon', 'public.member_check_in(text,double precision,double precision,double precision)', 'execute')
  union all
  select 3, l.check_name, l.result, l.result like 'ok%' or l.result = 'skipped'
  from last_probe l where l.check_name in ('distance', 'kst_time')
  union all
  select 4, l.check_name, l.result, l.result like 'ok%' or l.result = 'skipped'
  from last_probe l where l.check_name in ('member_context', 'no_coordinates_refused')
  union all
  select 5, 'next_regular_window',
    coalesce((
      select format('W%s %s ~ %s', r.week, to_char(r.s at time zone 'Asia/Seoul', 'MM-DD HH24:MI'), to_char(r.e at time zone 'Asia/Seoul', 'MM-DD HH24:MI'))
      from regular r where r.e >= now() order by r.s limit 1
    ), '예정된 출석 시간 없음'),
    null
) result
order by sort_order, item;
