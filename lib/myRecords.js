// 로그인한 학회원 본인의 출결·벌금·사유서 기록.
// auth.uid() → members.auth_user_id → member_id 기준으로 찾고, member_id가 비어 있는 예전 기록만
// 이름으로 보완한다 (동명이인이 있으면 이름 보완을 하지 않는다). 관리자 화면과 같은 계산 함수를 쓴다.
import { supabase } from '@/lib/supabase'
import { recordBelongsTo, uniqueNameSet, normalizeName } from '@/lib/memberRecords'

function nameFilter(name) {
  return `user_name.eq."${String(name).replace(/"/g, '')}"`
}

export async function fetchMyRecords({ member, session }) {
  const name = member?.name || session?.user?.user_metadata?.name || ''
  if (!member && !name) return { attendance: [], fines: [], absences: [], nameFallback: false, ambiguousName: false, error: null }
  const owner = member || { id: null, name }
  const orFilter = member ? `member_id.eq.${member.id},${nameFilter(name)}` : nameFilter(name)
  const [membersResult, attendanceResult, finesResult, absencesResult, semestersResult] = await Promise.all([
    supabase.from('members').select('id, name'),
    supabase.from('pr_attendance').select('*').or(orFilter).order('week', { ascending: false }),
    supabase.from('pr_fines').select('*').or(orFilter).order('week', { ascending: false }),
    supabase.from('absence_forms').select('id, week, session_type, type, status, target_date, created_at, semester_id, member_id, user_name, admin_comment').or(orFilter).order('created_at', { ascending: false }),
    supabase.from('semesters').select('id, code, name, status, semester_type, total_weeks'),
  ])
  const error = attendanceResult.error || finesResult.error || absencesResult.error
  const unique = uniqueNameSet(membersResult.data || [])
  const ambiguousName = Boolean(name) && !unique.has(normalizeName(name)) && (membersResult.data || []).length > 0
  const mine = (rows) => (rows || []).filter((row) => recordBelongsTo(row, owner, unique))
  const semesters = semestersResult.data || []
  const semesterOf = (row) => semesters.find((semester) => (row.semester_id && semester.id === row.semester_id) || (!row.semester_id && row.semester && semester.code === String(row.semester).trim())) || null
  const decorate = (rows) => rows.map((row) => ({ ...row, semesterRow: semesterOf(row) }))
  return {
    attendance: decorate(mine(attendanceResult.data)),
    fines: decorate(mine(finesResult.data)),
    absences: decorate(mine(absencesResult.data)),
    semesters,
    nameFallback: !member,
    ambiguousName,
    error,
  }
}
