-- One save path for week topics and the per-week session plan.
--
-- 1. semesters.ot_topic keeps the W0 (OT) topic per semester. semester_weeks only holds
--    weeks 1..52, so W0 used to live only in pr_config.week_topics and was lost for
--    past semesters.
-- 2. build_week_topics includes W0 again ('0' key), so activating a semester restores
--    its OT topic in the legacy pr_config.week_topics copy.
-- 3. admin_save_semester_configuration only changes a week's topic when the request
--    contains that key. Saving the 학기 및 주차 screen no longer overwrites topics it
--    did not touch with null. Optional expected_* keys reject a save when another tab
--    changed the same cell first (the whole save is rolled back).
-- 4. admin_save_week_plan saves one week of the 세션 및 제출 screen (topic, weekly
--    setup, deadlines, favorite locations) in one transaction, with the same
--    expected-value check.
-- 5. Blank semester_weeks topics of the ACTIVE semester are filled from
--    pr_config.week_topics. Past semesters are never filled from the current config.
--    Cells where both sides have different values are left as they are and listed by
--    the check query at the end of this file.
--
-- No rows are deleted. Existing topics, cancelled weeks and past snapshots are kept.

begin;

select pg_advisory_xact_lock(hashtextextended('insightgraphy-step-15', 0));

do $$
begin
  if to_regprocedure('public.build_week_topics(uuid)') is null then
    raise exception 'Run STEP_11_SEMESTER_ID_AUTOFILL.sql first';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'semesters'
      and column_name = 'weekly_setup'
  ) then
    raise exception 'Run STEP_12_SEMESTER_SCOPED_OPERATIONS.sql first';
  end if;
end;
$$;

alter table public.semesters
  add column if not exists ot_topic text;

-- W0 주제: 운영 학기는 현재 config, 지난 학기는 학기 마감 스냅샷에서 빈 값만 채운다
update public.semesters s
set ot_topic = nullif(trim(public.try_parse_jsonb(pc.value) ->> '0'), '')
from public.pr_config pc
where pc.key = 'week_topics'
  and s.status = 'active'
  and nullif(trim(s.ot_topic), '') is null
  and nullif(trim(public.try_parse_jsonb(pc.value) ->> '0'), '') is not null;

update public.semesters s
set ot_topic = (
  select nullif(trim(public.try_parse_jsonb(af.description) ->> '0'), '')
  from public.archive_files af
  where af.category = 'topics'
    and af.file_type = s.code
  order by af.created_at desc
  limit 1
)
where s.status <> 'active'
  and nullif(trim(s.ot_topic), '') is null
  and exists (
    select 1
    from public.archive_files af
    where af.category = 'topics'
      and af.file_type = s.code
      and nullif(trim(public.try_parse_jsonb(af.description) ->> '0'), '') is not null
  );

-- W1 이후 빈 주제: 운영 학기에만 현재 config 값을 채운다 (서로 다른 값은 건드리지 않음)
insert into public.semester_weeks (semester_id, week_no, status)
select
  s.id,
  w.week_no::smallint,
  case
    when w.week_no < coalesce(s.current_week_no, 1) then 'completed'
    when w.week_no = coalesce(s.current_week_no, 1) then 'current'
    else 'planned'
  end
from public.semesters s
cross join generate_series(1, s.total_weeks) as w(week_no)
join public.pr_config pc on pc.key = 'week_topics'
where s.status = 'active'
  and (
    nullif(trim(public.try_parse_jsonb(pc.value) ->> w.week_no::text), '') is not null
    or nullif(trim(public.try_parse_jsonb(pc.value) ->> ('weekday_' || w.week_no)), '') is not null
  )
on conflict (semester_id, week_no) do nothing;

update public.semester_weeks sw
set topic = nullif(trim(public.try_parse_jsonb(pc.value) ->> sw.week_no::text), '')
from public.semesters s, public.pr_config pc
where s.id = sw.semester_id
  and s.status = 'active'
  and pc.key = 'week_topics'
  and nullif(trim(sw.topic), '') is null
  and nullif(trim(public.try_parse_jsonb(pc.value) ->> sw.week_no::text), '') is not null;

