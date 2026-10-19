// 세션 및 제출 관리자 계산 로직 (화면과 분리된 순수 함수)
import { normalizeFileCategory } from '@/lib/archive'
import { fromKstInput, toKstInput } from '@/lib/semester'

export const TABS = [
  { key: 'overview', label: '개요·일정' },
  { key: 'attendance', label: '출석·장소' },
  { key: 'deadlines', label: '제출·피드백 마감' },
  { key: 'groups', label: '조·팀·평가 편성' },
  { key: 'submissions', label: '제출물' },
]

export const REGULAR_DEADLINES = {
  attendance: ['attendance_start', 'session_start', 'attendance_end'],
  submission: ['proposal', 'slide', 'video'],
  feedback: ['proposal_comment', 'vote_feedback', 'video_comment'],
  absence: ['absence'],
}
export const WEEKDAY_DEADLINES = ['weekday_absence', 'weekday_self']

export const SUBMISSION_TYPES = {
  regular: [
    { key: 'proposal', label: '기획서', deadline: 'proposal' },
    { key: 'slide', label: '슬라이드', deadline: 'slide' },
    { key: 'video', label: '발표영상', deadline: 'video' },
  ],
  weekday: [
    { key: 'weekday_slide', label: '평일 슬라이드', deadline: 'slideDl' },
    { key: 'weekday_video', label: '평일 영상', deadline: 'videoDl' },
  ],
}

export const UNASSIGNED = '미정'
export const EXCLUDED = '결석' // 저장 값은 기존 데이터와 같게 '결석'을 쓰고, 화면에는 '불참 표시'로 보여 준다

// 저장된 편성 + 예전 키 호환값을 한 형태로 읽는다
export function readSetup(raw) {
  const setup = raw || {}
  const evalMode = setup.evalMode || 'individual'
  const teamGroups = { ...(setup.teamGroups || {}) }
  if (evalMode === 'team' && Object.keys(teamGroups).length === 0 && setup.members) {
    Object.values(setup.members).forEach((value) => {
      if (!Number.isNaN(Number(value))) teamGroups[value] = Number(value)
    })
  }
  return {
    evalMode,
    teamCount: Number(setup.teamCount || setup.groupCount || 1),
    groupCount: Number(setup.groupCount || 1),
    clusterCount: Number(setup.clusterCount || 1),
    members: setup.members || {},
    memberTeams: setup.memberTeams || setup.members || {},
    teamGroups,
    groupToCluster: setup.groupToCluster || setup.groupClusters || {},
    groupClusters: setup.groupClusters || setup.groupToCluster || {},
    location: setup.location || { lat: '', lng: '', radius: 100 },
    weekdaySession: Boolean(setup.weekdaySession),
    weekday: setup.weekday || {},
    weekdayGroupCount: Number(setup.weekdayGroupCount || setup.groupCount || 1),
    weekdayMembers: setup.weekdayMembers || {},
  }
}

// 이 주차에 학회원별로 배정된 값 (정규: 개인 모드 members, 팀 모드 memberTeams / 평일: weekdayMembers)
export function assignmentKey(setup, mode) {
  if (mode === 'weekday') return 'weekdayMembers'
  return readSetup(setup).evalMode === 'team' ? 'memberTeams' : 'members'
}

export function assignmentOf(setup, mode, name) {
  const view = readSetup(setup)
  if (mode === 'weekday') {
    const own = view.weekdayMembers[name]
    return own ?? UNASSIGNED
  }
  const map = view.evalMode === 'team' ? view.memberTeams : view.members
  return map[name] ?? UNASSIGNED
}

export function range(count) {
  return Array.from({ length: Math.max(0, Number(count) || 0) }, (_, index) => index + 1)
}

// 편성 요약: 조(또는 팀)별 이름, 미배정, 불참 표시, 범위를 벗어난 배정
export function summarizeAssignments(setup, mode, members) {
  const view = readSetup(setup)
  const units = mode === 'weekday' ? view.weekdayGroupCount : view.evalMode === 'team' ? view.teamCount : view.groupCount
  const byUnit = Object.fromEntries(range(units).map((unit) => [unit, []]))
  const unassigned = []
  const excluded = []
  const outOfRange = []
  for (const member of members) {
    const value = assignmentOf(setup, mode, member.name)
    if (value === UNASSIGNED || value === '' || value == null) unassigned.push(member)
    else if (value === EXCLUDED) excluded.push(member)
    else if (byUnit[Number(value)]) byUnit[Number(value)].push(member)
    else outOfRange.push({ member, value })
  }
  return { units, byUnit, unassigned, excluded, outOfRange }
}

