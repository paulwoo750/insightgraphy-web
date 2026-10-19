-- Safe additive member lifecycle and attendance workflow.
-- Existing member, attendance, absence, fine, and semester rows are preserved.

begin;

select pg_advisory_xact_lock(hashtextextended('insightgraphy-step-8', 0));

alter table public.members
  add column if not exists requested_status text;

update public.members
set requested_status = case when status = 'alumni' then 'alumni' else 'active' end
where requested_status is null;

alter table public.members
  alter column requested_status set default 'active',
  alter column requested_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'members_requested_status_check'
      and conrelid = 'public.members'::regclass
  ) then
    alter table public.members
      add constraint members_requested_status_check
      check (requested_status in ('active', 'alumni'));
  end if;
end;
$$;

alter table public.absence_forms
  add column if not exists resolution_code text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references auth.users(id) on delete set null;

alter table public.pr_attendance
  add column if not exists source_absence_ref text;

alter table public.pr_fines
  add column if not exists source_absence_ref text,
  add column if not exists voided_at timestamptz;

create unique index if not exists pr_attendance_absence_source_unique
  on public.pr_attendance (source_absence_ref)
  where source_absence_ref is not null;

create unique index if not exists pr_fines_absence_source_unique
  on public.pr_fines (source_absence_ref)
  where source_absence_ref is not null;

-- A signup request records the requested lifecycle group, but remains pending
-- until an administrator approves it from the member management page.
create or replace function public.sync_profile_to_member()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_member_id uuid;
  candidate_count integer;
  auth_id uuid;
  signup_requested_status text := 'active';
begin
  select
    u.id,
    case
      when lower(coalesce(u.raw_user_meta_data ->> 'requested_member_status', '')) = 'alumni'
        then 'alumni'
      else 'active'
    end
  into auth_id, signup_requested_status
  from auth.users u
  where u.id = new.id;

  select m.id
  into target_member_id
  from public.members m
  where m.legacy_profile_id = new.id or m.auth_user_id = new.id
  order by (m.legacy_profile_id = new.id) desc
  limit 1;

  if target_member_id is null then
    select count(*), min(candidate.id::text)::uuid
    into candidate_count, target_member_id
    from public.members candidate
    where public.normalize_member_name(candidate.name) = public.normalize_member_name(new.name)
      and regexp_replace(coalesce(candidate.generation, ''), '[^0-9]', '', 'g')
          = regexp_replace(coalesce(new.student_id, ''), '[^0-9]', '', 'g')
      and candidate.legacy_profile_id is null
      and candidate.auth_user_id is null;

    if candidate_count <> 1 then
      target_member_id := null;
    end if;
  end if;

  if target_member_id is null then
    insert into public.members (
      auth_user_id,
      legacy_profile_id,
      name,
      generation,
      role,
      status,
      requested_status,
      is_public
    ) values (
      auth_id,
      new.id,
      trim(new.name),
      nullif(trim(new.student_id), ''),
      '일반',
      'pending',
      signup_requested_status,
      false
    )
    returning id into target_member_id;
  else
    update public.members
    set
      auth_user_id = coalesce(auth_id, auth_user_id),
      legacy_profile_id = new.id,
      name = trim(new.name),
      generation = nullif(trim(new.student_id), ''),
      requested_status = case
        when status = 'pending' then signup_requested_status
        else requested_status
      end
    where id = target_member_id;
  end if;

  update public.profiles
  set member_id = target_member_id
  where id = new.id and member_id is distinct from target_member_id;

  return new;
end;
$$;

