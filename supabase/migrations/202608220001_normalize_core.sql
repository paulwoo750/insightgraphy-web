-- InsightGraphy normalized core schema
-- Safe to run before the application code migration: legacy tables remain intact.

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

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.normalize_member_name(value text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(regexp_replace(coalesce(trim(value), ''), '\s+', '', 'g'));
$$;

create or replace function public.try_parse_jsonb(value text)
returns jsonb
language plpgsql
immutable
parallel safe
as $$
begin
  return coalesce(value::jsonb, '{}'::jsonb);
exception when others then
  return '{}'::jsonb;
end;
$$;

create or replace function public.parse_kst_timestamp(value text)
returns timestamptz
language plpgsql
immutable
parallel safe
as $$
declare
  normalized text := nullif(trim(value), '');
begin
  if normalized is null then
    return null;
  end if;

  if normalized ~* '(z|[+-][0-9]{2}:[0-9]{2})$' then
    return normalized::timestamptz;
  end if;

  return replace(normalized, 'T', ' ')::timestamp at time zone 'Asia/Seoul';
exception when others then
  return null;
end;
$$;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin'
    check (role in ('super_admin', 'admin', 'operator', 'viewer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin(required_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
      and au.is_active
      and (required_roles is null or au.role = any(required_roles))
  );
$$;

revoke all on function public.is_admin(text[]) from public;
grant execute on function public.is_admin(text[]) to anon, authenticated;

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  legacy_profile_id uuid unique,
  legacy_pr_member_id bigint unique,
  name text not null,
  generation text,
  university text,
  department text,
  role text not null default '일반',
  status text not null default 'pending'
    check (status in ('pending', 'active', 'inactive', 'leave', 'alumni')),
  is_active boolean generated always as (status = 'active') stored,
  is_public boolean not null default true,
  joined_on date,
  left_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (left_on is null or joined_on is null or left_on >= joined_on)
);

create index if not exists members_name_idx
  on public.members (public.normalize_member_name(name));
create index if not exists members_generation_idx on public.members (generation);
create index if not exists members_status_idx on public.members (status);

create table if not exists public.semesters (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  semester_type text not null default 'regular'
    check (semester_type in ('regular', 'vacation')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'closed', 'archived')),
  total_weeks smallint not null default 1 check (total_weeks between 1 and 52),
  current_week_no smallint check (current_week_no between 1 and 52),
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create unique index if not exists semesters_one_active_idx
  on public.semesters ((status))
  where status = 'active';

create table if not exists public.semester_memberships (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict,
  role text not null default 'member',
  participation_status text not null default 'active'
    check (participation_status in ('active', 'leave', 'withdrawn', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (semester_id, member_id)
);

create index if not exists semester_memberships_member_idx
  on public.semester_memberships (member_id, semester_id);
create index if not exists semester_memberships_active_idx
  on public.semester_memberships (semester_id, participation_status);

create table if not exists public.semester_weeks (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete cascade,
  week_no smallint not null check (week_no between 1 and 52),
  topic text,
  weekday_topic text,
  status text not null default 'planned'
    check (status in ('planned', 'current', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (semester_id, week_no)
);

create index if not exists semester_weeks_semester_idx
  on public.semester_weeks (semester_id, week_no);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid references public.semesters(id) on delete cascade,
  semester_week_id uuid references public.semester_weeks(id) on delete set null,
  legacy_pr_schedule_id uuid unique,
  title text not null,
  description text,
  event_type text not null default 'other',
  event_date date not null,
  starts_at timestamptz,
  ends_at timestamptz,
  is_all_day boolean not null default false,
  is_break boolean not null default false,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create index if not exists calendar_events_date_idx
  on public.calendar_events (event_date, is_public);
create index if not exists calendar_events_semester_idx
  on public.calendar_events (semester_id, semester_week_id);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  semester_week_id uuid not null references public.semester_weeks(id) on delete cascade,
  calendar_event_id uuid references public.calendar_events(id) on delete set null,
  session_type text not null
    check (session_type in ('regular', 'weekday', 'special', 'other')),
  group_no integer,
  title text,
  topic text,
  starts_at timestamptz,
  ends_at timestamptz,
  attendance_opens_at timestamptz,
  attendance_closes_at timestamptz,
  location_name text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  attendance_radius_m integer check (attendance_radius_m is null or attendance_radius_m >= 0),
  evaluation_mode text,
  status text not null default 'planned'
    check (status in ('planned', 'open', 'completed', 'cancelled')),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (group_no is null or group_no > 0),
  check (ends_at is null or starts_at is null or ends_at >= starts_at),
  check (attendance_closes_at is null or attendance_opens_at is null or attendance_closes_at >= attendance_opens_at)
);

create unique index if not exists sessions_week_type_group_idx
  on public.sessions (semester_week_id, session_type, coalesce(group_no, 0));
create index if not exists sessions_start_idx on public.sessions (starts_at);

create table if not exists public.session_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict,
  team_no integer,
  evaluation_group_no integer,
  cluster_no integer,
  participation_status text not null default 'assigned'
    check (participation_status in ('assigned', 'attended', 'absent', 'excused', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, member_id)
);

create index if not exists session_participants_member_idx
  on public.session_participants (member_id, session_id);

create table if not exists public.semester_deadlines (
  id uuid primary key default gen_random_uuid(),
  semester_week_id uuid not null references public.semester_weeks(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete cascade,
  legacy_pr_deadline_id bigint unique,
  legacy_key text unique,
  category text not null,
  due_at timestamptz not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists semester_deadlines_scope_category_idx
  on public.semester_deadlines (
    semester_week_id,
    coalesce(session_id, '00000000-0000-0000-0000-000000000000'::uuid),
    category
  );
create index if not exists semester_deadlines_due_idx
  on public.semester_deadlines (due_at);

create table if not exists public.data_migration_issues (
  id bigint generated always as identity primary key,
  source_table text not null,
  source_pk text not null,
  issue_code text not null,
  details jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_table, source_pk, issue_code)
);

-- Additive links from the legacy model to the canonical model.
alter table public.profiles
  add column if not exists member_id uuid references public.members(id) on delete set null;
alter table public.pr_members
  add column if not exists member_id uuid references public.members(id) on delete set null;
alter table public.pr_schedules
  add column if not exists calendar_event_id uuid references public.calendar_events(id) on delete set null;
alter table public.pr_deadlines
  add column if not exists semester_deadline_id uuid references public.semester_deadlines(id) on delete set null;

alter table public.pr_attendance
  add column if not exists member_id uuid references public.members(id) on delete set null,
  add column if not exists semester_id uuid references public.semesters(id) on delete set null,
  add column if not exists session_id uuid references public.sessions(id) on delete set null;

alter table public.pr_fines
  add column if not exists member_id uuid references public.members(id) on delete set null,
  add column if not exists semester_id uuid references public.semesters(id) on delete set null,
  add column if not exists session_id uuid references public.sessions(id) on delete set null;

alter table public.absence_forms
  add column if not exists member_id uuid references public.members(id) on delete set null,
  add column if not exists semester_id uuid references public.semesters(id) on delete set null,
  add column if not exists session_id uuid references public.sessions(id) on delete set null;

alter table public.files_metadata
  add column if not exists uploader_member_id uuid references public.members(id) on delete set null,
  add column if not exists semester_id uuid references public.semesters(id) on delete set null,
  add column if not exists session_id uuid references public.sessions(id) on delete set null;

alter table public.archive_files
  add column if not exists uploader_member_id uuid references public.members(id) on delete set null,
  add column if not exists semester_id uuid references public.semesters(id) on delete set null,
  add column if not exists session_id uuid references public.sessions(id) on delete set null;

alter table public.file_comments
  add column if not exists member_id uuid references public.members(id) on delete set null;

alter table public.presentations
  add column if not exists presenter_member_id uuid references public.members(id) on delete set null,
  add column if not exists semester_id uuid references public.semesters(id) on delete set null,
  add column if not exists session_id uuid references public.sessions(id) on delete set null;

alter table public.scores
  add column if not exists voter_member_id uuid references public.members(id) on delete set null,
  add column if not exists semester_id uuid references public.semesters(id) on delete set null;

create unique index if not exists profiles_member_id_unique_idx
  on public.profiles (member_id) where member_id is not null;
create unique index if not exists pr_members_member_id_unique_idx
  on public.pr_members (member_id) where member_id is not null;
create index if not exists pr_attendance_member_semester_idx
  on public.pr_attendance (member_id, semester_id);
create index if not exists pr_fines_member_semester_idx
  on public.pr_fines (member_id, semester_id);
create index if not exists absence_forms_member_semester_idx
  on public.absence_forms (member_id, semester_id);
create index if not exists files_metadata_owner_idx
  on public.files_metadata (uploader_member_id, semester_id);
create index if not exists archive_files_owner_idx
  on public.archive_files (uploader_member_id, semester_id);
create index if not exists presentations_member_semester_idx
  on public.presentations (presenter_member_id, semester_id);
create index if not exists scores_member_semester_idx
  on public.scores (voter_member_id, semester_id);

drop trigger if exists admin_users_set_updated_at on public.admin_users;
create trigger admin_users_set_updated_at
before update on public.admin_users
for each row execute function public.set_updated_at();

drop trigger if exists members_set_updated_at on public.members;
create trigger members_set_updated_at
before update on public.members
for each row execute function public.set_updated_at();

drop trigger if exists semesters_set_updated_at on public.semesters;
create trigger semesters_set_updated_at
before update on public.semesters
for each row execute function public.set_updated_at();

drop trigger if exists semester_memberships_set_updated_at on public.semester_memberships;
create trigger semester_memberships_set_updated_at
before update on public.semester_memberships
for each row execute function public.set_updated_at();

drop trigger if exists semester_weeks_set_updated_at on public.semester_weeks;
create trigger semester_weeks_set_updated_at
before update on public.semester_weeks
for each row execute function public.set_updated_at();

drop trigger if exists calendar_events_set_updated_at on public.calendar_events;
create trigger calendar_events_set_updated_at
before update on public.calendar_events
for each row execute function public.set_updated_at();

drop trigger if exists sessions_set_updated_at on public.sessions;
create trigger sessions_set_updated_at
before update on public.sessions
for each row execute function public.set_updated_at();

drop trigger if exists session_participants_set_updated_at on public.session_participants;
create trigger session_participants_set_updated_at
before update on public.session_participants
for each row execute function public.set_updated_at();

drop trigger if exists semester_deadlines_set_updated_at on public.semester_deadlines;
create trigger semester_deadlines_set_updated_at
before update on public.semester_deadlines
for each row execute function public.set_updated_at();

alter table public.admin_users enable row level security;
alter table public.members enable row level security;
alter table public.semesters enable row level security;
alter table public.semester_memberships enable row level security;
alter table public.semester_weeks enable row level security;
alter table public.calendar_events enable row level security;
alter table public.sessions enable row level security;
alter table public.session_participants enable row level security;
alter table public.semester_deadlines enable row level security;
alter table public.data_migration_issues enable row level security;

drop policy if exists admin_users_read_self on public.admin_users;
create policy admin_users_read_self on public.admin_users
for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists admin_users_admin_write on public.admin_users;
create policy admin_users_admin_write on public.admin_users
for all using (public.is_admin(array['super_admin']))
with check (public.is_admin(array['super_admin']));

drop policy if exists members_public_read on public.members;
create policy members_public_read on public.members
for select using (is_public and status <> 'pending');
drop policy if exists members_authenticated_read on public.members;
create policy members_authenticated_read on public.members
for select to authenticated using (true);
drop policy if exists members_admin_write on public.members;
create policy members_admin_write on public.members
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists semesters_read on public.semesters;
create policy semesters_read on public.semesters for select using (true);
drop policy if exists semesters_admin_write on public.semesters;
create policy semesters_admin_write on public.semesters
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists memberships_authenticated_read on public.semester_memberships;
create policy memberships_authenticated_read on public.semester_memberships
for select to authenticated using (true);
drop policy if exists memberships_admin_write on public.semester_memberships;
create policy memberships_admin_write on public.semester_memberships
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists weeks_authenticated_read on public.semester_weeks;
create policy weeks_authenticated_read on public.semester_weeks
for select to authenticated using (true);
drop policy if exists weeks_admin_write on public.semester_weeks;
create policy weeks_admin_write on public.semester_weeks
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists calendar_events_read on public.calendar_events;
create policy calendar_events_read on public.calendar_events
for select using (is_public or auth.role() = 'authenticated');
drop policy if exists calendar_events_admin_write on public.calendar_events;
create policy calendar_events_admin_write on public.calendar_events
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists sessions_read on public.sessions;
create policy sessions_read on public.sessions
for select using (is_public or auth.role() = 'authenticated');
drop policy if exists sessions_admin_write on public.sessions;
create policy sessions_admin_write on public.sessions
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists session_participants_read on public.session_participants;
create policy session_participants_read on public.session_participants
for select to authenticated using (true);
drop policy if exists session_participants_admin_write on public.session_participants;
create policy session_participants_admin_write on public.session_participants
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists semester_deadlines_read on public.semester_deadlines;
create policy semester_deadlines_read on public.semester_deadlines
for select to authenticated using (true);
drop policy if exists semester_deadlines_admin_write on public.semester_deadlines;
create policy semester_deadlines_admin_write on public.semester_deadlines
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists migration_issues_admin_read on public.data_migration_issues;
create policy migration_issues_admin_read on public.data_migration_issues
for select to authenticated using (public.is_admin());
drop policy if exists migration_issues_admin_write on public.data_migration_issues;
create policy migration_issues_admin_write on public.data_migration_issues
for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.members, public.semesters, public.calendar_events, public.sessions
  to anon, authenticated;
grant select on public.admin_users, public.semester_memberships, public.semester_weeks,
  public.session_participants, public.semester_deadlines, public.data_migration_issues
  to authenticated;
grant insert, update, delete on public.admin_users, public.members, public.semesters,
  public.semester_memberships, public.semester_weeks, public.calendar_events,
  public.sessions, public.session_participants, public.semester_deadlines,
  public.data_migration_issues to authenticated;
grant usage, select on sequence public.data_migration_issues_id_seq to authenticated;

select ig_backup_20260822.assert_legacy_unchanged();

commit;
