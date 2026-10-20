-- Split the top administrator role.
--
-- 1. New role 'developer' (개발자): passes every administrator check, and is the only role
--    that can review/link old records (STEP 17) and use the data tools. Only a developer
--    can grant, change or remove the developer role.
-- 2. 'super_admin' keeps its key (no rows change) but is shown as 학회장 in the app. A 학회장
--    can view and change administrator roles (except developer accounts) and run every
--    operation as before.
-- 3. Nobody can change or deactivate their own role. At least one active 학회장 or developer
--    must remain.
-- 4. admin_list_access() also says whether an account is a current member, a graduate
--    (alumni member, or a sign-up that asked for alumni status) or not linked to the roster.
--
-- Before running: put the developer's login email in developer_email below (once).
-- No member, record or semester rows change. admin_users only changes for that one account.

begin;

select pg_advisory_xact_lock(hashtextextended('insightgraphy-step-20', 0));

do $$
begin
  if to_regprocedure('public.admin_grant_access_member(uuid,text)') is null then
    raise exception 'Run STEP_16_ADMIN_ACCESS_BY_MEMBER.sql first';
  end if;
  if to_regprocedure('public.admin_record_link_report()') is null then
    raise exception 'Run STEP_17_RECORD_LINK_REVIEW.sql first';
  end if;
end;
$$;

-- 역할 값에 developer 추가 (기존 행은 그대로)
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.admin_users'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%role%'
  loop
    execute format('alter table public.admin_users drop constraint %I', constraint_name);
  end loop;
end;
$$;

alter table public.admin_users
  add constraint admin_users_role_check
  check (role in ('developer', 'super_admin', 'admin', 'operator', 'viewer'));

-- 개발자는 모든 관리자 검사를 통과한다. 나머지 역할은 기존과 같다.
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
      and (
        au.role = 'developer'
        or (required_roles is null and au.role in ('super_admin', 'admin', 'operator'))
        or (required_roles is not null and au.role = any(required_roles))
      )
  );
$$;

revoke all on function public.is_admin(text[]) from public;
grant execute on function public.is_admin(text[]) to anon, authenticated;

create or replace function public.is_developer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users au
    where au.user_id = auth.uid() and au.is_active and au.role = 'developer'
  );
$$;

revoke all on function public.is_developer() from public;
grant execute on function public.is_developer() to anon, authenticated;

