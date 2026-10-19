// 학기·주차 운영값의 단일 진입점.
// 학기 식별은 semesters(status='active')가 기준이고, 주제·조 편성·마감 같은
// 운영값은 아직 pr_config(문자열 JSON)에 남아 있어 두 곳을 함께 읽는다.
import { supabase } from '@/lib/supabase'

export function parseJson(value, fallback) {
  if (value == null || value === '') return fallback
  try {
    return JSON.parse(value) ?? fallback
  } catch {
    return fallback
  }
}

export async function fetchCurrentSemester() {
  const [{ data: active }, { data: configRows }] = await Promise.all([
    supabase.from('semesters').select('id, code, name, semester_type, total_weeks, current_week_no').eq('status', 'active').maybeSingle(),
    supabase.from('pr_config').select('key, value'),
  ])
  const config = Object.fromEntries((configRows || []).map((row) => [row.key, row.value]))
  const code = config.current_semester || active?.code || ''

  return {
    id: active && active.code === code ? active.id : null,
    code,
    name: active?.name || code,
    type: config.semester_type || active?.semester_type || 'regular',
    totalWeeks: Number(config.total_weeks) || active?.total_weeks || 12,
    currentWeek: Number(config.current_week) || active?.current_week_no || 1,
    weekTopics: parseJson(config.week_topics, {}),
    weeklySetup: parseJson(config.weekly_setup, {}),
    config,
  }
}

// 학기 참여 명단(semester_memberships) 기준 활동 학회원. 운영 학기가 없으면 활동 학회원 전체.
export async function fetchSemesterMembers(semesterId, columns = '*') {
  let query = supabase.from('members').select(columns).eq('status', 'active').order('name', { ascending: true })
  if (semesterId) {
    const { data: memberships } = await supabase
      .from('semester_memberships')
      .select('member_id')
      .eq('semester_id', semesterId)
      .eq('participation_status', 'active')
    const memberIds = (memberships || []).map((membership) => membership.member_id)
    if (memberIds.length === 0) return []
    query = query.in('id', memberIds)
  }
  const { data } = await query
  return data || []
}

// 학기 ID가 아직 없는 행(STEP_11 이전 업로드·제출)은 현재 학기 것으로 본다.
// 일정(pr_schedules)·마감(pr_deadlines)도 STEP_12부터 학기별 행이라 이 필터로 읽고 지운다.
export function currentSemesterIdFilter(semester) {
  return semester?.id ? `semester_id.eq.${semester.id},semester_id.is.null` : 'semester_id.is.null'
}

// 학기 코드 정렬: 연도 → 1학기 → 여름 → 2학기 → 겨울 (문자열 정렬은 '2026-여름'을 2학기 뒤로 보낸다)
const TERM_ORDER = { 1: 1, 여름: 2, 2: 3, 겨울: 4 }

function semesterRank(code) {
  const match = String(code || '').match(/^(\d{4})\s*-\s*(.+)$/)
  if (!match) return [0, 0, String(code || '')]
  return [Number(match[1]), TERM_ORDER[match[2].trim()] ?? 9, match[2]]
}

export function compareSemesterCodes(a, b) {
  const [yearA, termA, restA] = semesterRank(a)
  const [yearB, termB, restB] = semesterRank(b)
  return yearA - yearB || termA - termB || restA.localeCompare(restB)
}

export function sortSemestersDesc(codes) {
  return [...codes].sort((a, b) => compareSemesterCodes(b, a))
}

// weekly_setup에서 학회원의 조 번호를 찾는다. 평일세션은 전용 편성(weekdayMembers)이 우선이다.
export function memberGroup(weeklySetup, week, name, sessionType = 'regular') {
  const setup = weeklySetup?.[week] || {}
  const raw = sessionType === 'weekday'
    ? setup.weekdayMembers?.[name] ?? setup.members?.[name]
    : setup.members?.[name]
  return raw && raw !== '미정' && raw !== '결석' ? Number(raw) : null
}

// 한 주차의 제출물을 조별로 묶는다 → { groups: { 1: [], 2: [], 미분류: [] }, maxGroup }.
// 현재 편성(weekly_setup)이 우선이고, 편성에 없으면 제출 당시 group_id를 쓴다.
export function groupSubmissionsByTeam(files, weeklySetup, week, sessionType = 'regular') {
  const setup = weeklySetup?.[week] || {}
  const configuredCount = Number(sessionType === 'weekday' ? setup.weekdayGroupCount || setup.groupCount : setup.groupCount) || 0
  const groupOf = (file) => memberGroup(weeklySetup, week, file.uploader, sessionType) ?? (file.group_id || null)
  const maxGroup = Math.max(configuredCount, ...files.map((file) => groupOf(file) || 0))

  const groups = {}
  for (let group = 1; group <= maxGroup; group++) groups[group] = []
  groups['미분류'] = []
  files.forEach((file) => {
    const group = groupOf(file)
    ;(group && groups[group] ? groups[group] : groups['미분류']).push(file)
  })
  return { groups, maxGroup }
}

// 제출 파일명에 들어가는 주차 주제
export function submissionTopic(weekTopics, week, sessionType = 'regular') {
  if (sessionType === 'weekday') return weekTopics?.[`weekday_${week}`] || '평일세션'
  return weekTopics?.[week] || (week === 0 ? 'OT 및 자유 주제' : '자유 주제')
}

// pr_deadlines 행을 { [week]: { [category]: deadline_time } }로 묶는다
export function groupDeadlines(rows) {
  return (rows || []).reduce((map, row) => {
    map[row.week] ??= {}
    map[row.week][row.category] = row.deadline_time
    return map
  }, {})
}

// 처음 보여줄 주차: 아직 지나지 않은 가장 가까운 마감 주차, 모두 지났으면 마지막으로 지난 주차
export function nearestDeadlineWeek(rows, category) {
  const now = Date.now()
  let upcomingWeek = null
  let upcomingDiff = Infinity
  let lastPastWeek = 1
  for (const row of rows || []) {
    if (row.category !== category || !row.deadline_time) continue
    const diff = new Date(row.deadline_time).getTime() - now
    if (diff > 0) {
      if (diff < upcomingDiff) {
        upcomingDiff = diff
        upcomingWeek = row.week
      }
    } else if (row.week > lastPastWeek) {
      lastPastWeek = row.week
    }
  }
  return upcomingWeek ?? lastPastWeek
}

// pr_config.week_topics({ '1': 주제, 'weekday_1': 평일 주제 })를 semester_weeks에 반영한다.
// 학기를 전환한 뒤에도 과거 주차 주제가 학기별로 남도록 하기 위함이다.
export async function syncWeekTopicsToSemester(semesterId, weekTopics, totalWeeks) {
  if (!semesterId) return { error: null }
  const rows = Array.from({ length: totalWeeks }, (_, index) => {
    const weekNo = index + 1
    return {
      semester_id: semesterId,
      week_no: weekNo,
      topic: weekTopics?.[weekNo]?.trim() || null,
      weekday_topic: weekTopics?.[`weekday_${weekNo}`]?.trim() || null,
    }
  })
  if (rows.length === 0) return { error: null }
  return supabase.from('semester_weeks').upsert(rows, { onConflict: 'semester_id,week_no' })
}

export function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
