-- Sign-up no longer links a new account to an existing roster member. An admin links it.
--
-- Until now public.sync_profile_to_member() (STEP 8, trigger profiles_sync_member, security
-- definer) linked a new account at once to the roster member with the same name and generation
-- digits when exactly one such member had no login account. If that member was already approved
-- (active, leave, inactive, alumni), the new account became an approved member without any admin
-- action, so STEP 20 / STEP 21 (public.is_approved_member()) let it in. Names and generations are
-- on the public /members page and the club code is in the browser bundle, so anyone could sign up
-- as a listed member who has no account yet and read that member's records.
--
-- After this step:
--   sign-up       always creates its own pending members row (or keeps the account's own row).
--                 It never takes over another members row. A profile without a login account is
--                 refused, so the public key cannot fill the approval queue with fake rows.
--   approval      unchanged for new members: admin members screen, 가입 승인 대기, 활동으로 이동.
--   existing      the admin members screen lists each pending sign-up with its login e-mail and
--   members       the roster members of the same name that have no account
--                 (public.admin_signup_requests()). "기존 학회원과 연결" calls
--                 public.admin_link_signup_to_member(request, member) (super_admin, admin,
--                 operator): the account moves to the roster member, every row that referenced the
--                 request row moves with it, and the request row is removed, so no duplicate
--                 member is left. The roster member keeps its name, generation, status and all of
--                 its records; the account is approved at once if the member was approved.
--
-- 1. Snapshot (first run only) of the previous definitions of the three functions into
--    ig_backup_step22.access_before, so the change can be undone.
-- 2. ig_backup_step22.link_log keeps a full copy of every request row an admin merged, the roster
--    row before the link, the moved references and any removed duplicate rows.
-- 3. Probe: a made-up roster member, login account and sign-up are created inside a
--    subtransaction that is always rolled back (no rows remain). The sign-up must stay pending,
--    a non-admin must be refused, and an admin link must move the account and a record. If the
--    made-up sign-up fails or the admin link fails, the whole step is rolled back, so sign-up and
--    the way existing members get an account are never left broken.
--
-- No rows of public tables are inserted, changed or deleted by this script. Accounts that were
-- linked automatically before this step stay linked (listed for review). Safe to re-run: the first
-- snapshot is kept and the functions are recreated with the same definition.

begin;

select pg_advisory_xact_lock(hashtextextended('insightgraphy-step-22', 0));

do $$
declare
  missing text;
begin
  select string_agg(t, ', ')
  into missing
  from unnest(array['members', 'profiles', 'admin_users']) t
  where to_regclass('public.' || t) is null;

  if missing is not null then
    raise exception 'STEP 22: table(s) not found: %', missing;
  end if;

  if to_regprocedure('public.is_admin(text[])') is null then
    raise exception 'STEP 22: public.is_admin(text[]) not found. Run STEP 7 first.';
  end if;

  if to_regprocedure('public.normalize_member_name(text)') is null
     or to_regprocedure('public.sync_profile_to_member()') is null then
    raise exception 'STEP 22: sign-up trigger function not found. Run the core migration first.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'members' and column_name = 'requested_status'
  ) then
    raise exception 'STEP 22: members.requested_status not found. Run STEP 8 first.';
  end if;
end;
$$;

-- API로 노출되지 않는 별도 스키마 (anon·authenticated는 접근 권한이 없다)
create schema if not exists ig_backup_step22;
revoke all on schema ig_backup_step22 from public;

create table if not exists ig_backup_step22.access_before (
  id bigint generated always as identity primary key,
  captured_at timestamptz not null default now(),
  kind text not null,          -- function
  name text not null,
  detail jsonb not null
);

-- 관리자가 가입 신청을 기존 학회원과 연결할 때마다 한 행 (지운 신청 행 전체를 남긴다)
create table if not exists ig_backup_step22.link_log (
  id bigint generated always as identity primary key,
  linked_at timestamptz not null default now(),
  linked_by uuid,
  request_member_id uuid not null,
  target_member_id uuid not null,
  auth_user_id uuid not null,
  request_row jsonb not null,            -- 지운 가입 신청 행 (members)
  target_before jsonb not null,          -- 연결 전 기존 학회원 행
  moved jsonb not null default '{}',     -- 신청 행에서 기존 학회원으로 옮긴 참조 (테이블.열: 행 수)
  removed jsonb not null default '[]',   -- 같은 학기·세션에 둘 다 있어서 지운 신청 행 쪽 명단 행 전체
  detached jsonb not null default '[]'   -- 기존 학회원에 붙어 있던, 로그인 계정이 이미 삭제된 예전 가입 정보 (연결만 뗌)
);

