-- Backfill the normalized core from the current InsightGraphy legacy tables.
-- Run after 202608220001_normalize_core.sql.

begin;

select pg_advisory_xact_lock(hashtextextended('insightgraphy-normalize-core', 0));

do $$
begin
  if to_regprocedure('ig_backup_20260822.assert_legacy_unchanged()') is null then
    raise exception using
      message = 'STEP 0 snapshot is missing.',
      hint = 'Run supabase/STEP_0_COPY_FIRST_internal_snapshot.sql first.';
  end if;

  perform ig_backup_20260822.assert_legacy_unchanged();
end;
$$;

-- 1. Canonical members: roster rows first, then link matching Auth profiles.
insert into public.members (
  legacy_pr_member_id,
  name,
  generation,
  university,
  department,
  role,
  status,
  is_public,
  created_at
)
select
  pm.id,
  trim(pm.name),
  nullif(trim(pm.generation), ''),
  nullif(trim(pm.university), ''),
  nullif(trim(pm.department), ''),
  coalesce(nullif(trim(pm.role), ''), '일반'),
  case when pm.is_active then 'active' else 'inactive' end,
  true,
  coalesce(pm.created_at, now())
from public.pr_members pm
on conflict (legacy_pr_member_id) do update set
  name = excluded.name,
  generation = excluded.generation,
  university = excluded.university,
  department = excluded.department,
  role = excluded.role,
  status = excluded.status,
  is_public = excluded.is_public;

with candidate_pairs as (
  select
    p.id as profile_id,
    m.id as member_id,
    count(*) over (partition by p.id) as matches_for_profile,
    count(*) over (partition by m.id) as matches_for_member
  from public.profiles p
  join public.members m
    on public.normalize_member_name(m.name) = public.normalize_member_name(p.name)
   and regexp_replace(coalesce(m.generation, ''), '[^0-9]', '', 'g')
       = regexp_replace(coalesce(p.student_id, ''), '[^0-9]', '', 'g')
  where m.legacy_pr_member_id is not null
), unique_pairs as (
  select profile_id, member_id
  from candidate_pairs
  where matches_for_profile = 1 and matches_for_member = 1
)
update public.members m
set
  legacy_profile_id = up.profile_id,
  auth_user_id = case when au.id is not null then up.profile_id else m.auth_user_id end
from unique_pairs up
left join auth.users au on au.id = up.profile_id
where m.id = up.member_id
  and (m.legacy_profile_id is null or m.legacy_profile_id = up.profile_id)
  and (m.auth_user_id is null or m.auth_user_id = up.profile_id);

insert into public.members (
  legacy_profile_id,
  auth_user_id,
  name,
  generation,
  role,
  status,
  is_public
)
select
  p.id,
  au.id,
  trim(p.name),
  nullif(trim(p.student_id), ''),
  '일반',
  'pending',
  false
from public.profiles p
left join auth.users au on au.id = p.id
where not exists (
  select 1 from public.members m where m.legacy_profile_id = p.id
)
on conflict (legacy_profile_id) do update set
  auth_user_id = excluded.auth_user_id,
  name = excluded.name,
  generation = excluded.generation;

update public.profiles p
set member_id = m.id
from public.members m
where m.legacy_profile_id = p.id
  and p.member_id is distinct from m.id;

update public.pr_members pm
set member_id = m.id
from public.members m
where m.legacy_pr_member_id = pm.id
  and pm.member_id is distinct from m.id;

create or replace view ig_backup_20260822.unique_member_names as
select
  public.normalize_member_name(name) as normalized_name,
  (array_agg(id order by id::text))[1] as member_id
from public.members
where nullif(public.normalize_member_name(name), '') is not null
group by public.normalize_member_name(name)
having count(*) = 1;

-- 2. Semesters and weeks: collect every semester still referenced by history.
with current_config as (
  select nullif(trim(value), '') as current_code
  from public.pr_config
  where key = 'current_semester'
)
update public.semesters s
set status = 'closed'
where s.status = 'active'
  and s.code is distinct from (select current_code from current_config limit 1);

