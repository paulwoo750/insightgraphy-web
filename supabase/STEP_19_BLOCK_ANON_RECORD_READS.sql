-- Block personal records from the public (anon) key.
--
-- Logged-out visitors can read every row of pr_attendance, pr_fines, absence_forms
-- (reason, proof_url, admin_comment included), scores and file_comments with the public
-- key shipped in the browser. No public page reads these tables. Every member and admin
-- screen reads them after login (role "authenticated"), so only the anon role loses access.
--
-- 1. Snapshot (first run only) of the RLS flags, the anon/PUBLIC grants and all policies
--    of the five tables into ig_backup_step19.access_before, so the change can be undone.
-- 2. Policies whose roles include PUBLIC or anon are narrowed to authenticated. USING and
--    WITH CHECK expressions are not touched, so signed-in members and admins
--    (public.is_admin()) read and write exactly what they do now. A policy granted to anon
--    only is dropped (its definition stays in the snapshot).
-- 3. Table privileges of anon on the five tables are revoked. This also covers a table
--    whose RLS is disabled. If PUBLIC holds privileges, they are first granted to
--    authenticated and service_role explicitly, then revoked from PUBLIC.
-- 4. STEP 17 helpers record_link_source / record_link_classify are security definer and
--    are called only inside admin functions. Supabase grants EXECUTE on new functions to
--    anon directly, so "revoke ... from public" in STEP 17 does not stop anon from calling
--    record_link_source (it returns record rows without checking is_admin()). EXECUTE is
--    revoked from anon and authenticated. Skipped when STEP 17 has not been run.
-- 5. The backup schema of STEP 0 (ig_backup_20260822) holds copies of the same tables.
--    If anon has USAGE on it, that is revoked.
-- 6. Probe: row counts read as anon and as authenticated (JWT role simulated) before and
--    after the change are kept in ig_backup_step19.probe_log. If the authenticated counts
--    differ, the whole step is rolled back.
--
-- No rows of public tables are inserted, changed or deleted. RLS is not switched on or
-- off. Safe to re-run: the first snapshot is kept, narrowed policies and revoked grants
-- stay as they are.

begin;

select pg_advisory_xact_lock(hashtextextended('insightgraphy-step-19', 0));

do $$
declare
  missing text;
begin
  select string_agg(t, ', ')
  into missing
  from unnest(array['pr_attendance', 'pr_fines', 'absence_forms', 'scores', 'file_comments']) t
  where to_regclass('public.' || t) is null;

  if missing is not null then
    raise exception 'STEP 19: table(s) not found: %', missing;
  end if;
end;
$$;

-- API로 노출되지 않는 별도 스키마 (anon·authenticated는 접근 권한이 없다)
create schema if not exists ig_backup_step19;
revoke all on schema ig_backup_step19 from public;

create or replace function ig_backup_step19.target_tables()
returns text[]
language sql
immutable
as $$
  select array['pr_attendance', 'pr_fines', 'absence_forms', 'scores', 'file_comments']
$$;

create table if not exists ig_backup_step19.access_before (
  id bigint generated always as identity primary key,
  captured_at timestamptz not null default now(),
  kind text not null,          -- rls | table_grant | column_grant | policy
  table_name text not null,
  name text,
  detail jsonb not null
);

create table if not exists ig_backup_step19.probe_log (
  id bigint generated always as identity primary key,
  probed_at timestamptz not null default now(),
  phase text not null check (phase in ('before', 'after')),
  role_name text not null,
  table_name text not null,
  result text not null         -- row count | blocked | skipped | error <sqlstate>
);

-- 지정한 역할로 로그인한 것처럼 행 수만 센다. 행 내용은 읽지 않는다.
create or replace function ig_backup_step19.probe_count(p_role text, p_table text)
returns text
language plpgsql
as $$
declare
  old_claims text := current_setting('request.jwt.claims', true);
  counted bigint;
  outcome text;
begin
  perform set_config('request.jwt.claims', json_build_object('role', p_role)::text, true);

  begin
    execute format('set local role %I', p_role);
  exception when others then
    perform set_config('request.jwt.claims', coalesce(old_claims, ''), true);
    return 'skipped';
  end;

  begin
    execute format('select count(*) from public.%I', p_table) into counted;
    outcome := counted::text;
  exception
    when insufficient_privilege then
      outcome := 'blocked';
    when others then
      outcome := 'error ' || sqlstate;
  end;

  execute 'reset role';
  perform set_config('request.jwt.claims', coalesce(old_claims, ''), true);
  return outcome;
