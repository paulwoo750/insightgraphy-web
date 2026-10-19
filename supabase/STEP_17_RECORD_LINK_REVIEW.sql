-- Review queue for old records that are not linked to a member.
--
-- data_migration_issues rows are not failed SQL. They are records (attendance, fines,
-- absence forms, files, comments, presentations, scores, sign-ups) whose writer could
-- not be matched to exactly one member during the 2026-08 migration.
--
-- 1. admin_record_link_report(): read-only. Re-checks every open item against the live
--    row: already linked since then, source row deleted, system row (archive snapshot or
--    folder placeholder), sign-up still pending, or still unlinked. Suggests candidates
--    with their evidence (same login account, same name) but never picks one.
--    Also counts unlinked rows that are not in the queue yet.
-- 2. admin_link_record(issue, member, evidence, note): links ONE record to the member the
--    admin chose. Only the member column of the allowed tables can change, only when it
--    is still empty, and the item is closed only after the link is read back.
-- 3. admin_close_record_issue(issue, reason, note): closes ONE item without linking, only
--    when the reason is true right now (already linked, source deleted, system row,
--    sign-up decided). There is no bulk close.
-- 4. admin_queue_unlinked_records(): adds currently unlinked rows to the queue.
-- 5. New rows written by a signed-in member about themselves (attendance check-in,
--    absence form, upload, comment, score) get that member's id from the login account.
--    Rows written for someone else are left for review.
--
-- No rows are deleted. Names stored on the records are never changed.

begin;

select pg_advisory_xact_lock(hashtextextended('insightgraphy-step-17', 0));

create or replace function public.record_link_member_column(p_table text)
returns text
language sql
immutable
as $$
  select case p_table
    when 'pr_attendance' then 'member_id'
    when 'pr_fines' then 'member_id'
    when 'absence_forms' then 'member_id'
    when 'files_metadata' then 'uploader_member_id'
    when 'archive_files' then 'uploader_member_id'
    when 'file_comments' then 'member_id'
    when 'presentations' then 'presenter_member_id'
    when 'scores' then 'voter_member_id'
    when 'profiles' then 'member_id'
  end;
$$;

create or replace function public.record_link_name_column(p_table text)
returns text
language sql
immutable
as $$
  select case p_table
    when 'pr_attendance' then 'user_name'
    when 'pr_fines' then 'user_name'
    when 'absence_forms' then 'user_name'
    when 'files_metadata' then 'uploader'
    when 'archive_files' then 'uploader_name'
    when 'file_comments' then 'user_name'
    when 'presentations' then 'presenter_name'
    when 'scores' then 'voter_name'
    when 'profiles' then 'name'
  end;
$$;

