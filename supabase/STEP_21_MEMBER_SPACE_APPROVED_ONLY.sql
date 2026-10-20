-- Limit the rest of the member space to approved members and admins.
--
-- STEP 20 closed pr_attendance, pr_fines, absence_forms, scores and file_comments to accounts that
-- are signed in but not approved (members.status 'pending', or no members row). The same accounts,
-- and the public (anon) key, still reach the other member data, depending on policies made in the
-- dashboard (not in this repository) and on the repository policies below:
--   members               every row via members_authenticated_read using (true): pending applicants,
--                         non-public members, auth_user_id, requested_status
--   files_metadata        every submission with its link (proposal files in the public bucket
--                         ig-files, slide Drive links, YouTube links), uploader, is_late, group
--   archive_files, presentations, pr_vote_criteria, pr_deadlines, club_rules, semester_weeks,
--   semester_deadlines, session_participants, pr_members, pr_members_config
--   pr_config             weekly_setup (weekday group of each member by name, session coordinates),
--                         penalty_rules, favorite_locations, week_topics, ...
--   pr_schedules, sessions, calendar_events   rows that are not public
--   semester_memberships  every membership row
--   profiles              name and student_id of every account
--   storage ig-files, showcase   listing, upload and delete where storage policies allow
-- Writes are allowed wherever those policies allow. Two writes change approval itself: a row written
-- to pr_members runs sync_pr_member_to_member (security definer), which sets the members row with
-- the same name and generation to 'active'; a write to pr_config 'current_semester' switches the
-- active semester (sync_legacy_semester_config).
--
-- Who keeps access:
--   approved member / admin  unchanged. Same test as STEP 20: public.is_approved_member() or
--                            public.is_admin(array['super_admin', 'admin', 'operator', 'viewer']).
--   unapproved account       the rows the public pages show (what a logged-out visitor sees), plus
--                            its own members and profiles row (member space header, signup).
--   public key (anon)        the rows the public pages show. A pending account can sign out, so anon
--                            must not see more than it. The signup screen's profiles insert is kept.
--
-- 1. Snapshot (first run only) of the RLS flags and all policies of the target tables and of
--    storage.objects, the EXECUTE grants of refresh_legacy_week_topics and the USAGE grants of the
--    ig_backup_* schemas into ig_backup_step21.access_before, so the change can be undone.
-- 2. RESTRICTIVE policies per table and command (ANDed with the existing permissive policies, whose
--    expressions are not rewritten):
--      ig_step21_read        select  authenticated  approved/admin, or public rows, or own row
--      ig_step21_insert      insert  authenticated  approved/admin (profiles: own row too)
--      ig_step21_update      update  authenticated  approved/admin
--      ig_step21_delete      delete  authenticated  approved/admin
--      ig_step21_anon_read   select  anon           public rows only
--      ig_step21_anon_insert / _anon_update / _anon_delete   anon  never (profiles insert kept)
--    Public site tables (landing, showcase, about, activities) keep their reads; only the write
--    policies are added. members, pr_members and pr_members_config are written only by admins
--    (public.is_admin(): super_admin, admin, operator); the app writes them only from admin screens
--    and security definer functions.
-- 3. A table whose RLS is disabled first gets a permissive policy ig_step21_keep_current for anon
--    and authenticated (what they have now), then RLS is enabled so the restrictive policies apply.
-- 4. storage.objects: ig_step21_storage (authenticated) and ig_step21_storage_anon (anon) limit
--    listing, upload, update and delete in the buckets ig-files and showcase to approved members and
--    admins. Public URLs (getPublicUrl) are served without RLS, so public images and already shared
--    file links keep working. Skipped with a note if the SQL Editor role may not create policies on
--    storage.objects.
-- 5. refresh_legacy_week_topics(uuid) (security definer, no admin check, rewrites
--    pr_config.week_topics) is called only inside admin functions. EXECUTE is revoked from anon and
--    authenticated. ig_backup_* schemas: USAGE is revoked from anon and authenticated if present.
-- 6. Probe: row counts read as the public key, an approved member, an unapproved account, an admin
--    and a viewer before and after the change are kept in ig_backup_step21.probe_log. If the
--    approved member, admin or viewer counts differ, or the public key or the unapproved account
--    reads a public site table differently, the whole step is rolled back.
--
-- No rows of public tables are inserted, changed or deleted. Run after STEP 20. Safe to re-run:
-- the first snapshot is kept and the policies are recreated with the same definition.

begin;

select pg_advisory_xact_lock(hashtextextended('insightgraphy-step-21', 0));

do $$
declare
  missing text;
begin
  select string_agg(t, ', ')
  into missing
  from unnest(array['members', 'profiles', 'admin_users', 'files_metadata', 'archive_files', 'presentations', 'pr_config', 'pr_schedules', 'pr_deadlines', 'semesters', 'semester_memberships']) t
  where to_regclass('public.' || t) is null;

  if missing is not null then
    raise exception 'STEP 21: table(s) not found: %', missing;
  end if;

  if to_regprocedure('public.is_admin(text[])') is null then
    raise exception 'STEP 21: public.is_admin(text[]) not found. Run STEP 7 first.';
  end if;

  if to_regprocedure('public.is_approved_member()') is null then
    raise exception 'STEP 21: public.is_approved_member() not found. Run STEP 20 first.';
  end if;

  -- 공개 행 조건에 쓰는 열
  select string_agg(c, ', ')
  into missing
  from unnest(array['pr_config.key', 'pr_schedules.is_public', 'members.is_public', 'members.status', 'members.auth_user_id', 'profiles.id']) c
  where not exists (
    select 1
    from pg_attribute a
    where a.attrelid = ('public.' || split_part(c, '.', 1))::regclass
      and a.attname = split_part(c, '.', 2)
      and a.attnum > 0
      and not a.attisdropped
  );

  if missing is not null then
    raise exception 'STEP 21: column(s) not found: %', missing;
  end if;
