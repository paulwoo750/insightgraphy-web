-- STEP 25B: operators can register a phone for push notifications too.
--
-- STEP 25 accepted a device only from an approved member row (active, leave, inactive, alumni).
-- Graduate operators and the developer often have no member row, so "알림 켜기" failed with
-- NOT_MEMBER. Now an active admin account (developer, president, admin, operator, viewer) is
-- accepted as well. Admin-only accounts receive the test push and anything queued for them; the
-- member notifications (attendance, deadlines, best presenter) still go only to active members of
-- the semester, so nothing else changes.
--
-- Replaces one function. No rows are changed. Safe to re-run.

begin;

do $$
begin
  if to_regprocedure('public.member_save_push_subscription(text,text,text,text,text)') is null then
    raise exception 'STEP 25B: run STEP 25 first.';
  end if;
end;
$$;

create or replace function public.member_save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_platform text default null, p_user_agent text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'LOGIN_REQUIRED';
  end if;
  if not exists (select 1 from public.members m where m.auth_user_id = auth.uid() and m.status in ('active', 'leave', 'inactive', 'alumni'))
     and not public.is_admin(array['super_admin', 'admin', 'operator', 'viewer']) then
    raise exception 'NOT_MEMBER';
  end if;
  if coalesce(p_endpoint, '') !~ '^https://' or char_length(p_endpoint) > 2000 or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'BAD_SUBSCRIPTION';
  end if;
  insert into ig_private.push_subscriptions (user_id, endpoint, p256dh, auth, platform, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_platform, 20), left(p_user_agent, 300))
  on conflict (endpoint) do update set
    user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    platform = excluded.platform, user_agent = excluded.user_agent, last_seen_at = now(), failures = 0;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.member_save_push_subscription(text, text, text, text, text) from public, anon;
grant execute on function public.member_save_push_subscription(text, text, text, text, text) to authenticated;

commit;

-- 확인: 3행. 모두 true여야 한다
select
  position('is_admin' in pg_get_functiondef('public.member_save_push_subscription(text,text,text,text,text)'::regprocedure)) > 0 as admins_allowed,
  not has_function_privilege('anon', 'public.member_save_push_subscription(text,text,text,text,text)', 'execute') as anon_blocked,
  has_function_privilege('authenticated', 'public.member_save_push_subscription(text,text,text,text,text)', 'execute') as signed_in_allowed;
