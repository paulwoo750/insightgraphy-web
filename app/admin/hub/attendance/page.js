'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BadgeDollarSign, CalendarCheck2, ClipboardCheck, ReceiptText, RefreshCw, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { canRunAutomation } from '@/lib/permissions'
import {
  absenceThresholds,
  attendanceKind,
  FINE_STATE_LABELS,
  fineState,
  inSemester,
  isFineVoided,
  normalizeName,
  recordBelongsTo,
  summarizeAttendance,
  summarizeFines,
  uniqueNameSet,
} from '@/lib/memberRecords'
import { useAdminContext, useAdminRole } from '@/app/admin/_components/AdminShell'
import {
  AdminPage,
  Button,
  EmptyState,
  inputClass,
  LoadingState,
  Metric,
  Notice,
  PageHeader,
  Panel,
  ReadOnlyBanner,
  StatusBadge,
  useToast,
} from '@/app/admin/_components/AdminUI'

const attendanceOptions = [
  { value: '출석완료', label: '출석' },
  { value: '지각', label: '지각' },
  { value: '무단결석', label: '무단결석' },
  { value: '완전인정결석', label: '완전인정' },
  { value: '부분인정결석', label: '부분인정' },
]

function attendanceTone(status) {
  const kind = attendanceKind(status)
  if (kind === 'attended' || kind === 'full') return 'green'
  if (kind === 'late' || kind === 'partial') return 'amber'
  if (kind === 'unauthorized') return 'red'
  return 'gray'
}

