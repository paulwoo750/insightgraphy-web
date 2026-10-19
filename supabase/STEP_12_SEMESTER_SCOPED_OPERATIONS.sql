-- Keep the timeline, deadlines and weekly group setup per semester.
-- 1. pr_schedules and pr_deadlines get semester_id. Rows the app saves without one
--    are attached to the active semester; existing rows go to the active semester
--    (the old reset deleted schedules and deadlines every semester).
-- 2. pr_deadlines is unique on (semester_id, week, category) instead of (week, category),
--    so a new semester's week 3 no longer reuses last semester's week 3 deadline.
-- 3. semesters.weekly_setup keeps each semester's group setup. pr_config.weekly_setup
--    stays the working copy of the active semester and is swapped on activation.
-- No rows are deleted. The only object dropped is the old (week, category) unique
-- constraint on pr_deadlines.
--
-- Run this BEFORE the next semester switch and deploy the matching app right after:
-- the app filters by semester_id, and the old app's deadline save
-- (on conflict week, category) stops working once this runs.

begin;

select pg_advisory_xact_lock(hashtextextended('insightgraphy-step-12', 0));

do $$
begin
  if to_regprocedure('public.build_week_topics(uuid)') is null then
    raise exception 'Run STEP_11_SEMESTER_ID_AUTOFILL.sql first';
  end if;
end;
$$;

alter table public.pr_schedules
  add column if not exists semester_id uuid references public.semesters(id) on delete restrict;

alter table public.pr_deadlines
  add column if not exists semester_id uuid references public.semesters(id) on delete restrict;

alter table public.semesters
  add column if not exists weekly_setup jsonb;

create index if not exists pr_schedules_semester_date_idx
  on public.pr_schedules (semester_id, full_date);

update public.pr_schedules t
set semester_id = a.id
from (select s.id from public.semesters s where s.status = 'active' limit 1) a
where t.semester_id is null;

update public.pr_deadlines t
set semester_id = a.id
from (select s.id from public.semesters s where s.status = 'active' limit 1) a
where t.semester_id is null;

-- 마감은 학기마다 주차·카테고리별로 하나다. 기존 (week, category) 유일 제약은 이름이
-- 환경마다 다를 수 있어 컬럼 구성으로 찾는다.
do $$
declare
  legacy record;
begin
  for legacy in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.pr_deadlines'::regclass
      and c.contype = 'u'
      and array(
        select a.attname::text
        from unnest(c.conkey) k(attnum)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
        order by 1
      ) = array['category', 'week']
  loop
    execute format('alter table public.pr_deadlines drop constraint %I', legacy.conname);
  end loop;

  for legacy in
    select i.indexrelid::regclass as index_name
    from pg_index i
    where i.indrelid = 'public.pr_deadlines'::regclass
      and i.indisunique
      and not i.indisprimary
      and array(
        select a.attname::text
        from unnest(i.indkey::int2[]) k(attnum)
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
        order by 1
      ) = array['category', 'week']
  loop
    execute format('drop index %s', legacy.index_name);
  end loop;
end;
$$;

create unique index if not exists pr_deadlines_semester_week_category_idx
  on public.pr_deadlines (semester_id, week, category);

-- 앱이 학기 ID 없이 저장한 일정·마감은 저장 시점의 운영 학기에 속한다
create or replace function public.fill_active_semester_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.semester_id is null then
    select s.id into new.semester_id
    from public.semesters s
    where s.status = 'active'
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists pr_schedules_fill_active_semester on public.pr_schedules;
create trigger pr_schedules_fill_active_semester
before insert on public.pr_schedules
for each row execute function public.fill_active_semester_id();

drop trigger if exists pr_deadlines_fill_active_semester on public.pr_deadlines;
create trigger pr_deadlines_fill_active_semester
before insert on public.pr_deadlines
for each row execute function public.fill_active_semester_id();

-- pr_config.weekly_setup이 저장될 때마다 운영 학기 행에도 같은 편성을 남긴다
create or replace function public.sync_weekly_setup_to_semester()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.semesters
  set weekly_setup = public.try_parse_jsonb(new.value)
  where status = 'active';
  return new;