-- 원본 행을 jsonb로 읽는다 (허용 테이블만, 긴 본문 컬럼 제외)
create or replace function public.record_link_source(p_table text, p_pk text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if public.record_link_member_column(p_table) is null then
    return null;
  end if;
  execute format('select to_jsonb(t) from public.%I t where t.id::text = $1', p_table)
  into result
  using p_pk;
  -- 사유서 본문·증빙은 진단에 필요 없어 내보내지 않는다
  if p_table = 'absence_forms' then
    result := result - 'reason' - 'proof_url' - 'admin_comment';
  end if;
  return result - 'details';
end;
$$;

create or replace function public.record_link_is_system_row(p_table text, p_row jsonb)
returns boolean
language sql
immutable
as $$
  select case
    when p_row is null then false
    when p_table = 'archive_files' then
      coalesce(p_row ->> 'uploader_name', '') = 'SYSTEM'
      or coalesce(p_row ->> 'title', '') = '--FOLDER--'
      or coalesce(p_row ->> 'category', '') in ('timeline', 'absence', 'topics')
    when p_table = 'files_metadata' then coalesce(p_row ->> 'uploader', '') = 'SYSTEM'
    else false
  end;
$$;

create or replace function public.record_link_classify(p_table text, p_row jsonb)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  profile_member_status text;
begin
  if p_row is null then
    return 'source_deleted';
  end if;
  if p_table = 'profiles' then
    select m.status into profile_member_status from public.members m where m.id = (p_row ->> 'member_id')::uuid;
    return case when profile_member_status = 'pending' then 'profile_pending' when profile_member_status is null then 'profile_unlinked' else 'profile_resolved' end;
  end if;
  if p_row ->> public.record_link_member_column(p_table) is not null then
    return 'already_linked';
  end if;
  if public.record_link_is_system_row(p_table, p_row) then
    return 'system_row';
  end if;
  return 'needs_link';
end;
$$;

create or replace function public.admin_record_link_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  report jsonb;
  untracked jsonb;
begin
  if not public.is_admin(array['super_admin', 'admin', 'operator', 'viewer']) then
    raise exception 'Administrator access is required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('source_table', s.source_table, 'count', s.row_count) order by s.source_table), '[]'::jsonb)
  into untracked
  from (
    select 'pr_attendance' as source_table, count(*) as row_count from public.pr_attendance x
    where x.member_id is null and not exists (select 1 from public.data_migration_issues i where i.source_table = 'pr_attendance' and i.source_pk = x.id::text)
    union all
    select 'pr_fines', count(*) from public.pr_fines x
    where x.member_id is null and not exists (select 1 from public.data_migration_issues i where i.source_table = 'pr_fines' and i.source_pk = x.id::text)
    union all
    select 'absence_forms', count(*) from public.absence_forms x
    where x.member_id is null and not exists (select 1 from public.data_migration_issues i where i.source_table = 'absence_forms' and i.source_pk = x.id::text)
    union all
    select 'files_metadata', count(*) from public.files_metadata x
    where x.uploader_member_id is null and not exists (select 1 from public.data_migration_issues i where i.source_table = 'files_metadata' and i.source_pk = x.id::text)
    union all
    select 'archive_files', count(*) from public.archive_files x
    where x.uploader_member_id is null
      and not public.record_link_is_system_row('archive_files', to_jsonb(x))
      and not exists (select 1 from public.data_migration_issues i where i.source_table = 'archive_files' and i.source_pk = x.id::text)
    union all
    select 'file_comments', count(*) from public.file_comments x
    where x.member_id is null and not exists (select 1 from public.data_migration_issues i where i.source_table = 'file_comments' and i.source_pk = x.id::text)
    union all
    select 'presentations', count(*) from public.presentations x
    where x.presenter_member_id is null and not exists (select 1 from public.data_migration_issues i where i.source_table = 'presentations' and i.source_pk = x.id::text)
    union all
    select 'scores', count(*) from public.scores x
    where x.voter_member_id is null and not exists (select 1 from public.data_migration_issues i where i.source_table = 'scores' and i.source_pk = x.id::text)
  ) s
  where s.row_count > 0;

  with open_issues as (
    select i.*, public.record_link_source(i.source_table, i.source_pk) as source_row
    from public.data_migration_issues i
    where i.resolved_at is null
  ),
  classified as (
    select
      o.*,
      public.record_link_classify(o.source_table, o.source_row) as classification,
      coalesce(o.source_row ->> public.record_link_name_column(o.source_table), o.details ->> 'name') as raw_name,
      (o.source_row ->> public.record_link_member_column(o.source_table))::uuid as linked_member_id
    from open_issues o
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'source_table', c.source_table,
      'source_pk', c.source_pk,
      'issue_code', c.issue_code,
      'details', c.details,
      'created_at', c.created_at,
      'classification', c.classification,
      'raw_name', c.raw_name,
      'source', c.source_row,
      'linked_member', (
        select jsonb_build_object('id', m.id, 'name', m.name, 'generation', m.generation, 'status', m.status)
        from public.members m
        where m.id = c.linked_member_id
      ),
      'candidates', (
        select coalesce(jsonb_agg(jsonb_build_object(
            'id', m.id,
            'name', m.name,
            'generation', m.generation,
            'university', m.university,
            'status', m.status,
            'evidence', case
              when c.source_table = 'file_comments' and m.auth_user_id::text = c.source_row ->> 'user_id' then 'login_account'
              else 'same_name'
            end
          ) order by m.name, m.generation), '[]'::jsonb)
        from public.members m
        where c.classification = 'needs_link'
          and (
            public.normalize_member_name(m.name) = public.normalize_member_name(c.raw_name)
            or (c.source_table = 'file_comments' and m.auth_user_id::text = c.source_row ->> 'user_id')
          )
      )
    ) order by c.created_at, c.id), '[]'::jsonb)
  into report
  from classified c;

  return jsonb_build_object('generated_at', now(), 'issues', report, 'untracked', untracked);
end;
$$;