end;
$$;

-- API로 노출되지 않는 별도 스키마 (anon·authenticated는 접근 권한이 없다)
create schema if not exists ig_backup_step21;
revoke all on schema ig_backup_step21 from public;

-- 공개 페이지가 읽는 운영 설정 키 (메인·일정·지원·학회원 소개)
create or replace function ig_backup_step21.public_config_keys()
returns text[]
language sql
immutable
as $$
  select array['landing_content', 'schedule_content', 'recruiting_generation', 'application_form_url', 'members_group_photo']
$$;

-- 학회원 화면이 쓰는 저장소 버킷 (ig-files: 기획서 파일, showcase: 공개 사이트 이미지·자료)
create or replace function ig_backup_step21.buckets()
returns text[]
language sql
immutable
as $$
  select array['ig-files', 'showcase']
$$;

-- 대상 테이블과 승인 전 계정·공개 키에 남기는 범위
--   rule            member_only  학회원 전용: 승인 학회원·관리자만 읽고 쓴다
--                   public_rows  공개 페이지에 나오는 행은 누구나 읽고, 나머지는 학회원 전용
--                   public_site  공개 사이트 콘텐츠: 읽기는 그대로, 쓰기만 승인 학회원·관리자
--   signed_in_rows  승인 전 로그인 계정이 더 읽을 수 있는 행 (승인 학회원·관리자 조건과 OR)
--   anon_rows       공개 키가 읽을 수 있는 행
--   own_insert      승인 전 로그인 계정이 추가할 수 있는 행 (가입 직후 명단 등록)
--   anon_insert     공개 키의 추가를 그대로 둔다 (이메일 인증 전 가입 화면의 명단 등록)
--   admin_write     쓰기는 관리자(최고관리자·관리자·운영진)만
create or replace function ig_backup_step21.targets()
returns table (
  sort_order integer,
  table_name text,
  rule text,
  signed_in_rows text,
  anon_rows text,
  own_insert text,
  anon_insert boolean,
  admin_write boolean,
  label text
)
language sql
stable
as $$
  values
    (1, 'files_metadata'::text, 'member_only'::text, 'false'::text, 'false'::text, 'false'::text, false, false, '주차별 제출물 (기획서 파일·슬라이드·영상 링크)'::text),
    (2, 'archive_files', 'member_only', 'false', 'false', 'false', false, false, '아카이브 자료·양식 링크'),
    (3, 'presentations', 'member_only', 'false', 'false', 'false', false, false, '발표 순서·발표자'),
    (4, 'pr_vote_criteria', 'member_only', 'false', 'false', 'false', false, false, '채점 기준'),
    (5, 'pr_deadlines', 'member_only', 'false', 'false', 'false', false, false, '제출·출석 마감 시각'),
    (6, 'club_rules', 'member_only', 'false', 'false', 'false', false, false, '회칙 본문'),
    (7, 'semester_weeks', 'member_only', 'false', 'false', 'false', false, false, '주차 주제'),
    (8, 'semester_deadlines', 'member_only', 'false', 'false', 'false', false, false, '학기 마감 (새 구조)'),
    (9, 'session_participants', 'member_only', 'false', 'false', 'false', false, false, '세션 참여자 (새 구조)'),
    (10, 'pr_members', 'member_only', 'false', 'false', 'false', false, true, '예전 학회원 명단 (쓰면 같은 이름 학회원의 상태가 바뀜)'),
    (11, 'pr_members_config', 'member_only', 'false', 'false', 'false', false, true, '예전 명단 설정'),
    (20, 'members', 'public_rows',
      'auth_user_id = (select auth.uid()) or (is_public and status <> ''pending'')',
      'is_public and status <> ''pending''',
      'false', false, true, '학회원 명단'),
    (21, 'profiles', 'public_rows',
      'id = (select auth.uid())',
      'false',
      'id = (select auth.uid())', true, false, '가입 정보 (이름·기수)'),
    (22, 'semester_memberships', 'public_rows',
      'participation_status = ''active'' and exists (select 1 from public.semesters s where s.id = semester_memberships.semester_id and s.status = ''active'') and exists (select 1 from public.members m where m.id = semester_memberships.member_id and m.status = ''active'' and m.is_public)',
      'participation_status = ''active'' and exists (select 1 from public.semesters s where s.id = semester_memberships.semester_id and s.status = ''active'') and exists (select 1 from public.members m where m.id = semester_memberships.member_id and m.status = ''active'' and m.is_public)',
      'false', false, false, '학기 참여 명단'),
    (23, 'pr_config', 'public_rows',
      format('key = any (%L::text[])', ig_backup_step21.public_config_keys()),
      format('key = any (%L::text[])', ig_backup_step21.public_config_keys()),
      'false', false, false, '운영 설정 (조 편성·세션 위치·벌금 규정 등)'),
    (24, 'pr_schedules', 'public_rows', 'is_public is true', 'is_public is true', 'false', false, false, '전체 일정'),
    (25, 'sessions', 'public_rows', 'is_public', 'is_public', 'false', false, false, '세션 (새 구조)'),
    (26, 'calendar_events', 'public_rows', 'is_public', 'is_public', 'false', false, false, '일정 (새 구조)'),
    (40, 'pr_landing_config', 'public_site', 'true', 'true', 'false', false, false, '메인 화면 설정'),
    (41, 'pr_showcase', 'public_site', 'true', 'true', 'false', false, false, '쇼케이스'),
    (42, 'pr_about_content', 'public_site', 'true', 'true', 'false', false, false, '학회 소개'),
    (43, 'pr_about_alumni', 'public_site', 'true', 'true', 'false', false, false, '졸업생 인터뷰'),
    (44, 'pr_activities_content', 'public_site', 'true', 'true', 'false', false, false, '활동 소개'),
    (45, 'pr_activities_regular_routine', 'public_site', 'true', 'true', 'false', false, false, '정규 세션 소개'),
    (46, 'pr_activities_edu_curriculum', 'public_site', 'true', 'true', 'false', false, false, '교육 커리큘럼'),
    (47, 'pr_activities_union_projects', 'public_site', 'true', 'true', 'false', false, false, '연합 프로젝트'),
    (48, 'pr_activities_corp_projects', 'public_site', 'true', 'true', 'false', false, false, '기업 프로젝트'),
    (49, 'pr_activities_corp_partners', 'public_site', 'true', 'true', 'false', false, false, '협력 기업')
