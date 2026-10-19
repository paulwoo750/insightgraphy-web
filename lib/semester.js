// 학기·주차 운영값의 단일 진입점.
// 학기는 semesters(status='active')로 식별하고, W1 이후 주제는 semester_weeks, W0(OT) 주제는
// semesters.ot_topic이 원본이다. pr_config의 week_topics·weekly_setup은 기존 화면 호환용 사본이라
// 읽을 때 원본과 다르면 legacy 항목으로 드러낸다. 저장은 saveWeekPlan(세션 및 제출)과
// admin_save_semester_configuration(학기 및 주차) 두 RPC만 사용한다.
import { supabase } from '@/lib/supabase'

export function parseJson(value, fallback) {
  if (value == null || value === '') return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value) ?? fallback
  } catch {
    return fallback
  }
}

// ---------------------------------------------------------------- 한국 시간
export const KST_TIME_ZONE = 'Asia/Seoul'

const kstPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: KST_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function kstParts(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return Object.fromEntries(kstPartsFormatter.formatToParts(date).map((part) => [part.type, part.value]))
}

// timestamptz → datetime-local 입력값 (한국 시간)
export function toKstInput(value) {
  if (!value) return ''
  const parts = kstParts(value)
  return parts ? `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` : ''
}

// datetime-local 입력값(한국 시간) → ISO 문자열
export function fromKstInput(value) {
  if (!value) return null
  const normalized = String(value).length === 10 ? `${value}T00:00` : String(value).slice(0, 16)
  const date = new Date(`${normalized}:00+09:00`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

// 한국 날짜 'YYYY-MM-DD'
export function kstDateString(value = new Date()) {
  const parts = kstParts(value)
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : ''
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// 9.19(토) 14:00 처럼 한국 시간으로 표시한다
export function formatKst(value, { year = false, weekday = true, time = true } = {}) {
  if (!value) return ''
  const parts = kstParts(value)
  if (!parts) return ''
  const dayIndex = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))).getUTCDay()
  const datePart = `${year ? `${parts.year}.` : ''}${Number(parts.month)}.${Number(parts.day)}${weekday ? `(${WEEKDAYS[dayIndex]})` : ''}`
  return time ? `${datePart} ${parts.hour}:${parts.minute}` : datePart
}

export function formatDateTime(value) {
  if (!value) return ''
  const parts = kstParts(value)
  return parts ? `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}` : ''
}

// 'YYYY-MM-DD' 날짜만 있는 값 → 9.19(토)
export function formatKstDate(dateString, { weekday = true } = {}) {
  if (!dateString) return ''
  return formatKst(`${dateString}T12:00:00+09:00`, { weekday, time: false })
}

// ---------------------------------------------------------------- 마감 종류
// 관리자 설정 화면과 학회원 화면이 같은 이름과 순서를 쓴다.
export const DEADLINE_CATEGORIES = [
  { key: 'attendance_start', label: '출석 오픈', group: 'attendance', session: 'regular' },
  { key: 'session_start', label: '세션 시작 (지각 기준)', group: 'attendance', session: 'regular' },
  { key: 'attendance_end', label: '출석 종료 (이후 결석)', group: 'attendance', session: 'regular' },
  { key: 'proposal', label: '기획서 제출', group: 'submission', session: 'regular' },
  { key: 'slide', label: '슬라이드 제출', group: 'submission', session: 'regular' },
  { key: 'video', label: '발표영상 등록', group: 'submission', session: 'regular' },
  { key: 'proposal_comment', label: '기획서 피드백', group: 'feedback', session: 'regular' },
  { key: 'vote_feedback', label: '정성 피드백 (조원 평가)', group: 'feedback', session: 'regular' },
  { key: 'video_comment', label: '셀프 피드백 (본인 평가)', group: 'feedback', session: 'regular' },
  { key: 'absence', label: '사유서 제출', group: 'absence', session: 'regular' },
  { key: 'weekday_absence', label: '평일세션 불참 사유서', group: 'weekday', session: 'weekday' },
  { key: 'weekday_self', label: '평일세션 셀프 피드백', group: 'weekday', session: 'weekday' },
  { key: 'weekday_upload', label: '평일세션 자료·영상', group: 'weekday', session: 'weekday' },
  { key: 'weekday_feedback', label: '평일세션 정성 피드백', group: 'weekday', session: 'weekday' },
]

const DEADLINE_LABELS = Object.fromEntries(DEADLINE_CATEGORIES.map((item) => [item.key, item.label]))

export function deadlineLabel(category) {
  return DEADLINE_LABELS[category] || `${category} 마감`
}

export const ATTENDANCE_DEADLINES = ['attendance_start', 'session_start', 'attendance_end']

