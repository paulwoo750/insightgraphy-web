-- Temporary compatibility bridge while the application is moved to the new schema.
-- Keeps profile/member creation and basic semester config synchronized.

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
begin
  select u.id into auth_id from auth.users u where u.id = new.id;

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
      is_public
    ) values (
      auth_id,
      new.id,
      trim(new.name),
      nullif(trim(new.student_id), ''),
      '일반',
      'pending',
      false
    )
    returning id into target_member_id;
  else
    update public.members
    set
      auth_user_id = coalesce(auth_id, auth_user_id),
      legacy_profile_id = new.id,
      name = trim(new.name),
      generation = nullif(trim(new.student_id), '')
    where id = target_member_id;
  end if;

  update public.profiles
  set member_id = target_member_id
  where id = new.id and member_id is distinct from target_member_id;

  return new;
end;
$$;

drop trigger if exists profiles_sync_member on public.profiles;
create trigger profiles_sync_member
after insert or update of name, student_id on public.profiles
for each row execute function public.sync_profile_to_member();

create or replace function public.sync_pr_member_to_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_member_id uuid;
  candidate_count integer;
begin
  target_member_id := new.member_id;

  if target_member_id is null then
    select m.id
    into target_member_id
    from public.members m
    where m.legacy_pr_member_id = new.id
    limit 1;
  end if;

  if target_member_id is null then
    select count(*), min(candidate.id::text)::uuid
    into candidate_count, target_member_id
    from public.members candidate
    where public.normalize_member_name(candidate.name) = public.normalize_member_name(new.name)
      and regexp_replace(coalesce(candidate.generation, ''), '[^0-9]', '', 'g')
          = regexp_replace(coalesce(new.generation, ''), '[^0-9]', '', 'g')
      and candidate.legacy_pr_member_id is null;

    if candidate_count <> 1 then
      target_member_id := null;
    end if;
  end if;

  if target_member_id is null then
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
    ) values (
      new.id,
      trim(new.name),
      nullif(trim(new.generation), ''),
      nullif(trim(new.university), ''),
      nullif(trim(new.department), ''),
      coalesce(nullif(trim(new.role), ''), '일반'),
      case when new.is_active then 'active' else 'inactive' end,
      true,
      coalesce(new.created_at, now())
    )
    returning id into target_member_id;
  else
    update public.members
    set
      legacy_pr_member_id = new.id,
      name = trim(new.name),
      generation = nullif(trim(new.generation), ''),
      university = nullif(trim(new.university), ''),
      department = nullif(trim(new.department), ''),
      role = coalesce(nullif(trim(new.role), ''), '일반'),
      status = case when new.is_active then 'active' else 'inactive' end,
      is_public = true
    where id = target_member_id;
  end if;

  new.member_id := target_member_id;
  return new;
end;
$$;

drop trigger if exists pr_members_sync_member on public.pr_members;
create trigger pr_members_sync_member
before insert or update of name, generation, university, department, role, is_active
on public.pr_members
for each row execute function public.sync_pr_member_to_member();

create or replace function public.mark_deleted_pr_member_inactive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.member_id is not null then
    update public.members
    set status = 'inactive'
    where id = old.member_id;
  end if;
  return old;
end;
$$;

drop trigger if exists pr_members_mark_deleted_inactive on public.pr_members;
create trigger pr_members_mark_deleted_inactive
after delete on public.pr_members
for each row execute function public.mark_deleted_pr_member_inactive();

create or replace function public.sync_legacy_semester_config()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_semester_id uuid;
  target_total_weeks smallint;
  target_current_week smallint;
begin
  if new.key = 'current_semester' and nullif(trim(new.value), '') is not null then
    update public.semesters
    set status = 'closed'
    where status = 'active' and code <> trim(new.value);

    insert into public.semesters (
      code,
      name,
      semester_type,
      status,
      total_weeks,
      current_week_no
    ) values (
      trim(new.value),
      trim(new.value),
      case when new.value like '%여름%' or new.value like '%겨울%' then 'vacation' else 'regular' end,
      'active',
      1,
      1
    )
    on conflict (code) do update set status = 'active'
    returning id into active_semester_id;
  else
    select id into active_semester_id
    from public.semesters
    where status = 'active'
    limit 1;
  end if;

  if active_semester_id is null then
    return new;
  end if;

  if new.key = 'semester_type' and new.value in ('regular', 'vacation') then
    update public.semesters
    set semester_type = new.value
    where id = active_semester_id;
  elsif new.key = 'total_weeks' and new.value ~ '^[0-9]+$' then
    target_total_weeks := greatest(1, least(new.value::smallint, 52));
    update public.semesters
    set total_weeks = target_total_weeks
    where id = active_semester_id;
  elsif new.key = 'current_week' and new.value ~ '^[0-9]+$' then
    target_current_week := greatest(1, least(new.value::smallint, 52));
    update public.semesters
    set
      current_week_no = target_current_week,
      total_weeks = greatest(total_weeks, target_current_week)
    where id = active_semester_id;
  end if;

  select total_weeks, coalesce(current_week_no, 1)
  into target_total_weeks, target_current_week
  from public.semesters
  where id = active_semester_id;

  insert into public.semester_weeks (semester_id, week_no, status)
  select
    active_semester_id,
    week_no::smallint,
    case
      when week_no < target_current_week then 'completed'
      when week_no = target_current_week then 'current'
      else 'planned'
    end
  from generate_series(1, target_total_weeks) as generated(week_no)
  on conflict (semester_id, week_no) do update set status = excluded.status;

  return new;
end;
$$;

drop trigger if exists pr_config_sync_semester on public.pr_config;
create trigger pr_config_sync_semester
after insert or update of value on public.pr_config
for each row
when (new.key in ('current_semester', 'semester_type', 'total_weeks', 'current_week'))
execute function public.sync_legacy_semester_config();

select ig_backup_20260822.assert_legacy_unchanged();

commit;
