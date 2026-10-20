-- Limit personal records to approved members and admins.
--
-- Anyone can create an account: app/signup calls supabase.auth.signUp and the club code is
-- checked only in the browser. A new account gets a members row with status 'pending' until an
-- admin approves it, but it is already "authenticated". After STEP 19 every policy on
-- pr_attendance, pr_fines, absence_forms, scores and file_comments applies to authenticated, so an
-- unapproved account reads every row (reason, proof_url and admin_comment of absence forms
-- included) and writes wherever the policies allow.
--
-- Who keeps access:
--   approved member  the account is linked by members.auth_user_id to a member whose status is
--                    active, leave, inactive or alumni (anything but pending). Approving a member
--                    in the admin screen gives access at once; no SQL re-run is needed.
--   admin            an active admin_users row of any role, viewer included (the admin screens
--                    read these tables for viewers as well).
--
-- 1. Snapshot (first run only) of the RLS flags and all policies of the five tables into
--    ig_backup_step20.access_before, so the change can be undone.
-- 2. public.is_approved_member(): security definer helper, true when auth.uid() belongs to an
--    approved member.
-- 3. One RESTRICTIVE policy per table for authenticated: approved member or admin. Postgres ANDs
--    a restrictive policy with the existing permissive policies, so their USING / WITH CHECK
--    expressions (made in the dashboard, unknown shapes) are not rewritten. Approved members and
--    admins read and write exactly what they do now; an unapproved account reads no row and
--    cannot insert, update or delete.
-- 4. A table whose RLS is disabled first gets a permissive policy "signed-in: everything" (what
--    authenticated has now), then RLS is enabled so the restrictive policy applies.
-- 5. Probe: row counts read as an approved member, an unapproved account, an admin and a viewer
--    (JWT simulated with set local role) before and after the change are kept in
--    ig_backup_step20.probe_log. If the approved member, admin or viewer counts differ, the whole
--    step is rolled back.
--
-- No rows of public tables are inserted, changed or deleted. Run after STEP 19. Safe to re-run:
-- the first snapshot is kept and the two policies are recreated with the same definition.

begin;

select pg_advisory_xact_lock(hashtextextended('insightgraphy-step-20', 0));

do $$
declare
  missing text;
  anon_open text;
begin
  select string_agg(t, ', ')
  into missing
  from unnest(array['pr_attendance', 'pr_fines', 'absence_forms', 'scores', 'file_comments', 'members', 'admin_users', 'profiles']) t
  where to_regclass('public.' || t) is null;

  if missing is not null then
    raise exception 'STEP 20: table(s) not found: %', missing;
  end if;

  if to_regprocedure('public.is_admin(text[])') is null then
    raise exception 'STEP 20: public.is_admin(text[]) not found. Run STEP 7 first.';
  end if;

  -- STEP 19가 먼저 공개 키(anon)의 접근을 막아야 한다
  select string_agg(c.relname, ', ' order by c.relname)
  into anon_open
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relname in ('pr_attendance', 'pr_fines', 'absence_forms', 'scores', 'file_comments')
    and (
      has_any_column_privilege('anon', c.oid, 'SELECT')
      or exists (
        select 1
        from pg_policy pol
        where pol.polrelid = c.oid
          and (0 = any (pol.polroles) or 'anon'::regrole::oid = any (pol.polroles))
      )
    );

  if anon_open is not null then
    raise exception 'STEP 20: run STEP 19 first (the public key still reaches %)', anon_open;
  end if;
end;
$$;

-- API로 노출되지 않는 별도 스키마 (anon·authenticated는 접근 권한이 없다)
create schema if not exists ig_backup_step20;
revoke all on schema ig_backup_step20 from public;

create or replace function ig_backup_step20.target_tables()
returns text[]
language sql
immutable
as $$
  select array['pr_attendance', 'pr_fines', 'absence_forms', 'scores', 'file_comments']
$$;

create table if not exists ig_backup_step20.access_before (
  id bigint generated always as identity primary key,
  captured_at timestamptz not null default now(),
  kind text not null,          -- rls | policy | function
  table_name text,
  name text,
  detail jsonb not null
);