end;
$$;

create or replace function ig_backup_step19.run_probe(p_phase text)
returns void
language plpgsql
as $$
declare
  probe_role text;
  probe_table text;
  probe_result text;
begin
  foreach probe_role in array array['anon', 'authenticated'] loop
    foreach probe_table in array ig_backup_step19.target_tables() loop
      probe_result := ig_backup_step19.probe_count(probe_role, probe_table);
      insert into ig_backup_step19.probe_log (phase, role_name, table_name, result)
      values (p_phase, probe_role, probe_table, probe_result);
    end loop;
  end loop;
end;
$$;

revoke all on all functions in schema ig_backup_step19 from public;
revoke all on all tables in schema ig_backup_step19 from public;

-- 1. 변경 전 상태 스냅샷 (처음 실행할 때만)
do $$
begin
  if exists (select 1 from ig_backup_step19.access_before) then
    raise notice 'STEP 19: keeping the snapshot from the first run';
    return;
  end if;

  insert into ig_backup_step19.access_before (kind, table_name, name, detail)
  select 'rls', c.relname, null,
    jsonb_build_object('rls_enabled', c.relrowsecurity, 'rls_forced', c.relforcerowsecurity)
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relname = any (ig_backup_step19.target_tables());

  insert into ig_backup_step19.access_before (kind, table_name, name, detail)
  select 'table_grant', c.relname, a.privilege_type,
    jsonb_build_object(
      'grantee', case when a.grantee = 0 then 'PUBLIC' else g.rolname end,
      'privilege', a.privilege_type)
  from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  left join pg_roles g on g.oid = a.grantee
  where c.relnamespace = 'public'::regnamespace
    and c.relname = any (ig_backup_step19.target_tables())
    and (a.grantee = 0 or g.rolname = 'anon');

  insert into ig_backup_step19.access_before (kind, table_name, name, detail)
  select 'column_grant', c.relname, att.attname,
    jsonb_build_object(
      'grantee', case when a.grantee = 0 then 'PUBLIC' else g.rolname end,
      'privilege', a.privilege_type,
      'column', att.attname)
  from pg_class c
  join pg_attribute att
    on att.attrelid = c.oid and att.attnum > 0 and not att.attisdropped and att.attacl is not null
  cross join lateral aclexplode(att.attacl) a
  left join pg_roles g on g.oid = a.grantee
  where c.relnamespace = 'public'::regnamespace
    and c.relname = any (ig_backup_step19.target_tables())
    and (a.grantee = 0 or g.rolname = 'anon');

  insert into ig_backup_step19.access_before (kind, table_name, name, detail)
  select 'policy', c.relname, pol.polname,
    jsonb_build_object(
      'permissive', pol.polpermissive,
      'cmd', cmd.name,
      'roles_sql', r.roles_sql,
      'qual', pg_get_expr(pol.polqual, pol.polrelid),
      'with_check', pg_get_expr(pol.polwithcheck, pol.polrelid),
      'create_sql', format(
        'create policy %I on public.%I as %s for %s to %s%s%s',
        pol.polname,
        c.relname,
        case when pol.polpermissive then 'permissive' else 'restrictive' end,
        cmd.name,
        r.roles_sql,
        coalesce(' using (' || pg_get_expr(pol.polqual, pol.polrelid) || ')', ''),
        coalesce(' with check (' || pg_get_expr(pol.polwithcheck, pol.polrelid) || ')', '')))
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
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
  where c.relnamespace = 'public'::regnamespace
    and c.relname = any (ig_backup_step19.target_tables());
end;
$$;

-- 변경 전 읽기 확인
select ig_backup_step19.run_probe('before');

-- 2. PUBLIC·anon 정책을 authenticated 전용으로 좁힌다 (조건식은 그대로)
do $$
declare
  pol record;
  new_roles text;