with semester_codes as (
  select nullif(trim(value), '') as code from public.pr_config where key = 'current_semester'
  union select nullif(trim(semester), '') from public.pr_attendance
  union select nullif(trim(semester), '') from public.pr_fines
  union select nullif(trim(semester), '') from public.files_metadata
  union select nullif(trim(semester), '') from public.archive_files where trim(coalesce(semester, '')) <> '상시'
  union select nullif(trim(semester), '') from public.presentations
  union select nullif(trim(semester), '') from public.scores
)
insert into public.semesters (code, name, semester_type, status, total_weeks)
select
  code,
  code,
  case when code like '%여름%' or code like '%겨울%' then 'vacation' else 'regular' end,
  'closed',
  1
from semester_codes
where code is not null and lower(code) <> 'null'
on conflict (code) do update set
  name = excluded.name,
  semester_type = excluded.semester_type;

with raw_weeks as (
  select semester as code, week::integer as week_no from public.pr_attendance
  union all select semester, week::integer from public.pr_fines
  union all select semester, week::integer from public.files_metadata
  union all select semester, week::integer from public.presentations
  union all
  select semester, nullif(regexp_replace(coalesce(week::text, ''), '[^0-9]', '', 'g'), '')::integer
  from public.archive_files
), max_weeks as (
  select trim(code) as code, greatest(1, max(week_no))::smallint as total_weeks
  from raw_weeks
  where nullif(trim(code), '') is not null and week_no between 1 and 52
  group by trim(code)
)
update public.semesters s
set total_weeks = greatest(s.total_weeks, mw.total_weeks)
from max_weeks mw
where s.code = mw.code;

with config as (
  select
    max(value) filter (where key = 'current_semester') as current_code,
    max(value) filter (where key = 'semester_type') as semester_type,
    max(value) filter (where key = 'total_weeks') as total_weeks,
    max(value) filter (where key = 'current_week') as current_week
  from public.pr_config
  where key in ('current_semester', 'semester_type', 'total_weeks', 'current_week')
)
update public.semesters s
set
  status = 'active',
  semester_type = case when c.semester_type in ('regular', 'vacation') then c.semester_type else s.semester_type end,
  total_weeks = greatest(
    s.total_weeks,
    case when c.total_weeks ~ '^[0-9]+$' then c.total_weeks::smallint else 1 end
  ),
  current_week_no = case
    when c.current_week ~ '^[0-9]+$' then least(c.current_week::smallint, 52)
    else 1
  end
from config c
where s.code = trim(c.current_code);

insert into public.semester_weeks (semester_id, week_no, status)
select
  s.id,
  week_no::smallint,
  case
    when s.status = 'closed' then 'completed'
    when week_no < coalesce(s.current_week_no, 1) then 'completed'
    when week_no = coalesce(s.current_week_no, 1) then 'current'
    else 'planned'
  end
from public.semesters s
cross join lateral generate_series(1, s.total_weeks) as generated(week_no)
on conflict (semester_id, week_no) do update set
  status = excluded.status;

with topic_config as (
  select public.try_parse_jsonb(value) as topics
  from public.pr_config
  where key = 'week_topics'
), active_semester as (
  select id from public.semesters where status = 'active' limit 1
)
update public.semester_weeks sw
set
  topic = coalesce(nullif(tc.topics ->> sw.week_no::text, ''), sw.topic),
  weekday_topic = coalesce(nullif(tc.topics ->> ('weekday_' || sw.week_no), ''), sw.weekday_topic)
from topic_config tc, active_semester a
where sw.semester_id = a.id;

-- 3. Semester membership replaces the active-generation filter.
with active_semester as (
  select id from public.semesters where status = 'active' limit 1
), active_generations as (
  select regexp_replace(generation, '[^0-9]', '', 'g') as generation_no
  from public.pr_members_config pmc
  cross join lateral jsonb_array_elements_text(to_jsonb(pmc.active_generations)) as active_generation(generation)
)
insert into public.semester_memberships (
  semester_id,
  member_id,
  role,
  participation_status
)
select
  a.id,
  pm.member_id,
  coalesce(nullif(pm.role, ''), 'member'),
  'active'
from public.pr_members pm
cross join active_semester a
where pm.member_id is not null
  and pm.is_active
  and (
    not exists (select 1 from active_generations)
    or regexp_replace(coalesce(pm.generation, ''), '[^0-9]', '', 'g')
       in (select generation_no from active_generations)
  )