export default function AttendanceDashboardPage() {
  const { semester: activeSemester } = useAdminContext() || {}
  const { role, canWrite } = useAdminRole()
  const toast = useToast()
  const automationAllowed = canRunAutomation(role)
  const [semesters, setSemesters] = useState([])
  const [semesterId, setSemesterId] = useState('')
  const [members, setMembers] = useState([])
  const [attendances, setAttendances] = useState([])
  const [absences, setAbsences] = useState([])
  const [fines, setFines] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [syncNote, setSyncNote] = useState(null)
  const [query, setQuery] = useState('')
  const [riskOnly, setRiskOnly] = useState(false)
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [savingKey, setSavingKey] = useState('')
  const [syncRevision, setSyncRevision] = useState(0)

  useEffect(() => {
    let active = true
    async function loadSemesters() {
      const { data, error } = await supabase
        .from('semesters')
        .select('id, code, name, semester_type, status, total_weeks, current_week_no')
        .order('created_at', { ascending: false })
      if (!active) return
      if (error) setLoadError(`학기 조회 실패: ${error.message}`)
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
      if (!selectedSemester || !role) return
      setLoading(true)
      setLoadError('')

      // 출석 마감이 지난 미기록 세션을 결석으로 채우는 자동 처리는 쓰기 가능한 역할만 실행한다
      const syncResult = automationAllowed
        ? await supabase.rpc('admin_sync_missing_attendance', { p_semester_id: semesterId })
        : { data: null, error: null, skipped: true }

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
      if (firstError) setLoadError(`출결 데이터를 불러오지 못했습니다: ${firstError.message}`)
      if (syncResult.skipped) setSyncNote({ tone: 'neutral', text: '열람자 계정이라 미기록 출결 자동 반영을 실행하지 않았습니다. 표시된 내용은 저장된 기록 그대로입니다.' })
      else if (syncResult.error) setSyncNote({ tone: 'danger', text: `미기록 출결 자동 반영 실패: ${syncResult.error.message}. Supabase STEP 13 적용 여부를 확인하세요.` })
      else if (Number(syncResult.data?.inserted_count || 0) > 0) setSyncNote({ tone: 'success', text: `출석 마감 후 미기록 ${syncResult.data.inserted_count}건을 결석으로 반영했습니다 (정규 ${syncResult.data.regular_count}건 · 평일 ${syncResult.data.weekday_count}건).` })
      else setSyncNote(null)

      const memberRows = (memberResult.data || []).map((member) => ({
        ...member,
        membership: (membershipResult.data || []).find((item) => item.member_id === member.id),
      }))
      setMembers(memberRows)
      setAttendances((attendanceResult.data || []).filter((row) => inSemester(row, selectedSemester)))
      setAbsences((absenceResult.data || []).filter((row) => row.semester_id ? row.semester_id === semesterId : selectedSemester.status === 'active'))
      setFines((fineResult.data || []).filter((row) => inSemester(row, selectedSemester)))
      setSelectedMemberId((current) => memberRows.some((member) => member.id === current) ? current : memberRows[0]?.id || '')
      setLoading(false)
    }
    loadDashboard()
    return () => { active = false }
  }, [semesterId, semesters, syncRevision, automationAllowed, role])

  const selectedSemester = semesters.find((item) => item.id === semesterId)
  const thresholds = useMemo(() => absenceThresholds(selectedSemester), [selectedSemester])
  const uniqueNames = useMemo(() => uniqueNameSet(members), [members])

  const memberSummaries = useMemo(() => members.map((member) => {
    const records = attendances.filter((item) => recordBelongsTo(item, member, uniqueNames))
    const memberFines = fines.filter((item) => recordBelongsTo(item, member, uniqueNames))
    const pendingAbsences = absences.filter((item) => recordBelongsTo(item, member, uniqueNames) && item.status === '대기').length
    const { counts, countedAbsences } = summarizeAttendance(records)
    const { unpaidTotal } = summarizeFines(memberFines)
    const atThreshold = counts.unauthorized >= thresholds.unauthorized || (thresholds.half > 0 && countedAbsences >= thresholds.half)
    const warning = !atThreshold && (counts.unauthorized >= Math.max(1, thresholds.unauthorized - 1) || (thresholds.half > 0 && countedAbsences >= Math.max(1, thresholds.half - 1)))
    return { ...member, records, counts, countedAbsences, unpaidFine: unpaidTotal, pendingAbsences, atThreshold, warning }
  }), [absences, attendances, fines, members, thresholds, uniqueNames])

  const filteredMembers = useMemo(() => {
    const keyword = normalizeName(query)
    return memberSummaries.filter((member) => {
      const matchesQuery = !keyword || normalizeName(`${member.name}${member.generation}${member.university}${member.department}`).includes(keyword)
      return matchesQuery && (!riskOnly || member.atThreshold || member.warning)
    })
  }, [memberSummaries, query, riskOnly])

  const selectedMember = memberSummaries.find((member) => member.id === selectedMemberId)
  const selectedFines = selectedMember ? fines.filter((item) => recordBelongsTo(item, selectedMember, uniqueNames)) : []
  const sessionTypes = selectedSemester?.semester_type === 'vacation'
    ? [{ value: 'regular', label: '정규' }, { value: 'weekday', label: '평일' }]
    : [{ value: 'regular', label: '정규' }]
  const weeks = Array.from({ length: selectedSemester?.total_weeks || 0 }, (_, index) => index + 1)

  function attendanceFor(member, week, sessionType) {
    return attendances.find((item) => Number(item.week) === week && (item.session_type || 'regular') === sessionType && recordBelongsTo(item, member, uniqueNames))
  }

  function absenceFor(member, week, sessionType) {
    return absences.find((item) => Number(item.week) === week && (item.session_type || 'regular') === sessionType && recordBelongsTo(item, member, uniqueNames))
  }

  async function updateAttendance(member, week, sessionType, status) {
    if (!selectedSemester || !canWrite || savingKey) return
    const key = `${member.id}-${week}-${sessionType}`
    setSavingKey(key)
    const { error } = await supabase.rpc('admin_set_attendance_status', {
      p_member_id: member.id,
      p_semester_id: selectedSemester.id,
      p_week: week,
      p_session_type: sessionType,
      p_status: status,
    })
    if (error) {
      toast.error(`${member.name}님 W${week} 출결을 저장하지 못했습니다: ${error.message}`)
      setSavingKey('')
      return
    }
    setAttendances((current) => {
      const existing = attendanceFor(member, week, sessionType)
      if (existing) return current.map((item) => item === existing ? { ...item, status, member_id: member.id, semester_id: selectedSemester.id, semester: selectedSemester.code } : item)
      return [...current, { id: `local-${key}`, user_name: member.name, member_id: member.id, semester_id: selectedSemester.id, semester: selectedSemester.code, week, session_type: sessionType, status }]
    })
    toast.success(`${member.name}님 W${week} ${sessionType === 'weekday' ? '평일' : '정규'} 출결을 '${status}'(으)로 저장했습니다.`)
    setSavingKey('')
  }

  async function toggleFinePaid(fine) {
    if (!canWrite || savingKey) return
    setSavingKey(`fine-${fine.id}`)
    const { error } = await supabase.from('pr_fines').update({ is_paid: !fine.is_paid }).eq('id', fine.id)
    setSavingKey('')
    if (error) {
      toast.error(`벌금 납부 상태를 바꾸지 못했습니다: ${error.message}`)
      return
    }
    setFines((current) => current.map((item) => item.id === fine.id ? { ...item, is_paid: !fine.is_paid } : item))
    toast.success(`${fine.is_paid ? '미납' : '납부'}으로 바꿨습니다.`)
  }

  const riskCount = memberSummaries.filter((member) => member.atThreshold).length
  const warningCount = memberSummaries.filter((member) => member.warning).length
  const unpaidTotal = memberSummaries.reduce((sum, member) => sum + member.unpaidFine, 0)
  const pendingAbsenceTotal = absences.filter((item) => item.status === '대기').length

  return (
    <AdminPage>
      <PageHeader
        eyebrow="학회원 시스템"
        title="출결 대시보드"
        description="사유서 결재 결과와 출결 기록을 연결하고, 회칙의 학기별 결석 기준에 따라 개인별 위험도를 확인합니다. 마이페이지와 같은 계산 규칙을 씁니다."
        actions={
          <>
            <Button icon={ClipboardCheck} href="/admin/hub/absence">사유서 결재</Button>
            <Button icon={RefreshCw} onClick={() => setSyncRevision((current) => current + 1)} loading={loading}>{automationAllowed ? '미기록 동기화' : '새로고침'}</Button>
            <Button variant="dark" icon={ReceiptText} href="/admin/hub/fine">벌금 상세 관리</Button>
          </>
        }
      />
      <ReadOnlyBanner role={role} />
      {loadError && <Notice tone="danger" className="mb-4">{loadError}</Notice>}
      {syncNote && <Notice tone={syncNote.tone} className="mb-4" onClose={() => setSyncNote(null)}>{syncNote.text}</Notice>}

      <div className="mb-5 flex flex-col gap-3 rounded-lg bg-teal-50/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold text-slate-500">회칙 적용 기준</p>
          <p className="mt-1 text-sm font-bold text-slate-950">
            {selectedSemester?.semester_type === 'vacation' ? '방학학기' : '정규학기'} · 무단결석 {thresholds.unauthorized}회 이상 또는 전체 {thresholds.expectedSessions}개 세션 중 {thresholds.half}회 이상 결석(무단+부분인정)
          </p>
        </div>
        <select aria-label="학기 선택" value={semesterId} onChange={(event) => setSemesterId(event.target.value)} className={`${inputClass} w-auto min-w-48`}>
          {semesters.map((semester) => <option key={semester.id} value={semester.id}>{semester.name}{semester.status === 'active' ? ' (운영 중)' : ''}</option>)}
        </select>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric icon={CalendarCheck2} label="관리 대상" value={`${memberSummaries.length}명`} note={`${selectedSemester?.total_weeks || 0}주 운영`} />
        <Metric icon={AlertTriangle} label="제명회의 기준 도달" value={`${riskCount}명`} note={`주의 단계 ${warningCount}명`} tone={riskCount ? 'red' : 'green'} />
        <Metric icon={ClipboardCheck} label="결재 대기 사유서" value={`${pendingAbsenceTotal}건`} note="사유서 결재함 연동" tone={pendingAbsenceTotal ? 'amber' : 'green'} />
        <Metric icon={BadgeDollarSign} label="전체 미납 벌금" value={`₩${unpaidTotal.toLocaleString()}`} note="취소된 벌금 제외" tone={unpaidTotal ? 'red' : 'green'} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(380px,.8fr)]">
        <Panel title="개인별 출결 현황" description="학회원을 고르면 오른쪽에서 주차별 기록을 고칠 수 있습니다.">
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input aria-label="학회원 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름, 기수, 학교 검색" className={`${inputClass} h-9 pl-9`} />
            </div>
            <label className="flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={riskOnly} onChange={(event) => setRiskOnly(event.target.checked)} className="h-4 w-4 accent-red-600" />
              위험·주의만
            </label>
          </div>
          {loading ? <LoadingState label="출결 데이터를 불러오는 중입니다." /> : filteredMembers.length === 0 ? (
            <EmptyState title="표시할 학회원이 없습니다." description="선택 학기의 참여 명단 또는 검색 조건을 확인하세요." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <thead className="bg-white text-xs font-bold text-slate-600">
                  <tr className="border-b border-slate-200"><th className="px-4 py-3">학회원</th><th className="px-3 py-3 text-center">출석</th><th className="px-3 py-3 text-center">지각</th><th className="px-3 py-3 text-center">무단결석</th><th className="px-3 py-3 text-center">전체 결석</th><th className="px-3 py-3 text-right">미납 벌금</th><th className="px-3 py-3">판정</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMembers.map((member) => (
                    <tr key={member.id} className={selectedMemberId === member.id ? 'bg-teal-50/70' : 'hover:bg-slate-50'}>
                      <td className="px-4 py-2.5">
                        <button type="button" onClick={() => setSelectedMemberId(member.id)} aria-pressed={selectedMemberId === member.id} className="text-left">
                          <span className="block font-bold text-slate-900 underline-offset-2 hover:underline">{member.name}</span>
                          <span className="block text-xs text-slate-500">{member.generation || '-'} · {member.membership?.participation_status || '-'}</span>
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-center font-bold text-emerald-700">{member.counts.attended + member.counts.full}</td>
                      <td className="px-3 py-2.5 text-center font-bold text-amber-700">{member.counts.late}</td>
                      <td className="px-3 py-2.5 text-center font-bold text-red-700">{member.counts.unauthorized}/{thresholds.unauthorized}</td>
                      <td className="px-3 py-2.5 text-center font-bold text-slate-700">{member.countedAbsences}/{thresholds.half}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-slate-800">₩{member.unpaidFine.toLocaleString()}</td>
                      <td className="px-3 py-2.5">{member.atThreshold ? <StatusBadge tone="red">기준 도달</StatusBadge> : member.warning ? <StatusBadge tone="amber">주의</StatusBadge> : <StatusBadge tone="green">정상</StatusBadge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="min-w-0 space-y-5">
          <Panel title={selectedMember ? `${selectedMember.name} 출결 기록` : '개인 출결 기록'} description="미기록 칸에서 상태를 고르면 새 출결 기록이 만들어집니다.">
            {!selectedMember ? <EmptyState title="학회원을 선택하세요." /> : (
              <div className="max-h-[560px] overflow-y-auto">
                <div className="grid border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600" style={{ gridTemplateColumns: `64px repeat(${sessionTypes.length}, minmax(0, 1fr))` }}>
                  <span>주차</span>{sessionTypes.map((type) => <span key={type.value}>{type.label} 세션</span>)}
                </div>
                <div className="divide-y divide-slate-100">
                  {weeks.map((week) => (
                    <div key={week} className="grid items-center gap-2 px-3 py-2.5" style={{ gridTemplateColumns: `64px repeat(${sessionTypes.length}, minmax(0, 1fr))` }}>
                      <span className="text-sm font-bold text-slate-600">W{week}</span>
                      {sessionTypes.map((type) => {
                        const record = attendanceFor(selectedMember, week, type.value)
                        const absence = absenceFor(selectedMember, week, type.value)
                        const key = `${selectedMember.id}-${week}-${type.value}`
                        const tone = attendanceTone(record?.status)
                        return (
                          <div key={type.value}>
                            <select aria-label={`W${week} ${type.label} 출결`} value={record?.status || ''} onChange={(event) => updateAttendance(selectedMember, week, type.value, event.target.value)} disabled={!canWrite || savingKey === key} className={`h-9 w-full rounded-md border px-2 text-sm font-semibold outline-none ${tone === 'red' ? 'border-red-200 bg-red-50 text-red-700' : tone === 'green' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-300 bg-white text-slate-500'}`}>
                              <option value="" disabled>미기록</option>
                              {attendanceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                            {absence && <p className="mt-1 truncate text-xs text-slate-500" title={absence.status}>사유서: {absence.status}</p>}
                            {record?.auto_marked_at && <p className="mt-1 truncate text-xs text-red-600">출석 마감 후 자동 반영</p>}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          <Panel title="개인 벌금" description="납부 여부를 바로 바꿀 수 있습니다. 취소된 벌금은 회색으로 보입니다." action={<Button size="sm" variant="ghost" href="/admin/hub/fine">상세 관리</Button>}>
            {!selectedMember || selectedFines.length === 0 ? <EmptyState title="등록된 벌금이 없습니다." /> : (
              <div className="divide-y divide-slate-100">
                {selectedFines.map((fine) => {
                  const state = fineState(fine)
                  return (
                    <div key={fine.id} className={`flex items-center gap-3 px-4 py-3 ${isFineVoided(fine) ? 'opacity-60' : ''}`}>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-800">W{fine.week} · {fine.category}</p><p className="mt-0.5 truncate text-xs text-slate-500">{fine.reason || '사유 없음'}</p></div>
                      <p className="shrink-0 text-sm font-bold text-slate-900">₩{Number(fine.amount || 0).toLocaleString()}</p>
                      {isFineVoided(fine) ? <StatusBadge tone="gray">{FINE_STATE_LABELS.voided}</StatusBadge> : (
                        <Button size="sm" variant={fine.is_paid ? 'secondary' : 'danger'} onClick={() => toggleFinePaid(fine)} disabled={!canWrite || Boolean(savingKey)} title="눌러서 납부 상태 바꾸기">
                          {FINE_STATE_LABELS[state]}
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </AdminPage>
  )
}