begin
  for pol in
    select p.polname, c.relname, p.polroles
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where c.relnamespace = 'public'::regnamespace
      and c.relname = any (ig_backup_step19.target_tables())
      and (0 = any (p.polroles) or 'anon'::regrole::oid = any (p.polroles))
  loop
    select string_agg(distinct quote_ident(role_name), ', ')
    into new_roles
    from (
      select case when role_oid = 0 then 'authenticated' else ro.rolname::text end as role_name
      from unnest(pol.polroles) role_oid
      left join pg_roles ro on ro.oid = role_oid
    ) roles
    where role_name is not null
      and role_name <> 'anon';

    if new_roles is null then
      execute format('drop policy %I on public.%I', pol.polname, pol.relname);
      raise notice 'STEP 19: dropped anon-only policy % on %', pol.polname, pol.relname;
    else
      execute format('alter policy %I on public.%I to %s', pol.polname, pol.relname, new_roles);
      raise notice 'STEP 19: policy % on % now applies to %', pol.polname, pol.relname, new_roles;
    end if;
  end loop;
end;
$$;

-- 3. anon의 테이블 권한을 회수한다 (RLS가 꺼진 테이블도 막힌다)
do $$
declare
  target text;
  grant_row record;
begin
  foreach target in array ig_backup_step19.target_tables() loop
    -- PUBLIC 권한은 Supabase 기본값이 아니다. 있으면 학회원·서버 권한을 먼저 명시적으로 남긴다
    for grant_row in
      select a.privilege_type, null::name as column_name
      from pg_class c
      cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
      where c.oid = format('public.%I', target)::regclass
        and a.grantee = 0
      union all
      select a.privilege_type, att.attname
      from pg_attribute att
      cross join lateral aclexplode(att.attacl) a
      where att.attrelid = format('public.%I', target)::regclass
        and att.attnum > 0
        and not att.attisdropped
        and att.attacl is not null
        and a.grantee = 0
    loop
      if grant_row.column_name is null then
        execute format('grant %s on public.%I to authenticated, service_role', grant_row.privilege_type, target);
      else
        execute format('grant %s (%I) on public.%I to authenticated, service_role', grant_row.privilege_type, grant_row.column_name, target);
      end if;
    end loop;

    if exists (
      select 1
      from pg_class c
      cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
      where c.oid = format('public.%I', target)::regclass
        and a.grantee = 0
    ) or exists (
      select 1
      from pg_attribute att
      cross join lateral aclexplode(att.attacl) a
      where att.attrelid = format('public.%I', target)::regclass
        and att.attacl is not null
        and a.grantee = 0
    ) then
      execute format('revoke all on public.%I from public', target);
    end if;

    execute format('revoke all on public.%I from anon', target);
  end loop;
end;
$$;

-- 4. STEP 17 내부 함수는 관리자 함수 안에서만 쓴다
do $$
begin
  if to_regprocedure('public.record_link_source(text,text)') is not null then
    execute 'revoke all on function public.record_link_source(text, text) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.record_link_classify(text,jsonb)') is not null then
    execute 'revoke all on function public.record_link_classify(text, jsonb) from public, anon, authenticated';
  end if;
end;
$$;

-- 5. STEP 0 백업 스키마 (보통은 이미 접근 불가)
do $$
begin
  if to_regnamespace('ig_backup_20260822') is not null
     and has_schema_privilege('anon', 'ig_backup_20260822', 'USAGE') then
    execute 'revoke usage on schema ig_backup_20260822 from public, anon';
  end if;
end;
$$;

-- 6. 변경 후 읽기 확인. 학회원(authenticated) 결과가 달라지면 전체를 되돌린다
select ig_backup_step19.run_probe('after');

do $$
declare
  changed text;
begin
  select string_agg(b.table_name || ' ' || b.result || ' -> ' || a.result, ', ')
  into changed
  from ig_backup_step19.probe_log b
  join ig_backup_step19.probe_log a
    on a.probed_at = b.probed_at
   and a.role_name = b.role_name
   and a.table_name = b.table_name
   and a.phase = 'after'
  where b.phase = 'before'
    and b.role_name = 'authenticated'
    and b.probed_at = now()
    and a.result is distinct from b.result;

  if changed is not null then
    raise exception 'STEP 19: signed-in member reads changed (%). Nothing was applied.', changed;
  end if;
end;
$$;

commit;

