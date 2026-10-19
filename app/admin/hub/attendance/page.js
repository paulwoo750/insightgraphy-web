'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  BadgeDollarSign,
  CalendarCheck2,
  ClipboardCheck,
  ReceiptText,
  RefreshCw,
  Search,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAdminContext } from '@/app/admin/_components/AdminShell'
import { AdminPage, EmptyState, PageHeader, Panel, StatusBadge } from '@/app/admin/_components/AdminUI'

const attendanceOptions = [
  { value: '출석완료', label: '출석' },
  { value: '지각', label: '지각' },
  { value: '무단결석', label: '무단결석' },
  { value: '완전인정결석', label: '완전인정' },
  { value: '부분인정결석', label: '부분인정' },
]

function normalizeName(value) {
  return String(value || '').replace(/\s+/g, '').toLocaleLowerCase('ko-KR')
}

function attendanceKind(status) {
  const value = String(status || '')
  if (value.includes('완전인정')) return 'full'
  if (value.includes('부분인정')) return 'partial'
  if (value.includes('무단') || value === '결석') return 'unauthorized'
  if (value.includes('지각')) return 'late'
  if (value.includes('출석')) return 'attended'
  return 'missing'
}

function attendanceTone(status) {
  const kind = attendanceKind(status)
  if (kind === 'attended' || kind === 'full') return 'green'
  if (kind === 'late' || kind === 'partial') return 'amber'
  if (kind === 'unauthorized') return 'red'
  return 'gray'
}

