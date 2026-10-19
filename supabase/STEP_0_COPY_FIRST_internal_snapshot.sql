-- STEP 0: Run this before every migration file.
-- This makes an in-database, read-only reference copy of every legacy table
-- touched by the normalization migration. It does not alter source rows.

begin;

do $$
begin
  if to_regnamespace('ig_backup_20260822') is not null then
    raise exception using
      message = 'ig_backup_20260822 already exists.',
      hint = 'Do not overwrite the existing snapshot. Stop and inspect it first.';
  end if;
end;
$$;

create schema ig_backup_20260822;

create table ig_backup_20260822.profiles as
select id, name, student_id
from public.profiles;

create table ig_backup_20260822.pr_members as
select id, name, generation, university, department, is_active, role, created_at
from public.pr_members;

create table ig_backup_20260822.pr_members_config as
select id, active_generations
from public.pr_members_config;

create table ig_backup_20260822.pr_config as
select key, value
from public.pr_config;

create table ig_backup_20260822.pr_schedules as
select
  id, full_date, date_display, week, title, description, is_break, is_public,
  type, is_allday, start_time, end_time
from public.pr_schedules;

create table ig_backup_20260822.pr_deadlines as
select id, week, category, deadline_time
from public.pr_deadlines;

create table ig_backup_20260822.pr_attendance as
select
  id, user_name, week, status, created_at, distance_m, session_type, semester
from public.pr_attendance;

create table ig_backup_20260822.pr_fines as
select
  id, created_at, user_name, week, category, amount, reason, is_paid, semester
from public.pr_fines;

create table ig_backup_20260822.absence_forms as
select
  id, created_at, user_name, target_date, type, reason, proof_url, status,
  admin_comment, week, session_type
from public.absence_forms;

create table ig_backup_20260822.files_metadata as
select
  id, created_at, file_name, file_url, week, uploader, is_archive,
  storage_path, category, file_category, semester, is_late, group_id
from public.files_metadata;

create table ig_backup_20260822.archive_files as
select
  id, created_at, uploader_name, category, semester, week, title,
  file_url, file_type, description
from public.archive_files;

create table ig_backup_20260822.file_comments as
select
  id, file_id, user_id, user_name, comment_text, created_at, details
from public.file_comments;

create table ig_backup_20260822.presentations as
select
  id, created_at, presenter_name, topic, week, eval_version, order_index,
  group_id, cluster_id, semester, team_id
from public.presentations;

create table ig_backup_20260822.scores as
select
  id, created_at, voter_name, presentation_id, insight, graphic, delivery,
  complementarity, total_score, details, is_submitted, is_checked, semester
from public.scores;

create table ig_backup_20260822.snapshot_manifest (
  table_name text primary key,
  row_count bigint not null,
  captured_at timestamptz not null default now()
);

insert into ig_backup_20260822.snapshot_manifest (table_name, row_count)
select 'profiles', count(*) from ig_backup_20260822.profiles
union all select 'pr_members', count(*) from ig_backup_20260822.pr_members
union all select 'pr_members_config', count(*) from ig_backup_20260822.pr_members_config
union all select 'pr_config', count(*) from ig_backup_20260822.pr_config
union all select 'pr_schedules', count(*) from ig_backup_20260822.pr_schedules
union all select 'pr_deadlines', count(*) from ig_backup_20260822.pr_deadlines
union all select 'pr_attendance', count(*) from ig_backup_20260822.pr_attendance
union all select 'pr_fines', count(*) from ig_backup_20260822.pr_fines
union all select 'absence_forms', count(*) from ig_backup_20260822.absence_forms
union all select 'files_metadata', count(*) from ig_backup_20260822.files_metadata
union all select 'archive_files', count(*) from ig_backup_20260822.archive_files
union all select 'file_comments', count(*) from ig_backup_20260822.file_comments
union all select 'presentations', count(*) from ig_backup_20260822.presentations
union all select 'scores', count(*) from ig_backup_20260822.scores;

create or replace function ig_backup_20260822.assert_legacy_unchanged()
returns void
language plpgsql
security definer
set search_path = public, ig_backup_20260822
as $$
declare
  snapshot_table record;
  json_arguments text;
  has_difference boolean;
begin
  for snapshot_table in
    select table_name
    from ig_backup_20260822.snapshot_manifest
    order by table_name
  loop
    select string_agg(
      format('%L, %I', column_name, column_name),
      ', ' order by ordinal_position
    )
    into json_arguments
    from information_schema.columns
    where table_schema = 'ig_backup_20260822'
      and table_name = snapshot_table.table_name;

    execute format(
      'select exists (
        (select jsonb_build_object(%1$s) from public.%2$I
         except all
         select jsonb_build_object(%1$s) from ig_backup_20260822.%2$I)
        union all
        (select jsonb_build_object(%1$s) from ig_backup_20260822.%2$I
         except all
         select jsonb_build_object(%1$s) from public.%2$I)
      )',
      json_arguments,
      snapshot_table.table_name
    ) into has_difference;

    if has_difference then
      raise exception using
        message = format('Legacy data changed in public.%I.', snapshot_table.table_name),
        detail = 'A source row was inserted, deleted, or an original column value changed after STEP 0.',
        hint = 'Stop the migration. Do not continue until the change is reviewed.';
    end if;
  end loop;
end;
$$;

select ig_backup_20260822.assert_legacy_unchanged();

commit;

select table_name, row_count, captured_at
from ig_backup_20260822.snapshot_manifest
order by table_name;