-- 확인: 테이블별 적용 전·후 (6행 모두 ok = true)
--   anon_before   실행 전 공개 키로 읽히던 행 수
--   anon_after    blocked (공개 키로 읽을 수 없음)
--   member_before = member_after (로그인한 학회원이 읽는 행 수는 그대로)
with last_run as (
  select max(probed_at) as at from ig_backup_step19.probe_log
),
probe as (
  select
    l.table_name,
    max(l.result) filter (where l.phase = 'before' and l.role_name = 'anon') as anon_before,
    max(l.result) filter (where l.phase = 'after' and l.role_name = 'anon') as anon_after,
    max(l.result) filter (where l.phase = 'before' and l.role_name = 'authenticated') as member_before,
    max(l.result) filter (where l.phase = 'after' and l.role_name = 'authenticated') as member_after
  from ig_backup_step19.probe_log l
  join last_run on l.probed_at = last_run.at
  group by l.table_name
),
targets as (
  select
    c.relname::text as table_name,
    array_position(ig_backup_step19.target_tables(), c.relname::text) as sort_order,
    c.relrowsecurity as rls_enabled,
    has_any_column_privilege('anon', c.oid, 'SELECT') as anon_select_grant,
    exists (
      select 1
      from pg_policy pol
      where pol.polrelid = c.oid
        and (0 = any (pol.polroles) or 'anon'::regrole::oid = any (pol.polroles))
    ) as anon_policy_left
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relname = any (ig_backup_step19.target_tables())
),
other_paths as (
  select
    coalesce(not has_function_privilege('anon', to_regprocedure('public.record_link_source(text,text)')::oid, 'EXECUTE'), true)
      and coalesce(not has_function_privilege('authenticated', to_regprocedure('public.record_link_source(text,text)')::oid, 'EXECUTE'), true)
      as helpers_private,
    to_regprocedure('public.record_link_source(text,text)') is not null as step17_installed,
    coalesce(not has_schema_privilege('anon', to_regnamespace('ig_backup_20260822')::oid, 'USAGE'), true) as backup_hidden,
    (
      select string_agg(distinct v.oid::regclass::text, ', ')
      from pg_depend d
      join pg_rewrite rw on rw.oid = d.objid
      join pg_class v on v.oid = rw.ev_class
      join pg_class t on t.oid = d.refobjid
      where d.classid = 'pg_rewrite'::regclass
        and d.refclassid = 'pg_class'::regclass
        and t.relnamespace = 'public'::regnamespace
        and t.relname = any (ig_backup_step19.target_tables())
        and v.oid <> t.oid
        and has_schema_privilege('anon', v.relnamespace, 'USAGE')
        and has_any_column_privilege('anon', v.oid, 'SELECT')
    ) as anon_views,
    (
      select string_agg(p.oid::regprocedure::text, ', ')
      from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.prosecdef
        and p.prorettype <> 'trigger'::regtype
        and has_function_privilege('anon', p.oid, 'EXECUTE')
        and p.prosrc ~ '(pr_attendance|pr_fines|absence_forms|scores|file_comments)'
        and p.prosrc !~ 'is_admin'
    ) as anon_functions
)
select item, anon_before, anon_after, member_before, member_after, rls_enabled, ok, note
from (
  select
    t.sort_order,
    t.table_name as item,
    p.anon_before,
    p.anon_after,
    p.member_before,
    p.member_after,
    t.rls_enabled,
    (
      not t.anon_select_grant
      and not t.anon_policy_left
      and coalesce(p.anon_after, '') !~ '^[1-9]'
      and p.member_after is not distinct from p.member_before
      and coalesce(p.member_after, '') !~ '^(blocked|error)'
    ) as ok,
    concat_ws(' / ',
      case when t.anon_select_grant then 'anon SELECT 권한 남음' end,
      case when t.anon_policy_left then 'anon·public 정책 남음' end,
      case when p.anon_after = 'skipped' then '역할 전환 불가: 권한 기준으로만 확인' end,
      case when not t.rls_enabled then 'RLS 꺼짐: 로그인 사용자 권한은 기존과 같음' end
    ) as note
  from targets t
  left join probe p using (table_name)
  union all
  select
    99,
    'other_paths',
    null,
    null,
    null,
    null,
    null,
    o.helpers_private and o.backup_hidden and o.anon_views is null and o.anon_functions is null,
    concat_ws(' / ',
      case when not o.step17_installed then 'STEP 17 미실행: 실행 후 STEP 19를 다시 실행' end,
      case when not o.helpers_private then 'record_link 함수가 공개됨' end,
      case when not o.backup_hidden then '백업 스키마 공개됨' end,
      case when o.anon_views is not null then '공개 뷰: ' || o.anon_views end,
      case when o.anon_functions is not null then '공개 함수: ' || o.anon_functions end
    )
  from other_paths o
) result
order by sort_order;