create table if not exists ig_backup_step22.probe_log (
  id bigint generated always as identity primary key,
  probed_at timestamptz not null default now(),
  check_name text not null,
  result text not null,
  note text
);

-- members.id를 가리키는 모든 외래 키 열 (가입 정보 profiles 포함)
create or replace function ig_backup_step22.member_reference_columns()
returns table (table_ref regclass, column_name text)
language sql
stable
as $$
  select con.conrelid::regclass, att.attname::text
  from pg_constraint con
  join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
  join pg_attribute target on target.attrelid = con.confrelid and target.attnum = con.confkey[1]
  where con.contype = 'f'
    and con.confrelid = 'public.members'::regclass
    and cardinality(con.conkey) = 1
    and target.attname = 'id'
    and con.conrelid <> 'public.members'::regclass
  order by 1, 2
$$;

-- 한 학회원 행을 가리키는 기록 수 (가입 정보 profiles 제외). {"public.pr_attendance.member_id": 3, ...}
create or replace function ig_backup_step22.member_references(p_member_id uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  ref record;
  counted bigint;
  result jsonb := '{}'::jsonb;
begin
  for ref in select * from ig_backup_step22.member_reference_columns() loop
    if ref.table_ref = 'public.profiles'::regclass then
      continue;
    end if;
    execute format('select count(*) from %s where %I = $1', ref.table_ref, ref.column_name)
      into counted
      using p_member_id;
    if counted > 0 then
      result := result || jsonb_build_object(ref.table_ref::text || '.' || ref.column_name, counted);
    end if;
  end loop;
  return result;
end;
$$;

-- STEP 22 전에 가입 즉시 기존 명단 행에 자동 연결된 계정 (관리자 승인을 거치지 않음).
-- 명단 행이 계정보다 먼저 있었던 승인 학회원 = 예전 트리거가 연결한 계정 (STEP 21과 같은 기준,
-- STEP 22 이후 관리자가 연결한 계정은 뺀다). 2026-08 이관 때 연결된 예전 계정도 섞여 나올 수 있다.
create or replace function ig_backup_step22.auto_linked_accounts()
returns table (
  member_id uuid,
  name text,
  generation text,
  status text,
  email text,
  roster_since date,
  signed_up date,
  last_sign_in date,
  is_admin boolean
)
language sql
stable
as $$
  select
    m.id,
    m.name,
    m.generation,
    m.status,
    u.email::text,
    m.created_at::date,
    u.created_at::date,
    u.last_sign_in_at::date,
    exists (select 1 from public.admin_users au where au.user_id = u.id and au.is_active)
  from public.members m
  join auth.users u on u.id = m.auth_user_id
  where m.status in ('active', 'leave', 'inactive', 'alumni')
    and m.created_at < u.created_at - interval '1 minute'
    and not exists (
      select 1 from ig_backup_step22.link_log l
      where l.target_member_id = m.id and l.auth_user_id = u.id
    )
  order by u.created_at desc
$$;

revoke all on all functions in schema ig_backup_step22 from public;
revoke all on all tables in schema ig_backup_step22 from public;

-- 1. 변경 전 함수 정의 스냅샷 (처음 실행할 때만)
do $$
begin
  if exists (select 1 from ig_backup_step22.access_before) then
    raise notice 'STEP 22: keeping the snapshot from the first run';
    return;
  end if;

  insert into ig_backup_step22.access_before (kind, name, detail)
  select 'function', f.name, jsonb_build_object('definition', pg_get_functiondef(to_regprocedure(f.name)))
  from unnest(array[
    'public.sync_profile_to_member()',
    'public.admin_signup_requests()',
    'public.admin_link_signup_to_member(uuid,uuid)'
  ]) as f(name)
  where to_regprocedure(f.name) is not null;
end;
$$;

-- 2. 가입 트리거: 자기 행만 찾고, 이름·기수가 같은 기존 학회원 행에는 연결하지 않는다
create or replace function public.sync_profile_to_member()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_member_id uuid;
  target_status text;
  auth_id uuid;
  signup_requested_status text := 'active';
begin
  select
    u.id,
    case
      when lower(coalesce(u.raw_user_meta_data ->> 'requested_member_status', '')) = 'alumni'
        then 'alumni'
      else 'active'
    end
  into auth_id, signup_requested_status
  from auth.users u
  where u.id = new.id;

  -- 이 가입 정보나 같은 로그인 계정에 이미 연결된 학회원 행
  select m.id, m.status
  into target_member_id, target_status
  from public.members m
  where m.legacy_profile_id = new.id or m.auth_user_id = new.id
  order by (m.legacy_profile_id = new.id) desc
  limit 1;

  if target_member_id is null then
    -- 로그인 계정 없는 가입 정보로 승인 대기 행을 만들지 않는다 (공개 키로 대기열 채우기 방지)
    if auth_id is null then
      if tg_op = 'INSERT' then
        raise exception 'STEP 22: profile % has no login account', new.id;
      end if;
      return new;
    end if;

    -- 이름·기수가 같은 기존 학회원이 있어도 연결하지 않는다.
    -- 관리자가 학회원 화면 가입 승인 대기에서 기존 학회원과 연결하거나 새 학회원으로 승인한다.
    insert into public.members (
      auth_user_id,
      legacy_profile_id,
      name,
      generation,
      role,
      status,
      requested_status,
      is_public
    ) values (
      auth_id,
      new.id,
      trim(new.name),
      nullif(trim(new.student_id), ''),
      '일반',
      'pending',
      signup_requested_status,
      false
    )
    returning id into target_member_id;
  elsif target_status = 'pending' then
    update public.members
    set
      auth_user_id = coalesce(auth_user_id, auth_id),
      legacy_profile_id = new.id,
      name = trim(new.name),
      generation = nullif(trim(new.student_id), ''),
      requested_status = coalesce(signup_requested_status, requested_status)
    where id = target_member_id;
  else
    -- 승인된 학회원의 이름·기수는 관리자 명단 기준이다. 가입 정보 수정으로 바꾸지 않고,
    -- 이 행에 연결된 계정·가입 정보를 다른 것으로 바꾸지 않는다 (비어 있을 때만 채움).
    update public.members
    set
      auth_user_id = coalesce(auth_user_id, auth_id),
      legacy_profile_id = coalesce(legacy_profile_id, new.id)
    where id = target_member_id
      and (auth_user_id is null or legacy_profile_id is null);
  end if;

  update public.profiles
  set member_id = target_member_id
  where id = new.id and member_id is distinct from target_member_id;

  return new;
end;
$$;

-- 3. 관리자 학회원 화면: 가입 승인 대기 목록 (로그인 이메일, 같은 이름의 계정 없는 학회원 후보)
create or replace function public.admin_signup_requests()
returns table (
  request_member_id uuid,
  name text,
  generation text,
  requested_status text,
  email text,
  email_confirmed boolean,
  signed_up_at timestamptz,
  last_sign_in_at timestamptz,
  records jsonb,
  candidates jsonb
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin(array['super_admin', 'admin', 'operator', 'viewer']) then
    raise exception 'Administrator access is required';
  end if;

  return query
  select
    p.id,
    p.name,
    p.generation,
    p.requested_status,
    u.email::text,
    u.email_confirmed_at is not null,
    u.created_at,
    u.last_sign_in_at,
    ig_backup_step22.member_references(p.id),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'member_id', c.id,
          'name', c.name,
          'generation', c.generation,
          'status', c.status,
          'match', case when cm.same_generation then 'name_generation' else 'name' end,
          'linkable', cm.blocker is null,
          'reason', cm.blocker
        )
        order by cm.same_generation desc, c.status = 'pending', c.created_at
      )
      from public.members c
      cross join lateral (
        select
          regexp_replace(coalesce(c.generation, ''), '[^0-9]', '', 'g') <> ''
            and regexp_replace(coalesce(c.generation, ''), '[^0-9]', '', 'g')
              = regexp_replace(coalesce(p.generation, ''), '[^0-9]', '', 'g') as same_generation,
          -- 로그인 계정이 살아 있는 다른 가입 정보가 붙어 있으면 막는다 (계정이 삭제된 예전 가입 정보는 연결 때 뗀다)
          case
            when exists (
              select 1
              from public.profiles op
              join auth.users ou on ou.id = op.id
              where (op.member_id = c.id or op.id = c.legacy_profile_id)
                and op.id is distinct from p.auth_user_id
            ) then '다른 로그인 계정의 가입 정보가 연결된 학회원'
          end as blocker
      ) cm
      where c.id <> p.id
        and c.auth_user_id is null
        and public.normalize_member_name(c.name) = public.normalize_member_name(p.name)
    ), '[]'::jsonb)
  from public.members p
  join auth.users u on u.id = p.auth_user_id
  where p.status = 'pending'
  order by u.created_at desc;