create or replace function public.admin_link_record(
  p_issue_id bigint,
  p_member_id uuid,
  p_evidence text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  issue public.data_migration_issues%rowtype;
  member_column text;
  source_row jsonb;
  linked uuid;
  changed integer;
begin
  if not public.is_admin(array['super_admin', 'admin']) then
    raise exception 'Super administrator or administrator access is required';
  end if;

  if p_evidence not in ('login_account', 'same_name', 'admin_review') then
    raise exception 'Evidence must be login_account, same_name or admin_review';
  end if;
  if p_evidence = 'admin_review' and nullif(trim(coalesce(p_note, '')), '') is null then
    raise exception 'NOTE_REQUIRED: 직접 확인으로 연결할 때는 근거 메모가 필요합니다.';
  end if;

  select * into issue from public.data_migration_issues where id = p_issue_id for update;
  if issue.id is null or issue.resolved_at is not null then
    raise exception 'ISSUE_NOT_OPEN: 이미 처리되었거나 없는 항목입니다.';
  end if;
  if issue.source_table = 'profiles' then
    raise exception 'PROFILE_NOT_LINKABLE: 가입 계정은 학회원 화면에서 승인·보류를 결정합니다.';
  end if;

  member_column := public.record_link_member_column(issue.source_table);
  if member_column is null then
    raise exception 'TABLE_NOT_ALLOWED: %', issue.source_table;
  end if;

  if not exists (select 1 from public.members where id = p_member_id) then
    raise exception 'MEMBER_NOT_FOUND: 선택한 학회원을 찾을 수 없습니다.';
  end if;

  source_row := public.record_link_source(issue.source_table, issue.source_pk);
  if source_row is null then
    raise exception 'SOURCE_DELETED: 원본 기록이 삭제되었습니다. 원본 삭제로 종료하세요.';
  end if;
  if source_row ->> member_column is not null and (source_row ->> member_column)::uuid <> p_member_id then
    raise exception 'ALREADY_LINKED_OTHER: 원본 기록이 이미 다른 학회원에 연결되어 있습니다.';
  end if;

  execute format('update public.%I set %I = $1 where id::text = $2 and %I is null', issue.source_table, member_column, member_column)
  using p_member_id, issue.source_pk;
  get diagnostics changed = row_count;

  execute format('select %I from public.%I where id::text = $1', member_column, issue.source_table)
  into linked
  using issue.source_pk;

  if linked is distinct from p_member_id then
    raise exception 'LINK_NOT_CONFIRMED: 연결을 확인하지 못해 처리하지 않았습니다.';
  end if;

  update public.data_migration_issues
  set
    resolved_at = now(),
    details = details || jsonb_build_object('resolution', jsonb_build_object(
      'type', 'linked',
      'member_id', p_member_id,
      'evidence', p_evidence,
      'note', nullif(trim(coalesce(p_note, '')), ''),
      'changed_rows', changed,
      'by', auth.uid(),
      'at', now()
    ))
  where id = issue.id;

  return jsonb_build_object('issue_id', issue.id, 'source_table', issue.source_table, 'source_pk', issue.source_pk, 'member_id', p_member_id);
end;
$$;

create or replace function public.admin_close_record_issue(
  p_issue_id bigint,
  p_reason text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  issue public.data_migration_issues%rowtype;
  source_row jsonb;
  current_class text;
begin
  if not public.is_admin(array['super_admin', 'admin']) then
    raise exception 'Super administrator or administrator access is required';
  end if;

  if p_reason not in ('already_linked', 'source_deleted', 'system_row', 'profile_resolved') then
    raise exception 'Unknown close reason: %', p_reason;
  end if;

  select * into issue from public.data_migration_issues where id = p_issue_id for update;
  if issue.id is null or issue.resolved_at is not null then
    raise exception 'ISSUE_NOT_OPEN: 이미 처리되었거나 없는 항목입니다.';
  end if;

  source_row := public.record_link_source(issue.source_table, issue.source_pk);
  current_class := public.record_link_classify(issue.source_table, source_row);

  if current_class <> p_reason then
    raise exception 'CONDITION_NOT_MET: 현재 상태(%)가 종료 사유(%)와 다릅니다. 다시 진단하세요.', current_class, p_reason;
  end if;

  update public.data_migration_issues
  set
    resolved_at = now(),
    details = details || jsonb_build_object('resolution', jsonb_build_object(
      'type', p_reason,
      'note', nullif(trim(coalesce(p_note, '')), ''),
      'by', auth.uid(),
      'at', now()
    ))
  where id = issue.id;

  return jsonb_build_object('issue_id', issue.id, 'reason', p_reason);
end;
$$;

create or replace function public.admin_queue_unlinked_records()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  added integer;
begin
  if not public.is_admin(array['super_admin', 'admin']) then
    raise exception 'Super administrator or administrator access is required';
  end if;

  with unlinked as (
    select 'pr_attendance'::text as source_table, id::text as source_pk, jsonb_build_object('name', user_name) as details from public.pr_attendance where member_id is null
    union all select 'pr_fines', id::text, jsonb_build_object('name', user_name) from public.pr_fines where member_id is null
    union all select 'absence_forms', id::text, jsonb_build_object('name', user_name) from public.absence_forms where member_id is null
    union all select 'files_metadata', id::text, jsonb_build_object('name', uploader) from public.files_metadata where uploader_member_id is null
    union all select 'archive_files', x.id::text, jsonb_build_object('name', x.uploader_name) from public.archive_files x
      where x.uploader_member_id is null and not public.record_link_is_system_row('archive_files', to_jsonb(x))
    union all select 'file_comments', id::text, jsonb_build_object('name', user_name, 'auth_user_id', user_id) from public.file_comments where member_id is null
    union all select 'presentations', id::text, jsonb_build_object('name', presenter_name) from public.presentations where presenter_member_id is null
    union all select 'scores', id::text, jsonb_build_object('name', voter_name) from public.scores where voter_member_id is null
  )
  insert into public.data_migration_issues (source_table, source_pk, issue_code, details)
  select source_table, source_pk, 'member_name_unresolved', details || jsonb_build_object('queued_by', auth.uid(), 'queued_at', now())
  from unlinked
  on conflict (source_table, source_pk, issue_code) do nothing;

  get diagnostics added = row_count;
  return added;
end;
$$;

-- 로그인한 학회원이 자기 이름으로 쓴 새 기록은 그 계정의 학회원 ID로 연결한다.
-- 다른 사람 이름으로 쓴 기록(대리 업로드, 관리자 입력)은 건드리지 않는다.
create or replace function public.fill_member_id_from_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  name_column text := tg_argv[0];
  member_column text := tg_argv[1];
  row_data jsonb := to_jsonb(new);
  actor_id uuid;
  actor_name text;
begin
  if auth.uid() is null or row_data ->> member_column is not null then
    return new;
  end if;

  select m.id, m.name into actor_id, actor_name
  from public.members m
  where m.auth_user_id = auth.uid();

  if actor_id is null
     or public.normalize_member_name(row_data ->> name_column) <> public.normalize_member_name(actor_name) then
    return new;
  end if;

  new := jsonb_populate_record(new, jsonb_build_object(member_column, actor_id));
  return new;
end;
$$;

drop trigger if exists pr_attendance_fill_actor_member on public.pr_attendance;
create trigger pr_attendance_fill_actor_member before insert on public.pr_attendance
for each row execute function public.fill_member_id_from_actor('user_name', 'member_id');

drop trigger if exists absence_forms_fill_actor_member on public.absence_forms;
create trigger absence_forms_fill_actor_member before insert on public.absence_forms
for each row execute function public.fill_member_id_from_actor('user_name', 'member_id');

drop trigger if exists files_metadata_fill_actor_member on public.files_metadata;
create trigger files_metadata_fill_actor_member before insert on public.files_metadata
for each row execute function public.fill_member_id_from_actor('uploader', 'uploader_member_id');

drop trigger if exists file_comments_fill_actor_member on public.file_comments;
create trigger file_comments_fill_actor_member before insert on public.file_comments
for each row execute function public.fill_member_id_from_actor('user_name', 'member_id');

drop trigger if exists scores_fill_actor_member on public.scores;
create trigger scores_fill_actor_member before insert on public.scores
for each row execute function public.fill_member_id_from_actor('voter_name', 'voter_member_id');

revoke all on function public.record_link_source(text, text) from public;
revoke all on function public.record_link_classify(text, jsonb) from public;
revoke all on function public.admin_record_link_report() from public;
revoke all on function public.admin_link_record(bigint, uuid, text, text) from public;
revoke all on function public.admin_close_record_issue(bigint, text, text) from public;
revoke all on function public.admin_queue_unlinked_records() from public;
grant execute on function public.admin_record_link_report() to authenticated;
grant execute on function public.admin_link_record(bigint, uuid, text, text) to authenticated;
grant execute on function public.admin_close_record_issue(bigint, text, text) to authenticated;
grant execute on function public.admin_queue_unlinked_records() to authenticated;

commit;

-- 확인 1: 열린 검토 항목을 지금 상태로 다시 분류한 개수
select
  public.record_link_classify(i.source_table, public.record_link_source(i.source_table, i.source_pk)) as current_state,
  i.source_table,
  i.issue_code,
  count(*) as open_items
from public.data_migration_issues i
where i.resolved_at is null
group by 1, 2, 3
order by 1, 2;

-- 확인 2: 함수와 트리거 준비 상태 (모두 true)
select
  to_regprocedure('public.admin_record_link_report()') is not null as report_ready,
  to_regprocedure('public.admin_link_record(bigint,uuid,text,text)') is not null as link_ready,
  to_regprocedure('public.admin_close_record_issue(bigint,text,text)') is not null as close_ready,
  (
    select count(*)
    from pg_trigger
    where tgname like '%\_fill\_actor\_member' escape '\'
      and not tgisinternal
  ) = 5 as actor_triggers_ready;
