-- Keep cancelled weeks cancelled.
-- The legacy bridge trigger (pr_config_sync_semester, 202608220003_legacy_bridge.sql)
-- rewrites every semester_weeks status of the active semester from current_week on each
-- pr_config write of current_semester, semester_type, total_weeks or current_week.
-- admin_save_semester_configuration and admin_activate_semester write those keys right
-- after saving the weeks, so a week saved as 'cancelled' went straight back to
-- planned/completed/current, and nothing that checks for cancelled weeks (automatic
-- absences, archive) ever saw one.
-- sync_legacy_semester_config is redefined with one change: the week upsert leaves a
-- 'cancelled' status as it is. Other weeks still follow current_week. A week stops being
-- cancelled only when admin_save_semester_configuration saves it with another status.
-- No rows are changed or deleted by this script and the trigger itself is not replaced.
--
-- Weeks cancelled before this script were already reset and are not restored.

begin;

select pg_advisory_xact_lock(hashtextextended('insightgraphy-step-14', 0));

do $$
begin
  if to_regprocedure('public.sync_legacy_semester_config()') is null then
    raise exception 'Run supabase/migrations/202608220003_legacy_bridge.sql first';
  end if;
end;
$$;

create or replace function public.sync_legacy_semester_config()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_semester_id uuid;
  target_total_weeks smallint;
  target_current_week smallint;
begin
  if new.key = 'current_semester' and nullif(trim(new.value), '') is not null then
    update public.semesters
    set status = 'closed'
    where status = 'active' and code <> trim(new.value);

    insert into public.semesters (
      code,
      name,
      semester_type,
      status,
      total_weeks,
      current_week_no
    ) values (
      trim(new.value),
      trim(new.value),
      case when new.value like '%여름%' or new.value like '%겨울%' then 'vacation' else 'regular' end,
      'active',
      1,
      1
    )
    on conflict (code) do update set status = 'active'
    returning id into active_semester_id;
  else
    select id into active_semester_id
    from public.semesters
    where status = 'active'
    limit 1;
  end if;

  if active_semester_id is null then
    return new;
  end if;

  if new.key = 'semester_type' and new.value in ('regular', 'vacation') then
    update public.semesters
    set semester_type = new.value
    where id = active_semester_id;
  elsif new.key = 'total_weeks' and new.value ~ '^[0-9]+$' then
    target_total_weeks := greatest(1, least(new.value::smallint, 52));
    update public.semesters
    set total_weeks = target_total_weeks
    where id = active_semester_id;
  elsif new.key = 'current_week' and new.value ~ '^[0-9]+$' then
    target_current_week := greatest(1, least(new.value::smallint, 52));
    update public.semesters
    set
      current_week_no = target_current_week,
      total_weeks = greatest(total_weeks, target_current_week)
    where id = active_semester_id;
  end if;

  select total_weeks, coalesce(current_week_no, 1)
  into target_total_weeks, target_current_week
  from public.semesters
  where id = active_semester_id;

  insert into public.semester_weeks (semester_id, week_no, status)
  select
    active_semester_id,
    week_no::smallint,
    case
      when week_no < target_current_week then 'completed'
      when week_no = target_current_week then 'current'
      else 'planned'
    end
  from generate_series(1, target_total_weeks) as generated(week_no)
  -- 취소된 주차는 현재 주차가 바뀌어도 취소로 둔다. 취소 해제는 학기 설정 저장으로만 한다.
  on conflict (semester_id, week_no) do update set
    status = case
      when semester_weeks.status = 'cancelled' then 'cancelled'
      else excluded.status
    end;

  return new;
end;
$$;

commit;

select
  exists (
    select 1
    from pg_proc p
    where p.oid = to_regprocedure('public.sync_legacy_semester_config()')
      and p.prosrc like '%when semester_weeks.status = ''cancelled'' then ''cancelled''%'
  ) as bridge_keeps_cancelled_ready,
  exists (
    select 1
    from pg_trigger t
    where t.tgname = 'pr_config_sync_semester'
      and t.tgrelid = 'public.pr_config'::regclass
      and t.tgfoid = to_regprocedure('public.sync_legacy_semester_config()')
      and t.tgenabled <> 'D'
      and not t.tgisinternal
  ) as bridge_trigger_ready;
