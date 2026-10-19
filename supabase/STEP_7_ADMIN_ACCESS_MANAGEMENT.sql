-- Safe additive admin access management.
-- No member, semester, file, attendance, score, or archive rows are changed.

begin;

-- A viewer can enter the admin shell but cannot pass write policies that call
-- is_admin() without an explicit role list.
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
        (required_roles is null and au.role in ('super_admin', 'admin', 'operator'))
        or
        (required_roles is not null and au.role = any(required_roles))
      )
  );
$$;

revoke all on function public.is_admin(text[]) from public;
grant execute on function public.is_admin(text[]) to anon, authenticated;

create table if not exists public.admin_access_audit (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null,
  target_user_id uuid not null,
  action text not null check (action in ('grant', 'update')),
  previous_values jsonb,
  new_values jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists admin_access_audit_created_idx
  on public.admin_access_audit (created_at desc);
create index if not exists admin_access_audit_target_idx
  on public.admin_access_audit (target_user_id, created_at desc);

alter table public.admin_access_audit enable row level security;

drop policy if exists admin_access_audit_super_read
on public.admin_access_audit;

create policy admin_access_audit_super_read
on public.admin_access_audit
for select
to authenticated
using (public.is_admin(array['super_admin']));

grant select on public.admin_access_audit to authenticated;

-- Direct client writes bypass the safety checks below, so all mutations must
-- go through the security-definer functions.
drop policy if exists admin_users_admin_write on public.admin_users;
revoke insert, update, delete on public.admin_users from authenticated;

create or replace function public.admin_list_users()
returns table (
  user_id uuid,
  email text,
  display_name text,
  role text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
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
      nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
      nullif(trim(p.name), ''),
      split_part(u.email::text, '@', 1)
    ) as display_name,
    au.role,
    au.is_active,
    au.created_at,
    au.updated_at
  from public.admin_users au
  join auth.users u on u.id = au.user_id
  left join public.profiles p on p.id = au.user_id
  order by
    case au.role
      when 'super_admin' then 1
      when 'admin' then 2
      when 'operator' then 3
      else 4
    end,
    lower(u.email::text);
end;
$$;

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
  active_super_count integer;
begin
  if not public.is_admin(array['super_admin']) then
    raise exception 'Super administrator access is required';
  end if;

  if p_role not in ('super_admin', 'admin', 'operator', 'viewer') then
    raise exception 'Invalid administrator role';
  end if;

  select u.id
  into target_user_id
  from auth.users u
  where lower(u.email::text) = lower(trim(p_email))
  limit 1;

  if target_user_id is null then
    raise exception 'No Supabase Auth user found for this email';
  end if;

  select *
  into previous_record
  from public.admin_users au
  where au.user_id = target_user_id;

  if target_user_id = auth.uid()
     and previous_record.user_id is not null
     and previous_record.role = 'super_admin'
     and p_role <> 'super_admin' then
    raise exception 'You cannot demote your own super administrator account';
  end if;

  if previous_record.user_id is not null
     and previous_record.role = 'super_admin'
     and previous_record.is_active
     and p_role <> 'super_admin' then
    select count(*)
    into active_super_count
    from public.admin_users au
    where au.role = 'super_admin'
      and au.is_active;

    if active_super_count <= 1 then
      raise exception 'At least one active super administrator is required';
    end if;
  end if;

  insert into public.admin_users (user_id, role, is_active)
  values (target_user_id, p_role, true)
  on conflict (user_id) do update set
    role = excluded.role,
    is_active = true
  returning * into saved_record;

  insert into public.admin_access_audit (
    actor_user_id,
    target_user_id,
    action,
    previous_values,
    new_values
  ) values (
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
  active_super_count integer;
begin
  if not public.is_admin(array['super_admin']) then
    raise exception 'Super administrator access is required';
  end if;

  if p_role not in ('super_admin', 'admin', 'operator', 'viewer') then
    raise exception 'Invalid administrator role';
  end if;

  select *
  into previous_record
  from public.admin_users au
  where au.user_id = p_user_id
  for update;

  if previous_record.user_id is null then
    raise exception 'Administrator account not found';
  end if;

  if p_user_id = auth.uid()
     and (p_role <> 'super_admin' or not p_is_active) then
    raise exception 'You cannot demote or deactivate your own super administrator account';
  end if;

  if previous_record.role = 'super_admin'
     and previous_record.is_active
     and (p_role <> 'super_admin' or not p_is_active) then
    select count(*)
    into active_super_count
    from public.admin_users au
    where au.role = 'super_admin'
      and au.is_active;

    if active_super_count <= 1 then
      raise exception 'At least one active super administrator is required';
    end if;
  end if;

  update public.admin_users
  set
    role = p_role,
    is_active = p_is_active
  where user_id = p_user_id
  returning * into saved_record;

  insert into public.admin_access_audit (
    actor_user_id,
    target_user_id,
    action,
    previous_values,
    new_values
  ) values (
    auth.uid(),
    p_user_id,
    'update',
    to_jsonb(previous_record),
    to_jsonb(saved_record)
  );

  return saved_record;
end;
$$;

revoke all on function public.admin_list_users() from public;
revoke all on function public.admin_grant_access(text, text) from public;
revoke all on function public.admin_set_access(uuid, text, boolean) from public;

grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_grant_access(text, text) to authenticated;
grant execute on function public.admin_set_access(uuid, text, boolean) to authenticated;

commit;

select
  to_regprocedure('public.admin_list_users()') is not null as list_function_ready,
  to_regprocedure('public.admin_grant_access(text,text)') is not null as grant_function_ready,
  to_regprocedure('public.admin_set_access(uuid,text,boolean)') is not null as update_function_ready,
  (
    select count(*) > 0
    from public.admin_users
    where role = 'super_admin'
      and is_active
  ) as active_super_admin_ready;