create table if not exists ig_backup_step20.probe_log (
  id bigint generated always as identity primary key,
  probed_at timestamptz not null default now(),
  phase text not null check (phase in ('before', 'after')),
  account text not null,       -- member | unapproved | admin | viewer
  account_note text,
  table_name text not null,
  result text not null         -- row count | blocked | skipped | error <sqlstate>
);

-- 실행 중에만 쓰는 확인용 계정 목록. 실행이 끝나기 전에 비운다
create table if not exists ig_backup_step20.probe_accounts (
  sort_order integer not null,
  account text not null,
  user_id uuid,
  note text
);

-- 지정한 로그인 계정으로 접속한 것처럼 행 수만 센다. 행 내용은 읽지 않는다.
create or replace function ig_backup_step20.probe_count(p_user uuid, p_table text)
returns text
language plpgsql
as $$
declare
  old_claims text := current_setting('request.jwt.claims', true);
  old_sub text := current_setting('request.jwt.claim.sub', true);
  old_role text := current_setting('request.jwt.claim.role', true);
  counted bigint;
  outcome text;
begin
  if p_user is null then
    return 'skipped';
  end if;

  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', p_user)::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  begin
    execute 'set local role authenticated';
  exception when others then
    outcome := 'skipped';
  end;

  if outcome is null then
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
  end if;

  perform set_config('request.jwt.claims', coalesce(old_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(old_sub, ''), true);
  perform set_config('request.jwt.claim.role', coalesce(old_role, ''), true);
  return outcome;
end;
$$;

create or replace function ig_backup_step20.run_probe(p_phase text)
returns void
language plpgsql
as $$
declare
  probe record;
  probe_table text;
begin
  for probe in select account, user_id, note from ig_backup_step20.probe_accounts order by sort_order loop
    foreach probe_table in array ig_backup_step20.target_tables() loop
      insert into ig_backup_step20.probe_log (phase, account, account_note, table_name, result)
      values (p_phase, probe.account, probe.note, probe_table, ig_backup_step20.probe_count(probe.user_id, probe_table));
    end loop;
  end loop;
end;
$$;

-- STEP 20 이후 기록을 읽을 수 없는 로그인 계정 (관리자 제외).
-- own_records: 이 계정(학회원 ID·로그인 ID, 학회원 ID가 비어 있는 예전 기록은 같은 이름)으로 남은 기록 수
-- roster_match: 같은 이름의 승인 학회원 행이 있는데 로그인 계정이 연결되어 있지 않음
create or replace function ig_backup_step20.blocked_accounts()
returns table (
  account_type text,
  name text,
  generation text,
  requested text,
  signed_up date,
  last_sign_in date,
  own_records bigint,
  roster_match boolean
)
language sql
stable
as $$
  with accounts as (
    select
      u.id as user_id,
      u.created_at,
      u.last_sign_in_at,
      m.id as member_id,
      m.requested_status,
      nullif(trim(coalesce(m.name, p.name, u.raw_user_meta_data ->> 'name')), '') as name,
      coalesce(m.generation, p.student_id, u.raw_user_meta_data ->> 'student_id') as generation
    from auth.users u
    left join public.members m on m.auth_user_id = u.id
    left join public.profiles p on p.id = u.id
    where not exists (
        select 1 from public.admin_users au
        where au.user_id = u.id and au.is_active
      )
      and (m.id is null or m.status not in ('active', 'leave', 'inactive', 'alumni'))
  )
  select
    case when a.member_id is null then '학회원 연결 없음' else '승인 대기' end,
    a.name,
    a.generation,
    case a.requested_status when 'alumni' then '졸업' when 'active' then '활동' end,
    a.created_at::date,
    a.last_sign_in_at::date,
    (select count(*) from public.pr_attendance r
      where r.member_id = a.member_id or (r.member_id is null and trim(r.user_name) = a.name))
    + (select count(*) from public.pr_fines r
      where r.member_id = a.member_id or (r.member_id is null and trim(r.user_name) = a.name))
    + (select count(*) from public.absence_forms r
      where r.member_id = a.member_id or (r.member_id is null and trim(r.user_name) = a.name))
    + (select count(*) from public.scores r
      where r.voter_member_id = a.member_id or (r.voter_member_id is null and trim(r.voter_name) = a.name))
    + (select count(*) from public.file_comments r
      where r.user_id = a.user_id or r.member_id = a.member_id),
    exists (
      select 1
      from public.members roster
      where roster.auth_user_id is null
        and roster.status in ('active', 'leave', 'inactive', 'alumni')
        and public.normalize_member_name(roster.name) = public.normalize_member_name(a.name)
    )
  from accounts a
  order by 7 desc, 8 desc, a.created_at
$$;

revoke all on all functions in schema ig_backup_step20 from public;
revoke all on all tables in schema ig_backup_step20 from public;

-- 1. 변경 전 상태 스냅샷 (처음 실행할 때만)
do $$
begin
  if exists (select 1 from ig_backup_step20.access_before) then
    raise notice 'STEP 20: keeping the snapshot from the first run';
    return;
  end if;

  insert into ig_backup_step20.access_before (kind, table_name, name, detail)
  select 'rls', c.relname, null,
    jsonb_build_object('rls_enabled', c.relrowsecurity, 'rls_forced', c.relforcerowsecurity)
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relname = any (ig_backup_step20.target_tables());

  insert into ig_backup_step20.access_before (kind, table_name, name, detail)
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
    and c.relname = any (ig_backup_step20.target_tables());

  -- 같은 이름의 함수가 이미 있었다면 정의를 남긴다
  insert into ig_backup_step20.access_before (kind, table_name, name, detail)
  select 'function', null, 'public.is_approved_member()',
    jsonb_build_object('definition', pg_get_functiondef(to_regprocedure('public.is_approved_member()')))
  where to_regprocedure('public.is_approved_member()') is not null;
end;
$$;

-- 확인용 계정: 승인 학회원·승인 전 계정·관리자·열람자 한 명씩 (실행이 끝나기 전에 지운다)
delete from ig_backup_step20.probe_accounts;

insert into ig_backup_step20.probe_accounts (sort_order, account, user_id, note)
select 1, 'member', (
  select m.auth_user_id
  from public.members m
  where m.auth_user_id is not null
    and m.status in ('active', 'leave', 'inactive', 'alumni')
    and not exists (select 1 from public.admin_users au where au.user_id = m.auth_user_id and au.is_active)
  order by (m.status = 'active') desc, m.created_at
  limit 1
), null;

insert into ig_backup_step20.probe_accounts (sort_order, account, user_id, note)
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

insert into ig_backup_step20.probe_accounts (sort_order, account, user_id, note)
select 3, 'admin', (
  select au.user_id
  from public.admin_users au
  where au.is_active and au.role in ('super_admin', 'admin', 'operator')
  order by array_position(array['super_admin', 'admin', 'operator'], au.role)
  limit 1
), null;

insert into ig_backup_step20.probe_accounts (sort_order, account, user_id, note)
select 4, 'viewer', (
  select au.user_id
  from public.admin_users au
  where au.is_active and au.role = 'viewer'
  limit 1
), null;

-- 변경 전 읽기 확인
select ig_backup_step20.run_probe('before');

-- 2. 승인된 학회원 판별 함수
create or replace function public.is_approved_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.members m
    where m.auth_user_id = auth.uid()
      and m.status in ('active', 'leave', 'inactive', 'alumni')
  );
