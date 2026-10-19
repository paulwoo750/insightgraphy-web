-- Restore per-semester week topics into semester_weeks.
-- The 학기 및 주차 screen reads semester_weeks, which was only backfilled for the
-- semester that was active during the 2026-08 migration. Other semesters looked empty,
-- and saving them from that screen would have written the blanks back to week_topics.
--
-- Sources, strongest first:
--   1. pr_config.week_topics      (current semester only)
--   2. archive_files 'topics'      (snapshot taken when a semester was closed)
--   3. files_metadata.file_name    ("3W [평일세션] (주제) 이름 …", most used per week)
-- Only empty topic cells are filled. Existing topics and other columns are never changed.

begin;

select pg_advisory_xact_lock(hashtextextended('insightgraphy-step-11b', 0));

create temporary table restored_topics (
  semester_id uuid not null,
  week_no smallint not null,
  topic text,
  weekday_topic text,
  priority smallint not null
) on commit drop;

-- 1. 현재 운영 학기: pr_config.week_topics
insert into restored_topics (semester_id, week_no, topic, weekday_topic, priority)
select
  s.id,
  w.week_no::smallint,
  nullif(trim(cfg.topics ->> w.week_no::text), ''),
  nullif(trim(cfg.topics ->> ('weekday_' || w.week_no)), ''),
  1
from public.semesters s
cross join lateral (
  select public.try_parse_jsonb(pc.value) as topics
  from public.pr_config pc
  where pc.key = 'week_topics'
) cfg
cross join generate_series(1, s.total_weeks) as w(week_no)
where s.status = 'active';

-- 2. 학기 마감 때 보관한 주제 스냅샷
insert into restored_topics (semester_id, week_no, topic, weekday_topic, priority)
select
  s.id,
  w.week_no::smallint,
  nullif(trim(snap.topics ->> w.week_no::text), ''),
  nullif(trim(snap.topics ->> ('weekday_' || w.week_no)), ''),
  2
from public.semesters s
cross join lateral (
  select public.try_parse_jsonb(af.description) as topics
  from public.archive_files af
  where af.category = 'topics'
    and af.file_type = s.code
  order by af.created_at desc
  limit 1
) snap
cross join generate_series(1, s.total_weeks) as w(week_no);

-- 3. 제출 파일명 "(주제)" — 주차별로 가장 많이 쓰인 주제
with parsed as (
  select
    s.id as semester_id,
    f.week::smallint as week_no,
    f.file_category like 'weekday\_%' as is_weekday,
    nullif(trim(substring(f.file_name from '^\s*\d+W(?:\s*\[[^]]*\])?\s*\((.+)\)\s*[^()]*$')), '') as topic
  from public.files_metadata f
  join public.semesters s on s.code = trim(f.semester)
  where f.week between 1 and s.total_weeks
),
counted as (
  select semester_id, week_no, is_weekday, topic, count(*) as uses
  from parsed
  where topic is not null
    and topic not in ('자유 주제', 'OT 및 자유 주제', '평일세션')
  group by semester_id, week_no, is_weekday, topic
),
best as (
  select distinct on (semester_id, week_no, is_weekday)
    semester_id, week_no, is_weekday, topic
  from counted
  order by semester_id, week_no, is_weekday, uses desc, topic
)
insert into restored_topics (semester_id, week_no, topic, weekday_topic, priority)
select
  semester_id,
  week_no,
  max(topic) filter (where not is_weekday),
  max(topic) filter (where is_weekday),
  3
from best
group by semester_id, week_no;

-- 주제를 복구할 주차의 행이 없으면 만든다 (상태만 채우고 주제는 아래에서 채움)
insert into public.semester_weeks (semester_id, week_no, status)
select distinct
  r.semester_id,
  r.week_no,
  case
    when s.status <> 'active' then 'completed'
    when r.week_no < coalesce(s.current_week_no, 1) then 'completed'
    when r.week_no = coalesce(s.current_week_no, 1) then 'current'
    else 'planned'
  end
from restored_topics r
join public.semesters s on s.id = r.semester_id
where r.topic is not null or r.weekday_topic is not null
on conflict (semester_id, week_no) do nothing;

with chosen as (
  select distinct on (semester_id, week_no) semester_id, week_no, topic
  from restored_topics
  where topic is not null
  order by semester_id, week_no, priority
)
update public.semester_weeks sw
set topic = chosen.topic
from chosen
where sw.semester_id = chosen.semester_id
  and sw.week_no = chosen.week_no
  and nullif(trim(sw.topic), '') is null;

with chosen as (
  select distinct on (semester_id, week_no) semester_id, week_no, weekday_topic
  from restored_topics
  where weekday_topic is not null
  order by semester_id, week_no, priority
)
update public.semester_weeks sw
set weekday_topic = chosen.weekday_topic
from chosen
where sw.semester_id = chosen.semester_id
  and sw.week_no = chosen.week_no
  and nullif(trim(sw.weekday_topic), '') is null;

commit;

select
  s.code as semester,
  s.status,
  s.total_weeks,
  count(sw.id) filter (where nullif(trim(sw.topic), '') is not null) as weeks_with_topic,
  count(sw.id) filter (where nullif(trim(sw.weekday_topic), '') is not null) as weeks_with_weekday_topic
from public.semesters s
left join public.semester_weeks sw on sw.semester_id = s.id
group by s.code, s.status, s.total_weeks
order by s.code;