update public.semester_weeks sw
set weekday_topic = nullif(trim(public.try_parse_jsonb(pc.value) ->> ('weekday_' || sw.week_no)), '')
from public.semesters s, public.pr_config pc
where s.id = sw.semester_id
  and s.status = 'active'
  and pc.key = 'week_topics'
  and nullif(trim(sw.weekday_topic), '') is null
  and nullif(trim(public.try_parse_jsonb(pc.value) ->> ('weekday_' || sw.week_no)), '') is not null;

-- week_topics = { "0": OT 주제, "1": 정규 주제, "weekday_1": 평일 주제 }
create or replace function public.build_week_topics(p_semester_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(
      (
        select jsonb_object_agg(sw.week_no::text, coalesce(sw.topic, ''))
          || jsonb_object_agg('weekday_' || sw.week_no, coalesce(sw.weekday_topic, ''))
        from public.semester_weeks sw
        where sw.semester_id = p_semester_id
      ),
      '{}'::jsonb
    )
    || coalesce(
      (
        select jsonb_build_object('0', s.ot_topic)
        from public.semesters s
        where s.id = p_semester_id
          and nullif(trim(s.ot_topic), '') is not null
      ),
      '{}'::jsonb
    );
$$;

-- 운영 학기의 legacy 사본(pr_config.week_topics)을 semester_weeks·ot_topic 기준으로 다시 만든다.
-- 0주차 키는 ot_topic이 비면 지운다. 전체 주차보다 큰 기존 키는 그대로 둔다.
create or replace function public.refresh_legacy_week_topics(p_semester_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.semesters s where s.id = p_semester_id and s.status = 'active') then
    return;
  end if;

  insert into public.pr_config (key, value)
  select
    'week_topics',
    ((coalesce(public.try_parse_jsonb(pc.value), '{}'::jsonb) - '0') || public.build_week_topics(p_semester_id))::text
  from (select 1) one
  left join public.pr_config pc on pc.key = 'week_topics'
  on conflict (key) do update set value = excluded.value;
end;
$$;

revoke all on function public.refresh_legacy_week_topics(uuid) from public;

create or replace function public.admin_save_semester_configuration(
  p_semester_id uuid,
  p_code text,
  p_name text,
  p_semester_type text,
  p_total_weeks integer,
  p_current_week_no integer,
  p_starts_on date,
  p_ends_on date,
  p_weeks jsonb
)
returns public.semesters
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_semester public.semesters%rowtype;
  conflicts jsonb;
  ot_entry jsonb;
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required';
  end if;

  if nullif(trim(p_code), '') is null or nullif(trim(p_name), '') is null then
    raise exception 'Semester code and name are required';
  end if;

  if p_semester_type not in ('regular', 'vacation') then
    raise exception 'Invalid semester type';
  end if;

  if p_total_weeks not between 1 and 52 then
    raise exception 'Total weeks must be between 1 and 52';
  end if;

  if p_current_week_no not between 1 and p_total_weeks then
    raise exception 'Current week is outside the semester range';
  end if;

  perform 1 from public.semesters where id = p_semester_id for update;

  if exists (
    select 1
    from public.semester_weeks sw
    where sw.semester_id = p_semester_id
      and sw.week_no > p_total_weeks
  ) then
    raise exception 'Weeks above the requested total already exist';
  end if;

  -- 다른 화면에서 먼저 바뀐 주제가 있으면 아무것도 저장하지 않는다
  with requested as (
    select (elem ->> 'week_no')::integer as week_no, elem
    from jsonb_array_elements(coalesce(p_weeks, '[]'::jsonb)) elem
  ),
  current_values as (
    select
      r.week_no,
      r.elem,
      case when r.week_no = 0 then s.ot_topic else sw.topic end as topic,
      sw.weekday_topic
    from requested r
    join public.semesters s on s.id = p_semester_id
    left join public.semester_weeks sw on sw.semester_id = p_semester_id and sw.week_no = r.week_no
  )
  select jsonb_agg(conflict)
  into conflicts
  from (
    select jsonb_build_object('week_no', week_no, 'field', 'topic', 'current', coalesce(topic, ''), 'expected', elem ->> 'expected_topic') as conflict
    from current_values
    where elem ? 'expected_topic'
      and coalesce(nullif(trim(topic), ''), '') <> coalesce(nullif(trim(elem ->> 'expected_topic'), ''), '')
    union all
    select jsonb_build_object('week_no', week_no, 'field', 'weekday_topic', 'current', coalesce(weekday_topic, ''), 'expected', elem ->> 'expected_weekday_topic')
    from current_values
    where elem ? 'expected_weekday_topic'
      and coalesce(nullif(trim(weekday_topic), ''), '') <> coalesce(nullif(trim(elem ->> 'expected_weekday_topic'), ''), '')
  ) found;

  if conflicts is not null then
    raise exception using
      message = 'WEEK_TOPIC_CONFLICT',
      detail = conflicts::text,
      hint = 'Reload the semester and save again.';
  end if;

  update public.semesters
  set
    code = trim(p_code),
    name = trim(p_name),
    semester_type = p_semester_type,
    total_weeks = p_total_weeks,
    current_week_no = p_current_week_no,
    starts_on = p_starts_on,
    ends_on = p_ends_on
  where id = p_semester_id
  returning * into saved_semester;

  if saved_semester.id is null then
    raise exception 'Semester not found';
  end if;

  select elem
  into ot_entry
  from jsonb_array_elements(coalesce(p_weeks, '[]'::jsonb)) elem
  where (elem ->> 'week_no')::integer = 0
    and elem ? 'topic'
  limit 1;

  if ot_entry is not null then
    update public.semesters
    set ot_topic = nullif(trim(ot_entry ->> 'topic'), '')
    where id = p_semester_id
    returning * into saved_semester;
  end if;

  insert into public.semester_weeks (semester_id, week_no, status)
  select p_semester_id, (elem ->> 'week_no')::smallint, 'planned'
  from jsonb_array_elements(coalesce(p_weeks, '[]'::jsonb)) elem
  where (elem ->> 'week_no')::integer between 1 and p_total_weeks
  on conflict (semester_id, week_no) do nothing;

  -- 요청에 들어 있는 주제 키만 바꾼다. 상태는 기존처럼 현재 주차 기준으로 다시 계산한다
  update public.semester_weeks sw
  set
    topic = case when r.elem ? 'topic' then nullif(trim(r.elem ->> 'topic'), '') else sw.topic end,
    weekday_topic = case when r.elem ? 'weekday_topic' then nullif(trim(r.elem ->> 'weekday_topic'), '') else sw.weekday_topic end,
    status = case
      when r.elem ->> 'status' = 'cancelled' then 'cancelled'
      when r.week_no < p_current_week_no then 'completed'
      when r.week_no = p_current_week_no then 'current'
      else 'planned'
    end
  from (
    select (elem ->> 'week_no')::integer as week_no, elem
    from jsonb_array_elements(coalesce(p_weeks, '[]'::jsonb)) elem
  ) r
  where sw.semester_id = p_semester_id
    and sw.week_no = r.week_no
    and r.week_no between 1 and p_total_weeks;

  if saved_semester.status = 'active' then
    insert into public.pr_config (key, value)
    values
      ('current_semester', saved_semester.code),
      ('semester_type', saved_semester.semester_type),
      ('total_weeks', saved_semester.total_weeks::text),
      ('current_week', saved_semester.current_week_no::text)
    on conflict (key) do update set value = excluded.value;

    perform public.refresh_legacy_week_topics(saved_semester.id);
  end if;

  return saved_semester;
end;
$$;

-- 세션 및 제출 화면의 한 주차 저장. p_plan의 키가 있는 항목만 바꾼다.
-- {
--   "topic": "...", "expected_topic": "...",                 -- W0이면 semesters.ot_topic
--   "weekday_topic": "...", "expected_weekday_topic": "...",
--   "setup": { ... } | null, "expected_setup": { ... } | null, -- weekly_setup[week]
--   "deadlines": { "slide": "2026-10-10T14:59:00Z" | null },   -- null이면 이 학기 행 삭제
--   "expected_deadlines": { "slide": "..." | null },
--   "favorite_locations": [ ... ], "expected_favorite_locations": [ ... ]
-- }
create or replace function public.admin_save_week_plan(
  p_semester_id uuid,
  p_week_no integer,
  p_plan jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.semesters%rowtype;
  week_row public.semester_weeks%rowtype;
  current_setup jsonb;
  working_setup jsonb;
  current_favorites jsonb;
  current_deadlines jsonb;
  conflicts jsonb := '[]'::jsonb;
  category_key text;
  category_value jsonb;
  allowed_categories constant text[] := array[
    'proposal', 'slide', 'video', 'proposal_comment', 'vote_feedback', 'video_comment',
    'attendance_start', 'session_start', 'attendance_end', 'absence',
    'weekday_upload', 'weekday_feedback', 'weekday_self', 'weekday_absence'
  ];
  attendance_open timestamptz;
  attendance_late timestamptz;
  attendance_close timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required';
  end if;

  select * into target from public.semesters where id = p_semester_id for update;
  if target.id is null then
    raise exception 'Semester not found';
  end if;
  if p_week_no is null or p_week_no < 0 or p_week_no > target.total_weeks then
    raise exception 'Week % is outside the semester range', p_week_no;
  end if;

  p_plan := coalesce(p_plan, '{}'::jsonb);

  -- 현재 값 읽기 (운영 학기의 조 편성 작업본은 pr_config.weekly_setup)
  if target.status = 'active' then
    select public.try_parse_jsonb(pc.value) into working_setup from public.pr_config pc where pc.key = 'weekly_setup' for update;
  end if;
  working_setup := coalesce(working_setup, target.weekly_setup, '{}'::jsonb);
  current_setup := working_setup -> p_week_no::text;

  if p_week_no > 0 then
    select * into week_row from public.semester_weeks where semester_id = p_semester_id and week_no = p_week_no for update;
  end if;

  select coalesce(jsonb_object_agg(d.category, d.deadline_time), '{}'::jsonb)
  into current_deadlines
  from public.pr_deadlines d
  where d.semester_id = p_semester_id
    and d.week = p_week_no;

  select public.try_parse_jsonb(pc.value) into current_favorites from public.pr_config pc where pc.key = 'favorite_locations';
  current_favorites := coalesce(current_favorites, '[]'::jsonb);

  -- 충돌 검사: 화면을 연 뒤 다른 곳에서 바뀐 항목
  if p_plan ? 'expected_topic'
     and coalesce(nullif(trim(case when p_week_no = 0 then target.ot_topic else week_row.topic end), ''), '')
       <> coalesce(nullif(trim(p_plan ->> 'expected_topic'), ''), '') then
    conflicts := conflicts || jsonb_build_object('field', 'topic', 'current', case when p_week_no = 0 then target.ot_topic else week_row.topic end);
  end if;

  if p_plan ? 'expected_weekday_topic'
     and coalesce(nullif(trim(week_row.weekday_topic), ''), '') <> coalesce(nullif(trim(p_plan ->> 'expected_weekday_topic'), ''), '') then
    conflicts := conflicts || jsonb_build_object('field', 'weekday_topic', 'current', week_row.weekday_topic);
  end if;

  if p_plan ? 'expected_setup'
     and coalesce(current_setup, 'null'::jsonb) is distinct from coalesce(p_plan -> 'expected_setup', 'null'::jsonb) then
    conflicts := conflicts || jsonb_build_object('field', 'setup');
  end if;

  if p_plan ? 'expected_deadlines' then
    for category_key, category_value in select key, value from jsonb_each(p_plan -> 'expected_deadlines') loop
      if (current_deadlines ->> category_key)::timestamptz is distinct from nullif(category_value #>> '{}', '')::timestamptz then
        conflicts := conflicts || jsonb_build_object('field', 'deadline', 'category', category_key, 'current', current_deadlines -> category_key);
      end if;
    end loop;
  end if;

  if p_plan ? 'expected_favorite_locations'
     and current_favorites is distinct from coalesce(p_plan -> 'expected_favorite_locations', '[]'::jsonb) then
    conflicts := conflicts || jsonb_build_object('field', 'favorite_locations');
  end if;

  if jsonb_array_length(conflicts) > 0 then
    raise exception using
      message = 'WEEK_PLAN_CONFLICT',
      detail = conflicts::text,
      hint = 'Reload this week and apply your changes again.';
  end if;

  -- 마감 검증: 허용된 종류만, 출석 오픈 ≤ 세션 시작 ≤ 출석 종료
  if p_plan ? 'deadlines' then
    for category_key in select jsonb_object_keys(p_plan -> 'deadlines') loop
      if not (category_key = any(allowed_categories)) then
        raise exception 'Unknown deadline category: %', category_key;
      end if;
    end loop;

    attendance_open := coalesce(
      case when (p_plan -> 'deadlines') ? 'attendance_start' then nullif(p_plan -> 'deadlines' ->> 'attendance_start', '')::timestamptz end,
      case when not ((p_plan -> 'deadlines') ? 'attendance_start') then (current_deadlines ->> 'attendance_start')::timestamptz end
    );
    attendance_late := coalesce(
      case when (p_plan -> 'deadlines') ? 'session_start' then nullif(p_plan -> 'deadlines' ->> 'session_start', '')::timestamptz end,
      case when not ((p_plan -> 'deadlines') ? 'session_start') then (current_deadlines ->> 'session_start')::timestamptz end
    );
    attendance_close := coalesce(
      case when (p_plan -> 'deadlines') ? 'attendance_end' then nullif(p_plan -> 'deadlines' ->> 'attendance_end', '')::timestamptz end,
      case when not ((p_plan -> 'deadlines') ? 'attendance_end') then (current_deadlines ->> 'attendance_end')::timestamptz end
    );

    if attendance_open is not null and attendance_late is not null and attendance_open > attendance_late then
      raise exception 'ATTENDANCE_ORDER: 출석 오픈은 세션 시작(지각 기준)보다 늦을 수 없습니다.';
    end if;
    if attendance_late is not null and attendance_close is not null and attendance_late > attendance_close then
      raise exception 'ATTENDANCE_ORDER: 세션 시작(지각 기준)은 출석 종료보다 늦을 수 없습니다.';
    end if;
    if attendance_open is not null and attendance_close is not null and attendance_open > attendance_close then
      raise exception 'ATTENDANCE_ORDER: 출석 오픈은 출석 종료보다 늦을 수 없습니다.';
    end if;
  end if;

  -- 주제
  if p_week_no = 0 and p_plan ? 'topic' then
    update public.semesters set ot_topic = nullif(trim(p_plan ->> 'topic'), '') where id = p_semester_id;
  elsif p_week_no > 0 and (p_plan ? 'topic' or p_plan ? 'weekday_topic') then
    insert into public.semester_weeks (semester_id, week_no, status)
    values (
      p_semester_id,
      p_week_no,
      case
        when p_week_no < coalesce(target.current_week_no, 1) then 'completed'
        when p_week_no = coalesce(target.current_week_no, 1) then 'current'
        else 'planned'
      end
    )
    on conflict (semester_id, week_no) do nothing;

    update public.semester_weeks
    set
      topic = case when p_plan ? 'topic' then nullif(trim(p_plan ->> 'topic'), '') else topic end,
      weekday_topic = case when p_plan ? 'weekday_topic' then nullif(trim(p_plan ->> 'weekday_topic'), '') else weekday_topic end
    where semester_id = p_semester_id
      and week_no = p_week_no;
  end if;

  -- 조 편성: 이 주차 키만 바꾼다 (다른 주차 편성은 그대로)
  if p_plan ? 'setup' then
    if jsonb_typeof(p_plan -> 'setup') = 'object' then
      working_setup := jsonb_set(working_setup, array[p_week_no::text], p_plan -> 'setup', true);
    else
      working_setup := working_setup - p_week_no::text;
    end if;

    update public.semesters set weekly_setup = working_setup where id = p_semester_id;

    if target.status = 'active' then
      insert into public.pr_config (key, value)
      values ('weekly_setup', working_setup::text)
      on conflict (key) do update set value = excluded.value;
    end if;
  end if;

  -- 마감: 이 학기 행만 바꾼다
  if p_plan ? 'deadlines' then
    for category_key, category_value in select key, value from jsonb_each(p_plan -> 'deadlines') loop
      if nullif(category_value #>> '{}', '') is null then
        delete from public.pr_deadlines
        where semester_id = p_semester_id
          and week = p_week_no
          and category = category_key;
      else
        insert into public.pr_deadlines (semester_id, week, category, deadline_time)
        values (p_semester_id, p_week_no, category_key, (category_value #>> '{}')::timestamptz)
        on conflict (semester_id, week, category) do update set deadline_time = excluded.deadline_time;
      end if;
    end loop;
  end if;

  if p_plan ? 'favorite_locations' then
    insert into public.pr_config (key, value)
    values ('favorite_locations', coalesce(p_plan -> 'favorite_locations', '[]'::jsonb)::text)
    on conflict (key) do update set value = excluded.value;
  end if;

  if p_plan ? 'topic' or p_plan ? 'weekday_topic' then
    perform public.refresh_legacy_week_topics(p_semester_id);
  end if;

  -- 저장 직후 상태를 돌려준다 (화면은 이 값을 다음 저장의 기준값으로 쓴다)
  return jsonb_build_object(
    'semester_id', p_semester_id,
    'week_no', p_week_no,
    'topic', case
      when p_week_no = 0 then (select ot_topic from public.semesters where id = p_semester_id)
      else (select topic from public.semester_weeks where semester_id = p_semester_id and week_no = p_week_no)
    end,
    'weekday_topic', (select weekday_topic from public.semester_weeks where semester_id = p_semester_id and week_no = p_week_no),
    'setup', working_setup -> p_week_no::text,
    'deadlines', (
      select coalesce(jsonb_object_agg(d.category, d.deadline_time), '{}'::jsonb)
      from public.pr_deadlines d
      where d.semester_id = p_semester_id
        and d.week = p_week_no
    ),
    'favorite_locations', (select public.try_parse_jsonb(value) from public.pr_config where key = 'favorite_locations')
  );
end;
$$;

revoke all on function public.admin_save_semester_configuration(uuid, text, text, text, integer, integer, date, date, jsonb) from public;
grant execute on function public.admin_save_semester_configuration(uuid, text, text, text, integer, integer, date, date, jsonb) to authenticated;
revoke all on function public.admin_save_week_plan(uuid, integer, jsonb) from public;
grant execute on function public.admin_save_week_plan(uuid, integer, jsonb) to authenticated;

commit;

-- 확인 1: 학기별 주제 개수 (W0 포함)
select
  s.code as semester,
  s.status,
  s.total_weeks,
  nullif(trim(s.ot_topic), '') is not null as has_w0_topic,
  count(sw.id) filter (where nullif(trim(sw.topic), '') is not null) as weeks_with_topic,
  count(sw.id) filter (where nullif(trim(sw.weekday_topic), '') is not null) as weeks_with_weekday_topic,
  count(sw.id) filter (where sw.status = 'cancelled') as cancelled_weeks
from public.semesters s
left join public.semester_weeks sw on sw.semester_id = s.id
group by s.code, s.status, s.total_weeks, s.ot_topic
order by s.code;

-- 확인 2: 운영 학기에서 semester_weeks와 legacy config 값이 서로 다른 칸 (자동으로 바꾸지 않음)
select
  sw.week_no,
  'topic' as field,
  sw.topic as semester_weeks_value,
  public.try_parse_jsonb(pc.value) ->> sw.week_no::text as legacy_config_value
from public.semester_weeks sw
join public.semesters s on s.id = sw.semester_id and s.status = 'active'
join public.pr_config pc on pc.key = 'week_topics'
where nullif(trim(sw.topic), '') is not null
  and nullif(trim(public.try_parse_jsonb(pc.value) ->> sw.week_no::text), '') is not null
  and trim(sw.topic) <> trim(public.try_parse_jsonb(pc.value) ->> sw.week_no::text)
union all
select
  sw.week_no,
  'weekday_topic',
  sw.weekday_topic,
  public.try_parse_jsonb(pc.value) ->> ('weekday_' || sw.week_no)
from public.semester_weeks sw
join public.semesters s on s.id = sw.semester_id and s.status = 'active'
join public.pr_config pc on pc.key = 'week_topics'
where nullif(trim(sw.weekday_topic), '') is not null
  and nullif(trim(public.try_parse_jsonb(pc.value) ->> ('weekday_' || sw.week_no)), '') is not null
  and trim(sw.weekday_topic) <> trim(public.try_parse_jsonb(pc.value) ->> ('weekday_' || sw.week_no))
order by 1, 2;

-- 확인 3: 함수 준비 상태 (모두 true)
select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'semesters' and column_name = 'ot_topic'
  ) as ot_topic_column_ready,
  to_regprocedure('public.admin_save_week_plan(uuid,integer,jsonb)') is not null as week_plan_function_ready,
  to_regprocedure('public.refresh_legacy_week_topics(uuid)') is not null as legacy_refresh_ready,
  exists (
    select 1 from pg_proc p
    where p.oid = to_regprocedure('public.admin_save_semester_configuration(uuid,text,text,text,integer,integer,date,date,jsonb)')
      and p.prosrc like '%WEEK_TOPIC_CONFLICT%'
  ) as semester_save_keeps_topics_ready,
  exists (
    select 1 from pg_proc p
    where p.oid = to_regprocedure('public.build_week_topics(uuid)')
      and p.prosrc like '%ot_topic%'
  ) as week_topics_include_w0_ready;