// 제출 대상 명단.
// - 편성이 있으면 조·팀에 배정된 사람만 대상이다. '미정'은 편성이 끝나지 않은 것이라 미제출로 세지 않는다.
// - 불참 표시('결석')는 이번 주 편성에서 뺀 사람이다. 제출하면 보강 제출로 보여 주고, 미제출로 세지 않는다.
// - 편성이 없는 주차는 학기 명단 전체가 대상이다.
// - 팀 발표의 영상은 'Team N' 이름으로 올라오므로 팀 단위로 본다.
export function buildRoster(setup, mode, members, category) {
  const view = readSetup(setup)
  const hasSetup = Boolean(setup) && Object.keys(mode === 'weekday' ? view.weekdayMembers : view.evalMode === 'team' ? view.memberTeams : view.members).length > 0
  const teamVideo = mode !== 'weekday' && view.evalMode === 'team' && normalizeFileCategory(category) === 'video'
  const entries = []

  if (teamVideo) {
    const summary = summarizeAssignments(setup, mode, members)
    for (const team of range(summary.units)) {
      const teamMembers = summary.byUnit[team] || []
      if (teamMembers.length === 0) continue
      entries.push({ key: `Team ${team}`, label: `${team}팀`, detail: teamMembers.map((member) => member.name).join(', '), names: [`Team ${team}`, ...teamMembers.map((member) => member.name)], kind: 'target', unit: team })
    }
    summary.excluded.forEach((member) => entries.push({ key: member.name, label: member.name, detail: '불참 표시', names: [member.name], kind: 'excluded' }))
    summary.unassigned.forEach((member) => entries.push({ key: member.name, label: member.name, detail: '편성 미정', names: [member.name], kind: 'unassigned' }))
    return { entries, hasSetup }
  }

  for (const member of members) {
    const value = hasSetup ? assignmentOf(setup, mode, member.name) : null
    let kind = 'target'
    let detail = member.generation || ''
    if (hasSetup) {
      if (value === UNASSIGNED || value === '' || value == null) {
        kind = 'unassigned'
        detail = '편성 미정'
      } else if (value === EXCLUDED) {
        kind = 'excluded'
        detail = '불참 표시'
      } else {
        detail = `${value}${mode !== 'weekday' && view.evalMode === 'team' ? '팀' : '조'}`
      }
    }
    entries.push({ key: member.name, label: member.name, detail, names: [member.name], kind, unit: Number(value) || null, memberId: member.id })
  }
  return { entries, hasSetup }
}

// 대상별 제출 상태
export function submissionStatus(roster, files, deadlineIso) {
  const deadline = deadlineIso ? new Date(deadlineIso).getTime() : null
  const used = new Set()
  const rows = roster.entries.map((entry) => {
    const own = files.filter((file) => entry.names.includes(file.uploader))
    own.forEach((file) => used.add(file.id))
    const latest = own[0] || null
    const late = latest ? Boolean(latest.is_late) || (deadline != null && new Date(latest.created_at).getTime() > deadline) : false
    let state = 'missing'
    if (latest) state = entry.kind === 'excluded' ? 'makeup' : late ? 'late' : 'ontime'
    else if (entry.kind !== 'target') state = entry.kind
    return { ...entry, files: own, latest, late, state }
  })
  const extra = files.filter((file) => !used.has(file.id))
  const targets = rows.filter((row) => row.kind === 'target')
  return {
    rows,
    extra,
    counts: {
      targets: targets.length,
      submitted: targets.filter((row) => row.latest).length,
      late: targets.filter((row) => row.state === 'late').length,
      missing: targets.filter((row) => row.state === 'missing').length,
      unassigned: rows.filter((row) => row.kind === 'unassigned').length,
      excluded: rows.filter((row) => row.kind === 'excluded').length,
      makeup: rows.filter((row) => row.state === 'makeup').length,
    },
  }
}

// ---------------------------------------------------------------- 검증
function inRange(value, min, max) {
  const number = Number(value)
  return value !== '' && value != null && Number.isFinite(number) && number >= min && number <= max
}

export function validateLocation(location, label = '출석 장소') {
  const errors = []
  const lat = location?.lat
  const lng = location?.lng
  const hasLat = lat !== '' && lat != null
  const hasLng = lng !== '' && lng != null
  if (hasLat !== hasLng) errors.push(`${label}: 위도와 경도를 함께 입력하세요.`)
  if (hasLat && !inRange(lat, -90, 90)) errors.push(`${label}: 위도는 -90~90 사이 숫자여야 합니다.`)
  if (hasLng && !inRange(lng, -180, 180)) errors.push(`${label}: 경도는 -180~180 사이 숫자여야 합니다.`)
  const radius = location?.radius
  if (radius !== '' && radius != null && !inRange(radius, 10, 2000)) errors.push(`${label}: 허용 반경은 10~2000m 사이로 입력하세요.`)
  return errors
}

