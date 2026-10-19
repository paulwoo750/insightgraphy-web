-- Keep semester_id filled on operational rows and keep week_topics per semester.
-- 1. New rows that only carry the legacy semester code get semester_id automatically.
-- 2. Existing rows with a matching semester code are linked (semester_id only).
-- 3. pr_config.week_topics written by the semester RPCs keeps weekday topics.
-- No rows are deleted and no legacy column is modified.
--
-- Run this BEFORE the next semester switch: unlinked absence forms are attached
-- to the semester that is active at the time this script runs.

begin;

select pg_advisory_xact_lock(hashtextextended('insightgraphy-step-11', 0));

create or replace function public.fill_semester_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  semester_code text := nullif(trim(to_jsonb(new) ->> 'semester'), '');
begin
  -- 명시된 semester_id는 그대로 둔다. 수정 시 학기 코드가 바뀐 경우에만 다시 연결한다.
  if new.semester_id is not null then
    if tg_op = 'INSERT'
      or semester_code is not distinct from nullif(trim(to_jsonb(old) ->> 'semester'), '') then
      return new;
    end if;
  end if;

  if semester_code = '상시' then
    return new;
  end if;

  if semester_code is not null then
    select s.id into new.semester_id
    from public.semesters s
    where s.code = semester_code;
  elsif new.semester_id is null and tg_table_name = 'absence_forms' then
    -- 사유서는 학기 코드 없이 제출되며 제출 시점의 운영 학기에 속한다
    select s.id into new.semester_id
    from public.semesters s
    where s.status = 'active'
    limit 1;
  end if;

  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'files_metadata', 'archive_files', 'pr_attendance', 'pr_fines',
    'presentations', 'scores', 'absence_forms'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_fill_semester_id', table_name);
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.fill_semester_id()',
      table_name || '_fill_semester_id',
      table_name
    );
  end loop;
end;
$$;

update public.files_metadata t set semester_id = s.id
from public.semesters s
where t.semester_id is null and s.code = trim(t.semester);

update public.archive_files t set semester_id = s.id
from public.semesters s
where t.semester_id is null and trim(t.semester) <> '상시' and s.code = trim(t.semester);

update public.pr_attendance t set semester_id = s.id
from public.semesters s
where t.semester_id is null and s.code = trim(t.semester);

update public.pr_fines t set semester_id = s.id
from public.semesters s
where t.semester_id is null and s.code = trim(t.semester);

update public.presentations t set semester_id = s.id
from public.semesters s
where t.semester_id is null and s.code = trim(t.semester);

update public.scores t set semester_id = s.id
from public.semesters s
where t.semester_id is null and s.code = trim(t.semester);

update public.absence_forms t set semester_id = s.id
from public.semesters s
where t.semester_id is null and s.status = 'active';

-- week_topics = { "1": 정규 주제, "weekday_1": 평일 주제 } (기존 RPC는 평일 주제를 빠뜨렸다)
create or replace function public.build_week_topics(p_semester_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(
    jsonb_object_agg(sw.week_no::text, coalesce(sw.topic, ''))
      || jsonb_object_agg('weekday_' || sw.week_no, coalesce(sw.weekday_topic, '')),
    '{}'::jsonb
  )
  from public.semester_weeks sw
  where sw.semester_id = p_semester_id;
$$;

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
  week_topics_value text;
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

  if exists (
    select 1
    from public.semester_weeks sw
    where sw.semester_id = p_semester_id
      and sw.week_no > p_total_weeks
  ) then
    raise exception 'Weeks above the requested total already exist';
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

  insert into public.semester_weeks (
    semester_id,
    week_no,
    topic,
    weekday_topic,
    status
  )
  select
    p_semester_id,
    w.week_no::smallint,
    nullif(trim(w.topic), ''),
    nullif(trim(w.weekday_topic), ''),
    case
      when w.status = 'cancelled' then 'cancelled'
      when w.week_no < p_current_week_no then 'completed'
      when w.week_no = p_current_week_no then 'current'
      else 'planned'
    end
  from jsonb_to_recordset(coalesce(p_weeks, '[]'::jsonb))
    as w(week_no integer, topic text, weekday_topic text, status text)
  where w.week_no between 1 and p_total_weeks
  on conflict (semester_id, week_no) do update set
    topic = excluded.topic,
    weekday_topic = excluded.weekday_topic,
    status = excluded.status;

  if saved_semester.status = 'active' then
    -- 같은 학기 저장이므로 semester_weeks에 없는 키(0주차 OT 주제 등)는 유지한다
    select (
      coalesce(public.try_parse_jsonb(pc.value), '{}'::jsonb)
      || public.build_week_topics(saved_semester.id)
    )::text
    into week_topics_value
    from (select 1) one
    left join public.pr_config pc on pc.key = 'week_topics';

    insert into public.pr_config (key, value)
    values
      ('current_semester', saved_semester.code),
      ('semester_type', saved_semester.semester_type),
      ('total_weeks', saved_semester.total_weeks::text),
      ('current_week', saved_semester.current_week_no::text),
      ('week_topics', week_topics_value)
    on conflict (key) do update set value = excluded.value;
  end if;

  return saved_semester;
end;
$$;

create or replace function public.admin_activate_semester(
  p_semester_id uuid
)
returns public.semesters
language plpgsql
security definer
set search_path = public
as $$
declare
  activated_semester public.semesters%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required';
  end if;

  if not exists (
    select 1
    from public.semesters s
    where s.id = p_semester_id
      and s.status <> 'archived'
  ) then
    raise exception 'Semester not found or archived';
  end if;

  update public.semesters
  set status = 'closed'
  where status = 'active'
    and id <> p_semester_id;

  update public.semesters
  set
    status = 'active',
    current_week_no = coalesce(current_week_no, 1)
  where id = p_semester_id
  returning * into activated_semester;

  insert into public.pr_config (key, value)
  values
    ('current_semester', activated_semester.code),
    ('semester_type', activated_semester.semester_type),
    ('total_weeks', activated_semester.total_weeks::text),
    ('current_week', activated_semester.current_week_no::text),
    ('week_topics', public.build_week_topics(activated_semester.id)::text)
  on conflict (key) do update set value = excluded.value;

  return activated_semester;
end;
$$;

revoke all on function public.build_week_topics(uuid) from public;
grant execute on function public.build_week_topics(uuid) to authenticated;

commit;

select 'files_metadata' as table_name, count(*) filter (where semester_id is null) as unlinked, count(*) as total from public.files_metadata
union all select 'pr_attendance', count(*) filter (where semester_id is null), count(*) from public.pr_attendance
union all select 'pr_fines', count(*) filter (where semester_id is null), count(*) from public.pr_fines
union all select 'presentations', count(*) filter (where semester_id is null), count(*) from public.presentations
union all select 'scores', count(*) filter (where semester_id is null), count(*) from public.scores
union all select 'absence_forms', count(*) filter (where semester_id is null), count(*) from public.absence_forms
order by table_name;

select
  to_regprocedure('public.fill_semester_id()') is not null as autofill_function_ready,
  to_regprocedure('public.build_week_topics(uuid)') is not null as week_topics_function_ready,
  (
    select count(*)
    from pg_trigger
    where tgname like '%\_fill\_semester\_id' escape '\'
      and not tgisinternal
  ) = 7 as autofill_triggers_ready;