-- 역할 변경 공통 검사: 자기 자신 변경 금지, 개발자 역할은 개발자만, 학회장·개발자 최소 1명 유지
create or replace function public.admin_check_role_change(
  p_target_user_id uuid,
  p_previous_role text,
  p_previous_active boolean,
  p_new_role text,
  p_new_active boolean
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  remaining integer;
begin
  if not public.is_admin(array['super_admin']) then
    raise exception 'Super administrator access is required';
  end if;

  if p_new_role not in ('developer', 'super_admin', 'admin', 'operator', 'viewer') then
    raise exception 'Invalid administrator role';
  end if;

  if p_target_user_id = auth.uid()
     and (p_previous_role is distinct from p_new_role or p_previous_active is distinct from p_new_active) then
    raise exception 'SELF_CHANGE: 내 계정의 역할과 사용 여부는 직접 바꿀 수 없습니다.';
  end if;

  if (p_new_role = 'developer' or p_previous_role = 'developer') and not public.is_developer() then
    raise exception 'DEVELOPER_ONLY: 개발자 역할은 개발자만 부여하거나 바꿀 수 있습니다.';
  end if;

  if p_previous_role in ('developer', 'super_admin')
     and coalesce(p_previous_active, false)
     and (p_new_role not in ('developer', 'super_admin') or not p_new_active) then
    select count(*) into remaining
    from public.admin_users au
    where au.is_active
      and au.role in ('developer', 'super_admin')
      and au.user_id <> p_target_user_id;
    if remaining < 1 then
      raise exception 'LAST_LEAD: 활성 학회장 또는 개발자가 최소 한 명은 있어야 합니다.';
    end if;
  end if;
end;
$$;

revoke all on function public.admin_check_role_change(uuid, text, boolean, text, boolean) from public;

create or replace function public.admin_grant_access(
  p_email text,
  p_role text
)
returns public.admin_users
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_user_id uuid;
  previous_record public.admin_users%rowtype;
  saved_record public.admin_users%rowtype;
begin
  if not public.is_admin(array['super_admin']) then
    raise exception 'Super administrator access is required';
  end if;

  select u.id into target_user_id
  from auth.users u
  where lower(u.email::text) = lower(trim(p_email))
  limit 1;

  if target_user_id is null then
    raise exception 'No Supabase Auth user found for this email';
  end if;

  select * into previous_record from public.admin_users au where au.user_id = target_user_id for update;

  perform public.admin_check_role_change(target_user_id, previous_record.role, previous_record.is_active, p_role, true);

  insert into public.admin_users (user_id, role, is_active)
  values (target_user_id, p_role, true)
  on conflict (user_id) do update set role = excluded.role, is_active = true
  returning * into saved_record;

  insert into public.admin_access_audit (actor_user_id, target_user_id, action, previous_values, new_values)
  values (
    auth.uid(),
    target_user_id,
    case when previous_record.user_id is null then 'grant' else 'update' end,
    case when previous_record.user_id is null then null else to_jsonb(previous_record) end,
    to_jsonb(saved_record)
  );

  return saved_record;
end;
$$;

create or replace function public.admin_set_access(
  p_user_id uuid,
  p_role text,
  p_is_active boolean
)
returns public.admin_users
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_record public.admin_users%rowtype;
  saved_record public.admin_users%rowtype;
begin
  if not public.is_admin(array['super_admin']) then
    raise exception 'Super administrator access is required';
  end if;

  select * into previous_record from public.admin_users au where au.user_id = p_user_id for update;
  if previous_record.user_id is null then
    raise exception 'Administrator account not found';
  end if;

  perform public.admin_check_role_change(p_user_id, previous_record.role, previous_record.is_active, p_role, p_is_active);

  update public.admin_users
  set role = p_role, is_active = p_is_active
  where user_id = p_user_id
  returning * into saved_record;

  insert into public.admin_access_audit (actor_user_id, target_user_id, action, previous_values, new_values)
  values (auth.uid(), p_user_id, 'update', to_jsonb(previous_record), to_jsonb(saved_record));

  return saved_record;
end;
$$;

create or replace function public.admin_grant_access_member(
  p_member_id uuid,
  p_role text
)
returns public.admin_users
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_member public.members%rowtype;
  saved_record public.admin_users%rowtype;
begin
  if not public.is_admin(array['super_admin']) then
    raise exception 'Super administrator access is required';
  end if;

  select * into target_member from public.members where id = p_member_id;
  if target_member.id is null then
    raise exception 'MEMBER_NOT_FOUND: 선택한 학회원을 찾을 수 없습니다.';
  end if;

  if target_member.auth_user_id is null then
    raise exception 'MEMBER_NOT_LINKED: % 학회원은 로그인 계정이 연결되지 않았습니다.', target_member.name;
  end if;

  if not exists (select 1 from auth.users u where u.id = target_member.auth_user_id) then
    raise exception 'AUTH_USER_MISSING: % 학회원에 연결된 로그인 계정이 존재하지 않습니다.', target_member.name;
  end if;

  if exists (select 1 from public.admin_users au where au.user_id = target_member.auth_user_id) then
    raise exception 'ALREADY_REGISTERED: % 학회원은 이미 관리자 목록에 있습니다. 목록에서 역할을 변경하세요.', target_member.name;
  end if;

  perform public.admin_check_role_change(target_member.auth_user_id, null, null, p_role, true);

  insert into public.admin_users (user_id, role, is_active)
  values (target_member.auth_user_id, p_role, true)
  returning * into saved_record;

  insert into public.admin_access_audit (actor_user_id, target_user_id, action, previous_values, new_values)
  values (
    auth.uid(),
    target_member.auth_user_id,
    'grant',
    null,
    to_jsonb(saved_record) || jsonb_build_object('member_id', target_member.id, 'member_name', target_member.name)
  );

  return saved_record;
end;
$$;

-- 계정 종류: member(학회원 명단과 연결) · alumni(졸업생 명단과 연결 또는 졸업생으로 가입 요청)
-- · alumni_name(연결은 없지만 가입 이름이 졸업생 명단의 한 명과만 같음, 표시용이며 연결하지 않는다) · unlinked
create or replace function public.admin_account_kind(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select case
    when m.id is not null and m.status = 'alumni' then 'alumni'
    when m.id is not null then 'member'
    when lower(coalesce(u.raw_user_meta_data ->> 'requested_member_status', '')) = 'alumni' then 'alumni'
    when nullif(trim(u.raw_user_meta_data ->> 'name'), '') is not null
      and (
        select count(*) from public.members am
        where am.status = 'alumni'
          and public.normalize_member_name(am.name) = public.normalize_member_name(u.raw_user_meta_data ->> 'name')
      ) = 1
      and not exists (
        select 1 from public.members other
        where other.status <> 'alumni'
          and public.normalize_member_name(other.name) = public.normalize_member_name(u.raw_user_meta_data ->> 'name')
      ) then 'alumni_name'
    else 'unlinked'
  end
  from auth.users u
  left join public.members m on m.auth_user_id = u.id
  where u.id = p_user_id;
$$;

revoke all on function public.admin_account_kind(uuid) from public;

-- 관리자 목록: 계정 종류(재학 학회원·졸업생·명단 미연결)를 함께 돌려준다
drop function if exists public.admin_list_access();

create function public.admin_list_access()
returns table (
  user_id uuid,
  email text,
  display_name text,
  role text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  member_id uuid,
  member_name text,
  member_generation text,
  member_university text,
  member_status text,
  account_kind text,
  signup_generation text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin(array['super_admin']) then
    raise exception 'Super administrator access is required';
  end if;

  return query
  select
    au.user_id,
    u.email::text,
    coalesce(
      nullif(trim(m.name), ''),
      nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
      split_part(u.email::text, '@', 1)
    ),
    au.role,
    au.is_active,
    au.created_at,
    au.updated_at,
    m.id,
    m.name,
    m.generation,
    m.university,
    m.status,
    public.admin_account_kind(au.user_id),
    nullif(trim(u.raw_user_meta_data ->> 'student_id'), '')
  from public.admin_users au
  join auth.users u on u.id = au.user_id
  left join public.members m on m.auth_user_id = au.user_id
  order by
    case au.role when 'developer' then 0 when 'super_admin' then 1 when 'admin' then 2 when 'operator' then 3 else 4 end,
    coalesce(m.name, u.email::text);
end;
$$;

revoke all on function public.admin_list_access() from public;
grant execute on function public.admin_list_access() to authenticated;

-- 기존 기록 연결 검토(STEP 17)는 개발자만: 아래 네 함수는 STEP 17 본문과 같고 권한 검사만 바뀐다
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
  if not public.is_developer() then
    raise exception 'DEVELOPER_ONLY: 기존 기록 연결 검토는 개발자 계정만 사용할 수 있습니다.';
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
  if not public.is_developer() then
    raise exception 'DEVELOPER_ONLY: 기존 기록 연결 검토는 개발자 계정만 사용할 수 있습니다.';
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
  if not public.is_developer() then
    raise exception 'DEVELOPER_ONLY: 기존 기록 연결 검토는 개발자 계정만 사용할 수 있습니다.';
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
  if not public.is_developer() then
    raise exception 'DEVELOPER_ONLY: 기존 기록 연결 검토는 개발자 계정만 사용할 수 있습니다.';
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


revoke all on function public.admin_record_link_report() from public;
revoke all on function public.admin_link_record(bigint, uuid, text, text) from public;
revoke all on function public.admin_close_record_issue(bigint, text, text) from public;
revoke all on function public.admin_queue_unlinked_records() from public;
grant execute on function public.admin_record_link_report() to authenticated;
grant execute on function public.admin_link_record(bigint, uuid, text, text) to authenticated;
grant execute on function public.admin_close_record_issue(bigint, text, text) to authenticated;
grant execute on function public.admin_queue_unlinked_records() to authenticated;
-- Supabase는 새 함수에 anon 실행 권한을 따로 준다. 공개 키로는 부를 수 없게 한다 (STEP 19 other_paths 점검)
revoke execute on function public.admin_record_link_report() from anon;
revoke execute on function public.admin_link_record(bigint, uuid, text, text) from anon;
revoke execute on function public.admin_close_record_issue(bigint, text, text) from anon;
revoke execute on function public.admin_queue_unlinked_records() from anon;
revoke execute on function public.admin_account_kind(uuid) from anon, authenticated;
revoke execute on function public.admin_check_role_change(uuid, text, boolean, text, boolean) from anon, authenticated;

-- 개발자 계정 지정: 아래 이메일을 개발자 로그인 이메일로 바꾼다 (바꾸지 않으면 건너뛴다)
do $$
declare
  developer_email text := 'REPLACE_WITH_DEVELOPER_LOGIN_EMAIL';
  target_user_id uuid;
  previous_record public.admin_users%rowtype;
  saved_record public.admin_users%rowtype;
begin
  if developer_email = 'REPLACE_WITH_DEVELOPER_LOGIN_EMAIL' then
    raise notice '개발자 이메일을 입력하지 않아 개발자 지정을 건너뜁니다.';
    return;
  end if;

  select u.id into target_user_id from auth.users u where lower(u.email::text) = lower(trim(developer_email)) limit 1;
  if target_user_id is null then
    raise exception 'DEVELOPER_EMAIL_NOT_FOUND: % 로그인 계정을 찾을 수 없습니다.', developer_email;
  end if;

  select * into previous_record from public.admin_users au where au.user_id = target_user_id;

  insert into public.admin_users (user_id, role, is_active)
  values (target_user_id, 'developer', true)
  on conflict (user_id) do update set role = 'developer', is_active = true
  returning * into saved_record;

  insert into public.admin_access_audit (actor_user_id, target_user_id, action, previous_values, new_values)
  values (
    target_user_id,
    target_user_id,
    case when previous_record.user_id is null then 'grant' else 'update' end,
    case when previous_record.user_id is null then null else to_jsonb(previous_record) end,
    to_jsonb(saved_record) || jsonb_build_object('via', 'STEP_20 SQL Editor')
  );
end;
$$;

commit;

-- 확인 1: 역할별 계정 (developer·super_admin 행이 보여야 한다)
select au.role, au.is_active, u.email, m.name as member_name, public.admin_account_kind(au.user_id) as account_kind
from public.admin_users au
join auth.users u on u.id = au.user_id
left join public.members m on m.auth_user_id = au.user_id
order by case au.role when 'developer' then 0 when 'super_admin' then 1 when 'admin' then 2 when 'operator' then 3 else 4 end, u.email;

-- 확인 2: 준비 상태 (모두 true)
select
  exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.admin_users'::regclass
      and c.conname = 'admin_users_role_check'
      and pg_get_constraintdef(c.oid) like '%developer%'
  ) as role_check_ready,
  exists (
    select 1 from pg_proc p
    where p.oid = to_regprocedure('public.is_admin(text[])')
      and p.prosrc like '%developer%'
  ) as developer_passes_admin_ready,
  exists (
    select 1 from pg_proc p
    where p.oid = to_regprocedure('public.admin_link_record(bigint,uuid,text,text)')
      and p.prosrc like '%is_developer()%'
  ) as records_developer_only_ready,
  exists (
    select 1 from information_schema.routines r
    join information_schema.parameters prm on prm.specific_name = r.specific_name
    where r.routine_schema = 'public' and r.routine_name = 'admin_list_access'
      and prm.parameter_name = 'account_kind'
  ) as list_account_kind_ready,
  (select count(*) from public.admin_users where role = 'developer' and is_active) >= 1 as developer_assigned,
  (select count(*) from public.admin_users where role in ('developer', 'super_admin') and is_active) >= 1 as lead_account_ready;