$$;

comment on function public.is_approved_member() is
  'STEP 20: 로그인 계정이 승인된 학회원(활동·휴회·비활동·졸업)에 연결되어 있으면 true. 승인 대기(pending)와 학회원 행이 없는 계정은 false.';

revoke all on function public.is_approved_member() from public, anon;
grant execute on function public.is_approved_member() to authenticated, service_role;

-- 3·4. 다섯 테이블에 승인 학회원·관리자 전용 제한 정책을 더한다 (기존 정책 조건식은 그대로)
do $$
declare
  target text;
  rls_on boolean;
  gate text := '(select public.is_approved_member()) or (select public.is_admin(array[''super_admin'', ''admin'', ''operator'', ''viewer'']))';
begin
  foreach target in array ig_backup_step20.target_tables() loop
    select c.relrowsecurity
    into rls_on
    from pg_class c
    where c.oid = format('public.%I', target)::regclass;

    if not rls_on then
      -- RLS가 꺼져 있던 테이블: 로그인 계정이 지금처럼 모두 읽고 쓰도록 남긴 뒤 RLS를 켠다
      execute format('drop policy if exists ig_step20_signed_in_all on public.%I', target);
      execute format('create policy ig_step20_signed_in_all on public.%I as permissive for all to authenticated using (true) with check (true)', target);
      execute format('alter table public.%I enable row level security', target);
      raise notice 'STEP 20: RLS enabled on % (signed-in access kept by ig_step20_signed_in_all)', target;
    end if;

    execute format('drop policy if exists ig_step20_approved_only on public.%I', target);
    execute format(
      'create policy ig_step20_approved_only on public.%I as restrictive for all to authenticated using (%s) with check (%s)',
      target, gate, gate);
  end loop;
