-- External site content support.
--
-- 1. pr_about_alumni gets a one-line interview summary next to short_quote.
--    short_quote (the interviewee's own words) is kept as it is.
--      summary_line          the sentence shown on the /about card ("인터뷰 한 줄 요약")
--      summary_origin        'ai' (generated, maybe edited after) or 'manual'
--      summary_source_hash   fingerprint of qna_json the summary was written from;
--                            when the interview text changes the admin screen shows
--                            "요약 갱신 필요"
--      summary_model, summary_generated_at
-- 2. pr_landing_config.schedule_mode: 'auto' shows the next public schedules of the
--    current semester; 'manual' shows the selected ids (selected_schedules is kept).
--
-- Columns are only added. No rows are changed or deleted.

begin;

select pg_advisory_xact_lock(hashtextextended('insightgraphy-step-18', 0));

alter table public.pr_about_alumni
  add column if not exists summary_line text,
  add column if not exists summary_origin text,
  add column if not exists summary_source_hash text,
  add column if not exists summary_model text,
  add column if not exists summary_generated_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pr_about_alumni'::regclass
      and conname = 'pr_about_alumni_summary_origin_check'
  ) then
    alter table public.pr_about_alumni
      add constraint pr_about_alumni_summary_origin_check
      check (summary_origin is null or summary_origin in ('ai', 'manual'));
  end if;
end;
$$;

alter table public.pr_landing_config
  add column if not exists schedule_mode text not null default 'auto';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pr_landing_config'::regclass
      and conname = 'pr_landing_config_schedule_mode_check'
  ) then
    alter table public.pr_landing_config
      add constraint pr_landing_config_schedule_mode_check
      check (schedule_mode in ('auto', 'manual'));
  end if;
end;
$$;

commit;

-- 확인 1: 알럼나이 인터뷰 (id는 그대로, 요약은 아직 비어 있음)
select id, name, length(coalesce(short_quote, '')) as quote_length, summary_line, summary_origin
from public.pr_about_alumni
order by order_num nulls last, id;

-- 확인 2: 준비 상태 (모두 true)
select
  (
    select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'pr_about_alumni'
      and column_name in ('summary_line', 'summary_origin', 'summary_source_hash', 'summary_model', 'summary_generated_at')
  ) = 5 as alumni_summary_columns_ready,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pr_landing_config' and column_name = 'schedule_mode'
  ) as landing_schedule_mode_ready,
  (select schedule_mode from public.pr_landing_config where id = 'main') as current_landing_mode;