create or replace function public.admin_bulk_set_member_status(
  p_member_ids uuid[],
  p_target_status text,
  p_semester_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required';
  end if;

  if coalesce(array_length(p_member_ids, 1), 0) = 0 then
    return 0;
  end if;

  if p_target_status is null or p_target_status not in ('active', 'alumni') then
    raise exception 'Unsupported member status: %', p_target_status;
  end if;

  update public.members
  set
    status = p_target_status,
    requested_status = p_target_status,
    joined_on = case when p_target_status = 'active' then coalesce(joined_on, current_date) else joined_on end,
    left_on = case when p_target_status = 'alumni' then coalesce(left_on, current_date) else null end
  where id = any(p_member_ids)
    and status is distinct from p_target_status;

  get diagnostics changed_count = row_count;

  if p_target_status = 'alumni' then
    update public.semester_memberships
    set participation_status = 'completed'
    where member_id = any(p_member_ids)
      and participation_status in ('active', 'leave');
  elsif p_semester_id is not null then
    insert into public.semester_memberships (
      semester_id,
      member_id,
      role,
      participation_status
    )
    select p_semester_id, member_id, 'member', 'active'
    from unnest(p_member_ids) as selected(member_id)
    on conflict (semester_id, member_id) do update set
      participation_status = 'active';
  end if;

  return changed_count;
end;
$$;

create or replace function public.admin_resolve_absence(
  p_absence_id text,
  p_decision text,
  p_comment text default '',
  p_has_makeup boolean default false,
  p_makeup_detail text default '',
  p_fine_amount integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_name text;
  target_week integer;
  target_session_type text;
  target_member_id uuid;
  target_semester_id uuid;
  target_semester_code text;
  final_status text;
  attendance_status text;
  final_comment text;
  attendance_id text;
  fine_id text;
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required';
  end if;

  if p_decision is null or p_decision not in ('full', 'partial', 'reject') then
    raise exception 'Unsupported absence decision: %', p_decision;
  end if;

  select
    af.user_name,
    af.week,
    coalesce(nullif(af.session_type, ''), 'regular'),
    af.member_id,
    af.semester_id
  into
    target_user_name,
    target_week,
    target_session_type,
    target_member_id,
    target_semester_id
  from public.absence_forms af
  where af.id::text = p_absence_id
  for update;

  if not found then
    raise exception 'Absence form not found: %', p_absence_id;
  end if;

  if target_week is null then
    raise exception 'Absence form has no week: %', p_absence_id;
  end if;

  if target_member_id is null then
    select m.id
    into target_member_id
    from public.members m
    where public.normalize_member_name(m.name) = public.normalize_member_name(target_user_name)
    order by case m.status when 'active' then 1 when 'leave' then 2 else 3 end, m.created_at
    limit 1;
  end if;

  if target_semester_id is null then
    select s.id
    into target_semester_id
    from public.semesters s
    where s.status = 'active'
    limit 1;
  end if;

  select s.code
  into target_semester_code
  from public.semesters s
  where s.id = target_semester_id;

  if p_decision = 'full' then
    final_status := '완전인정';
    attendance_status := '완전인정결석';
    final_comment := coalesce(nullif(trim(p_comment), ''), '사유 인정. 출석 인정 및 벌금 면제');
  elsif p_decision = 'partial' then
    final_status := format('부분인정 (대체과제: %s)', case when p_has_makeup then 'O' else 'X' end);
    attendance_status := '부분인정결석';
    final_comment := case
      when p_has_makeup then format('[대체 과제 부여]%s%s', chr(10), trim(p_makeup_detail))
      else coalesce(nullif(trim(p_comment), ''), '부분 인정 처리 (결석 횟수 포함, 벌금 면제)')
    end;
  else
    final_status := '불허';
    attendance_status := '무단결석';
    final_comment := coalesce(nullif(trim(p_comment), ''), '사유 불인정');
  end if;

  update public.absence_forms af
  set
    status = final_status,
    admin_comment = final_comment,
    resolution_code = p_decision,
    resolved_at = now(),
    resolved_by = auth.uid(),
    member_id = coalesce(af.member_id, target_member_id),
    semester_id = coalesce(af.semester_id, target_semester_id)
  where af.id::text = p_absence_id;

  select pa.id::text
  into attendance_id
  from public.pr_attendance pa
  where pa.week = target_week
    and coalesce(nullif(pa.session_type, ''), 'regular') = target_session_type
    and (
      (target_member_id is not null and pa.member_id = target_member_id)
      or public.normalize_member_name(pa.user_name) = public.normalize_member_name(target_user_name)
    )
    and (
      target_semester_id is null
      or pa.semester_id = target_semester_id
      or pa.semester = target_semester_code
    )
  order by pa.created_at desc
  limit 1;

  if attendance_id is null then
    insert into public.pr_attendance (
      user_name,
      week,
      status,
      session_type,
      semester,
      member_id,
      semester_id,
      source_absence_ref
    ) values (
      target_user_name,
      target_week,
      attendance_status,
      target_session_type,
      target_semester_code,
      target_member_id,
      target_semester_id,
      p_absence_id
    );
  else
    update public.pr_attendance pa
    set
      status = attendance_status,
      member_id = coalesce(pa.member_id, target_member_id),
      semester_id = coalesce(pa.semester_id, target_semester_id),
      semester = coalesce(nullif(pa.semester, ''), target_semester_code),
      source_absence_ref = p_absence_id
    where pa.id::text = attendance_id;
  end if;

  if p_decision in ('full', 'partial') then
    update public.pr_fines
    set voided_at = coalesce(voided_at, now())
    where source_absence_ref = p_absence_id
      and voided_at is null;
  else
    select pf.id::text
    into fine_id
    from public.pr_fines pf
    where pf.source_absence_ref = p_absence_id
       or (
         pf.source_absence_ref is null
         and pf.category = '사유서 불허 페널티'
         and pf.week = target_week
         and public.normalize_member_name(pf.user_name) = public.normalize_member_name(target_user_name)
         and (target_semester_code is null or pf.semester = target_semester_code)
       )
    order by pf.created_at desc
    limit 1;

    if fine_id is null then
      insert into public.pr_fines (
        user_name,
        week,
        category,
        amount,
        reason,
        is_paid,
        semester,
        member_id,
        semester_id,
        source_absence_ref,
        voided_at
      ) values (
        target_user_name,
        target_week,
        '사유서 불허 페널티',
        greatest(p_fine_amount, 0),
        final_comment,
        false,
        target_semester_code,
        target_member_id,
        target_semester_id,
        p_absence_id,
        null
      );
    else
      update public.pr_fines pf
      set
        amount = greatest(p_fine_amount, 0),
        reason = final_comment,
        is_paid = false,
        member_id = coalesce(pf.member_id, target_member_id),
        semester_id = coalesce(pf.semester_id, target_semester_id),
        source_absence_ref = p_absence_id,
        voided_at = null
      where pf.id::text = fine_id;
    end if;
  end if;

  return jsonb_build_object(
    'absence_id', p_absence_id,
    'decision', p_decision,
    'attendance_status', attendance_status,
    'fine_active', p_decision = 'reject' and p_fine_amount > 0
  );
end;
$$;

create or replace function public.admin_set_attendance_status(
  p_member_id uuid,
  p_semester_id uuid,
  p_week integer,
  p_session_type text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_name text;
  target_semester_code text;
  attendance_id text;
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required';
  end if;

  if p_week is null or p_week < 1 or p_week > 52 then
    raise exception 'Week is out of range: %', p_week;
  end if;

  if p_session_type is null or p_session_type not in ('regular', 'weekday', 'special', 'other') then
    raise exception 'Unsupported session type: %', p_session_type;
  end if;

  if p_status is null or p_status not in ('출석완료', '지각', '무단결석', '완전인정결석', '부분인정결석') then
    raise exception 'Unsupported attendance status: %', p_status;
  end if;

  select m.name into target_user_name
  from public.members m
  where m.id = p_member_id;

  select s.code into target_semester_code
  from public.semesters s
  where s.id = p_semester_id;

  if target_user_name is null or target_semester_code is null then
    raise exception 'Member or semester was not found';
  end if;

  select pa.id::text
  into attendance_id
  from public.pr_attendance pa
  where pa.week = p_week
    and coalesce(nullif(pa.session_type, ''), 'regular') = p_session_type
    and (pa.member_id = p_member_id or public.normalize_member_name(pa.user_name) = public.normalize_member_name(target_user_name))
    and (pa.semester_id = p_semester_id or pa.semester = target_semester_code)
  order by pa.created_at desc
  limit 1;

  if attendance_id is null then
    insert into public.pr_attendance (
      user_name,
      week,
      status,
      session_type,
      semester,
      member_id,
      semester_id
    ) values (
      target_user_name,
      p_week,
      p_status,
      p_session_type,
      target_semester_code,
      p_member_id,
      p_semester_id
    );
  else
    update public.pr_attendance pa
    set
      status = p_status,
      member_id = p_member_id,
      semester_id = p_semester_id,
      semester = target_semester_code,
      session_type = p_session_type
    where pa.id::text = attendance_id;
  end if;

  return jsonb_build_object(
    'member_id', p_member_id,
    'semester_id', p_semester_id,
    'week', p_week,
    'session_type', p_session_type,
    'status', p_status
  );
end;
$$;

revoke all on function public.admin_bulk_set_member_status(uuid[], text, uuid) from public;
revoke all on function public.admin_resolve_absence(text, text, text, boolean, text, integer) from public;
revoke all on function public.admin_set_attendance_status(uuid, uuid, integer, text, text) from public;

grant execute on function public.admin_bulk_set_member_status(uuid[], text, uuid) to authenticated;
grant execute on function public.admin_resolve_absence(text, text, text, boolean, text, integer) to authenticated;
grant execute on function public.admin_set_attendance_status(uuid, uuid, integer, text, text) to authenticated;

commit;

select
  to_regprocedure('public.admin_bulk_set_member_status(uuid[],text,uuid)') is not null as member_bulk_function_ready,
  to_regprocedure('public.admin_resolve_absence(text,text,text,boolean,text,integer)') is not null as absence_resolution_function_ready,
  to_regprocedure('public.admin_set_attendance_status(uuid,uuid,integer,text,text)') is not null as attendance_update_function_ready,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'members'
      and column_name = 'requested_status'
  ) as member_request_status_ready;