end;
$$;

-- 5. 변경 후 읽기 확인. 승인 학회원·관리자·열람자 결과가 달라지면 전체를 되돌린다
select ig_backup_step20.run_probe('after');

do $$
declare
  changed text;
begin
  select string_agg(b.account || ' ' || b.table_name || ' ' || b.result || ' -> ' || a.result, ', ')
  into changed
  from ig_backup_step20.probe_log b
  join ig_backup_step20.probe_log a
    on a.probed_at = b.probed_at
   and a.account = b.account
   and a.table_name = b.table_name
   and a.phase = 'after'
  where b.phase = 'before'
    and b.account in ('member', 'admin', 'viewer')
    and b.probed_at = now()
    and a.result is distinct from b.result;

  if changed is not null then
    raise exception 'STEP 20: approved member or admin reads changed (%). Nothing was applied.', changed;
  end if;
end;
$$;

delete from ig_backup_step20.probe_accounts;

commit;

-- 확인: 테이블 5행 + accounts + other_paths (7행 모두 ok = true)
--   member      승인 학회원 계정이 읽는 행 수 (실행 전 → 후, 같아야 한다)
--   unapproved  승인 전 계정이 읽는 행 수 (실행 후 0)
--   admin       관리자 계정 (같아야 한다), viewer 열람자 계정 (같아야 한다, 없으면 skipped)
with last_run as (
  select max(probed_at) as at from ig_backup_step20.probe_log
),
probe as (
  select
    l.table_name,
    max(l.result) filter (where l.phase = 'before' and l.account = 'member') as member_before,
    max(l.result) filter (where l.phase = 'after' and l.account = 'member') as member_after,
    max(l.result) filter (where l.phase = 'before' and l.account = 'unapproved') as unapproved_before,
    max(l.result) filter (where l.phase = 'after' and l.account = 'unapproved') as unapproved_after,
    max(l.result) filter (where l.phase = 'before' and l.account = 'admin') as admin_before,
    max(l.result) filter (where l.phase = 'after' and l.account = 'admin') as admin_after,
    max(l.result) filter (where l.phase = 'before' and l.account = 'viewer') as viewer_before,
    max(l.result) filter (where l.phase = 'after' and l.account = 'viewer') as viewer_after,
    max(l.account_note) filter (where l.account = 'unapproved') as unapproved_note
  from ig_backup_step20.probe_log l
  join last_run on l.probed_at = last_run.at
  group by l.table_name
),
targets as (
  select
    c.relname::text as table_name,
    array_position(ig_backup_step20.target_tables(), c.relname::text) as sort_order,
    c.relrowsecurity as rls_enabled,
    exists (
      select 1
      from pg_policy pol
      where pol.polrelid = c.oid
        and pol.polname = 'ig_step20_approved_only'
        and not pol.polpermissive
        and pol.polcmd = '*'
    ) as gate_ready,
    exists (
      select 1 from pg_policy pol
      where pol.polrelid = c.oid and pol.polname = 'ig_step20_signed_in_all'
    ) as rls_turned_on,
    exists (
      select 1 from pg_policy pol
      where pol.polrelid = c.oid
        and (0 = any (pol.polroles) or 'anon'::regrole::oid = any (pol.polroles))
    ) or has_any_column_privilege('anon', c.oid, 'SELECT') as anon_open
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relname = any (ig_backup_step20.target_tables())
),
blocked as (
  select * from ig_backup_step20.blocked_accounts()
),
account_summary as (
  select
    (select count(*) from auth.users) as total,
    (select count(*) from auth.users u
      where exists (select 1 from public.members m where m.auth_user_id = u.id and m.status in ('active', 'leave', 'inactive', 'alumni'))) as approved,
    (select count(*) from auth.users u
      where exists (select 1 from public.admin_users au where au.user_id = u.id and au.is_active)) as admins,
    (select count(*) from blocked) as blocked,
    (select count(*) from blocked where account_type = '승인 대기') as pending,
    (select count(*) from blocked where account_type = '학회원 연결 없음') as unlinked,
    (select count(*) from blocked where own_records > 0 or roster_match) as needs_review
),
other_paths as (
  select
    (
      select string_agg(p.oid::regprocedure::text, ', ')
      from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.prosecdef
        and p.prorettype <> 'trigger'::regtype
        and has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and p.prosrc ~ '(pr_attendance|pr_fines|absence_forms|scores|file_comments)'
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
        and t.relname = any (ig_backup_step20.target_tables())
        and v.oid <> t.oid
        and coalesce(array_to_string(v.reloptions, ','), '') !~* 'security_invoker=(true|on|1)'
        and has_schema_privilege('authenticated', v.relnamespace, 'USAGE')
        and has_any_column_privilege('authenticated', v.oid, 'SELECT')
    ) as open_views
)
select item, member, unapproved, admin, viewer, ok, note
from (
  select
    t.sort_order,
    t.table_name as item,
    concat(p.member_before, ' -> ', p.member_after) as member,
    concat(p.unapproved_before, ' -> ', p.unapproved_after) as unapproved,
    concat(p.admin_before, ' -> ', p.admin_after) as admin,
    concat(p.viewer_before, ' -> ', p.viewer_after) as viewer,
    (
      t.gate_ready
      and t.rls_enabled
      and not t.anon_open
      and p.member_after is not distinct from p.member_before
      and p.admin_after is not distinct from p.admin_before
      and p.viewer_after is not distinct from p.viewer_before
      and coalesce(p.member_after, '') !~ '^(blocked|error)'
      and coalesce(p.admin_after, '') !~ '^(blocked|error)'
      and coalesce(p.unapproved_after, '') in ('0', 'blocked', 'skipped')
    ) as ok,
    concat_ws(' / ',
      case when not t.gate_ready then '제한 정책 없음' end,
      case when not t.rls_enabled then 'RLS 꺼짐' end,
      case when t.anon_open then '공개 키 접근 남음: STEP 19 다시 실행' end,
      case when t.rls_turned_on then 'RLS를 켬 (로그인 계정 전체 허용 정책 추가)' end,
      case when p.member_after = 'skipped' then '승인 학회원 계정 없음 또는 역할 전환 불가: 정책 기준으로만 확인' end,
      case when p.viewer_after = 'skipped' and p.member_after is distinct from 'skipped' then '열람자 계정 없음' end,
      p.unapproved_note
    ) as note
  from targets t
  left join probe p using (table_name)
  union all
  select
    98,
    'accounts',
    concat(s.approved, '명'),
    concat(s.blocked, '명'),
    concat(s.admins, '명'),
    null,
    s.needs_review = 0,
    concat_ws(' / ',
      format('로그인 계정 %s개: 승인 학회원 %s · 관리자 %s · 읽기 불가 %s (승인 대기 %s, 학회원 연결 없음 %s)',
        s.total, s.approved, s.admins, s.blocked, s.pending, s.unlinked),
      case when s.needs_review > 0 then
        format('그중 %s개는 기록이 있거나 같은 이름의 학회원이 있음: select * from ig_backup_step20.blocked_accounts(); 로 확인 후 실제 학회원이면 관리자 학회원 화면에서 승인', s.needs_review)
      end
    )
  from account_summary s
  union all
  select
    99,
    'other_paths',
    null,
    null,
    null,
    null,
    o.open_functions is null and o.open_views is null,
    concat_ws(' / ',
      case when o.open_functions is not null then '승인 확인 없이 로그인 계정이 호출 가능한 함수: ' || o.open_functions end,
      case when o.open_views is not null then 'RLS를 거치지 않는 뷰: ' || o.open_views end
    )
  from other_paths o
) result
order by sort_order;