end;
$$;

drop trigger if exists pr_config_sync_weekly_setup on public.pr_config;
create trigger pr_config_sync_weekly_setup
after insert or update of value on public.pr_config
for each row
when (new.key = 'weekly_setup')
execute function public.sync_weekly_setup_to_semester();

update public.semesters s
set weekly_setup = public.try_parse_jsonb(pc.value)
from public.pr_config pc
where pc.key = 'weekly_setup'
  and s.status = 'active';

create or replace function public.admin_activate_semester(
  p_semester_id uuid
)
returns public.semesters
language plpgsql
security definer
set search_path = public
as $$
declare
  activated_semester public.semesters%rowtype;
  was_active boolean;
begin
  if not public.is_admin() then
    raise exception 'Administrator access is required';
  end if;

  select s.status = 'active'
  into was_active
  from public.semesters s
  where s.id = p_semester_id
    and s.status <> 'archived';

  if was_active is null then
    raise exception 'Semester not found or archived';
  end if;

  -- 나가는 학기의 조 편성을 그 학기 행에 확정한다
  update public.semesters s
  set weekly_setup = public.try_parse_jsonb(pc.value)
  from public.pr_config pc
  where pc.key = 'weekly_setup'
    and s.status = 'active'
    and s.id <> p_semester_id;

  update public.semesters
  set status = 'closed'
  where status = 'active'
    and id <> p_semester_id;

  update public.semesters
  set
    status = 'active',
    current_week_no = coalesce(current_week_no, 1)
  where id = p_semester_id
  returning * into activated_semester;

  insert into public.pr_config (key, value)
  values
    ('current_semester', activated_semester.code),
    ('semester_type', activated_semester.semester_type),
    ('total_weeks', activated_semester.total_weeks::text),
    ('current_week', activated_semester.current_week_no::text),
    ('week_topics', public.build_week_topics(activated_semester.id)::text)
  on conflict (key) do update set value = excluded.value;

  -- 일정·마감은 학기 ID로 나뉘어 옮길 것이 없다. 조 편성 작업본만 들어오는 학기 것으로
  -- 바꾸고, 처음 운영하는 학기는 빈 편성으로 시작한다.
  if not was_active then
    insert into public.pr_config (key, value)
    values ('weekly_setup', coalesce(activated_semester.weekly_setup, '{}'::jsonb)::text)
    on conflict (key) do update set value = excluded.value;
  end if;

  return activated_semester;
end;
$$;

commit;

select 'pr_schedules' as table_name, coalesce(s.code, '(학기 없음)') as semester, count(*) as row_count
from public.pr_schedules t
left join public.semesters s on s.id = t.semester_id
group by s.code
union all
select 'pr_deadlines', coalesce(s.code, '(학기 없음)'), count(*)
from public.pr_deadlines t
left join public.semesters s on s.id = t.semester_id
group by s.code
union all
select 'weekly_setup', s.code, count(*) filter (where s.weekly_setup is not null)
from public.semesters s
where s.status = 'active'
group by s.code
order by table_name, semester;

select
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'semester_id'
      and table_name in ('pr_schedules', 'pr_deadlines')
  ) = 2 as semester_columns_ready,
  to_regclass('public.pr_deadlines_semester_week_category_idx') is not null
    and not exists (
      select 1
      from pg_index i
      where i.indrelid = 'public.pr_deadlines'::regclass
        and i.indisunique
        and array(
          select a.attname::text
          from unnest(i.indkey::int2[]) k(attnum)
          join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
          order by 1
        ) = array['category', 'week']
    ) as deadline_unique_ready,
  (
    select count(*)
    from pg_trigger
    where tgname in ('pr_schedules_fill_active_semester', 'pr_deadlines_fill_active_semester', 'pr_config_sync_weekly_setup')
      and not tgisinternal
  ) = 3 as semester_triggers_ready,
  exists (
    select 1
    from pg_proc p
    where p.oid = to_regprocedure('public.admin_activate_semester(uuid)')
      and p.prosrc like '%weekly_setup%'
  ) as activate_function_ready;
