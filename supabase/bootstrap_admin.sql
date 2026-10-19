-- Run once after all three migrations.
-- Replace the email before executing this block in the Supabase SQL Editor.

do $$
declare
  admin_email text := 'REPLACE_WITH_YOUR_LOGIN_EMAIL';
  target_user_id uuid;
begin
  select id
  into target_user_id
  from auth.users
  where lower(email) = lower(admin_email)
  limit 1;

  if target_user_id is null then
    raise exception 'No Supabase Auth user found for email: %', admin_email;
  end if;

  insert into public.admin_users (user_id, role, is_active)
  values (target_user_id, 'super_admin', true)
  on conflict (user_id) do update set
    role = excluded.role,
    is_active = excluded.is_active;
end;
$$;

select
  au.user_id,
  au.role,
  au.is_active,
  u.email
from public.admin_users au
join auth.users u on u.id = au.user_id
order by au.created_at;