on conflict (semester_id, member_id) do update set
  role = excluded.role,
  participation_status = excluded.participation_status;

with historical_activity as (
  select user_name as member_name, semester as semester_code from public.pr_attendance
  union select user_name, semester from public.pr_fines
  union select uploader, semester from public.files_metadata
  union select uploader_name, semester from public.archive_files where trim(coalesce(semester, '')) <> '상시'
  union select presenter_name, semester from public.presentations
  union select voter_name, semester from public.scores
)
insert into public.semester_memberships (
  semester_id,
  member_id,
  role,
  participation_status
)
select distinct
  s.id,
  mn.member_id,
  'member',
  case when s.status = 'active' then 'active' else 'completed' end
from historical_activity h
join public.semesters s on s.code = trim(h.semester_code)
join ig_backup_20260822.unique_member_names mn
  on mn.normalized_name = public.normalize_member_name(h.member_name)
where nullif(trim(coalesce(h.semester_code, '')), '') is not null
on conflict (semester_id, member_id) do nothing;

-- 4. Public schedule events and canonical sessions.
with active_semester as (
  select id from public.semesters where status = 'active' limit 1
)
insert into public.calendar_events (
  semester_id,
  semester_week_id,
  legacy_pr_schedule_id,
  title,
  description,
  event_type,
  event_date,
  starts_at,
  ends_at,
  is_all_day,
  is_break,
  is_public
)
select
  a.id,
  sw.id,
  ps.id,
  coalesce(nullif(trim(ps.title), ''), '일정'),
  nullif(trim(ps.description), ''),
  coalesce(nullif(trim(ps.type), ''), 'other'),
  ps.full_date::text::date,
  case when nullif(trim(ps.start_time::text), '') is not null
    then public.parse_kst_timestamp(ps.full_date::text || ' ' || ps.start_time::text)
  end,
  case when nullif(trim(ps.end_time::text), '') is not null
    then public.parse_kst_timestamp(ps.full_date::text || ' ' || ps.end_time::text)
  end,
  coalesce(ps.is_allday, false) or nullif(trim(ps.start_time::text), '') is null,
  coalesce(ps.is_break, false),
  coalesce(ps.is_public, true)
from public.pr_schedules ps
cross join active_semester a
left join public.semester_weeks sw
  on sw.semester_id = a.id
 and sw.week_no = nullif(regexp_replace(coalesce(ps.week::text, ''), '[^0-9]', '', 'g'), '')::integer
where ps.full_date::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
on conflict (legacy_pr_schedule_id) do update set
  semester_id = excluded.semester_id,
  semester_week_id = excluded.semester_week_id,
  title = excluded.title,
  description = excluded.description,
  event_type = excluded.event_type,
  event_date = excluded.event_date,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  is_all_day = excluded.is_all_day,
  is_break = excluded.is_break,
  is_public = excluded.is_public;

update public.pr_schedules ps
set calendar_event_id = ce.id
from public.calendar_events ce
where ce.legacy_pr_schedule_id = ps.id
  and ps.calendar_event_id is distinct from ce.id;

insert into public.sessions (
  semester_week_id,
  session_type,
  title,
  topic,
  status
)
select
  sw.id,
  'regular',
  sw.week_no || '주차 정규 세션',
  sw.topic,
  case when sw.status = 'completed' then 'completed' else 'planned' end
from public.semester_weeks sw
on conflict (semester_week_id, session_type, (coalesce(group_no, 0))) do update set
  topic = excluded.topic,
  status = excluded.status;