$$;

-- 이 단계가 만드는 제한 정책 수 (테이블별)
create or replace function ig_backup_step21.expected_policies(p_rule text, p_anon_insert boolean)
returns integer
language sql
immutable
as $$
  select case when p_rule = 'public_site' then 0 else 2 end + 3 + 2 + case when p_anon_insert then 0 else 1 end
$$;

-- 행 수 비교용: 결과가 한도(+여유) 이하인가. 숫자가 아니면 blocked·skipped만 통과
create or replace function ig_backup_step21.within(p_result text, p_limit text, p_extra integer)
returns boolean
language sql
immutable
as $$
  select case
    when p_result is null then true
    when p_result !~ '^[0-9]+$' then p_result in ('blocked', 'skipped')
    when p_limit is null or p_limit !~ '^[0-9]+$' then false
    else p_result::bigint <= p_limit::bigint + p_extra
  end
$$;

-- 공개 페이지가 읽던 공개 행을 잃지 않았는가 (실행 후 = min(실행 전, 공개 행))
create or replace function ig_backup_step21.kept_public(p_before text, p_after text, p_public text)
returns boolean
language sql
immutable
as $$
  select case
    when p_before ~ '^[0-9]+$' and p_after ~ '^[0-9]+$' and p_public ~ '^[0-9]+$'
      then p_after::bigint = least(p_before::bigint, p_public::bigint)
    when p_before in ('blocked', 'skipped') then coalesce(p_after, '') in ('blocked', 'skipped', '0')
    else coalesce(p_after, '') !~ '^error'
  end
$$;

create table if not exists ig_backup_step21.access_before (
  id bigint generated always as identity primary key,
  captured_at timestamptz not null default now(),
  kind text not null,          -- rls | policy | function_acl | schema_usage
  table_name text,             -- schema.table
  name text,
  detail jsonb not null
);

create table if not exists ig_backup_step21.probe_log (
  id bigint generated always as identity primary key,
  probed_at timestamptz not null default now(),
  phase text not null check (phase in ('before', 'after')),
  account text not null,       -- anon | member | unapproved | admin | viewer | public_rows
  account_note text,
  target text not null,
  result text not null         -- row count | blocked | skipped | error <sqlstate>
);

-- 실행 중에만 쓰는 확인용 계정 목록. 실행이 끝나기 전에 비운다
create table if not exists ig_backup_step21.probe_accounts (
  sort_order integer not null,
  account text not null,
  user_id uuid,
  note text
);

-- 확인 대상: 테이블은 전체 행 수, 저장소는 버킷별 파일 수. public_sql은 공개 행 수 (소유자 권한)
create or replace function ig_backup_step21.probe_targets()
returns table (sort_order integer, target text, count_sql text, public_sql text)
language sql
stable
as $$
  select
    t.sort_order,
    t.table_name,
    format('select count(*) from public.%I', t.table_name),
    case when t.rule = 'public_rows' then format('select count(*) from public.%I where %s', t.table_name, t.anon_rows) end
  from ig_backup_step21.targets() t
  where to_regclass('public.' || t.table_name) is not null
  union all
  select
    (100 + b.n)::integer,
    'storage:' || b.bucket,
    format('select count(*) from storage.objects where bucket_id = %L', b.bucket),
    null
  from unnest(ig_backup_step21.buckets()) with ordinality b(bucket, n)
  where to_regclass('storage.objects') is not null
$$;