// 국내 좌표 범위를 벗어나면 위도·경도가 뒤바뀌었을 가능성이 크다 (저장은 막지 않는다)
export function locationWarnings(location, label = '출석 장소') {
  const lat = Number(location?.lat)
  const lng = Number(location?.lng)
  if (!location?.lat || !location?.lng || !Number.isFinite(lat) || !Number.isFinite(lng)) return []
  if (lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132) return []
  if (lng >= 33 && lng <= 39 && lat >= 124 && lat <= 132) return [`${label}: 위도와 경도가 서로 바뀐 것 같습니다.`]
  return [`${label}: 좌표가 국내 범위 밖입니다. 지도에서 위치를 확인하세요.`]
}

function compareTimes(entries, label) {
  const filled = entries.filter((entry) => entry.value)
  const errors = []
  for (let index = 1; index < filled.length; index++) {
    if (filled[index - 1].value > filled[index].value) errors.push(`${label}: ${filled[index - 1].name}이(가) ${filled[index].name}보다 늦습니다.`)
  }
  return errors
}

// 한 주차의 저장 전 검증. 반환값은 오류 문장 목록이다.
export function validateWeek({ week, setup, deadlines, mode }) {
  const errors = []
  const view = readSetup(setup)
  errors.push(...validateLocation(view.location, `W${week} 정규 출석 장소`))
  errors.push(...compareTimes([
    { name: '출석 오픈', value: deadlines.attendance_start || '' },
    { name: '세션 시작', value: deadlines.session_start || '' },
    { name: '출석 종료', value: deadlines.attendance_end || '' },
  ], `W${week} 출석 시간`))
  for (const key of ['groupCount', 'clusterCount', 'teamCount', 'weekdayGroupCount']) {
    if (setup && setup[key] != null && !(Number.isInteger(Number(setup[key])) && Number(setup[key]) >= 1 && Number(setup[key]) <= 30)) {
      errors.push(`W${week} 편성: 개수는 1~30 사이 정수여야 합니다.`)
      break
    }
  }
  if (setup && (mode === 'weekday' || view.weekdaySession)) {
    for (const [group, team] of Object.entries(view.weekday || {})) {
      if (Number(group) > view.weekdayGroupCount) continue
      const times = [team.attOpen, team.sessionStart, team.attEnd].some(Boolean)
      if (times && !team.date) errors.push(`W${week} 평일 ${group}조: 출석 시간을 쓰려면 진행 날짜가 필요합니다.`)
      errors.push(...compareTimes([
        { name: '출석 오픈', value: team.attOpen || '' },
        { name: '세션 시작', value: team.sessionStart || '' },
        { name: '출석 마감', value: team.attEnd || '' },
      ], `W${week} 평일 ${group}조`))
      errors.push(...validateLocation({ lat: team.lat, lng: team.lng, radius: team.radius }, `W${week} 평일 ${group}조 장소`))
    }
  }
  return errors
}

// 범위를 벗어난 배정 (조 개수를 줄였을 때 등)은 저장은 되지만 경고로 보여 준다
export function setupWarnings(setup, members) {
  if (!setup) return []
  const warnings = [...locationWarnings(readSetup(setup).location, '정규 출석 장소')]
  for (const [group, team] of Object.entries(readSetup(setup).weekday || {})) {
    warnings.push(...locationWarnings({ lat: team.lat, lng: team.lng }, `평일 ${group}조 장소`))
  }
  for (const mode of ['regular', 'weekday']) {
    if (mode === 'weekday' && !readSetup(setup).weekdaySession) continue
    const summary = summarizeAssignments(setup, mode, members)
    if (summary.outOfRange.length > 0) {
      warnings.push(`${mode === 'weekday' ? '평일 ' : ''}편성 범위를 벗어난 배정 ${summary.outOfRange.length}명: ${summary.outOfRange.map((item) => `${item.member.name}(${item.value})`).join(', ')}`)
    }
  }
  return warnings
}

// ---------------------------------------------------------------- 마감 변환
export function deadlinesToInputs(map) {
  return Object.fromEntries(Object.entries(map || {}).map(([category, iso]) => [category, toKstInput(iso)]))
}

export function inputsToIso(map) {
  return Object.fromEntries(Object.entries(map || {}).map(([category, value]) => [category, fromKstInput(value)]))
}

// 장소 좌표에 맞는 즐겨찾기 이름 (학회원 화면과 같은 함수)
export { locationName } from '@/lib/semester'