with weekday_requirements as (
  select s.id as semester_id, a.week::smallint as week_no
  from public.pr_attendance a join public.semesters s on s.code = trim(a.semester)
  where a.session_type = 'weekday'
  union
  select s.id, f.week::smallint
  from public.files_metadata f join public.semesters s on s.code = trim(f.semester)
  where f.file_category like 'weekday_%'
  union
  select s.id, p.week::smallint
  from public.presentations p join public.semesters s on s.code = trim(p.semester)
  where coalesce(p.eval_version, '') like '%평일%'
  union
  select s.id, af.week::smallint
  from public.absence_forms af cross join lateral (
    select id from public.semesters where status = 'active' limit 1
  ) s
  where af.session_type = 'weekday'
  union
  select s.id, pd.week::smallint
  from public.pr_deadlines pd
  cross join lateral (
    select id from public.semesters where status = 'active' limit 1
  ) s
  where pd.category like 'weekday_%'
  union
  select s.id, week_entry.key::smallint
  from public.pr_config pc
  cross join lateral jsonb_each(public.try_parse_jsonb(pc.value)) week_entry
  cross join lateral (select id from public.semesters where status = 'active' limit 1) s
  where pc.key = 'weekly_setup'
    and week_entry.key ~ '^[0-9]+$'
    and coalesce((week_entry.value ->> 'weekdaySession')::boolean, false)
)
insert into public.sessions (semester_week_id, session_type, title, topic, status)
select
  sw.id,
  'weekday',
  sw.week_no || '주차 평일 세션',
  sw.weekday_topic,
  case when sw.status = 'completed' then 'completed' else 'planned' end
from weekday_requirements wr
join public.semester_weeks sw
  on sw.semester_id = wr.semester_id and sw.week_no = wr.week_no
on conflict (semester_week_id, session_type, (coalesce(group_no, 0))) do update set
  topic = excluded.topic,
  status = excluded.status;

