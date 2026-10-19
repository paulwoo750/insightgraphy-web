-- Safe permanent member deletion for mistaken or unused registrations.
-- Installing this function does not delete any rows. Deletion only occurs
-- after an administrator explicitly invokes the RPC from member management.

begin;

select pg_advisory_xact_lock(hashtextextended('insightgraphy-step-9', 0));

create or replace function public.admin_delete_members(
  p_member_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  blocked_members jsonb := '[]'::jsonb;
  target_auth_ids uuid[] := '{}'::uuid[];
  deleted_ids uuid[] := '{}'::uuid[];
  deleted_count integer := 0;
begin
  if not public.is_admin(array['super_admin', 'admin', 'operator']) then
    raise exception 'Administrator access is required';
  end if;

  if coalesce(array_length(p_member_ids, 1), 0) = 0 then
    return jsonb_build_object(
      'deleted_count', 0,
      'deleted_ids', '[]'::jsonb,
      'blocked', '[]'::jsonb
    );
  end if;

  perform 1
  from public.members m
  where m.id = any(p_member_ids)
  for update;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'name', m.name,
        'reasons', concat_ws(', ',
          case when exists (
            select 1 from public.admin_users au
            where au.user_id = m.auth_user_id
          ) then '관리자 계정' end,
          case when exists (
            select 1
            from public.semester_memberships sm
            join public.semesters s on s.id = sm.semester_id
            where sm.member_id = m.id
              and (sm.participation_status = 'completed' or s.status in ('closed', 'archived'))
          ) then '과거 학기 명단' end,
          case when exists (
            select 1 from public.session_participants sp
            where sp.member_id = m.id
          ) then '세션 참여' end,
          case when exists (
            select 1 from public.pr_attendance pa
            where pa.member_id = m.id
          ) then '출결' end,
          case when exists (
            select 1 from public.pr_fines pf
            where pf.member_id = m.id
          ) then '벌금' end,
          case when exists (
            select 1 from public.absence_forms af
            where af.member_id = m.id
          ) then '사유서' end,
          case when exists (
            select 1 from public.files_metadata fm
            where fm.uploader_member_id = m.id
          ) or exists (
            select 1 from public.archive_files arf
            where arf.uploader_member_id = m.id
          ) or exists (
            select 1 from public.file_comments fc
            where fc.member_id = m.id
          ) then '아카이브' end,
          case when exists (
            select 1 from public.presentations p
            where p.presenter_member_id = m.id
          ) then '발표' end,
          case when exists (
            select 1 from public.scores sc
            where sc.voter_member_id = m.id
          ) then '평가' end
        )
      ) order by m.name
    ),
    '[]'::jsonb
  )
  into blocked_members
  from public.members m
  where m.id = any(p_member_ids)
    and (
      exists (
        select 1 from public.admin_users au
        where au.user_id = m.auth_user_id
      )
      or exists (
        select 1
        from public.semester_memberships sm
        join public.semesters s on s.id = sm.semester_id
        where sm.member_id = m.id
          and (sm.participation_status = 'completed' or s.status in ('closed', 'archived'))
      )
      or exists (select 1 from public.session_participants sp where sp.member_id = m.id)
      or exists (select 1 from public.pr_attendance pa where pa.member_id = m.id)
      or exists (select 1 from public.pr_fines pf where pf.member_id = m.id)
      or exists (select 1 from public.absence_forms af where af.member_id = m.id)
      or exists (select 1 from public.files_metadata fm where fm.uploader_member_id = m.id)
      or exists (select 1 from public.archive_files arf where arf.uploader_member_id = m.id)
      or exists (select 1 from public.file_comments fc where fc.member_id = m.id)
      or exists (select 1 from public.presentations p where p.presenter_member_id = m.id)
      or exists (select 1 from public.scores sc where sc.voter_member_id = m.id)
    );

  if jsonb_array_length(blocked_members) > 0 then
    return jsonb_build_object(
      'deleted_count', 0,
      'deleted_ids', '[]'::jsonb,
      'blocked', blocked_members
    );
  end if;

  select coalesce(array_agg(m.auth_user_id) filter (where m.auth_user_id is not null), '{}'::uuid[])
  into target_auth_ids
  from public.members m
  where m.id = any(p_member_ids);

  delete from public.semester_memberships
  where member_id = any(p_member_ids);

  delete from auth.users
  where id = any(target_auth_ids);

  with deleted as (
    delete from public.members
    where id = any(p_member_ids)
    returning id
  )
  select
    coalesce(array_agg(id), '{}'::uuid[]),
    count(*)::integer
  into deleted_ids, deleted_count
  from deleted;

  return jsonb_build_object(
    'deleted_count', deleted_count,
    'deleted_ids', to_jsonb(deleted_ids),
    'blocked', '[]'::jsonb
  );
end;
$$;

revoke all on function public.admin_delete_members(uuid[]) from public;
grant execute on function public.admin_delete_members(uuid[]) to authenticated;

commit;

select
  to_regprocedure('public.admin_delete_members(uuid[])') is not null as delete_function_ready;
