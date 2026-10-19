// 학회원별 출결·벌금 계산 규칙. 관리자 출결 대시보드와 학회원 마이페이지가 같은 함수를 쓴다.
// 기록 주인 판단: member_id가 있으면 그것만 본다. member_id가 비어 있는 예전 기록만 이름으로 맞추고,
// 같은 이름이 둘 이상이면 이름으로 맞추지 않는다 (동명이인 섞임 방지).

export function normalizeName(value) {
  return String(value || '').replace(/\s+/g, '').toLocaleLowerCase('ko-KR')
}

// 이름이 한 명에게만 있는 경우만 이름 매칭을 허용한다
export function uniqueNameSet(members) {
  const counts = new Map()
  for (const member of members || []) {
    const key = normalizeName(member.name)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return new Set([...counts].filter(([, count]) => count === 1).map(([key]) => key))
}

export function recordBelongsTo(record, member, uniqueNames, nameField = 'user_name', idField = 'member_id') {
  if (!record || !member) return false
  if (record[idField]) return record[idField] === member.id
  const name = normalizeName(member.name)
  return (!uniqueNames || uniqueNames.has(name)) && normalizeName(record[nameField]) === name
}

export function attendanceKind(status) {
  const value = String(status || '')
  if (value.includes('완전인정')) return 'full'
  if (value.includes('부분인정')) return 'partial'
  if (value.includes('무단') || value === '결석') return 'unauthorized'
  if (value.includes('지각')) return 'late'
  if (value.includes('출석')) return 'attended'
  return 'missing'
}

export const ATTENDANCE_LABELS = {
  attended: '출석',
  late: '지각',
  unauthorized: '무단결석',
  full: '인정결석 (완전)',
  partial: '인정결석 (부분)',
  missing: '기록 없음',
}

export function summarizeAttendance(records) {
  const counts = { attended: 0, late: 0, unauthorized: 0, full: 0, partial: 0, missing: 0 }
  for (const record of records || []) counts[attendanceKind(record.status)] += 1
  return {
    counts,
    // 회칙 기준 결석 집계: 무단결석 + 부분인정 결석 (완전인정은 출석으로 본다)
    countedAbsences: counts.unauthorized + counts.partial,
    presentLike: counts.attended + counts.full,
  }
}

// 취소된 벌금: voided_at이 있거나 예전 방식으로 사유 앞에 [삭제됨]을 붙인 행
export function isFineVoided(fine) {
  return Boolean(fine?.voided_at) || String(fine?.reason || '').startsWith('[삭제됨]')
}

export function fineState(fine) {
  if (isFineVoided(fine)) return 'voided'
  if (fine.is_paid && Number(fine.amount || 0) === 0) return 'waived'
  if (fine.is_paid) return 'paid'
  return 'unpaid'
}

export const FINE_STATE_LABELS = { unpaid: '미납', paid: '납부', waived: '면제', voided: '취소' }

export function summarizeFines(fines) {
  const active = (fines || []).filter((fine) => !isFineVoided(fine))
  return {
    unpaidTotal: active.filter((fine) => !fine.is_paid).reduce((sum, fine) => sum + Number(fine.amount || 0), 0),
    paidTotal: active.filter((fine) => fine.is_paid && Number(fine.amount || 0) > 0).reduce((sum, fine) => sum + Number(fine.amount || 0), 0),
    unpaidCount: active.filter((fine) => !fine.is_paid && Number(fine.amount || 0) > 0).length,
    waivedCount: active.filter((fine) => fine.is_paid && Number(fine.amount || 0) === 0).length,
    voidedCount: (fines || []).length - active.length,
    activeCount: active.length,
  }
}

// 학기에 속한 기록인지: semester_id 우선, 없으면 학기 코드, 둘 다 없으면 운영 학기의 예전 기록으로 본다
export function inSemester(row, semester) {
  if (!semester) return false
  if (row.semester_id) return row.semester_id === semester.id
  if (row.semester) return String(row.semester).trim() === semester.code
  return semester.status === 'active'
}

// 학기별 결석 기준 (회칙)
export function absenceThresholds(semester) {
  const vacation = semester?.semester_type === 'vacation'
  const expectedSessions = (semester?.total_weeks || 0) * (vacation ? 2 : 1)
  return {
    unauthorized: vacation ? 3 : 4,
    expectedSessions,
    half: Math.ceil(expectedSessions / 2),
  }
}
