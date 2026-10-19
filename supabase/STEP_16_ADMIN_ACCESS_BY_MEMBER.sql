-- Grant admin access by picking a member instead of typing an email.
--
-- 1. admin_access_candidates(query): super_admin searches members by name, generation
--    or university. Each row says whether the member has a working login account
--    (members.auth_user_id that exists in auth.users) and its current admin role.
-- 2. admin_grant_access_member(member_id, role): grants a role to the member's own
--    login account. A member without a linked login account is rejected; no account is
--    created or linked by name. An account that is already registered is rejected so
--    its role is changed only from its own row (admin_set_access keeps the
--    self-demotion and last-super-admin checks).
-- 3. admin_list_access(): the admin list with the linked member (name, generation,
--    university, status) so same-name members are told apart by member_id.
-- Every grant is written to admin_access_audit with the member_id.
--
-- Existing admin_users rows, roles and the email-based admin_grant_access are kept.

begin;

select pg_advisory_xact_lock(hashtextextended('insightgraphy-step-16', 0));

do $$
begin
  if to_regprocedure('public.admin_set_access(uuid,text,boolean)') is null then
    raise exception 'Run STEP_7_ADMIN_ACCESS_MANAGEMENT.sql first';
  end if;
end;
$$;

create or replace function public.admin_access_candidates(p_query text default null)
returns table (
  member_id uuid,
  name text,
  generation text,
  university text,
  department text,
  member_status text,
  has_login boolean,
  login_email text,
  admin_role text,
  admin_active boolean
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  needle text := nullif(trim(coalesce(p_query, '')), '');
begin
  if not public.is_admin(array['super_admin']) then
    raise exception 'Super administrator access is required';
  end if;

  return query
  select
    m.id,
    m.name,
    m.generation,
    m.university,
    m.department,
    m.status,
    u.id is not null,
    u.email::text,
    au.role,
    au.is_active
  from public.members m
  left join auth.users u on u.id = m.auth_user_id
  left join public.admin_users au on au.user_id = u.id
  where needle is null
     or m.name ilike '%' || needle || '%'
     or coalesce(m.generation, '') ilike '%' || needle || '%'
     or coalesce(m.university, '') ilike '%' || needle || '%'
  order by
    case m.status when 'active' then 1 when 'leave' then 2 when 'pending' then 3 else 4 end,
    m.name,
    m.generation
  limit 50;
end;
$$;

create or replace function public.admin_list_access()
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
  member_status text
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
    m.status
  from public.admin_users au
  join auth.users u on u.id = au.user_id
  left join public.members m on m.auth_user_id = au.user_id
  order by
    case au.role when 'super_admin' then 1 when 'admin' then 2 when 'operator' then 3 else 4 end,
    coalesce(m.name, u.email::text);
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

  if p_role not in ('super_admin', 'admin', 'operator', 'viewer') then
    raise exception 'Invalid administrator role';
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

  insert into public.admin_users (user_id, role, is_active)
  values (target_member.auth_user_id, p_role, true)
  returning * into saved_record;

  insert into public.admin_access_audit (
    actor_user_id,
    target_user_id,
    action,
    previous_values,
    new_values
  ) values (
    auth.uid(),
    target_member.auth_user_id,
    'grant',
    null,
    to_jsonb(saved_record) || jsonb_build_object('member_id', target_member.id, 'member_name', target_member.name)
  );

  return saved_record;
end;
$$;

revoke all on function public.admin_access_candidates(text) from public;
revoke all on function public.admin_list_access() from public;
revoke all on function public.admin_grant_access_member(uuid, text) from public;
grant execute on function public.admin_access_candidates(text) to authenticated;
grant execute on function public.admin_list_access() to authenticated;
grant execute on function public.admin_grant_access_member(uuid, text) to authenticated;

commit;

-- 확인 1: 관리자 계정과 연결된 학회원 (member_name이 비어 있으면 학회원 명단과 연결되지 않은 계정)
select
  au.role,
  au.is_active,
  m.id as member_id,
  m.name as member_name,
  m.generation,
  u.email
from public.admin_users au
join auth.users u on u.id = au.user_id
left join public.members m on m.auth_user_id = au.user_id
order by au.role, m.name;

-- 확인 2: 함수 준비 상태 (모두 true)
select
  to_regprocedure('public.admin_access_candidates(text)') is not null as candidates_ready,
  to_regprocedure('public.admin_list_access()') is not null as list_ready,
  to_regprocedure('public.admin_grant_access_member(uuid,text)') is not null as grant_member_ready,
  (select count(*) from public.admin_users where role = 'super_admin' and is_active) >= 1 as active_super_admin_ready;
