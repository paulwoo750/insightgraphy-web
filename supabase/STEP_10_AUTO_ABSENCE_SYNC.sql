-- Convert missing attendance into absence records after attendance closes.
-- Future sessions and sessions without a configured close time are untouched.

begin;

select pg_advisory_xact_lock(hashtextextended('insightgraphy-step-10', 0));

alter table public.pr_attendance
  add column if not exists auto_marked_at timestamptz;

create index if not exists pr_attendance_semester_member_week_idx
  on public.pr_attendance (semester_id, member_id, week, session_type);

create or replace function public.clear_attendance_auto_mark()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status is distinct from new.status then
    new.auto_marked_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists pr_attendance_clear_auto_mark on public.pr_attendance;
create trigger pr_attendance_clear_auto_mark
before update of status on public.pr_attendance
for each row execute function public.clear_attendance_auto_mark();

create or replace function public.admin_sync_missing_attendance(
  p_semester_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_semester public.semesters%rowtype;
  configured_semester text;
  regular_count integer := 0;
  weekday_count integer := 0;
begin
  if not public.is_admin(array['super_admin', 'admin', 'operator']) then
    raise exception 'Administrator access is required';
  end if;

  select *
  into target_semester
  from public.semesters s
  where s.id = p_semester_id;

  if target_semester.id is null then
    raise exception 'Semester not found: %', p_semester_id;
  end if;

  if target_semester.status <> 'active' then
    return jsonb_build_object(
      'semester_id', p_semester_id,
      'inserted_count', 0,
      'regular_count', 0,
      'weekday_count', 0,
      'skipped', true,
      'reason', 'Only the active semester is synchronized automatically'
    );
  end if;

  select pc.value
  into configured_semester
  from public.pr_config pc
  where pc.key = 'current_semester';

  if nullif(trim(configured_semester), '') is distinct from target_semester.code then
    return jsonb_build_object(
      'semester_id', p_semester_id,
      'inserted_count', 0,
      'regular_count', 0,
      'weekday_count', 0,
      'skipped', true,
      'reason', 'Active semester and legacy attendance configuration do not match'
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended('attendance-sync:' || p_semester_id::text, 0));

  with closed_regular as (
    select
      sw.week_no::integer as week_no,
      max(sd.due_at) as closes_at
    from public.semester_deadlines sd
    join public.semester_weeks sw
      on sw.id = sd.semester_week_id
     and sw.semester_id = p_semester_id
    where sd.category = 'attendance_end'
    group by sw.week_no
    having max(sd.due_at) < now()
  ), candidates as (
    select
      m.id as member_id,
      m.name as user_name,
      cr.week_no,
      session.id as session_id
    from closed_regular cr
    join public.semester_memberships sm
      on sm.semester_id = p_semester_id
     and sm.participation_status = 'active'
    join public.members m
      on m.id = sm.member_id
     and m.status = 'active'
    left join public.semester_weeks sw
      on sw.semester_id = p_semester_id
     and sw.week_no = cr.week_no
    left join public.sessions session
      on session.semester_week_id = sw.id
     and session.session_type = 'regular'
     and session.group_no is null
     and session.status <> 'cancelled'
    where sw.status is distinct from 'cancelled'
      and not exists (
        select 1
        from public.sessions cancelled_session
        where cancelled_session.semester_week_id = sw.id
          and cancelled_session.session_type = 'regular'
          and cancelled_session.group_no is null
          and cancelled_session.status = 'cancelled'
      )
  )
  insert into public.pr_attendance (
    user_name,
    week,
    status,
    session_type,
    semester,
    member_id,
    semester_id,
    session_id,
    auto_marked_at
  )
  select
    c.user_name,
    c.week_no,
    case
      when af.status like '%완전인정%' then '완전인정결석'
      when af.status like '%부분인정%' then '부분인정결석'
      else '무단결석'
    end,
    'regular',
    target_semester.code,
    c.member_id,
    p_semester_id,
    c.session_id,
    now()
  from candidates c
  left join lateral (
    select absence.status
    from public.absence_forms absence
    where absence.week = c.week_no
      and coalesce(nullif(absence.session_type, ''), 'regular') = 'regular'
      and (absence.semester_id is null or absence.semester_id = p_semester_id)
      and (
        absence.member_id = c.member_id
        or public.normalize_member_name(absence.user_name) = public.normalize_member_name(c.user_name)
      )
    order by absence.created_at desc
    limit 1
  ) af on true
  where not exists (
    select 1
    from public.pr_attendance attendance
    where attendance.week = c.week_no
      and coalesce(nullif(attendance.session_type, ''), 'regular') = 'regular'
      and (
        attendance.member_id = c.member_id
        or public.normalize_member_name(attendance.user_name) = public.normalize_member_name(c.user_name)
      )
      and (
        attendance.semester_id = p_semester_id
        or attendance.semester = target_semester.code
      )
  );

  get diagnostics regular_count = row_count;

  with config as (
    select public.try_parse_jsonb(pc.value) as value
    from public.pr_config pc
    where pc.key = 'weekly_setup'
  ), week_setups as (
    select
      week_entry.key::integer as week_no,
      week_entry.value as setup
    from config
    cross join lateral jsonb_each(config.value) week_entry
    where week_entry.key ~ '^[0-9]+$'
      and lower(coalesce(week_entry.value ->> 'weekdaySession', 'false')) = 'true'
  ), assignments as (
    select
      ws.week_no,
      ws.setup,
      member_entry.key as member_name,
      nullif(regexp_replace(member_entry.value #>> '{}', '[^0-9]', '', 'g'), '')::integer as group_no
    from week_setups ws
    cross join lateral jsonb_each(
      case
        when jsonb_typeof(ws.setup -> 'weekdayMembers') = 'object'
          and jsonb_object_length(
            case
              when jsonb_typeof(ws.setup -> 'weekdayMembers') = 'object'
                then ws.setup -> 'weekdayMembers'
              else '{}'::jsonb
            end
          ) > 0
          then ws.setup -> 'weekdayMembers'
        else coalesce(ws.setup -> 'members', '{}'::jsonb)
      end
    ) member_entry
  ), closed_weekday as (
    select
      a.week_no,
      a.member_name,
      a.group_no,
      public.parse_kst_timestamp(
        concat_ws(
          ' ',
          group_setup.value ->> 'date',
          coalesce(nullif(group_setup.value ->> 'attEnd', ''), '23:59')
        )
      ) as closes_at
    from assignments a
    cross join lateral (
      select (a.setup -> 'weekday' -> a.group_no::text) as value
    ) group_setup
    where a.group_no is not null
  ), candidates as (
    select
      m.id as member_id,
      m.name as user_name,
      cw.week_no,
      cw.group_no,
      session.id as session_id
    from closed_weekday cw
    join public.members m
      on public.normalize_member_name(m.name) = public.normalize_member_name(cw.member_name)
     and m.status = 'active'
    join public.semester_memberships sm
      on sm.member_id = m.id
     and sm.semester_id = p_semester_id
     and sm.participation_status = 'active'
    left join public.semester_weeks sw
      on sw.semester_id = p_semester_id
     and sw.week_no = cw.week_no
    left join public.sessions session
      on session.semester_week_id = sw.id
     and session.session_type = 'weekday'
     and session.group_no = cw.group_no
     and session.status <> 'cancelled'
    where cw.closes_at is not null
      and cw.closes_at < now()
      and sw.status is distinct from 'cancelled'
      and not exists (
        select 1
        from public.sessions cancelled_session
        where cancelled_session.semester_week_id = sw.id
          and cancelled_session.session_type = 'weekday'
          and cancelled_session.group_no = cw.group_no
          and cancelled_session.status = 'cancelled'
      )
  )
  insert into public.pr_attendance (
    user_name,
    week,
    status,
    session_type,
    semester,
    member_id,
    semester_id,
    session_id,
    auto_marked_at
  )
  select
    c.user_name,
    c.week_no,
    case
      when af.status like '%완전인정%' then '완전인정결석'
      when af.status like '%부분인정%' then '부분인정결석'
      else '무단결석'
    end,
    'weekday',
    target_semester.code,
    c.member_id,
    p_semester_id,
    c.session_id,
    now()
  from candidates c
  left join lateral (
    select absence.status
    from public.absence_forms absence
    where absence.week = c.week_no
      and absence.session_type = 'weekday'
      and (absence.semester_id is null or absence.semester_id = p_semester_id)
      and (
        absence.member_id = c.member_id
        or public.normalize_member_name(absence.user_name) = public.normalize_member_name(c.user_name)
      )
    order by absence.created_at desc
    limit 1
  ) af on true
  where not exists (
    select 1
    from public.pr_attendance attendance
    where attendance.week = c.week_no
      and attendance.session_type = 'weekday'
      and (
        attendance.member_id = c.member_id
        or public.normalize_member_name(attendance.user_name) = public.normalize_member_name(c.user_name)
      )
      and (
        attendance.semester_id = p_semester_id
        or attendance.semester = target_semester.code
      )
  );

  get diagnostics weekday_count = row_count;

  return jsonb_build_object(
    'semester_id', p_semester_id,
    'inserted_count', regular_count + weekday_count,
    'regular_count', regular_count,
    'weekday_count', weekday_count,
    'skipped', false
  );
end;
$$;

revoke all on function public.admin_sync_missing_attendance(uuid) from public;
grant execute on function public.admin_sync_missing_attendance(uuid) to authenticated;

commit;

select
  to_regprocedure('public.admin_sync_missing_attendance(uuid)') is not null as sync_function_ready,
  to_regprocedure('public.clear_attendance_auto_mark()') is not null as correction_trigger_function_ready,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pr_attendance'
      and column_name = 'auto_marked_at'
  ) as auto_mark_column_ready;