export default function AttendanceDashboardPage() {
  const { semester: activeSemester } = useAdminContext() || {}
  const [semesters, setSemesters] = useState([])
  const [semesterId, setSemesterId] = useState('')
  const [members, setMembers] = useState([])
  const [attendances, setAttendances] = useState([])
  const [absences, setAbsences] = useState([])
  const [fines, setFines] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [riskOnly, setRiskOnly] = useState(false)
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [savingKey, setSavingKey] = useState('')
  const [syncRevision, setSyncRevision] = useState(0)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true

    async function loadSemesters() {
      const { data, error } = await supabase
        .from('semesters')
        .select('id, code, name, semester_type, status, total_weeks, current_week_no')
        .order('created_at', { ascending: false })
      if (!active) return
      if (error) setMessage(`학기 조회 실패: ${error.message}`)
      const rows = data || []
      setSemesters(rows)
      setSemesterId((current) => current || activeSemester?.id || rows.find((item) => item.status === 'active')?.id || rows[0]?.id || '')
    }

    loadSemesters()
    return () => { active = false }
  }, [activeSemester?.id])

  useEffect(() => {
    let active = true

    async function loadDashboard() {
      const selectedSemester = semesters.find((item) => item.id === semesterId)
      if (!selectedSemester) return
      setLoading(true)
      setMessage('')

      const syncResult = await supabase.rpc('admin_sync_missing_attendance', {
        p_semester_id: semesterId,
      })

      const [membershipResult, attendanceResult, absenceResult, fineResult] = await Promise.all([
        supabase.from('semester_memberships').select('member_id, participation_status, role').eq('semester_id', semesterId).neq('participation_status', 'withdrawn'),
        supabase.from('pr_attendance').select('*'),
        supabase.from('absence_forms').select('*').order('created_at', { ascending: false }),
        supabase.from('pr_fines').select('*').order('created_at', { ascending: false }),
      ])

      const memberIds = (membershipResult.data || []).map((item) => item.member_id)
      const memberResult = memberIds.length > 0
        ? await supabase.from('members').select('id, name, generation, university, department, status').in('id', memberIds).order('name')
        : { data: [], error: null }

      if (!active) return
      const firstError = membershipResult.error || attendanceResult.error || absenceResult.error || fineResult.error || memberResult.error
      if (firstError) setMessage(`대시보드 조회 실패: ${firstError.message}`)
      else if (syncResult.error) setMessage(`미기록 출결 자동 반영 실패: ${syncResult.error.message}. Supabase STEP 10 실행 여부를 확인하세요.`)
      else if (Number(syncResult.data?.inserted_count || 0) > 0) {
        setMessage(`출석 마감 후 미기록 ${syncResult.data.inserted_count}건을 자동 반영했습니다. 정규 ${syncResult.data.regular_count}건 · 평일 ${syncResult.data.weekday_count}건`)
      }

      const inSelectedSemester = (row) => row.semester_id === semesterId
        || row.semester === selectedSemester.code
        || (selectedSemester.status === 'active' && !row.semester_id && !row.semester)

      const memberRows = (memberResult.data || []).map((member) => ({
        ...member,
        membership: (membershipResult.data || []).find((item) => item.member_id === member.id),
      }))
      setMembers(memberRows)
      setAttendances((attendanceResult.data || []).filter(inSelectedSemester))
      setAbsences((absenceResult.data || []).filter((row) => row.semester_id === semesterId || (selectedSemester.status === 'active' && !row.semester_id)))
      setFines((fineResult.data || []).filter(inSelectedSemester))
      setSelectedMemberId((current) => memberRows.some((member) => member.id === current) ? current : memberRows[0]?.id || '')
      setLoading(false)
    }

    loadDashboard()
    return () => { active = false }
  }, [semesterId, semesters, syncRevision])

  const selectedSemester = semesters.find((item) => item.id === semesterId)
  const unauthorizedThreshold = selectedSemester?.semester_type === 'vacation' ? 3 : 4
  const expectedSessions = (selectedSemester?.total_weeks || 0) * (selectedSemester?.semester_type === 'vacation' ? 2 : 1)
  const halfAbsenceThreshold = Math.ceil(expectedSessions / 2)

  const memberSummaries = useMemo(() => members.map((member) => {
    const memberName = normalizeName(member.name)
    const records = attendances.filter((item) => item.member_id === member.id || normalizeName(item.user_name) === memberName)
    const memberFines = fines.filter((item) => !item.voided_at && (item.member_id === member.id || normalizeName(item.user_name) === memberName))
    const pendingAbsences = absences.filter((item) => (item.member_id === member.id || normalizeName(item.user_name) === memberName) && item.status === '대기').length
    const counts = records.reduce((result, record) => {
      const kind = attendanceKind(record.status)
      result[kind] = (result[kind] || 0) + 1
      return result
    }, { attended: 0, late: 0, unauthorized: 0, full: 0, partial: 0, missing: 0 })
    const countedAbsences = counts.unauthorized + counts.partial
    const unpaidFine = memberFines.filter((fine) => !fine.is_paid).reduce((sum, fine) => sum + Number(fine.amount || 0), 0)
    const atThreshold = counts.unauthorized >= unauthorizedThreshold || (halfAbsenceThreshold > 0 && countedAbsences >= halfAbsenceThreshold)
    const warning = !atThreshold && (counts.unauthorized >= Math.max(1, unauthorizedThreshold - 1) || (halfAbsenceThreshold > 0 && countedAbsences >= Math.max(1, halfAbsenceThreshold - 1)))
    return { ...member, records, counts, countedAbsences, unpaidFine, pendingAbsences, atThreshold, warning }
  }), [absences, attendances, fines, halfAbsenceThreshold, members, unauthorizedThreshold])

  const filteredMembers = useMemo(() => {
    const keyword = normalizeName(query)
    return memberSummaries.filter((member) => {
      const matchesQuery = !keyword || normalizeName(`${member.name}${member.generation}${member.university}${member.department}`).includes(keyword)
      const matchesRisk = !riskOnly || member.atThreshold || member.warning
      return matchesQuery && matchesRisk
    })
  }, [memberSummaries, query, riskOnly])

  const selectedMember = memberSummaries.find((member) => member.id === selectedMemberId)
  const selectedFines = selectedMember
    ? fines.filter((item) => !item.voided_at && (item.member_id === selectedMember.id || normalizeName(item.user_name) === normalizeName(selectedMember.name)))
    : []
  const sessionTypes = selectedSemester?.semester_type === 'vacation'
    ? [{ value: 'regular', label: '정규' }, { value: 'weekday', label: '평일' }]
    : [{ value: 'regular', label: '정규' }]
  const weeks = Array.from({ length: selectedSemester?.total_weeks || 0 }, (_, index) => index + 1)

  function attendanceFor(member, week, sessionType) {
    if (!member) return null
    return attendances.find((item) =>
      Number(item.week) === week
      && (item.session_type || 'regular') === sessionType
      && (item.member_id === member.id || normalizeName(item.user_name) === normalizeName(member.name)))
  }

  function absenceFor(member, week, sessionType) {
    if (!member) return null
    return absences.find((item) =>
      Number(item.week) === week
      && (item.session_type || 'regular') === sessionType
      && (item.member_id === member.id || normalizeName(item.user_name) === normalizeName(member.name)))
  }

  async function updateAttendance(member, week, sessionType, status) {
    if (!selectedSemester) return
    const key = `${member.id}-${week}-${sessionType}`
    setSavingKey(key)
    setMessage('')
    const { error } = await supabase.rpc('admin_set_attendance_status', {
      p_member_id: member.id,
      p_semester_id: selectedSemester.id,
      p_week: week,
      p_session_type: sessionType,
      p_status: status,
    })

    if (error) {
      setMessage(`출결 저장 실패: ${error.message}. Supabase STEP 8 실행 여부를 확인하세요.`)
      setSavingKey('')
      return
    }

    setAttendances((current) => {
      const existing = attendanceFor(member, week, sessionType)
      if (existing) return current.map((item) => item === existing ? { ...item, status, member_id: member.id, semester_id: selectedSemester.id, semester: selectedSemester.code } : item)
      return [...current, {
        id: `local-${key}`,
        user_name: member.name,
        member_id: member.id,
        semester_id: selectedSemester.id,
        semester: selectedSemester.code,
        week,
        session_type: sessionType,
        status,
      }]
    })
    setMessage(`${member.name}님의 ${week}주차 ${sessionType === 'weekday' ? '평일' : '정규'} 출결을 저장했습니다.`)
    setSavingKey('')
  }

  async function toggleFinePaid(fine) {
    const { error } = await supabase.from('pr_fines').update({ is_paid: !fine.is_paid }).eq('id', fine.id)
    if (error) {
      setMessage(`벌금 상태 저장 실패: ${error.message}`)
      return
    }
    setFines((current) => current.map((item) => item.id === fine.id ? { ...item, is_paid: !fine.is_paid } : item))
  }

  const riskCount = memberSummaries.filter((member) => member.atThreshold).length
  const warningCount = memberSummaries.filter((member) => member.warning).length
  const unpaidTotal = memberSummaries.reduce((sum, member) => sum + member.unpaidFine, 0)
  const pendingAbsenceTotal = absences.filter((item) => item.status === '대기').length

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Attendance Operations"
        title="출결·벌금 대시보드"
        description="사유서 결재 결과와 출결 기록을 연결하고, 회칙의 학기별 결석 기준에 따라 개인별 위험도를 확인합니다."
        actions={
          <>
            <Link href="/admin/hub/absence" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"><ClipboardCheck className="h-4 w-4" aria-hidden="true" />사유서 결재</Link>
            <button type="button" onClick={() => setSyncRevision((current) => current + 1)} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-teal-200 bg-teal-50 px-3 text-xs font-bold text-teal-800 hover:bg-teal-100 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />미기록 동기화</button>
            <Link href="/admin/hub/fine" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-slate-900 px-3 text-xs font-bold text-white hover:bg-slate-800"><ReceiptText className="h-4 w-4" aria-hidden="true" />벌금 상세 관리</Link>
          </>
        }
      />

      {message && <div className={`mb-4 rounded-md border px-4 py-3 text-sm font-semibold ${message.includes('실패') ? 'border-red-200 bg-red-50 text-red-700' : 'border-teal-200 bg-teal-50 text-teal-800'}`}>{message}</div>}

      <div className="mb-5 flex flex-col gap-3 border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold text-slate-500">회칙 적용 기준</p>
          <p className="mt-1 text-sm font-bold text-slate-950">
            {selectedSemester?.semester_type === 'vacation' ? '방학학기' : '정규학기'} · 무단결석 {unauthorizedThreshold}회 이상 또는 전체 {expectedSessions}개 세션 중 {halfAbsenceThreshold}회 이상 결석
          </p>
        </div>
        <select value={semesterId} onChange={(event) => setSemesterId(event.target.value)} className="h-10 min-w-48 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-teal-700">
          {semesters.map((semester) => <option key={semester.id} value={semester.id}>{semester.name}</option>)}
        </select>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric icon={CalendarCheck2} label="관리 대상" value={`${memberSummaries.length}명`} note={`${selectedSemester?.total_weeks || 0}주 운영`} />
        <Metric icon={AlertTriangle} label="제명회의 기준 도달" value={`${riskCount}명`} note={`주의 단계 ${warningCount}명`} tone={riskCount ? 'red' : 'green'} />
        <Metric icon={ClipboardCheck} label="결재 대기 사유서" value={`${pendingAbsenceTotal}건`} note="사유서 결재함 연동" tone={pendingAbsenceTotal ? 'amber' : 'green'} />
        <Metric icon={BadgeDollarSign} label="전체 미납 벌금" value={`₩${unpaidTotal.toLocaleString()}`} note="취소되지 않은 벌금 기준" tone={unpaidTotal ? 'red' : 'green'} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(380px,.8fr)]">
        <Panel title="개인별 출결 현황" description="행을 선택하면 우측에서 주차별 기록을 수정할 수 있습니다.">
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
              <span className="sr-only">학회원 검색</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름, 기수, 학교 검색" className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-teal-700" />
            </label>
            <label className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600">
              <input type="checkbox" checked={riskOnly} onChange={(event) => setRiskOnly(event.target.checked)} className="accent-red-600" />
              위험·주의만
            </label>
          </div>

          {loading ? (
            <div className="px-5 py-12 text-center text-sm font-semibold text-slate-400">출결 데이터를 불러오는 중입니다.</div>
          ) : filteredMembers.length === 0 ? (
            <EmptyState title="표시할 학회원이 없습니다." description="선택 학기의 참여 명단 또는 검색 조건을 확인하세요." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left">
                <thead className="bg-white text-[11px] font-bold text-slate-500">
                  <tr className="border-b border-slate-200"><th className="px-4 py-3">학회원</th><th className="px-3 py-3 text-center">출석</th><th className="px-3 py-3 text-center">지각</th><th className="px-3 py-3 text-center">무단결석</th><th className="px-3 py-3 text-center">전체 결석</th><th className="px-3 py-3 text-right">미납 벌금</th><th className="px-3 py-3">판정</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMembers.map((member) => (
                    <tr key={member.id} onClick={() => setSelectedMemberId(member.id)} className={`cursor-pointer hover:bg-slate-50 ${selectedMemberId === member.id ? 'bg-teal-50/70' : ''}`}>
                      <td className="px-4 py-3"><p className="text-sm font-bold text-slate-900">{member.name}</p><p className="text-[11px] text-slate-400">{member.generation || '-'} · {member.membership?.participation_status || '-'}</p></td>
                      <td className="px-3 py-3 text-center text-sm font-bold text-emerald-700">{member.counts.attended + member.counts.full}</td>
                      <td className="px-3 py-3 text-center text-sm font-bold text-amber-700">{member.counts.late}</td>
                      <td className="px-3 py-3 text-center text-sm font-bold text-red-700">{member.counts.unauthorized}/{unauthorizedThreshold}</td>
                      <td className="px-3 py-3 text-center text-sm font-bold text-slate-700">{member.countedAbsences}/{halfAbsenceThreshold}</td>
                      <td className="px-3 py-3 text-right text-sm font-bold text-slate-800">₩{member.unpaidFine.toLocaleString()}</td>
                      <td className="px-3 py-3">{member.atThreshold ? <StatusBadge tone="red">기준 도달</StatusBadge> : member.warning ? <StatusBadge tone="amber">주의</StatusBadge> : <StatusBadge tone="green">정상</StatusBadge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel title={selectedMember ? `${selectedMember.name} 출결 기록` : '개인 출결 기록'} description="미기록 항목에서 상태를 선택하면 새 출결 기록이 생성됩니다.">
            {!selectedMember ? (
              <EmptyState title="학회원을 선택하세요." />
            ) : (
              <div className="max-h-[560px] overflow-y-auto">
                <div className="grid grid-cols-[64px_repeat(2,minmax(0,1fr))] border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-bold text-slate-500" style={{ gridTemplateColumns: `64px repeat(${sessionTypes.length}, minmax(0, 1fr))` }}>
                  <span>주차</span>{sessionTypes.map((type) => <span key={type.value}>{type.label} 세션</span>)}
                </div>
                <div className="divide-y divide-slate-100">
                  {weeks.map((week) => (
                    <div key={week} className="grid items-center gap-2 px-3 py-3" style={{ gridTemplateColumns: `64px repeat(${sessionTypes.length}, minmax(0, 1fr))` }}>
                      <span className="text-xs font-bold text-slate-500">W{week}</span>
                      {sessionTypes.map((type) => {
                        const record = attendanceFor(selectedMember, week, type.value)
                        const absence = absenceFor(selectedMember, week, type.value)
                        const key = `${selectedMember.id}-${week}-${type.value}`
                        return (
                          <div key={type.value}>
                            <select value={record?.status || ''} onChange={(event) => updateAttendance(selectedMember, week, type.value, event.target.value)} disabled={savingKey === key} className={`h-9 w-full rounded-md border px-2 text-xs font-bold outline-none ${attendanceTone(record?.status) === 'red' ? 'border-red-200 bg-red-50 text-red-700' : attendanceTone(record?.status) === 'green' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : attendanceTone(record?.status) === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-500'}`}>
                              <option value="" disabled>미기록</option>
                              {attendanceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                            {absence && <p className="mt-1 truncate text-[9px] font-semibold text-slate-400" title={absence.status}>사유서: {absence.status}</p>}
                            {record?.auto_marked_at && <p className="mt-1 truncate text-[9px] font-semibold text-red-500">출석 마감 후 자동 반영</p>}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          <Panel title="개인 벌금" description="납부 여부를 바로 변경할 수 있습니다." action={<Link href="/admin/hub/fine" className="text-xs font-bold text-teal-700">상세 관리</Link>}>
            {!selectedMember || selectedFines.length === 0 ? (
              <EmptyState title="등록된 벌금이 없습니다." />
            ) : (
              <div className="divide-y divide-slate-100">
                {selectedFines.map((fine) => (
                  <div key={fine.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-800">W{fine.week} · {fine.category}</p><p className="mt-0.5 truncate text-[10px] text-slate-400">{fine.reason || '사유 없음'}</p></div>
                    <p className="shrink-0 text-sm font-bold text-slate-900">₩{Number(fine.amount || 0).toLocaleString()}</p>
                    <button type="button" onClick={() => toggleFinePaid(fine)} className={`min-h-8 rounded-md px-2.5 text-[10px] font-bold ${fine.is_paid ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{fine.is_paid ? '납부 완료' : '미납'}</button>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </AdminPage>
  )
}

function Metric({ icon: Icon, label, value, note, tone = 'gray' }) {
  const tones = {
    gray: 'border-t-slate-300 text-slate-600',
    green: 'border-t-emerald-600 text-emerald-700',
    amber: 'border-t-amber-500 text-amber-700',
    red: 'border-t-red-600 text-red-700',
  }
  return (
    <div className={`rounded-md border border-slate-200 border-t-[3px] bg-white p-4 ${tones[tone] || tones.gray}`}>
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Icon className="h-4 w-4" aria-hidden="true" />{label}</div>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-[10px] text-slate-400">{note}</p>
    </div>
  )
}
