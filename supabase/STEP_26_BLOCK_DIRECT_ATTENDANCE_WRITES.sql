-- STEP 26: members can no longer write pr_attendance directly. Run AFTER the new site is deployed.
--
-- After STEP 24 and the new attendance screens, members check in only through
-- public.member_check_in() (security definer: the server decides window, distance and status).
-- This step adds one restrictive policy so that a member calling the API directly cannot insert,
-- change or delete attendance rows. Operators keep writing as before (is_admin(): developer,
-- president, admin, operator), and the existing admin RPCs (security definer) are not affected.
--
-- Guard: the step stops if member_check_in() could not write under RLS (its owner must own
-- pr_attendance or bypass RLS), so the new check-in can never be broken by this step.
-- Probe (always rolled back): an approved non-admin member is refused a direct insert.
--
-- No rows are changed. Undo: drop policy ig_step26_attendance_admin_writes on public.pr_attendance;

begin;

select pg_advisory_xact_lock(hashtextextended('insightgraphy-step-26', 0));

do $$
declare
  owner_ok boolean;
begin
  if to_regprocedure('public.member_check_in(text,double precision,double precision,double precision)') is null then
    raise exception 'STEP 26: run STEP 24 first (member_check_in not found).';
  end if;
  if to_regprocedure('public.is_admin(text[])') is null then
    raise exception 'STEP 26: public.is_admin(text[]) not found.';
  end if;
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.pr_attendance'::regclass) then
    raise exception 'STEP 26: RLS is off on pr_attendance. Run STEP 20 first.';
  end if;

  select (c.relowner = p.proowner) or r.rolbypassrls or r.rolsuper
  into owner_ok
  from pg_proc p
  join pg_roles r on r.oid = p.proowner
  cross join pg_class c
  where p.oid = 'public.member_check_in(text,double precision,double precision,double precision)'::regprocedure
    and c.oid = 'public.pr_attendance'::regclass;
  if not owner_ok then
    raise exception 'STEP 26: member_check_in() owner cannot write pr_attendance under RLS. Nothing was applied.';
  end if;
end;
$$;

drop policy if exists ig_step26_attendance_admin_writes on public.pr_attendance;
drop policy if exists ig_step26_attendance_admin_updates on public.pr_attendance;
drop policy if exists ig_step26_attendance_admin_deletes on public.pr_attendance;
create policy ig_step26_attendance_admin_writes on public.pr_attendance
  as restrictive for insert to authenticated
  with check ((select public.is_admin()));
create policy ig_step26_attendance_admin_updates on public.pr_attendance
  as restrictive for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy ig_step26_attendance_admin_deletes on public.pr_attendance
  as restrictive for delete to authenticated
  using ((select public.is_admin()));

create schema if not exists ig_private;
create table if not exists ig_private.step26_probe (
  id bigint generated always as identity primary key,
  probed_at timestamptz not null default now(),
  check_name text not null,
  result text not null
);
revoke all on ig_private.step26_probe from public;

do $$
declare
  member_user uuid;
  member_name text;
  r_member text := 'skipped';
  old_claims text := current_setting('request.jwt.claims', true);
  old_sub text := current_setting('request.jwt.claim.sub', true);
  old_role text := current_setting('request.jwt.claim.role', true);
begin
  select m.auth_user_id, m.name into member_user, member_name
  from public.members m
  where m.auth_user_id is not null and m.status = 'active'
    and not exists (select 1 from public.admin_users au where au.user_id = m.auth_user_id and au.is_active)
  limit 1;

  if member_user is not null then
    perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', member_user)::text, true);
    perform set_config('request.jwt.claim.sub', member_user::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    begin
      execute 'set local role authenticated';
      begin
        insert into public.pr_attendance (user_name, week, status, session_type, semester)
        values (member_name, 52, '출석완료', 'regular', 'ig-step26-probe');
        r_member := 'not refused';
      exception when insufficient_privilege or check_violation then
        r_member := 'ok (refused)';
      when others then
        r_member := case when sqlstate = '42501' then 'ok (refused)' else 'error ' || sqlstate || ' ' || sqlerrm end;
      end;
      execute 'reset role';
      if r_member = 'not refused' then
        raise exception 'ig_step26_probe_rollback';
      end if;
    exception when others then
      if sqlerrm <> 'ig_step26_probe_rollback' then
        r_member := coalesce(nullif(r_member, 'skipped'), 'error ' || sqlstate || ' ' || sqlerrm);
      end if;
    end;
    perform set_config('request.jwt.claims', coalesce(old_claims, ''), true);
    perform set_config('request.jwt.claim.sub', coalesce(old_sub, ''), true);
    perform set_config('request.jwt.claim.role', coalesce(old_role, ''), true);
  end if;

  if r_member = 'not refused' then
    raise exception 'STEP 26: a member could still insert attendance directly. Nothing was applied.';
  end if;

  insert into ig_private.step26_probe (check_name, result) values ('member_direct_insert', r_member);
end;
$$;

commit;

-- 확인: 3행. ok가 false인 행이 없어야 한다
select item, result, ok
from (
  select 1 as sort_order, 'policies' as item,
    (select string_agg(polname, ', ' order by polname) from pg_policy where polrelid = 'public.pr_attendance'::regclass and polname like 'ig_step26_%') as result,
    (select count(*) from pg_policy where polrelid = 'public.pr_attendance'::regclass and polname like 'ig_step26_%') = 3 as ok
  union all
  select 2, p.check_name, p.result, p.result like 'ok%' or p.result = 'skipped'
  from ig_private.step26_probe p
  where p.probed_at = (select max(probed_at) from ig_private.step26_probe)
  union all
  select 3, 'check_in_function',
    case when to_regprocedure('public.member_check_in(text,double precision,double precision,double precision)') is not null then '있음' else '없음' end,
    to_regprocedure('public.member_check_in(text,double precision,double precision,double precision)') is not null
) result
order by sort_order;