end;
$$;

-- 4. 관리자 학회원 화면: 가입 신청(승인 대기 행)의 로그인 계정을 기존 학회원 행으로 옮긴다
create or replace function public.admin_link_signup_to_member(
  p_request_member_id uuid,
  p_target_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  request_row public.members%rowtype;
  target_row public.members%rowtype;
  request_profile_id uuid;
  ref record;
  moved jsonb := '{}'::jsonb;
  removed jsonb := '[]'::jsonb;
  removed_part jsonb;
  detached_rows jsonb := '[]'::jsonb;
  changed integer;
begin
  if not public.is_admin(array['super_admin', 'admin', 'operator']) then
    raise exception 'Administrator access is required';
  end if;

  if p_request_member_id is null or p_target_member_id is null
     or p_request_member_id = p_target_member_id then
    raise exception '가입 신청과 연결할 기존 학회원을 각각 선택하세요';
  end if;

  -- 두 관리자가 동시에 누르는 경우를 막는다
  perform 1
  from public.members m
  where m.id in (p_request_member_id, p_target_member_id)
  order by m.id
  for update;

  select * into request_row from public.members where id = p_request_member_id;
  select * into target_row from public.members where id = p_target_member_id;

  if request_row.id is null then
    raise exception '가입 신청을 찾을 수 없습니다. 이미 처리됐는지 새로고침해 확인하세요';
  end if;
  if request_row.status <> 'pending' or request_row.auth_user_id is null then
    raise exception '로그인 계정이 있는 승인 대기 신청만 연결할 수 있습니다';
  end if;
  if target_row.id is null then
    raise exception '연결할 학회원을 찾을 수 없습니다';
  end if;
  if target_row.auth_user_id is not null then
    raise exception '%(%) 학회원에는 이미 다른 로그인 계정이 연결되어 있습니다',
      target_row.name, coalesce(target_row.generation, '기수 없음');
  end if;
  if exists (
    select 1
    from public.profiles op
    join auth.users ou on ou.id = op.id
    where (op.member_id = target_row.id or op.id = target_row.legacy_profile_id)
      and op.id is distinct from request_row.auth_user_id
  ) then
    raise exception '%(%) 학회원에는 다른 로그인 계정의 가입 정보가 연결되어 있습니다',
      target_row.name, coalesce(target_row.generation, '기수 없음');
  end if;

  select coalesce(request_row.legacy_profile_id, (
    select p.id from public.profiles p where p.id = request_row.auth_user_id
  ))
  into request_profile_id;

  -- 로그인 계정이 이미 삭제된 예전 가입 정보가 기존 학회원을 가리키면 연결만 뗀다 (행은 남기고 기록)
  with old_profile as (
    update public.profiles op
    set member_id = null
    where op.member_id = p_target_member_id
      and op.id is distinct from request_row.auth_user_id
      and not exists (select 1 from auth.users ou where ou.id = op.id)
    returning to_jsonb(op) as row_data
  )
  select coalesce(jsonb_agg(row_data), '[]'::jsonb)
  into detached_rows
  from old_profile;

  -- 같은 학기 명단·세션 참여에 두 행이 모두 있으면 기존 학회원 쪽을 남기고 신청 행 쪽은 기록 후 지운다
  with dup as (
    delete from public.semester_memberships sm
    where sm.member_id = p_request_member_id
      and exists (
        select 1 from public.semester_memberships keep
        where keep.member_id = p_target_member_id and keep.semester_id = sm.semester_id
      )
    returning to_jsonb(sm) as row_data
  )
  select coalesce(jsonb_agg(jsonb_build_object('table', 'public.semester_memberships', 'row', row_data)), '[]'::jsonb)
  into removed_part
  from dup;
  removed := removed || removed_part;

  with dup as (
    delete from public.session_participants sp
    where sp.member_id = p_request_member_id
      and exists (
        select 1 from public.session_participants keep
        where keep.member_id = p_target_member_id and keep.session_id = sp.session_id
      )
    returning to_jsonb(sp) as row_data
  )
  select coalesce(jsonb_agg(jsonb_build_object('table', 'public.session_participants', 'row', row_data)), '[]'::jsonb)
  into removed_part
  from dup;
  removed := removed || removed_part;

  -- 신청 행을 가리키던 모든 참조(가입 정보·출결·사유서·제출물·명단 등)를 기존 학회원으로 옮긴다
  begin
    for ref in select * from ig_backup_step22.member_reference_columns() loop
      execute format('update %s set %I = $1 where %I = $2', ref.table_ref, ref.column_name, ref.column_name)
        using p_target_member_id, p_request_member_id;
      get diagnostics changed = row_count;
      if changed > 0 then
        moved := moved || jsonb_build_object(ref.table_ref::text || '.' || ref.column_name, changed);
      end if;
    end loop;
  exception when unique_violation then
    raise exception '두 학회원 행이 같은 항목을 함께 가지고 있어 합칠 수 없습니다 (%)', sqlerrm;
  end;

  -- 중복 신청 행을 지우고 (전체 내용은 link_log에 남긴다) 계정을 기존 학회원 행에 연결한다
  delete from public.members where id = p_request_member_id;

  update public.members
  set
    auth_user_id = request_row.auth_user_id,
    legacy_profile_id = coalesce(request_profile_id, legacy_profile_id)
  where id = p_target_member_id;

  update public.profiles
  set member_id = p_target_member_id
  where id = request_row.auth_user_id
    and member_id is distinct from p_target_member_id;

  insert into ig_backup_step22.link_log (
    linked_by,
    request_member_id,
    target_member_id,
    auth_user_id,
    request_row,
    target_before,
    moved,
    removed,
    detached
  ) values (
    auth.uid(),
    p_request_member_id,
    p_target_member_id,
    request_row.auth_user_id,
    to_jsonb(request_row),
    to_jsonb(target_row),
    moved,
    removed,
    detached_rows
  );

  return jsonb_build_object(
    'member_id', target_row.id,
    'name', target_row.name,
    'generation', target_row.generation,
    'status', target_row.status,
    'removed_request_id', p_request_member_id,
    'moved', moved,
    'removed_duplicates', jsonb_array_length(removed),
    'detached_old_profiles', jsonb_array_length(detached_rows)
  );
end;
$$;

revoke all on function public.admin_signup_requests() from public, anon, authenticated;
revoke all on function public.admin_link_signup_to_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_signup_requests() to authenticated;
grant execute on function public.admin_link_signup_to_member(uuid, uuid) to authenticated;

comment on function public.admin_link_signup_to_member(uuid, uuid) is
  'STEP 22: 가입 신청(승인 대기 행)의 로그인 계정을 계정 없는 기존 학회원 행으로 옮기고 신청 행을 정리한다. 기록은 기존 학회원 행에 그대로 남는다. 최고관리자·관리자·운영진만.';

-- 5. 확인: 가상 학회원·계정·가입을 하위 트랜잭션 안에서 만들고 항상 되돌린다 (남는 행 없음)
do $$
declare
  probe_user uuid := gen_random_uuid();
  probe_name text := 'IG STEP22 확인용 ' || substr(md5(random()::text), 1, 8);
  probe_roster uuid;
  probe_request uuid;
  probe_status text;
  probe_admin uuid;
  roster_account uuid;
  record_ok boolean := false;
  record_count bigint;
  approved boolean;
  link_result jsonb;
  stage text := 'roster';
  failed_stage text;
  failure text;
  r_no_auto_link text := 'skipped';
  r_refused text := 'skipped';
  r_listed text := 'skipped';
  r_linked text := 'skipped';
  r_approved text := 'skipped';
  old_claims text := current_setting('request.jwt.claims', true);
  old_sub text := current_setting('request.jwt.claim.sub', true);
  old_role text := current_setting('request.jwt.claim.role', true);
begin
  select au.user_id
  into probe_admin
  from public.admin_users au
  where au.is_active and au.role in ('super_admin', 'admin', 'operator')
  order by array_position(array['super_admin', 'admin', 'operator'], au.role)
  limit 1;

  begin
    -- 계정 없는 기존 학회원 (승인 상태)과 그 학회원의 기록 1건
    insert into public.members (name, generation, role, status, requested_status, is_public)
    values (probe_name, '999기', '일반', 'active', 'active', false)
    returning id into probe_roster;

    begin
      insert into public.pr_attendance (user_name, week, status, session_type, member_id)
      values (probe_name, 1, '출석완료', 'regular', probe_roster);
      record_ok := true;
    exception when others then
      record_ok := false;
    end;

    -- 가입 화면과 같은 순서: 로그인 계정 → 가입 정보 (이름·기수가 위 학회원과 같다)
    stage := 'account';
    insert into auth.users (
      id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data,
      invited_at, created_at, updated_at
    ) values (
      probe_user,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'ig-step22-probe-' || probe_user || '@example.invalid',
      jsonb_build_object('name', probe_name, 'student_id', '999', 'requested_member_status', 'active'),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      now(), now(), now()
    );

    stage := 'signup';
    insert into public.profiles (id, name, student_id) values (probe_user, probe_name, '999');

    stage := 'no_auto_link';
    select m.id, m.status into probe_request, probe_status
    from public.members m
    where m.auth_user_id = probe_user;
    select m.auth_user_id into roster_account from public.members m where m.id = probe_roster;

    r_no_auto_link := case
      when probe_request is not null and probe_request <> probe_roster
        and probe_status = 'pending' and roster_account is null then 'ok'
      when probe_request = probe_roster then 'linked automatically'
      else format('unexpected (request %s, status %s)', probe_request, probe_status)
    end;

    -- 가입 신청 쪽에도 기록 1건 (연결 후 기존 학회원으로 옮겨져야 한다)
    if record_ok and probe_request is not null then
      begin
        insert into public.pr_attendance (user_name, week, status, session_type, member_id)
        values (probe_name, 2, '출석완료', 'regular', probe_request);
      exception when others then
        record_ok := false;
      end;
    end if;

    -- 관리자가 아닌 계정(가입한 본인)은 연결할 수 없어야 한다
    stage := 'refused';
    perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', probe_user)::text, true);
    perform set_config('request.jwt.claim.sub', probe_user::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    begin
      perform public.admin_link_signup_to_member(probe_request, probe_roster);
      r_refused := 'not refused';
    exception when others then
      r_refused := case when sqlerrm like '%Administrator access is required%' then 'ok' else 'error ' || sqlstate || ' ' || sqlerrm end;
    end;

    if probe_admin is not null and r_no_auto_link = 'ok' then
      perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', probe_admin)::text, true);
      perform set_config('request.jwt.claim.sub', probe_admin::text, true);

      stage := 'listed';
      r_listed := case when exists (
        select 1
        from public.admin_signup_requests() r
        where r.request_member_id = probe_request
          and r.email like 'ig-step22-probe-%'
          and r.candidates @> jsonb_build_array(jsonb_build_object(
            'member_id', probe_roster, 'match', 'name_generation', 'linkable', true))
      ) then 'ok' else 'not listed with the roster candidate' end;

      stage := 'linked';
      link_result := public.admin_link_signup_to_member(probe_request, probe_roster);
      select count(*) into record_count from public.pr_attendance where member_id = probe_roster;

      r_linked := case
        when (select auth_user_id from public.members where id = probe_roster) is distinct from probe_user
          then 'account not on the roster member'
        when exists (select 1 from public.members where id = probe_request)
          then 'request row left'
        when (select member_id from public.profiles where id = probe_user) is distinct from probe_roster
          then 'profile not moved'
        when (select status from public.members where id = probe_roster) <> 'active'
          then 'roster status changed'
        when record_ok and record_count <> 2
          then format('records %s (expected 2)', record_count)
        when record_ok then 'ok (기록 2건 모두 기존 학회원 행)'
        else 'ok (기록 이동은 확인 못 함)'
      end;

      stage := 'approved';
      if to_regprocedure('public.is_approved_member()') is not null then
        perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', probe_user)::text, true);
        perform set_config('request.jwt.claim.sub', probe_user::text, true);
        execute 'select public.is_approved_member()' into approved;
        r_approved := case when approved then 'ok' else 'not approved after link' end;
      end if;
    end if;

    raise exception 'ig_step22_probe_rollback';
  exception when others then
    if sqlerrm <> 'ig_step22_probe_rollback' then
      failed_stage := stage;
      failure := sqlstate || ' ' || sqlerrm;
    end if;
  end;

  perform set_config('request.jwt.claims', coalesce(old_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(old_sub, ''), true);
  perform set_config('request.jwt.claim.role', coalesce(old_role, ''), true);

  -- 가상 가입이 실패하면 실제 가입 화면도 실패할 수 있다. 관리자 연결이 실패하면 기존 학회원이 계정을 얻지 못한다.
  if failed_stage in ('signup', 'no_auto_link', 'listed', 'linked', 'approved') then
    raise exception 'STEP 22: probe failed at % (%). Nothing was applied.', failed_stage, failure;
  end if;
  if r_no_auto_link not in ('ok', 'skipped') or r_refused not in ('ok', 'skipped')
     or r_listed not in ('ok', 'skipped') or r_linked not like 'ok%' and r_linked <> 'skipped'
     or r_approved not in ('ok', 'skipped') then
    raise exception 'STEP 22: probe result unexpected (no_auto_link %, refused %, listed %, linked %, approved %). Nothing was applied.',
      r_no_auto_link, r_refused, r_listed, r_linked, r_approved;
  end if;

  insert into ig_backup_step22.probe_log (check_name, result, note) values
    ('signup_no_auto_link', r_no_auto_link,
      case when failed_stage is not null then format('가상 가입을 만들지 못함 (%s 단계: %s)', failed_stage, failure) end),
    ('non_admin_refused', r_refused, null),
    ('admin_request_list', r_listed, case when probe_admin is null then '최고관리자·관리자·운영진 계정 없음' end),
    ('admin_link', r_linked, case when probe_admin is null then '최고관리자·관리자·운영진 계정 없음' end),
    ('approved_after_link', r_approved,
      case when to_regprocedure('public.is_approved_member()') is null then 'STEP 20 미실행 (is_approved_member 없음)' end);
end;
$$;

commit;

-- 확인: 9행. ok가 false인 행이 없어야 한다 (ok가 비어 있는 행은 정보)
with last_probe as (
  select l.*
  from ig_backup_step22.probe_log l
  where l.probed_at = (select max(probed_at) from ig_backup_step22.probe_log)
),
definition as (
  select pg_get_functiondef('public.sync_profile_to_member()'::regprocedure) as body
),
requests as (
  select
    p.id,
    exists (
      select 1 from public.members c
      where c.id <> p.id and c.auth_user_id is null
        and public.normalize_member_name(c.name) = public.normalize_member_name(p.name)
        and regexp_replace(coalesce(c.generation, ''), '[^0-9]', '', 'g') <> ''
        and regexp_replace(coalesce(c.generation, ''), '[^0-9]', '', 'g')
          = regexp_replace(coalesce(p.generation, ''), '[^0-9]', '', 'g')
    ) as strong,
    exists (
      select 1 from public.members c
      where c.id <> p.id and c.auth_user_id is null
        and public.normalize_member_name(c.name) = public.normalize_member_name(p.name)
    ) as by_name
  from public.members p
  where p.status = 'pending' and p.auth_user_id is not null
),
roster as (
  select
    count(*) as claimable,
    count(*) filter (where m.is_public) as claimable_public
  from public.members m
  where m.status in ('active', 'leave', 'inactive', 'alumni') and m.auth_user_id is null
),
other_paths as (
  select
    (
      select string_agg(p.oid::regprocedure::text, ', ' order by p.proname)
      from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and p.prosecdef
        and p.proname not in ('sync_profile_to_member', 'admin_link_signup_to_member')
        and p.prosrc ~* 'update\s+(public\.)?members\M[^;]*?\mset\M((?!\mwhere\M)[^;])*\mauth_user_id\s*='
    ) as account_writers,
    to_regclass('public.pr_members') is not null as has_pr_members,
    exists (
      select 1 from pg_policy pol
      where pol.polrelid = to_regclass('public.pr_members') and pol.polname like 'ig_step21_%'
    ) as pr_members_guarded
)
select item, result, ok, note
from (
  select
    1 as sort_order,
    'signup_no_auto_link' as item,
    l.result,
    (l.result = 'ok' or (l.result = 'skipped' and d.body !~ 'normalize_member_name')) as ok,
    concat_ws(' / ',
      '가입하면 항상 본인 승인 대기 행이 생기고, 이름·기수가 같은 기존 학회원 행에는 연결되지 않는다',
      case when l.result = 'skipped' then '가상 가입으로는 확인하지 못해 함수 정의로만 확인함' end,
      l.note) as note
  from last_probe l cross join definition d
  where l.check_name = 'signup_no_auto_link'
  union all
  select 2, l.check_name, l.result, l.result in ('ok', 'skipped'),
    concat_ws(' / ', '관리자가 아닌 계정(가입한 본인 포함)은 연결 함수를 쓸 수 없다', l.note)
  from last_probe l where l.check_name = 'non_admin_refused'
  union all
  select 3, l.check_name, l.result, l.result in ('ok', 'skipped'),
    concat_ws(' / ', '가입 승인 대기 목록에 로그인 이메일과 같은 이름·기수의 기존 학회원 후보가 나온다', l.note)
  from last_probe l where l.check_name = 'admin_request_list'
  union all
  select 4, l.check_name, l.result, l.result like 'ok%' or l.result = 'skipped',
    concat_ws(' / ', '연결하면 계정이 기존 학회원 행으로 옮겨지고 신청 행은 남지 않는다. 기존 학회원의 이름·기수·상태·기록은 그대로', l.note)
  from last_probe l where l.check_name = 'admin_link'
  union all
  select 5, l.check_name, l.result, l.result in ('ok', 'skipped'),
    concat_ws(' / ', '연결 직후 STEP 20·21 기준 승인 학회원이 된다 (SQL 재실행 필요 없음)', l.note)
  from last_probe l where l.check_name = 'approved_after_link'
  union all
  select 6, 'pending_requests',
    format('%s건', (select count(*) from requests)),
    null,
    format('지금 가입 승인 대기 계정 %s개 중 이름·기수가 같은 계정 없는 학회원이 있는 신청 %s개, 이름만 같은 신청 %s개. 관리자 학회원 화면 → 가입 승인 대기에서 이메일로 본인인지 확인한 뒤 연결하거나 새 학회원으로 승인한다',
      (select count(*) from requests),
      (select count(*) from requests where strong),
      (select count(*) from requests where by_name and not strong))
  union all
  select 7, 'roster_without_account',
    format('%s명', r.claimable),
    null,
    format('로그인 계정이 없는 승인 학회원 %s명 (그중 공개 명단 %s명). 이전에는 이름·기수만 맞으면 가입 즉시 이 행을 차지할 수 있었다. 이제 이 학회원들은 가입 후 관리자 연결로 계정을 얻는다', r.claimable, r.claimable_public)
  from roster r
  union all
  select 8, 'already_auto_linked',
    format('%s개', (select count(*) from ig_backup_step22.auto_linked_accounts())),
    null,
    case when (select count(*) from ig_backup_step22.auto_linked_accounts()) > 0 then
      'STEP 22 전에 가입 즉시 기존 학회원 행에 연결된 계정. 이 단계는 풀지 않는다. select * from ig_backup_step22.auto_linked_accounts(); 로 이메일을 보고 본인인지 확인한다'
    else '자동 연결된 계정 없음' end
  union all
  select 9, 'other_paths',
    null,
    o.account_writers is null and (not o.has_pr_members or o.pr_members_guarded),
    concat_ws(' / ',
      case when o.account_writers is not null then '학회원 행의 로그인 계정을 바꾸는 다른 보안 정의 함수: ' || o.account_writers || ' (이름을 알려 주면 판단)' end,
      case when o.has_pr_members and not o.pr_members_guarded then 'STEP 21 미실행: 로그인 계정이 pr_members에 쓰면 같은 이름·기수 학회원 행이 활동으로 바뀐다 (STEP 21 실행 필요)' end)
  from other_paths o
) result
order by sort_order;
