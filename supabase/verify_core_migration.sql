-- Read-only verification report. Run after all migrations and admin bootstrap.

select 'admin_users' as entity, count(*)::bigint as row_count from public.admin_users
union all select 'members', count(*) from public.members
union all select 'semesters', count(*) from public.semesters
union all select 'semester_memberships', count(*) from public.semester_memberships
union all select 'semester_weeks', count(*) from public.semester_weeks
union all select 'calendar_events', count(*) from public.calendar_events
union all select 'sessions', count(*) from public.sessions
union all select 'session_participants', count(*) from public.session_participants
union all select 'semester_deadlines', count(*) from public.semester_deadlines
union all select 'migration_issues', count(*) from public.data_migration_issues
order by entity;

select
  s.code,
  s.semester_type,
  s.status,
  s.total_weeks,
  s.current_week_no,
  count(distinct sm.member_id) as member_count,
  count(distinct sw.id) as week_count,
  count(distinct session.id) as session_count
from public.semesters s
left join public.semester_memberships sm on sm.semester_id = s.id
left join public.semester_weeks sw on sw.semester_id = s.id
left join public.sessions session on session.semester_week_id = sw.id
group by s.id
order by s.code;

select 'profiles.member_id' as linkage,
  count(*) filter (where member_id is not null) as linked,
  count(*) as total
from public.profiles
union all
select 'pr_members.member_id', count(*) filter (where member_id is not null), count(*) from public.pr_members
union all
select 'pr_attendance.member_id', count(*) filter (where member_id is not null), count(*) from public.pr_attendance
union all
select 'pr_fines.member_id', count(*) filter (where member_id is not null), count(*) from public.pr_fines
union all
select 'absence_forms.member_id', count(*) filter (where member_id is not null), count(*) from public.absence_forms
union all
select 'files_metadata.uploader_member_id', count(*) filter (where uploader_member_id is not null), count(*) from public.files_metadata
union all
select 'archive_files.uploader_member_id', count(*) filter (where uploader_member_id is not null), count(*) from public.archive_files
union all
select 'file_comments.member_id', count(*) filter (where member_id is not null), count(*) from public.file_comments
union all
select 'presentations.presenter_member_id', count(*) filter (where presenter_member_id is not null), count(*) from public.presentations
union all
select 'scores.voter_member_id', count(*) filter (where voter_member_id is not null), count(*) from public.scores
order by linkage;

select
  issue_code,
  source_table,
  count(*) as issue_count
from public.data_migration_issues
where resolved_at is null
group by issue_code, source_table
order by issue_code, source_table;

select
  count(*) filter (where status = 'active') as active_semester_count,
  count(*) filter (where status = 'active' and current_week_no > total_weeks) as invalid_current_week_count
from public.semesters;

select
  public.normalize_member_name(name) as normalized_name,
  count(*) as duplicate_count
from public.members
group by public.normalize_member_name(name)
having count(*) > 1
order by duplicate_count desc, normalized_name;
