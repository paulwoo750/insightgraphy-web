-- Finalize independent member/semester/session links after the core backfill.
-- Only newly added UUID columns and migration issue rows are updated.

begin;

select pg_advisory_xact_lock(hashtextextended('insightgraphy-normalize-core', 0));
select ig_backup_20260822.assert_legacy_unchanged();

create or replace view ig_backup_20260822.unique_member_names as
select
  public.normalize_member_name(name) as normalized_name,
  (array_agg(id order by id::text))[1] as member_id
from public.members
where nullif(public.normalize_member_name(name), '') is not null
group by public.normalize_member_name(name)
having count(*) = 1;

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

update public.data_migration_issues
set resolved_at = now()
where resolved_at is null
  and source_table in ('files_metadata', 'archive_files', 'scores')
  and issue_code = 'member_name_unresolved';

with unresolved as (
  select 'files_metadata'::text as source_table, id::text as source_pk,
    'member_name_unresolved'::text as issue_code,
    jsonb_build_object('name', uploader) as details
  from public.files_metadata where uploader_member_id is null
  union all
  select 'archive_files', id::text, 'member_name_unresolved', jsonb_build_object('name', uploader_name)
  from public.archive_files where uploader_member_id is null
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

select 'files.owner' as linkage,
  count(*) filter (where uploader_member_id is not null) as linked,
  count(*) as total
from public.files_metadata
union all
select 'files.semester', count(*) filter (where semester_id is not null), count(*) from public.files_metadata
union all
select 'files.session', count(*) filter (where session_id is not null), count(*) from public.files_metadata
union all
select 'archive.owner', count(*) filter (where uploader_member_id is not null), count(*) from public.archive_files
union all
select 'archive.semester', count(*) filter (where semester_id is not null), count(*) from public.archive_files
union all
select 'scores.voter', count(*) filter (where voter_member_id is not null), count(*) from public.scores
union all
select 'scores.semester', count(*) filter (where semester_id is not null), count(*) from public.scores
order by linkage;
