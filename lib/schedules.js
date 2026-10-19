// 일정(pr_schedules) 공통 조회. 루트 랜딩·/schedule·/home·관리자 미리보기가 같은 규칙을 쓴다.
// - 원본은 pr_schedules (calendar_events는 2026-08 백필 이후 갱신되지 않아 쓰지 않는다)
// - 학기: 현재 운영 학기 행 (+ 학기 ID가 비어 있는 예전 행)
// - 공개 화면: is_public = true 인 행만
// - 정렬: 날짜 → 시작 시간(종일 먼저) → 제목
import { supabase } from '@/lib/supabase'
import { currentSemesterIdFilter, kstDateString } from '@/lib/semester'

export const LANDING_SCHEDULE_LIMIT = 4

export async function fetchActiveSemesterRef() {
  const { data, error } = await supabase.from('semesters').select('id, code, name').eq('status', 'active').maybeSingle()
  return { semester: data || null, error }
}

export function compareSchedules(a, b) {
  return String(a.full_date || '').localeCompare(String(b.full_date || ''))
    || (a.is_allday === b.is_allday ? 0 : a.is_allday ? -1 : 1)
    || String(a.start_time || '').localeCompare(String(b.start_time || ''))
    || String(a.title || '').localeCompare(String(b.title || ''), 'ko')
}

// 한 학기의 일정. publicOnly면 비공개 일정을 뺀다.
export async function fetchSemesterSchedules(semester, { publicOnly = true } = {}) {
  let query = supabase.from('pr_schedules').select('*').or(currentSemesterIdFilter(semester))
  if (publicOnly) query = query.eq('is_public', true)
  const { data, error } = await query.order('full_date', { ascending: true })
  return { data: (data || []).sort(compareSchedules), error }
}

// 오늘(한국 날짜) 이후의 진행 일정. 휴회는 세션이 아니므로 뺀다.
export function pickUpcoming(rows, { limit = LANDING_SCHEDULE_LIMIT, today = kstDateString(), includeBreaks = false } = {}) {
  return (rows || [])
    .filter((row) => row.full_date && row.full_date >= today && (includeBreaks || !row.is_break))
    .sort(compareSchedules)
    .slice(0, limit)
}

// 루트 랜딩의 Upcoming Sessions.
// mode 'auto': 현재 학기 공개 일정 중 가까운 4개
// mode 'manual': 관리자가 고른 일정 중 아직 공개·현재 학기·오늘 이후인 것. 하나도 남지 않으면 자동 목록으로 대체한다.
export async function fetchLandingSchedules({ config = null, today = kstDateString() } = {}) {
  let landingConfig = config
  if (!landingConfig) {
    const { data, error } = await supabase.from('pr_landing_config').select('*').eq('id', 'main').maybeSingle()
    if (error) return { items: [], mode: 'auto', fallback: false, error }
    landingConfig = data || {}
  }
  const mode = landingConfig.schedule_mode === 'manual' ? 'manual' : 'auto'

  const { semester, error: semesterError } = await fetchActiveSemesterRef()
  if (semesterError) return { items: [], mode, fallback: false, error: semesterError }

  const { data: rows, error } = await fetchSemesterSchedules(semester, { publicOnly: true })
  if (error) return { items: [], mode, fallback: false, error }

  const autoItems = pickUpcoming(rows, { today })
  if (mode === 'auto') return { items: autoItems, mode, fallback: false, error: null, semester }

  const selected = new Set((landingConfig.selected_schedules || []).map(String))
  const manualItems = pickUpcoming(rows.filter((row) => selected.has(String(row.id))), { today, limit: LANDING_SCHEDULE_LIMIT, includeBreaks: true })
  if (manualItems.length > 0) return { items: manualItems, mode, fallback: false, error: null, semester }
  return { items: autoItems, mode, fallback: true, error: null, semester }
}

export function scheduleTimeLabel(row) {
  if (!row) return ''
  if (row.is_allday || !row.start_time) return '종일'
  return row.end_time ? `${row.start_time}–${row.end_time}` : row.start_time
}

export const SCHEDULE_TYPE_LABELS = {
  regular: '정규 세션',
  special: '특별 세션',
  other: '기타',
}