with weekly_setup as (
  select week_entry.key::smallint as week_no, week_entry.value as setup
  from public.pr_config pc
  cross join lateral jsonb_each(public.try_parse_jsonb(pc.value)) week_entry
  where pc.key = 'weekly_setup' and week_entry.key ~ '^[0-9]+$'
), active_semester as (
  select id from public.semesters where status = 'active' limit 1
)
update public.sessions session
set
  title = sw.week_no || '주차 정규 세션',
  topic = sw.topic,
  calendar_event_id = regular_event.id,
  starts_at = coalesce(regular_event.starts_at, session.starts_at),
  ends_at = coalesce(regular_event.ends_at, session.ends_at),
  latitude = case when (ws.setup #>> '{location,lat}') ~ '^-?[0-9]+(\.[0-9]+)?$'
    then (ws.setup #>> '{location,lat}')::numeric else session.latitude end,
  longitude = case when (ws.setup #>> '{location,lng}') ~ '^-?[0-9]+(\.[0-9]+)?$'
    then (ws.setup #>> '{location,lng}')::numeric else session.longitude end,
  attendance_radius_m = case when (ws.setup #>> '{location,radius}') ~ '^[0-9]+$'
    then (ws.setup #>> '{location,radius}')::integer else session.attendance_radius_m end
from weekly_setup ws
cross join active_semester a
join public.semester_weeks sw
  on sw.semester_id = a.id and sw.week_no = ws.week_no
left join lateral (
  select ce.id, ce.starts_at, ce.ends_at
  from public.calendar_events ce
  where ce.semester_week_id = sw.id and ce.event_type = 'regular'
  order by ce.event_date, ce.starts_at nulls last
  limit 1
) regular_event on true
where session.semester_week_id = sw.id
  and session.session_type = 'regular'
  and session.group_no is null;

with weekly_setup as (
  select week_entry.key::smallint as week_no, week_entry.value as setup
  from public.pr_config pc
  cross join lateral jsonb_each(public.try_parse_jsonb(pc.value)) week_entry
  where pc.key = 'weekly_setup' and week_entry.key ~ '^[0-9]+$'
), weekday_groups as (
  select
    ws.week_no,
    group_entry.key::integer as group_no,
    group_entry.value as group_setup
  from weekly_setup ws
  cross join lateral jsonb_each(coalesce(ws.setup -> 'weekday', '{}'::jsonb)) group_entry
  where group_entry.key ~ '^[0-9]+$'
), active_semester as (
  select id from public.semesters where status = 'active' limit 1
)
insert into public.sessions (
  semester_week_id,
  session_type,
  group_no,
  title,
  topic,
  starts_at,
  ends_at,
  attendance_opens_at,
  attendance_closes_at,
  latitude,
  longitude,
  attendance_radius_m,
  status
)
select
  sw.id,
  'weekday',
  wg.group_no,
  sw.week_no || '주차 평일 세션 ' || wg.group_no || '조',
  sw.weekday_topic,
  ((wg.group_setup #>> '{date}')::date + (wg.group_setup #>> '{sessionStart}')::time) at time zone 'Asia/Seoul',
  ((wg.group_setup #>> '{date}')::date + (wg.group_setup #>> '{attEnd}')::time) at time zone 'Asia/Seoul',
  ((wg.group_setup #>> '{date}')::date + (wg.group_setup #>> '{attOpen}')::time) at time zone 'Asia/Seoul',
  ((wg.group_setup #>> '{date}')::date + (wg.group_setup #>> '{attEnd}')::time) at time zone 'Asia/Seoul',
  case when (wg.group_setup ->> 'lat') ~ '^-?[0-9]+(\.[0-9]+)?$' then (wg.group_setup ->> 'lat')::numeric end,
  case when (wg.group_setup ->> 'lng') ~ '^-?[0-9]+(\.[0-9]+)?$' then (wg.group_setup ->> 'lng')::numeric end,
  case when (wg.group_setup ->> 'radius') ~ '^[0-9]+$' then (wg.group_setup ->> 'radius')::integer end,
  'planned'
from weekday_groups wg
cross join active_semester a
join public.semester_weeks sw
  on sw.semester_id = a.id and sw.week_no = wg.week_no
on conflict (semester_week_id, session_type, (coalesce(group_no, 0))) do update set
  title = excluded.title,
  topic = excluded.topic,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  attendance_opens_at = excluded.attendance_opens_at,
  attendance_closes_at = excluded.attendance_closes_at,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  attendance_radius_m = excluded.attendance_radius_m;

-- 5. Deadlines: legacy week deadlines plus group-specific weekday deadlines.
with active_semester as (
  select id from public.semesters where status = 'active' limit 1
)
insert into public.semester_deadlines (
  semester_week_id,
  session_id,
  legacy_pr_deadline_id,
  category,
  due_at
)
select
  sw.id,
  session.id,
  pd.id,
  pd.category,
  public.parse_kst_timestamp(pd.deadline_time::text)
from public.pr_deadlines pd
cross join active_semester a
join public.semester_weeks sw
  on sw.semester_id = a.id and sw.week_no = pd.week
left join public.sessions session
  on session.semester_week_id = sw.id
 and session.session_type = case when pd.category like 'weekday_%' then 'weekday' else 'regular' end
 and session.group_no is null
where public.parse_kst_timestamp(pd.deadline_time::text) is not null
on conflict (legacy_pr_deadline_id) do update set
  semester_week_id = excluded.semester_week_id,
  session_id = excluded.session_id,
  category = excluded.category,
  due_at = excluded.due_at;

update public.pr_deadlines pd
set semester_deadline_id = sd.id
from public.semester_deadlines sd
where sd.legacy_pr_deadline_id = pd.id
  and pd.semester_deadline_id is distinct from sd.id;

with session_timing as (
  select
    session_id,
    max(due_at) filter (where category = 'session_start') as starts_at,
    max(due_at) filter (where category = 'attendance_start') as attendance_opens_at,
    max(due_at) filter (where category = 'attendance_end') as attendance_closes_at
  from public.semester_deadlines
  where legacy_pr_deadline_id is not null
  group by session_id
)
update public.sessions s
set
  starts_at = coalesce(st.starts_at, s.starts_at),
  attendance_opens_at = coalesce(st.attendance_opens_at, s.attendance_opens_at),
  attendance_closes_at = coalesce(st.attendance_closes_at, s.attendance_closes_at)
from session_timing st
where s.id = st.session_id;

with weekly_setup as (
  select week_entry.key::smallint as week_no, week_entry.value as setup
  from public.pr_config pc
  cross join lateral jsonb_each(public.try_parse_jsonb(pc.value)) week_entry
  where pc.key = 'weekly_setup' and week_entry.key ~ '^[0-9]+$'
), weekday_groups as (
  select
    ws.week_no,
    group_entry.key::integer as group_no,
    group_entry.value as group_setup
  from weekly_setup ws
  cross join lateral jsonb_each(coalesce(ws.setup -> 'weekday', '{}'::jsonb)) group_entry
  where group_entry.key ~ '^[0-9]+$'
), deadline_values as (
  select week_no, group_no, 'weekday_slide'::text as category, group_setup ->> 'slideDl' as raw_due from weekday_groups
  union all
  select week_no, group_no, 'weekday_video', group_setup ->> 'videoDl' from weekday_groups
  union all
  select week_no, group_no, 'weekday_feedback', group_setup ->> 'fbDl' from weekday_groups
), active_semester as (
  select id from public.semesters where status = 'active' limit 1
)
insert into public.semester_deadlines (
  semester_week_id,
  session_id,
  legacy_key,
  category,
  due_at
)
select
  sw.id,
  session.id,
  'weekly_setup:' || dv.week_no || ':' || dv.group_no || ':' || dv.category,
  dv.category,
  public.parse_kst_timestamp(dv.raw_due)
from deadline_values dv
cross join active_semester a
join public.semester_weeks sw
  on sw.semester_id = a.id and sw.week_no = dv.week_no
join public.sessions session
  on session.semester_week_id = sw.id
 and session.session_type = 'weekday'
 and session.group_no = dv.group_no
where public.parse_kst_timestamp(dv.raw_due) is not null
on conflict (legacy_key) do update set
  semester_week_id = excluded.semester_week_id,
  session_id = excluded.session_id,
  category = excluded.category,
  due_at = excluded.due_at;

-- 6. Team/group assignments from weekly_setup member maps.
with weekly_setup as (
  select week_entry.key::smallint as week_no, week_entry.value as setup
  from public.pr_config pc
  cross join lateral jsonb_each(public.try_parse_jsonb(pc.value)) week_entry
  where pc.key = 'weekly_setup' and week_entry.key ~ '^[0-9]+$'
), regular_assignments as (
  select
    ws.week_no,
    member_entry.key as member_name,
    nullif(regexp_replace(member_entry.value #>> '{}', '[^0-9]', '', 'g'), '')::integer as team_no
  from weekly_setup ws
  cross join lateral jsonb_each(coalesce(ws.setup -> 'members', '{}'::jsonb)) member_entry
), active_semester as (
  select id from public.semesters where status = 'active' limit 1
)
insert into public.session_participants (session_id, member_id, team_no)
select
  session.id,
  mn.member_id,
  ra.team_no
from regular_assignments ra
cross join active_semester a
join public.semester_weeks sw
  on sw.semester_id = a.id and sw.week_no = ra.week_no
join public.sessions session
  on session.semester_week_id = sw.id
 and session.session_type = 'regular'
 and session.group_no is null
join ig_backup_20260822.unique_member_names mn
  on mn.normalized_name = public.normalize_member_name(ra.member_name)
on conflict (session_id, member_id) do update set team_no = excluded.team_no;

with weekly_setup as (
  select week_entry.key::smallint as week_no, week_entry.value as setup
  from public.pr_config pc
  cross join lateral jsonb_each(public.try_parse_jsonb(pc.value)) week_entry
  where pc.key = 'weekly_setup' and week_entry.key ~ '^[0-9]+$'
), weekday_assignments as (
  select
    ws.week_no,
    member_entry.key as member_name,
    nullif(regexp_replace(member_entry.value #>> '{}', '[^0-9]', '', 'g'), '')::integer as team_no
  from weekly_setup ws
  cross join lateral jsonb_each(coalesce(ws.setup -> 'weekdayMembers', '{}'::jsonb)) member_entry
), active_semester as (
  select id from public.semesters where status = 'active' limit 1
), targets as (
  select
    wa.week_no,
    wa.member_name,
    wa.team_no,
    session.id as session_id
  from weekday_assignments wa
  cross join active_semester a
  join public.semester_weeks sw
    on sw.semester_id = a.id and sw.week_no = wa.week_no
  join public.sessions session
    on session.semester_week_id = sw.id
   and session.session_type = 'weekday'
   and (session.group_no is null or session.group_no = wa.team_no)
)
insert into public.session_participants (session_id, member_id, team_no)
select
  t.session_id,
  mn.member_id,
  t.team_no
from targets t
join ig_backup_20260822.unique_member_names mn
  on mn.normalized_name = public.normalize_member_name(t.member_name)
on conflict (session_id, member_id) do update set team_no = excluded.team_no;

-- 7. Attach stable IDs to all operational history.
update public.pr_attendance a
set
  member_id = mn.member_id,
  semester_id = s.id
from ig_backup_20260822.unique_member_names mn, public.semesters s
where mn.normalized_name = public.normalize_member_name(a.user_name)
  and s.code = trim(a.semester)
  and (a.member_id is distinct from mn.member_id or a.semester_id is distinct from s.id);

update public.pr_attendance a
set session_id = session.id
from public.semester_weeks sw
join public.sessions session
  on session.semester_week_id = sw.id and session.group_no is null
where sw.semester_id = a.semester_id
  and sw.week_no = a.week
  and session.session_type = case when a.session_type = 'weekday' then 'weekday' else 'regular' end
  and a.session_id is distinct from session.id;

update public.pr_fines f
set
  member_id = mn.member_id,
  semester_id = s.id
from ig_backup_20260822.unique_member_names mn, public.semesters s
where mn.normalized_name = public.normalize_member_name(f.user_name)
  and s.code = trim(f.semester)
  and (f.member_id is distinct from mn.member_id or f.semester_id is distinct from s.id);

update public.pr_fines f
set session_id = session.id
from public.semester_weeks sw
join public.sessions session
  on session.semester_week_id = sw.id and session.group_no is null
where sw.semester_id = f.semester_id
  and sw.week_no = f.week
  and session.session_type = case when f.category like '평일세션%' then 'weekday' else 'regular' end
  and f.session_id is distinct from session.id;

with active_semester as (
  select id from public.semesters where status = 'active' limit 1
)
update public.absence_forms af
set
  member_id = mn.member_id,
  semester_id = a.id
from ig_backup_20260822.unique_member_names mn, active_semester a
where mn.normalized_name = public.normalize_member_name(af.user_name)
  and (af.member_id is distinct from mn.member_id or af.semester_id is distinct from a.id);

update public.absence_forms af
set session_id = session.id
from public.semester_weeks sw
join public.sessions session
  on session.semester_week_id = sw.id and session.group_no is null
where sw.semester_id = af.semester_id
  and sw.week_no = af.week
  and session.session_type = case when af.session_type = 'weekday' then 'weekday' else 'regular' end
  and af.session_id is distinct from session.id;

update public.files_metadata f
set uploader_member_id = mn.member_id
from ig_backup_20260822.unique_member_names mn
where mn.normalized_name = public.normalize_member_name(f.uploader)
  and f.uploader_member_id is distinct from mn.member_id;

update public.files_metadata f
set semester_id = s.id
from public.semesters s
where s.code = trim(f.semester)
  and f.semester_id is distinct from s.id;

update public.files_metadata f
set session_id = session.id
from public.semester_weeks sw
join public.sessions session on session.semester_week_id = sw.id
where sw.semester_id = f.semester_id
  and sw.week_no = f.week
  and session.session_type = case when f.file_category like 'weekday_%' then 'weekday' else 'regular' end
  and (
    (f.file_category like 'weekday_%' and f.group_id is not null and session.group_no = f.group_id)
    or (session.group_no is null and (f.file_category not like 'weekday_%' or f.group_id is null))
  )
  and f.session_id is distinct from session.id;

update public.files_metadata f
set session_id = session.id
from public.semester_weeks sw
join public.sessions session
  on session.semester_week_id = sw.id
 and session.session_type = 'weekday'
 and session.group_no is null
where f.session_id is null
  and f.file_category like 'weekday_%'
  and sw.semester_id = f.semester_id
  and sw.week_no = f.week;

update public.archive_files af
set uploader_member_id = mn.member_id
from ig_backup_20260822.unique_member_names mn
where mn.normalized_name = public.normalize_member_name(af.uploader_name)
  and af.uploader_member_id is distinct from mn.member_id;

update public.archive_files af
set semester_id = s.id
from public.semesters s
where trim(af.semester) <> '상시'
  and s.code = trim(af.semester)
  and af.semester_id is distinct from s.id;

update public.archive_files af
set session_id = session.id
from public.semester_weeks sw
join public.sessions session
  on session.semester_week_id = sw.id
 and session.session_type = 'regular'
 and session.group_no is null
where af.semester_id = sw.semester_id
  and nullif(regexp_replace(coalesce(af.week::text, ''), '[^0-9]', '', 'g'), '')::integer = sw.week_no
  and af.session_id is distinct from session.id;

update public.file_comments fc
set member_id = auth_member.id
from public.members auth_member
where auth_member.auth_user_id = fc.user_id
  and fc.member_id is distinct from auth_member.id;

update public.file_comments fc
set member_id = mn.member_id
from ig_backup_20260822.unique_member_names mn
where fc.member_id is null
  and mn.normalized_name = public.normalize_member_name(fc.user_name);

update public.presentations p
set
  presenter_member_id = mn.member_id,
  semester_id = s.id
from ig_backup_20260822.unique_member_names mn, public.semesters s
where mn.normalized_name = public.normalize_member_name(p.presenter_name)
  and s.code = trim(p.semester)
  and (p.presenter_member_id is distinct from mn.member_id or p.semester_id is distinct from s.id);

update public.presentations p
set session_id = session.id
from public.semester_weeks sw
join public.sessions session
  on session.semester_week_id = sw.id
 and session.session_type = 'regular'
 and session.group_no is null
where sw.semester_id = p.semester_id
  and sw.week_no = p.week
  and p.session_id is distinct from session.id;

insert into public.session_participants (
  session_id,
  member_id,
  team_no,
  evaluation_group_no,
  cluster_no
)
select distinct
  p.session_id,
  p.presenter_member_id,
  coalesce(p.team_id, p.group_id),
  p.group_id,
  p.cluster_id
from public.presentations p
where p.session_id is not null and p.presenter_member_id is not null
on conflict (session_id, member_id) do update set
  team_no = coalesce(session_participants.team_no, excluded.team_no),
  evaluation_group_no = coalesce(session_participants.evaluation_group_no, excluded.evaluation_group_no),
  cluster_no = coalesce(session_participants.cluster_no, excluded.cluster_no);

update public.scores score
set voter_member_id = mn.member_id
from ig_backup_20260822.unique_member_names mn
where mn.normalized_name = public.normalize_member_name(score.voter_name)
  and score.voter_member_id is distinct from mn.member_id;

update public.scores score
set semester_id = s.id
from public.semesters s
where s.code = trim(score.semester)
  and score.semester_id is distinct from s.id;

-- 8. Review queue: never guess when a mutable name is missing or duplicated.
update public.data_migration_issues
set resolved_at = now()
where resolved_at is null
  and issue_code in ('profile_not_in_roster', 'member_name_unresolved');

with unresolved as (
  select 'profiles'::text as source_table, p.id::text as source_pk,
    'profile_not_in_roster'::text as issue_code,
    jsonb_build_object('name', p.name, 'generation', p.student_id) as details
  from public.profiles p
  join public.members m on m.id = p.member_id
  where m.status = 'pending'
  union all
  select 'pr_attendance', id::text, 'member_name_unresolved', jsonb_build_object('name', user_name)
  from public.pr_attendance where member_id is null
  union all
  select 'pr_fines', id::text, 'member_name_unresolved', jsonb_build_object('name', user_name)
  from public.pr_fines where member_id is null
  union all
  select 'absence_forms', id::text, 'member_name_unresolved', jsonb_build_object('name', user_name)
  from public.absence_forms where member_id is null
  union all
  select 'files_metadata', id::text, 'member_name_unresolved', jsonb_build_object('name', uploader)
  from public.files_metadata where uploader_member_id is null
  union all
  select 'archive_files', id::text, 'member_name_unresolved', jsonb_build_object('name', uploader_name)
  from public.archive_files where uploader_member_id is null
  union all
  select 'file_comments', id::text, 'member_name_unresolved', jsonb_build_object('name', user_name, 'auth_user_id', user_id)
  from public.file_comments where member_id is null
  union all
  select 'presentations', id::text, 'member_name_unresolved', jsonb_build_object('name', presenter_name)
  from public.presentations where presenter_member_id is null
  union all
  select 'scores', id::text, 'member_name_unresolved', jsonb_build_object('name', voter_name)
  from public.scores where voter_member_id is null
)
insert into public.data_migration_issues (source_table, source_pk, issue_code, details)
select source_table, source_pk, issue_code, details
from unresolved
on conflict (source_table, source_pk, issue_code) do update set
  details = excluded.details,
  resolved_at = null;

select ig_backup_20260822.assert_legacy_unchanged();

commit;
