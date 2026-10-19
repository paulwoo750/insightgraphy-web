-- Safe additive application support.
-- 1. Adds a narrowly scoped public read policy for the current public roster.
-- 2. Adds transactional admin functions for semester save/activation.
-- No existing table rows are deleted.

begin;

drop policy if exists memberships_public_current_read
on public.semester_memberships;

create policy memberships_public_current_read
on public.semester_memberships
for select
to anon
using (
  participation_status = 'active'
  and exists (
    select 1
    from public.semesters s
    where s.id = semester_memberships.semester_id
      and s.status = 'active'
  )
  and exists (
    select 1
    from public.members m
    where m.id = semester_memberships.member_id
      and m.status = 'active'
      and m.is_public
  )
);

grant select on public.semester_memberships to anon;

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
    select coalesce(
      jsonb_object_agg(sw.week_no::text, coalesce(sw.topic, '') order by sw.week_no),
      '{}'::jsonb
    )::text
    into week_topics_value
    from public.semester_weeks sw
    where sw.semester_id = saved_semester.id;

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
  week_topics_value text;
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

  select coalesce(
    jsonb_object_agg(sw.week_no::text, coalesce(sw.topic, '') order by sw.week_no),
    '{}'::jsonb
  )::text
  into week_topics_value
  from public.semester_weeks sw
  where sw.semester_id = activated_semester.id;

  insert into public.pr_config (key, value)
  values
    ('current_semester', activated_semester.code),
    ('semester_type', activated_semester.semester_type),
    ('total_weeks', activated_semester.total_weeks::text),
    ('current_week', activated_semester.current_week_no::text),
    ('week_topics', week_topics_value)
  on conflict (key) do update set value = excluded.value;

  return activated_semester;
end;
$$;

create or replace function public.admin_create_semester(
  p_code text,
  p_name text,
  p_semester_type text,
  p_total_weeks integer,
  p_starts_on date,
  p_ends_on date
)
returns public.semesters
language plpgsql
security definer
set search_path = public
as $$
declare
  created_semester public.semesters%rowtype;
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

  insert into public.semesters (
    code,
    name,
    semester_type,
    status,
    total_weeks,
    current_week_no,
    starts_on,
    ends_on
  )
  values (
    trim(p_code),
    trim(p_name),
    p_semester_type,
    'draft',
    p_total_weeks,
    1,
    p_starts_on,
    p_ends_on
  )
  returning * into created_semester;

  insert into public.semester_weeks (semester_id, week_no, status)
  select
    created_semester.id,
    week_no::smallint,
    case when week_no = 1 then 'current' else 'planned' end
  from generate_series(1, p_total_weeks) as gs(week_no);

  return created_semester;
end;
$$;

revoke all on function public.admin_save_semester_configuration(
  uuid, text, text, text, integer, integer, date, date, jsonb
) from public;
revoke all on function public.admin_activate_semester(uuid) from public;
revoke all on function public.admin_create_semester(
  text, text, text, integer, date, date
) from public;

grant execute on function public.admin_save_semester_configuration(
  uuid, text, text, text, integer, integer, date, date, jsonb
) to authenticated;
grant execute on function public.admin_activate_semester(uuid) to authenticated;
grant execute on function public.admin_create_semester(
  text, text, text, integer, date, date
) to authenticated;

commit;

select
  s.code as active_semester,
  count(*) as public_active_members
from public.semester_memberships sm
join public.semesters s on s.id = sm.semester_id and s.status = 'active'
join public.members m on m.id = sm.member_id and m.status = 'active' and m.is_public
where sm.participation_status = 'active'
group by s.code;

select
  to_regprocedure('public.admin_save_semester_configuration(uuid,text,text,text,integer,integer,date,date,jsonb)') is not null
    as save_function_ready,
  to_regprocedure('public.admin_activate_semester(uuid)') is not null
    as activate_function_ready,
  to_regprocedure('public.admin_create_semester(text,text,text,integer,date,date)') is not null
    as create_function_ready;
