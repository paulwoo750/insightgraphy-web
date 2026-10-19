-- Make admin_sync_missing_attendance (STEP_10) actually create absences.
-- 1. Regular weeks: attendance_end was read from semester_deadlines, which only holds
--    the 2026-08-22 backfill (the app saves deadlines to pr_deadlines), so no regular
--    week of the active semester was ever closed. It is now read from pr_deadlines rows
--    of the synchronized semester (semester_id from STEP_12).
-- 2. Weekday sessions: the branch called jsonb_object_length, which does not exist in
--    PostgreSQL, so every call failed and nothing was inserted. The same condition
--    (a non-empty weekdayMembers object) is now written without it.
-- The cancelled-week and cancelled-session checks and the absence-form status mapping
-- are unchanged. No rows are deleted and no table is altered.
--
-- Run this AFTER STEP_12. The next fine-page scan creates absence rows for every closed
-- regular week and weekday session of the active semester that has no attendance row yet.

begin;

select pg_advisory_xact_lock(hashtextextended('insightgraphy-step-13', 0));

do $$
begin
  if to_regprocedure('public.clear_attendance_auto_mark()') is null then
    raise exception 'Run STEP_10_AUTO_ABSENCE_SYNC.sql first';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pr_deadlines'
      and column_name = 'semester_id'
  ) then
    raise exception 'Run STEP_12_SEMESTER_SCOPED_OPERATIONS.sql first';
  end if;
end;
$$;

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

  -- 정규 세션 출석 마감은 앱이 저장하는 이 학기의 pr_deadlines에서 읽는다. to_jsonb는
  -- deadline_time을 오프셋까지 넘기므로 컬럼이 timestamptz든 문자열이든 같은 시각이 된다.
  with closed_regular as (
    select
      sw.week_no::integer as week_no,
      max(public.parse_kst_timestamp(to_jsonb(pd) ->> 'deadline_time')) as closes_at
    from public.pr_deadlines pd
    join public.semester_weeks sw
      on sw.semester_id = p_semester_id
     and sw.week_no = pd.week
    where pd.semester_id = p_semester_id
      and pd.category = 'attendance_end'
    group by sw.week_no
    having max(public.parse_kst_timestamp(to_jsonb(pd) ->> 'deadline_time')) < now()
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
      -- jsonb_object_length는 PostgreSQL에 없는 함수라 STEP_10 함수는 여기서 매번 실패했다.
      -- 비어 있지 않은 weekdayMembers 객체를 쓰는 조건은 그대로다.
      case
        when jsonb_typeof(ws.setup -> 'weekdayMembers') = 'object'
          and ws.setup -> 'weekdayMembers' <> '{}'::jsonb
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

-- 운영 학기의 정규 주차별 출석 마감. members_without_attendance는 다음 벌금 스캔 때
-- 정규 결석 행이 생성될 인원이다 (마감 전·마감 미설정·취소된 주차와 세션은 비어 있다).
with active as (
  select s.id, s.code
  from public.semesters s
  where s.status = 'active'
  limit 1
), week_close as (
  select
    sw.week_no,
    sw.status = 'cancelled' or exists (
      select 1
      from public.sessions cancelled_session
      where cancelled_session.semester_week_id = sw.id
        and cancelled_session.session_type = 'regular'
        and cancelled_session.group_no is null
        and cancelled_session.status = 'cancelled'
    ) as cancelled,
    max(public.parse_kst_timestamp(to_jsonb(pd) ->> 'deadline_time')) as closes_at
  from active a
  join public.semester_weeks sw
    on sw.semester_id = a.id
  left join public.pr_deadlines pd
    on pd.semester_id = a.id
   and pd.week = sw.week_no
   and pd.category = 'attendance_end'
  group by sw.id, sw.week_no, sw.status
)
select
  a.code as semester,
  wc.week_no,
  to_char(wc.closes_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') as attendance_end_kst,
  wc.closes_at < now() as closed,
  wc.cancelled,
  case when wc.closes_at < now() and not wc.cancelled then (
    select count(*)
    from public.semester_memberships sm
    join public.members m
      on m.id = sm.member_id
     and m.status = 'active'
    where sm.semester_id = a.id
      and sm.participation_status = 'active'
      and not exists (
        select 1
        from public.pr_attendance attendance
        where attendance.week = wc.week_no
          and coalesce(nullif(attendance.session_type, ''), 'regular') = 'regular'
          and (
            attendance.member_id = m.id
            or public.normalize_member_name(attendance.user_name) = public.normalize_member_name(m.name)
          )
          and (
            attendance.semester_id = a.id
            or attendance.semester = a.code
          )
      )
  ) end as members_without_attendance
from week_close wc
cross join active a
order by wc.week_no;

select
  exists (
    select 1
    from pg_proc p
    where p.oid = to_regprocedure('public.admin_sync_missing_attendance(uuid)')
      and p.prosrc like '%public.pr_deadlines%'
      and p.prosrc not like '%semester_deadlines%'
  ) as sync_function_ready,
  not exists (
    select 1
    from public.pr_deadlines pd
    where pd.semester_id is null
  ) as deadlines_linked_ready,
  exists (
    select 1
    from public.semesters s
    join public.pr_config pc
      on pc.key = 'current_semester'
     and nullif(trim(pc.value), '') = s.code
    where s.status = 'active'
  ) as active_semester_config_ready;