// ---------------------------------------------------------------- 학기 읽기
const SEMESTER_COLUMNS = '*'

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`
}

export function sameJson(a, b) {
  return stableStringify(a) === stableStringify(b)
}

// semester_weeks 행과 W0 주제 → { '0': OT, '1': 주제, 'weekday_1': 평일 주제 }
export function weekTopicsFromRows(rows, otTopic) {
  const topics = {}
  if (otTopic) topics[0] = otTopic
  for (const row of rows || []) {
    if (row.topic) topics[row.week_no] = row.topic
    if (row.weekday_topic) topics[`weekday_${row.week_no}`] = row.weekday_topic
  }
  return topics
}

function hasOtColumn(row) {
  return row && Object.hasOwn(row, 'ot_topic')
}

// 원본(semester_weeks·ot_topic)과 legacy 사본(pr_config.week_topics)이 다른 칸
function compareLegacyTopics(sourceTopics, legacyTopics, totalWeeks, otColumnReady) {
  const conflicts = []
  const missing = []
  const keys = ['0']
  for (let week = 1; week <= totalWeeks; week++) keys.push(String(week), `weekday_${week}`)
  for (const key of keys) {
    if (key === '0' && !otColumnReady) continue
    const source = String(sourceTopics[key] || '').trim()
    const legacy = String(legacyTopics?.[key] || '').trim()
    if (!legacy || source === legacy) continue
    const week = Number(key.replace('weekday_', ''))
    const field = key === '0' ? 'ot_topic' : key.startsWith('weekday_') ? 'weekday_topic' : 'topic'
    if (source) conflicts.push({ week, field, source, legacy })
    else missing.push({ week, field, legacy })
  }
  return { conflicts, missing }
}

// 한 학기의 운영값 전체. semester는 semesters 행.
export async function fetchSemesterContext(semester, configRows = null) {
  if (!semester) return null
  const isActive = semester.status === 'active'
  const [weeksResult, configResult] = await Promise.all([
    supabase.from('semester_weeks').select('id, week_no, topic, weekday_topic, status').eq('semester_id', semester.id).order('week_no'),
    configRows ? Promise.resolve({ data: configRows }) : (isActive ? supabase.from('pr_config').select('key, value') : Promise.resolve({ data: [] })),
  ])
  const config = Object.fromEntries((configResult.data || []).map((row) => [row.key, row.value]))
  const weekRows = weeksResult.data || []
  const otColumnReady = hasOtColumn(semester)
  const legacyTopics = isActive ? parseJson(config.week_topics, {}) : {}
  const sourceTopics = weekTopicsFromRows(weekRows, otColumnReady ? semester.ot_topic : null)
  const weeksReadable = !weeksResult.error

  // 표시용 주제: 원본(semester_weeks) 값이 있으면 원본, 운영 학기에서 원본 칸이 비어 있으면 legacy 사본.
  // RLS로 원본 행이 안 보이면 오류 없이 0건이 오므로(비로그인·학회원 권한) 칸 단위로 채운다.
  // 지난 학기는 현재 설정으로 채우지 않는다. 편집 화면은 weekTopics가 아니라 weeks(원본 행)를 쓴다.
  const weekTopics = { ...(isActive ? legacyTopics : {}), ...sourceTopics }
  if (!otColumnReady && legacyTopics[0]) weekTopics[0] = legacyTopics[0]

  const legacySetup = isActive ? parseJson(config.weekly_setup, null) : null
  const storedSetup = parseJson(semester.weekly_setup, null)
  const weeklySetup = (isActive ? legacySetup ?? storedSetup : storedSetup) || {}

  const topicCheck = isActive && weeksReadable
    ? compareLegacyTopics(sourceTopics, legacyTopics, semester.total_weeks, otColumnReady)
    : { conflicts: [], missing: [] }

  return {
    id: semester.id,
    code: semester.code,
    name: semester.name || semester.code,
    status: semester.status,
    isActive,
    type: semester.semester_type || 'regular',
    totalWeeks: semester.total_weeks || 1,
    currentWeek: semester.current_week_no || 1,
    otTopic: otColumnReady ? semester.ot_topic || '' : legacyTopics[0] || '',
    otColumnReady,
    weeks: Object.fromEntries(weekRows.map((row) => [row.week_no, row])),
    weekTopics,
    weeklySetup,
    config,
    legacy: {
      codeMismatch: isActive && Boolean(config.current_semester) && config.current_semester !== semester.code,
      legacyCode: config.current_semester || '',
      topicConflicts: topicCheck.conflicts,
      topicsMissing: topicCheck.missing,
      setupMismatch: isActive && legacySetup != null && storedSetup != null && !sameJson(legacySetup, storedSetup),
      topicsSource: weeksReadable ? 'semester_weeks' : 'legacy',
      weeksError: weeksResult.error?.message || '',
    },
  }
}

// 현재 운영 학기. semesters에 활성 학기가 없을 때만 pr_config 값을 그대로 쓴다.
export async function fetchCurrentSemester() {
  const [{ data: active }, { data: configRows }] = await Promise.all([
    supabase.from('semesters').select(SEMESTER_COLUMNS).eq('status', 'active').maybeSingle(),
    supabase.from('pr_config').select('key, value'),
  ])
  if (active) return fetchSemesterContext(active, configRows || [])

  const config = Object.fromEntries((configRows || []).map((row) => [row.key, row.value]))
  return {
    id: null,
    code: config.current_semester || '',
    name: config.current_semester || '',
    status: 'legacy',
    isActive: true,
    type: config.semester_type || 'regular',
    totalWeeks: Number(config.total_weeks) || 12,
    currentWeek: Number(config.current_week) || 1,
    otTopic: parseJson(config.week_topics, {})[0] || '',
    otColumnReady: false,
    weeks: {},
    weekTopics: parseJson(config.week_topics, {}),
    weeklySetup: parseJson(config.weekly_setup, {}),
    config,
    legacy: { codeMismatch: false, legacyCode: config.current_semester || '', topicConflicts: [], topicsMissing: [], setupMismatch: false, topicsSource: 'legacy', weeksError: '' },
  }
}

export async function fetchSemesterById(semesterId) {
  const { data, error } = await supabase.from('semesters').select(SEMESTER_COLUMNS).eq('id', semesterId).maybeSingle()
  if (error || !data) return { semester: null, error: error || new Error('학기를 찾을 수 없습니다.') }
  return { semester: await fetchSemesterContext(data), error: null }
}

// 학기별 주제 (아카이브 스냅샷·과거 학기 표시용)
export async function fetchWeekTopics(semesterId) {
  if (!semesterId) return {}
  const [{ data: semester }, { data: rows }] = await Promise.all([
    supabase.from('semesters').select('*').eq('id', semesterId).maybeSingle(),
    supabase.from('semester_weeks').select('week_no, topic, weekday_topic').eq('semester_id', semesterId),
  ])
  return weekTopicsFromRows(rows, hasOtColumn(semester) ? semester.ot_topic : null)
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

// ---------------------------------------------------------------- 조 편성
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
  return weekTopics?.[week] || (Number(week) === 0 ? 'OT 및 자유 주제' : '자유 주제')
}

// 화면에 보이는 주제 (없으면 '주제 미정')
export function displayTopic(weekTopics, week, sessionType = 'regular') {
  if (sessionType === 'weekday') return weekTopics?.[`weekday_${week}`] || ''
  return weekTopics?.[week] || ''
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

// URL ?week= 값이 이 학기 범위 안이면 그 주차, 아니면 fallback
export function weekFromParam(value, totalWeeks, fallback) {
  if (value === null || value === undefined || value === '') return fallback
  const week = Number(value)
  return Number.isInteger(week) && week >= 0 && week <= totalWeeks ? week : fallback
}

// ---------------------------------------------------------------- 저장
// 세션 및 제출 화면의 한 주차 저장 (주제·조 편성·마감·장소 즐겨찾기를 한 트랜잭션으로)
export async function saveWeekPlan(semesterId, weekNo, plan) {
  const { data, error } = await supabase.rpc('admin_save_week_plan', {
    p_semester_id: semesterId,
    p_week_no: weekNo,
    p_plan: plan,
  })
  return { data, error, conflicts: parseConflicts(error) }
}

function parseConflicts(error) {
  if (!error || !['WEEK_PLAN_CONFLICT', 'WEEK_TOPIC_CONFLICT'].includes(error.message)) return null
  return parseJson(error.details, [])
}

const CONFLICT_FIELDS = {
  topic: '정규 주제',
  ot_topic: 'W0 주제',
  weekday_topic: '평일 주제',
  setup: '조·팀 편성',
  deadline: '마감',
  favorite_locations: '장소 즐겨찾기',
}

// RPC 오류를 관리자에게 보여줄 문장으로 바꾼다
export function describeSaveError(error) {
  if (!error) return ''
  const message = error.message || String(error)
  const conflicts = parseConflicts(error)
  if (conflicts) {
    const fields = conflicts.map((item) => `${item.week_no != null ? `W${item.week_no} ` : ''}${CONFLICT_FIELDS[item.field] || item.field}${item.category ? `(${deadlineLabel(item.category)})` : ''}`)
    return `다른 화면에서 먼저 저장된 항목이 있어 저장하지 않았습니다: ${[...new Set(fields)].join(', ')}. 최신 값을 불러온 뒤 다시 적용하세요.`
  }
  if (error.code === 'PGRST202' || message.includes('Could not find the function')) {
    return '필요한 DB 함수가 아직 없습니다. Supabase SQL Editor에서 STEP 15를 먼저 실행해 주세요.'
  }
  if (message.startsWith('ATTENDANCE_ORDER:')) return message.replace('ATTENDANCE_ORDER:', '').trim()
  if (message.includes('Administrator access is required')) return '이 작업은 관리자·운영진 권한이 필요합니다. 열람자 계정은 저장할 수 없습니다.'
  if (message.includes('outside the semester range')) return '학기 전체 주차 범위를 벗어난 주차입니다.'
  return message
}

// 출석 장소 좌표에 맞는 즐겨찾기 이름 (없으면 좌표)
export function locationName(location, favorites) {
  if (!location?.lat || !location?.lng) return ''
  const match = (favorites || []).find((favorite) => String(favorite.lat) === String(location.lat) && String(favorite.lng) === String(location.lng))
  return match?.name || `${Number(location.lat).toFixed(5)}, ${Number(location.lng).toFixed(5)}`
}