-- 지정한 계정으로 접속한 것처럼 행 수만 센다. 행 내용은 읽지 않는다.
create or replace function ig_backup_step21.probe_count(p_account text, p_user uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  old_claims text := current_setting('request.jwt.claims', true);
  old_sub text := current_setting('request.jwt.claim.sub', true);
  old_role text := current_setting('request.jwt.claim.role', true);
  probe_role text := case when p_account = 'anon' then 'anon' else 'authenticated' end;
  counted bigint;
  outcome text;
begin
  if probe_role = 'authenticated' and p_user is null then
    return 'skipped';
  end if;

  perform set_config('request.jwt.claims',
    case
      when probe_role = 'anon' then json_build_object('role', 'anon')
      else json_build_object('role', 'authenticated', 'sub', p_user)
    end::text, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  perform set_config('request.jwt.claim.role', probe_role, true);

  begin
    execute format('set local role %I', probe_role);
  exception when others then
    outcome := 'skipped';
  end;

  if outcome is null then
    begin
      execute p_sql into counted;
      outcome := counted::text;
    exception
      when insufficient_privilege then
        outcome := 'blocked';
      when others then
        outcome := 'error ' || sqlstate;
    end;
    execute 'reset role';
  end if;

  perform set_config('request.jwt.claims', coalesce(old_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(old_sub, ''), true);
  perform set_config('request.jwt.claim.role', coalesce(old_role, ''), true);
  return outcome;
end;
$$;

create or replace function ig_backup_step21.run_probe(p_phase text)
returns void
language plpgsql
as $$
declare
  probe record;
  probe_target record;
  counted bigint;
begin
  for probe in select account, user_id, note from ig_backup_step21.probe_accounts order by sort_order loop
    for probe_target in select t.target, t.count_sql from ig_backup_step21.probe_targets() t order by t.sort_order loop
      insert into ig_backup_step21.probe_log (phase, account, account_note, target, result)
      values (p_phase, probe.account, probe.note, probe_target.target,
        ig_backup_step21.probe_count(probe.account, probe.user_id, probe_target.count_sql));
    end loop;
  end loop;

  if p_phase = 'after' then
    -- 공개 페이지에 나오는 행 수 (공개 행 조건만으로 센다)
    for probe_target in select t.target, t.public_sql from ig_backup_step21.probe_targets() t where t.public_sql is not null loop
      execute probe_target.public_sql into counted;
      insert into ig_backup_step21.probe_log (phase, account, target, result)
      values ('after', 'public_rows', probe_target.target, counted::text);
    end loop;
  end if;
end;
$$;

-- 가입할 때 이름·기수가 같은 기존 명단 행에 자동으로 연결된 계정 (관리자 승인 화면을 거치지 않음).
-- 명단 행이 계정보다 먼저 있었던 승인 학회원 = sync_profile_to_member가 연결한 계정
create or replace function ig_backup_step21.auto_linked_accounts()
returns table (
  name text,
  generation text,
  status text,
  roster_since date,
  signed_up date,
  last_sign_in date,
  is_admin boolean
)
language sql
stable
as $$
  select
    m.name,
    m.generation,
    m.status,
    m.created_at::date,
    u.created_at::date,
    u.last_sign_in_at::date,
    exists (select 1 from public.admin_users au where au.user_id = u.id and au.is_active)
  from public.members m
  join auth.users u on u.id = m.auth_user_id
  where m.status in ('active', 'leave', 'inactive', 'alumni')
    and m.created_at < u.created_at - interval '1 minute'
  order by u.created_at desc
$$;

revoke all on all functions in schema ig_backup_step21 from public;
revoke all on all tables in schema ig_backup_step21 from public;

-- 1. 변경 전 상태 스냅샷 (처음 실행할 때만)
do $$
begin
  if exists (select 1 from ig_backup_step21.access_before) then
    raise notice 'STEP 21: keeping the snapshot from the first run';
    return;
  end if;

  insert into ig_backup_step21.access_before (kind, table_name, name, detail)
  select 'rls', format('%I.%I', n.nspname, c.relname), null,
    jsonb_build_object('rls_enabled', c.relrowsecurity, 'rls_forced', c.relforcerowsecurity)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where (n.nspname = 'public' and c.relname in (select table_name from ig_backup_step21.targets()))
     or (n.nspname = 'storage' and c.relname = 'objects');

  insert into ig_backup_step21.access_before (kind, table_name, name, detail)
  select 'policy', format('%I.%I', n.nspname, c.relname), pol.polname,
    jsonb_build_object(
      'permissive', pol.polpermissive,
      'cmd', cmd.name,
      'roles_sql', r.roles_sql,
      'qual', pg_get_expr(pol.polqual, pol.polrelid),
      'with_check', pg_get_expr(pol.polwithcheck, pol.polrelid),
      'create_sql', format(
        'create policy %I on %I.%I as %s for %s to %s%s%s',
        pol.polname,
        n.nspname,
        c.relname,
        case when pol.polpermissive then 'permissive' else 'restrictive' end,
        cmd.name,
        r.roles_sql,
        coalesce(' using (' || pg_get_expr(pol.polqual, pol.polrelid) || ')', ''),
        coalesce(' with check (' || pg_get_expr(pol.polwithcheck, pol.polrelid) || ')', '')))
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral (
    select case pol.polcmd
      when 'r' then 'select'
      when 'a' then 'insert'
      when 'w' then 'update'
      when 'd' then 'delete'
      else 'all'
    end as name
  ) cmd
  cross join lateral (
    select string_agg(case when role_oid = 0 then 'public' else quote_ident(ro.rolname) end, ', ' order by role_oid) as roles_sql
    from unnest(pol.polroles) role_oid
    left join pg_roles ro on ro.oid = role_oid
  ) r
  where (n.nspname = 'public' and c.relname in (select table_name from ig_backup_step21.targets()))
     or (n.nspname = 'storage' and c.relname = 'objects');

  insert into ig_backup_step21.access_before (kind, table_name, name, detail)
  select 'function_acl', null, 'public.refresh_legacy_week_topics(uuid)',
    jsonb_build_object(
      'acl', p.proacl::text,
      'anon', has_function_privilege('anon', p.oid, 'EXECUTE'),
      'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  from pg_proc p
  where p.oid = to_regprocedure('public.refresh_legacy_week_topics(uuid)');

  insert into ig_backup_step21.access_before (kind, table_name, name, detail)
  select 'schema_usage', null, n.nspname,
    jsonb_build_object(
      'acl', n.nspacl::text,
      'anon', has_schema_privilege('anon', n.oid, 'USAGE'),
      'authenticated', has_schema_privilege('authenticated', n.oid, 'USAGE'))
  from pg_namespace n
  where n.nspname like 'ig\_backup%';
end;
$$;

-- 확인용 계정: 공개 키·승인 학회원·승인 전 계정·관리자·열람자 (실행이 끝나기 전에 지운다)
delete from ig_backup_step21.probe_accounts;

insert into ig_backup_step21.probe_accounts (sort_order, account, user_id, note)
values (0, 'anon', null, null);

insert into ig_backup_step21.probe_accounts (sort_order, account, user_id, note)
select 1, 'member', (
  select m.auth_user_id
  from public.members m
  where m.auth_user_id is not null
    and m.status in ('active', 'leave', 'inactive', 'alumni')
    and not exists (select 1 from public.admin_users au where au.user_id = m.auth_user_id and au.is_active)
  order by (m.status = 'active') desc, m.created_at
  limit 1
), null;

insert into ig_backup_step21.probe_accounts (sort_order, account, user_id, note)
select 2, 'unapproved', coalesce(pending.auth_user_id, gen_random_uuid()),
  case when pending.auth_user_id is null then '승인 대기 계정이 없어 학회원 행 없는 가상 계정으로 확인' end
from (select null::int as dummy) one
left join lateral (
  select m.auth_user_id
  from public.members m
  where m.auth_user_id is not null
    and m.status = 'pending'
    and not exists (select 1 from public.admin_users au where au.user_id = m.auth_user_id and au.is_active)
  order by m.created_at desc
  limit 1
) pending on true;

insert into ig_backup_step21.probe_accounts (sort_order, account, user_id, note)
select 3, 'admin', (
  select au.user_id
  from public.admin_users au
  where au.is_active and au.role in ('super_admin', 'admin', 'operator')
  order by array_position(array['super_admin', 'admin', 'operator'], au.role)
  limit 1
), null;

insert into ig_backup_step21.probe_accounts (sort_order, account, user_id, note)
select 4, 'viewer', (
  select au.user_id
  from public.admin_users au
  where au.is_active and au.role = 'viewer'
  limit 1
), null;

-- 변경 전 읽기 확인
select ig_backup_step21.run_probe('before');

-- 2·3. 테이블별 제한 정책 (기존 정책 조건식은 그대로)
do $$
declare
  t record;
  policy_name text;
  gate constant text := '(select public.is_approved_member()) or (select public.is_admin(array[''super_admin'', ''admin'', ''operator'', ''viewer'']))';
  write_gate text;
begin
  for t in
    select tt.*
    from ig_backup_step21.targets() tt
    where to_regclass('public.' || tt.table_name) is not null
    order by tt.sort_order
  loop
    if not (select c.relrowsecurity from pg_class c where c.oid = format('public.%I', t.table_name)::regclass) then
      -- RLS가 꺼져 있던 테이블: 공개 키·로그인 계정이 지금처럼 읽고 쓰도록 남긴 뒤 RLS를 켠다
      execute format('drop policy if exists ig_step21_keep_current on public.%I', t.table_name);
      execute format('create policy ig_step21_keep_current on public.%I as permissive for all to anon, authenticated using (true) with check (true)', t.table_name);
      execute format('alter table public.%I enable row level security', t.table_name);
      raise notice 'STEP 21: RLS enabled on % (current access kept by ig_step21_keep_current)', t.table_name;
    end if;

    foreach policy_name in array array[
      'ig_step21_read', 'ig_step21_insert', 'ig_step21_update', 'ig_step21_delete',
      'ig_step21_anon_read', 'ig_step21_anon_insert', 'ig_step21_anon_update', 'ig_step21_anon_delete'
    ] loop
      execute format('drop policy if exists %I on public.%I', policy_name, t.table_name);
    end loop;

    write_gate := case when t.admin_write then '(select public.is_admin())' else gate end;

    -- 로그인 계정
    if t.rule <> 'public_site' then
      execute format(
        'create policy ig_step21_read on public.%I as restrictive for select to authenticated using (%s or (%s))',
        t.table_name, gate, t.signed_in_rows);
    end if;
    execute format(
      'create policy ig_step21_insert on public.%I as restrictive for insert to authenticated with check (%s or (%s))',
      t.table_name, write_gate, t.own_insert);
    execute format(
      'create policy ig_step21_update on public.%I as restrictive for update to authenticated using (%s) with check (%s)',
      t.table_name, write_gate, write_gate);
    execute format(
      'create policy ig_step21_delete on public.%I as restrictive for delete to authenticated using (%s)',
      t.table_name, write_gate);

    -- 공개 키
    if t.rule <> 'public_site' then
      execute format(
        'create policy ig_step21_anon_read on public.%I as restrictive for select to anon using (%s)',
        t.table_name, t.anon_rows);
    end if;
    if not t.anon_insert then
      execute format(
        'create policy ig_step21_anon_insert on public.%I as restrictive for insert to anon with check (false)',
        t.table_name);
    end if;
    execute format(
      'create policy ig_step21_anon_update on public.%I as restrictive for update to anon using (false)',
      t.table_name);
    execute format(
      'create policy ig_step21_anon_delete on public.%I as restrictive for delete to anon using (false)',
      t.table_name);
  end loop;
end;
$$;

-- 4. 저장소 버킷 (공개 주소로 내려받기는 RLS와 무관하게 그대로)
do $$
declare
  gate constant text := '(select public.is_approved_member()) or (select public.is_admin(array[''super_admin'', ''admin'', ''operator'', ''viewer'']))';
  bucket_list text := (select string_agg(quote_literal(b), ', ') from unnest(ig_backup_step21.buckets()) b);
begin
  if to_regclass('storage.objects') is null then
    raise notice 'STEP 21: storage.objects not found, storage policies skipped';
    return;
  end if;

  begin
    execute 'drop policy if exists ig_step21_storage on storage.objects';
    execute 'drop policy if exists ig_step21_storage_anon on storage.objects';
    execute format(
      'create policy ig_step21_storage on storage.objects as restrictive for all to authenticated using (bucket_id not in (%1$s) or %2$s) with check (bucket_id not in (%1$s) or %2$s)',
      bucket_list, gate);
    execute format(
      'create policy ig_step21_storage_anon on storage.objects as restrictive for all to anon using (bucket_id not in (%1$s)) with check (bucket_id not in (%1$s))',
      bucket_list);
  exception when insufficient_privilege then
    raise notice 'STEP 21: cannot create policies on storage.objects (%). Add them in the dashboard.', sqlerrm;
  end;
end;
$$;

-- 5. 관리자 함수 안에서만 쓰는 함수, 백업 스키마
do $$
declare
  backup record;
begin
  if to_regprocedure('public.refresh_legacy_week_topics(uuid)') is not null then
    execute 'revoke all on function public.refresh_legacy_week_topics(uuid) from public, anon, authenticated';
  end if;

  for backup in
    select n.nspname
    from pg_namespace n
    where n.nspname like 'ig\_backup%'
      and (has_schema_privilege('anon', n.oid, 'USAGE') or has_schema_privilege('authenticated', n.oid, 'USAGE'))
  loop
    execute format('revoke usage on schema %I from public, anon, authenticated', backup.nspname);
  end loop;
end;
$$;

-- 6. 변경 후 읽기 확인. 승인 학회원·관리자·열람자, 또는 공개 사이트 테이블의 공개 키·승인 전 계정
--    결과가 달라지면 전체를 되돌린다
select ig_backup_step21.run_probe('after');

do $$
declare
  changed text;
begin
  select string_agg(b.account || ' ' || b.target || ' ' || b.result || ' -> ' || a.result, ', ')
  into changed
  from ig_backup_step21.probe_log b
  join ig_backup_step21.probe_log a
    on a.probed_at = b.probed_at
   and a.account = b.account
   and a.target = b.target
   and a.phase = 'after'
  left join ig_backup_step21.targets() t on t.table_name = b.target
  where b.phase = 'before'
    and b.probed_at = now()
    and (
      b.account in ('member', 'admin', 'viewer')
      or (b.account in ('anon', 'unapproved') and t.rule = 'public_site')
    )
    and a.result is distinct from b.result;

  if changed is not null then
    raise exception 'STEP 21: approved member, admin or public site reads changed (%). Nothing was applied.', changed;
  end if;
end;
$$;

delete from ig_backup_step21.probe_accounts;

commit;

-- 확인: 테이블 행(있는 것만) + 저장소 2행 + signup_auto_link + other_tables + other_paths
--   칸은 실행 전 -> 실행 후 행 수. ok가 비어 있는 행은 정보, 나머지는 모두 true여야 한다.
--   anon        공개 키 (학회원 전용: 0 / 공개 행만: 공개 행 수 / 공개 사이트: 그대로)
--   unapproved  승인 전 계정 (학회원 전용: 0 / 공개 행만: 공개 행 수 + 본인 행 / 공개 사이트: 그대로)
--   member·admin·viewer  승인 학회원·관리자·열람자 (같아야 한다)
with last_run as (
  select max(probed_at) as at from ig_backup_step21.probe_log
),
probe as (
  select
    l.target,
    max(l.result) filter (where l.phase = 'before' and l.account = 'anon') as anon_before,
    max(l.result) filter (where l.phase = 'after' and l.account = 'anon') as anon_after,
    max(l.result) filter (where l.phase = 'before' and l.account = 'unapproved') as unapproved_before,
    max(l.result) filter (where l.phase = 'after' and l.account = 'unapproved') as unapproved_after,
    max(l.result) filter (where l.phase = 'before' and l.account = 'member') as member_before,
    max(l.result) filter (where l.phase = 'after' and l.account = 'member') as member_after,
    max(l.result) filter (where l.phase = 'before' and l.account = 'admin') as admin_before,
    max(l.result) filter (where l.phase = 'after' and l.account = 'admin') as admin_after,
    max(l.result) filter (where l.phase = 'before' and l.account = 'viewer') as viewer_before,
    max(l.result) filter (where l.phase = 'after' and l.account = 'viewer') as viewer_after,
    max(l.result) filter (where l.account = 'public_rows') as public_rows,
    max(l.account_note) filter (where l.account = 'unapproved') as unapproved_note
  from ig_backup_step21.probe_log l
  join last_run on l.probed_at = last_run.at
  group by l.target
),
tables as (
  select
    t.sort_order,
    t.table_name as target,
    t.rule,
    t.label,
    c.oid is not null as present,
    coalesce(c.relrowsecurity, false) as rls_enabled,
    (
      select count(*)
      from pg_policy pol
      where pol.polrelid = c.oid
        and pol.polname like 'ig\_step21\_%'
        and not pol.polpermissive
    ) as gate_policies,
    ig_backup_step21.expected_policies(t.rule, t.anon_insert) as expected_policies,
    exists (
      select 1 from pg_policy pol
      where pol.polrelid = c.oid and pol.polname = 'ig_step21_keep_current'
    ) as rls_turned_on,
    case when t.table_name in ('members', 'profiles') then 1 else 0 end as own_rows
  from ig_backup_step21.targets() t
  left join pg_class c on c.oid = to_regclass('public.' || t.table_name)::oid
),
storage_state as (
  select
    b.n,
    b.bucket,
    to_regclass('storage.objects') is not null as present,
    coalesce((select c.relrowsecurity from pg_class c where c.oid = to_regclass('storage.objects')::oid), false) as rls_enabled,
    (
      select count(*)
      from pg_policy pol
      where pol.polrelid = to_regclass('storage.objects')::oid
        and pol.polname in ('ig_step21_storage', 'ig_step21_storage_anon')
        and not pol.polpermissive
    ) = 2 as gate_ready,
    (select bk.public from storage.buckets bk where bk.id = b.bucket) as public_bucket
  from unnest(ig_backup_step21.buckets()) with ordinality b(bucket, n)
),
config_keys as (
  select
    (
      select string_agg(cfg.key, ', ' order by cfg.key)
      from public.pr_config cfg
      where not (cfg.key = any (ig_backup_step21.public_config_keys()))
    ) as hidden_keys,
    (
      select string_agg(k, ', ')
      from unnest(ig_backup_step21.public_config_keys()) k
      where not exists (select 1 from public.pr_config cfg where cfg.key = k)
    ) as absent_public_keys
),
auto_link as (
  select
    count(*) filter (where m.auth_user_id is null and m.legacy_profile_id is null) as claimable,
    count(*) filter (where m.auth_user_id is null and m.legacy_profile_id is null and m.is_public) as claimable_public,
    (select count(*) from ig_backup_step21.auto_linked_accounts()) as auto_linked
  from public.members m
  where m.status in ('active', 'leave', 'inactive', 'alumni')
),
other_paths as (
  select
    (
      select string_agg(p.oid::regprocedure::text, ', ' order by p.proname)
      from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.prosecdef
        and p.prorettype <> 'trigger'::regtype
        and p.proname not in ('is_admin', 'is_approved_member')
        and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
        and p.prosrc ~ ('\m(' || (select string_agg(table_name, '|') from ig_backup_step21.targets()) || ')\M')
        and p.prosrc !~ '(is_admin|is_developer|is_approved_member)'
    ) as open_functions,
    (
      select string_agg(distinct v.oid::regclass::text, ', ')
      from pg_depend d
      join pg_rewrite rw on rw.oid = d.objid
      join pg_class v on v.oid = rw.ev_class
      join pg_class t on t.oid = d.refobjid
      where d.classid = 'pg_rewrite'::regclass
        and d.refclassid = 'pg_class'::regclass
        and t.relnamespace = 'public'::regnamespace
        and t.relname in (select table_name from ig_backup_step21.targets())
        and v.oid <> t.oid
        and coalesce(array_to_string(v.reloptions, ','), '') !~* 'security_invoker=(true|on|1)'
        and (
          (has_schema_privilege('anon', v.relnamespace, 'USAGE') and has_any_column_privilege('anon', v.oid, 'SELECT'))
          or (has_schema_privilege('authenticated', v.relnamespace, 'USAGE') and has_any_column_privilege('authenticated', v.oid, 'SELECT'))
        )
    ) as open_views,
    (
      select string_agg(n.nspname, ', ')
      from pg_namespace n
      where n.nspname like 'ig\_backup%'
        and (has_schema_privilege('anon', n.oid, 'USAGE') or has_schema_privilege('authenticated', n.oid, 'USAGE'))
    ) as open_backups,
    (
      select string_agg(c.relname, ', ' order by c.relname)
      from pg_class c
      where c.relnamespace = 'public'::regnamespace
        and c.relkind in ('r', 'p')
        and c.relname not in (select table_name from ig_backup_step21.targets())
        -- STEP 19·20 대상, 관리자 전용, 공개가 원래 목적인 테이블
        and c.relname not in ('pr_attendance', 'pr_fines', 'absence_forms', 'scores', 'file_comments',
                              'admin_users', 'admin_access_audit', 'data_migration_issues', 'semesters')
        and (has_any_column_privilege('anon', c.oid, 'SELECT') or has_any_column_privilege('authenticated', c.oid, 'SELECT'))
        and (
          not c.relrowsecurity
          or exists (
            select 1
            from pg_policy pol
            where pol.polrelid = c.oid
              and pol.polpermissive
              and pol.polcmd in ('r', '*')
              and coalesce(pg_get_expr(pol.polqual, pol.polrelid), 'true') !~ '(is_admin|is_approved_member)'
          )
        )
    ) as other_tables
)
select item, rule, anon, unapproved, member, admin, viewer, ok, note
from (
  select
    t.sort_order,
    t.target as item,
    case t.rule when 'member_only' then '학회원 전용' when 'public_rows' then '공개 행만' else '공개 (쓰기만 제한)' end as rule,
    concat(p.anon_before, ' -> ', p.anon_after) as anon,
    concat(p.unapproved_before, ' -> ', p.unapproved_after) as unapproved,
    concat(p.member_before, ' -> ', p.member_after) as member,
    concat(p.admin_before, ' -> ', p.admin_after) as admin,
    concat(p.viewer_before, ' -> ', p.viewer_after) as viewer,
    case when not t.present then null else (
      t.rls_enabled
      and t.gate_policies = t.expected_policies
      and p.member_after is not distinct from p.member_before
      and p.admin_after is not distinct from p.admin_before
      and p.viewer_after is not distinct from p.viewer_before
      and coalesce(p.member_after, '') !~ '^(blocked|error)'
      and coalesce(p.admin_after, '') !~ '^(blocked|error)'
      and case t.rule
        when 'member_only' then
          coalesce(p.anon_after, 'skipped') in ('0', 'blocked', 'skipped')
          and coalesce(p.unapproved_after, 'skipped') in ('0', 'blocked', 'skipped')
        when 'public_rows' then
          ig_backup_step21.within(p.anon_after, p.public_rows, 0)
          and ig_backup_step21.within(p.unapproved_after, p.public_rows, t.own_rows)
          and ig_backup_step21.kept_public(p.anon_before, p.anon_after, p.public_rows)
        else
          p.anon_after is not distinct from p.anon_before
          and p.unapproved_after is not distinct from p.unapproved_before
      end
    ) end as ok,
    concat_ws(' / ',
      t.label,
      case when not t.present then '테이블 없음: 건너뜀' end,
      case when t.present and t.rule = 'public_rows' then '공개 행 ' || coalesce(p.public_rows, '?') end,
      case when t.present and t.gate_policies <> t.expected_policies then format('제한 정책 %s/%s개', t.gate_policies, t.expected_policies) end,
      case when t.present and not t.rls_enabled then 'RLS 꺼짐' end,
      case when t.rls_turned_on then 'RLS를 켬 (지금 권한을 유지하는 허용 정책 추가)' end,
      case when t.target = 'pr_config' and ck.hidden_keys is not null then '공개 키·승인 전 계정에서 숨긴 설정: ' || ck.hidden_keys end,
      case when t.target = 'pr_config' and ck.absent_public_keys is not null then '아직 없는 공개 설정: ' || ck.absent_public_keys end,
      case when t.present and p.member_after = 'skipped' then '승인 학회원 계정 없음 또는 역할 전환 불가: 정책 기준으로만 확인' end,
      case when t.present and p.viewer_after = 'skipped' and p.member_after is distinct from 'skipped' then '열람자 계정 없음' end,
      case when t.present then p.unapproved_note end
    ) as note
  from tables t
  left join probe p on p.target = t.target
  cross join config_keys ck
  union all
  select
    100 + s.n,
    'storage:' || s.bucket,
    '학회원 전용 (목록·올리기·지우기)',
    concat(p.anon_before, ' -> ', p.anon_after),
    concat(p.unapproved_before, ' -> ', p.unapproved_after),
    concat(p.member_before, ' -> ', p.member_after),
    concat(p.admin_before, ' -> ', p.admin_after),
    concat(p.viewer_before, ' -> ', p.viewer_after),
    case when not s.present then null else (
      s.gate_ready
      and s.rls_enabled
      and p.member_after is not distinct from p.member_before
      and p.admin_after is not distinct from p.admin_before
      and p.viewer_after is not distinct from p.viewer_before
      and coalesce(p.anon_after, 'skipped') in ('0', 'blocked', 'skipped')
      and coalesce(p.unapproved_after, 'skipped') in ('0', 'blocked', 'skipped')
    ) end,
    concat_ws(' / ',
      case when not s.present then '저장소 없음: 건너뜀' end,
      case when s.present and not s.gate_ready then '저장소 정책을 만들 권한이 없어 건너뜀: COPY_PASTE_ORDER STEP 21의 저장소 정책을 대시보드에서 추가' end,
      case when s.present and not s.rls_enabled then 'storage.objects RLS 꺼짐' end,
      case when s.public_bucket then '공개 버킷: 파일 주소를 아는 사람은 로그인 없이 내려받을 수 있음 (정책과 무관)' end,
      case when s.public_bucket is null and s.present then '버킷 없음' end
    )
  from storage_state s
  left join probe p on p.target = 'storage:' || s.bucket
  union all
  select
    97,
    'signup_auto_link',
    '정보',
    null,
    null,
    concat(a.claimable, '명'),
    null,
    null,
    null,
    concat_ws(' / ',
      format('이름·기수만 맞으면 가입하는 순간 승인 학회원이 되는 명단 행 %s개 (로그인 계정 연결 없음, 그중 공개 명단 %s개)', a.claimable, a.claimable_public),
      format('지금까지 이렇게 자동 연결된 계정 %s개: select * from ig_backup_step21.auto_linked_accounts(); 로 확인', a.auto_linked)
    )
  from auto_link a
  union all
  select
    98,
    'other_tables',
    null,
    null,
    null,
    null,
    null,
    null,
    o.other_tables is null,
    case when o.other_tables is not null then
      '이 단계가 다루지 않았는데 로그인 계정이나 공개 키가 읽을 수 있는 테이블: ' || o.other_tables || ' (이름을 알려 주면 다음 단계에서 판단)'
    end
  from other_paths o
  union all
  select
    99,
    'other_paths',
    null,
    null,
    null,
    null,
    null,
    null,
    o.open_functions is null and o.open_views is null and o.open_backups is null,
    concat_ws(' / ',
      case when o.open_functions is not null then '승인 확인 없이 호출 가능한 보안 정의 함수: ' || o.open_functions end,
      case when o.open_views is not null then 'RLS를 거치지 않는 뷰: ' || o.open_views end,
      case when o.open_backups is not null then '백업 스키마 접근 가능: ' || o.open_backups end
    )
  from other_paths o
) result
order by sort_order;
