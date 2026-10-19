'use client'
// 사유서: 주차별 제출 마감(세션 및 제출 화면과 같은 저장 경로)과 결재
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { describeSaveError, fetchCurrentSemester, formatKst, fromKstInput, groupDeadlines, parseJson, saveWeekPlan, toKstInput } from '@/lib/semester'
import { recordBelongsTo, uniqueNameSet } from '@/lib/memberRecords'
import { useAdminRole } from '@/app/admin/_components/AdminShell'
import {
  AdminPage,
  Button,
  EmptyState,
  ErrorState,
  Field,
  inputClass,
  LoadingState,
  Notice,
  PageHeader,
  Panel,
  ReadOnlyBanner,
  SaveStatus,
  SegmentedControl,
  StatusBadge,
  textareaClass,
  useAsyncAction,
  useToast,
  useUnsavedChanges,
} from '@/app/admin/_components/AdminUI'

function statusTone(status) {
  if (status === '대기') return 'amber'
  if (status?.includes('완전인정')) return 'green'
  if (status?.includes('부분인정')) return 'teal'
  return 'red'
}

export default function AbsenceAdmin() {
  const { role, canWrite } = useAdminRole()
  const toast = useToast()
  const [saveRun, saving] = useAsyncAction()
  const [state, setState] = useState({ status: 'loading', error: '' })
  const [semester, setSemester] = useState(null)
  const [absenceLateFine, setAbsenceLateFine] = useState(20000)
  const [baseDeadlines, setBaseDeadlines] = useState({})
  const [inputs, setInputs] = useState({})
  const [absences, setAbsences] = useState([])
  const [attendances, setAttendances] = useState([])
  const [members, setMembers] = useState([])
  const [dlTab, setDlTab] = useState('regular')
  const [sessionFilter, setSessionFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('pending')
  const [folder, setFolder] = useState('all')
  const [forms, setForms] = useState({})
  const [processingId, setProcessingId] = useState(null)
  const [failedWeeks, setFailedWeeks] = useState([])

  const load = useCallback(async () => {
    setState({ status: 'loading', error: '' })
    const current = await fetchCurrentSemester()
    const filter = current.id ? `semester_id.eq.${current.id},semester_id.is.null` : 'semester_id.is.null'
    const [dlResult, absResult, attResult, memberResult] = await Promise.all([
      supabase.from('pr_deadlines').select('week, category, deadline_time').or(filter).in('category', ['absence', 'weekday_absence']),
      supabase.from('absence_forms').select('*').or(filter).order('created_at', { ascending: false }),
      supabase.from('pr_attendance').select('*').eq('semester', current.code),
      supabase.from('members').select('id, name'),
    ])
    const error = dlResult.error || absResult.error || attResult.error
    if (error) {
      setState({ status: 'error', error: error.message })
      return
    }
    const penalties = parseJson(current.config.penalty_rules, {})
    if (penalties.absenceLate) setAbsenceLateFine(penalties.absenceLate)
    const grouped = groupDeadlines(dlResult.data)
    setSemester(current)
    setBaseDeadlines(grouped)
    setInputs(Object.fromEntries(Object.entries(grouped).map(([week, map]) => [week, Object.fromEntries(Object.entries(map).map(([category, iso]) => [category, toKstInput(iso)]))])))
    setAbsences(absResult.data || [])
    setAttendances(attResult.data || [])
    setMembers(memberResult.data || [])
    setState({ status: 'ready', error: '' })
  }, [])

  useEffect(() => {
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])

  const weeks = useMemo(() => Array.from({ length: (semester?.totalWeeks || 0) + 1 }, (_, index) => index), [semester])
  const uniqueNames = useMemo(() => uniqueNameSet(members), [members])
  const changedWeeks = weeks.filter((week) => ['absence', 'weekday_absence'].some((category) => (inputs[week]?.[category] || '') !== toKstInput(baseDeadlines[week]?.[category])))
  useUnsavedChanges(changedWeeks.length > 0)

  function setDeadline(week, category, value) {
    setInputs((current) => ({ ...current, [week]: { ...(current[week] || {}), [category]: value } }))
  }

  async function saveDeadlines() {
    if (!canWrite || changedWeeks.length === 0) return
    await saveRun(async () => {
      const saved = []
      const failed = []
      for (const week of changedWeeks) {
        const deadlines = {}
        const expected = {}
        for (const category of ['absence', 'weekday_absence']) {
          if ((inputs[week]?.[category] || '') === toKstInput(baseDeadlines[week]?.[category])) continue
          deadlines[category] = fromKstInput(inputs[week]?.[category])
          expected[category] = baseDeadlines[week]?.[category] || null
        }
        const { data, error } = await saveWeekPlan(semester.id, week, { deadlines, expected_deadlines: expected })
        if (error) failed.push({ week, message: describeSaveError(error) })
        else {
          saved.push(week)
          setBaseDeadlines((current) => ({ ...current, [week]: data.deadlines || {} }))
        }
      }
      setFailedWeeks(failed.map((item) => item.week))
      if (failed.length) {
        toast.error(failed.map((item) => `W${item.week}: ${item.message}`).join(' / '), { title: saved.length ? '일부 주차만 저장되었습니다' : '마감을 저장하지 못했습니다', duration: 0 })
      } else {
        toast.success(`W${saved.join(', W')} 사유서 마감을 저장했습니다. 세션 및 제출 화면에도 같은 값이 보입니다.`)
      }
    })
  }

  function updateForm(id, patch) {
    setForms((current) => ({ ...current, [id]: { ...(current[id] || {}), ...patch } }))
  }

  async function resolve(absence, decision) {
    if (!canWrite || processingId) return
    const form = forms[absence.id] || {}
    if (decision === 'partial' && form.hasTask && !form.task?.trim()) {
      toast.error('대체 과제 내용과 제출 기한을 입력하세요.')
      return
    }
    if (decision === 'reject' && !form.reject?.trim()) {
      toast.error('불허 사유를 입력하세요.')
      return
    }
    const label = decision === 'full' ? '완전 인정 (출석 인정·벌금 면제)' : decision === 'partial' ? '부분 인정 (결석·벌금 면제)' : `불허 (벌금 ₩${absenceLateFine.toLocaleString()} 부과)`
    if (!confirm(`${absence.user_name}님의 W${absence.week ?? '-'} 사유서를 '${label}'(으)로 결재할까요?\n출결과 벌금에 바로 반영됩니다.`)) return
    setProcessingId(absence.id)
    const { error } = await supabase.rpc('admin_resolve_absence', {
      p_absence_id: String(absence.id),
      p_decision: decision,
      p_comment: decision === 'reject' ? form.reject : '',
      p_has_makeup: Boolean(form.hasTask),
      p_makeup_detail: form.task || '',
      p_fine_amount: decision === 'reject' ? absenceLateFine : 0,
    })
    setProcessingId(null)
    if (error) {
      toast.error(`결재를 반영하지 못했습니다: ${error.message}`)
      return
    }
    toast.success(`${absence.user_name}님 사유서를 결재했습니다. 출결·벌금에 반영되었습니다.`)
    setForms((current) => ({ ...current, [absence.id]: {} }))
    await load()
  }

  if (state.status === 'loading') return <AdminPage><LoadingState /></AdminPage>
  if (state.status === 'error') return <AdminPage><ErrorState title="사유서를 불러오지 못했습니다." description={state.error} onRetry={load} /></AdminPage>

  const isVacation = semester.type === 'vacation'
  const category = dlTab === 'weekday' ? 'weekday_absence' : 'absence'
  const filtered = absences.filter((absence) => {
    if (sessionFilter !== 'all' && (absence.session_type || 'regular') !== sessionFilter) return false
    if (statusFilter === 'pending' && absence.status !== '대기') return false
    if (statusFilter === 'done' && absence.status === '대기') return false
    if (folder === 'all') return true
    if (folder === 'none') return absence.week === null || absence.week === undefined
    return absence.week === folder
  })
  const pendingCount = absences.filter((absence) => absence.status === '대기').length

  const memberOf = (absence) => members.find((member) => recordBelongsTo(absence, member, uniqueNames)) || { id: null, name: absence.user_name }
  const attendanceFor = (absence) => {
    const member = memberOf(absence)
    return attendances.find((item) => item.week === absence.week && (item.session_type || 'regular') === (absence.session_type || 'regular') && recordBelongsTo(item, member, uniqueNames))
  }
  const isLate = (absence) => {
    const due = baseDeadlines[absence.week]?.[absence.session_type === 'weekday' ? 'weekday_absence' : 'absence']
    return due ? new Date(absence.created_at) > new Date(due) : false
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="학회원 시스템"
        title="사유서"
        description="주차별 사유서 제출 마감을 정하고, 접수된 사유서를 결재합니다. 결재 결과는 출결과 벌금에 바로 반영됩니다."
        actions={<Button icon={ExternalLink} href="/admin/hub/attendance">출결 대시보드</Button>}
      />
      <ReadOnlyBanner role={role} />

      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Panel
          title="주차별 제출 마감"
          description="한국 시간 기준 · 세션 및 제출의 사유서 마감과 같은 값"
          className="self-start"
          action={<div className="flex items-center gap-2"><SaveStatus state={saving ? 'saving' : failedWeeks.length ? 'error' : changedWeeks.length ? 'dirty' : 'clean'} dirtyCount={changedWeeks.length} /><Button size="sm" variant="primary" icon={Save} onClick={saveDeadlines} loading={saving} disabled={!canWrite || changedWeeks.length === 0}>저장</Button></div>}
        >
          <div className="space-y-3 p-4">
            {isVacation && <SegmentedControl label="세션 종류" size="sm" value={dlTab} onChange={setDlTab} options={[{ value: 'regular', label: '정규 세션' }, { value: 'weekday', label: '평일 세션' }]} />}
            <p className="text-xs leading-5 text-slate-500">{dlTab === 'weekday' ? '회칙: 평일세션 불참 사유서는 세션 전주 일요일 자정까지 제출합니다.' : '회칙(제19조): 정규세션 사유서는 화요일 자정까지 제출합니다.'}</p>
            <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
              {weeks.map((week) => {
                const value = inputs[week]?.[category] || ''
                const changed = value !== toKstInput(baseDeadlines[week]?.[category])
                return (
                  <Field key={week} label={`W${week}${dlTab === 'weekday' ? ' 평일' : ''} 마감`} htmlFor={`absence-${category}-${week}`} hint={failedWeeks.includes(week) ? '저장 실패 — 다시 저장하세요' : value ? formatKst(fromKstInput(value)) : '설정 안 됨'}>
                    <div className="flex gap-1.5">
                      <input id={`absence-${category}-${week}`} type="datetime-local" value={value} onChange={(event) => setDeadline(week, category, event.target.value)} disabled={!canWrite} className={`${inputClass} ${changed ? 'border-amber-400 bg-amber-50/40' : ''}`} />
                      {value && canWrite && <Button size="sm" onClick={() => setDeadline(week, category, '')}>지우기</Button>}
                    </div>
                  </Field>
                )
              })}
            </div>
          </div>
        </Panel>

        <Panel title="사유서 결재함" description={`결재 대기 ${pendingCount}건 · 표시 ${filtered.length}건`}>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 p-3">
            <SegmentedControl label="결재 상태" size="sm" value={statusFilter} onChange={setStatusFilter} options={[{ value: 'pending', label: `대기 ${pendingCount}` }, { value: 'done', label: '처리됨' }, { value: 'all', label: '전체' }]} />
            {isVacation && <SegmentedControl label="세션 종류" size="sm" value={sessionFilter} onChange={setSessionFilter} options={[{ value: 'all', label: '전체' }, { value: 'regular', label: '정규' }, { value: 'weekday', label: '평일' }]} />}
            <select aria-label="주차로 거르기" value={String(folder)} onChange={(event) => setFolder(event.target.value === 'all' || event.target.value === 'none' ? event.target.value : Number(event.target.value))} className={`${inputClass} h-9 w-auto`}>
              <option value="all">모든 주차</option>
              {weeks.map((week) => <option key={week} value={week}>W{week}</option>)}
              <option value="none">주차 미지정 (예전 기록)</option>
            </select>
          </div>
          {filtered.length === 0 ? <EmptyState title="조건에 맞는 사유서가 없습니다." /> : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((absence) => {
                const form = forms[absence.id] || {}
                const attendance = attendanceFor(absence)
                const pending = absence.status === '대기'
                const exempt = absence.status?.includes('완전인정') || absence.status?.includes('부분인정')
                return (
                  <li key={absence.id} className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge tone={statusTone(absence.status)}>{pending ? '결재 대기' : absence.status}</StatusBadge>
                        <StatusBadge tone="gray">{absence.week != null ? `W${absence.week}` : '주차 미지정'}</StatusBadge>
                        {absence.session_type === 'weekday' && <StatusBadge tone="teal">평일세션</StatusBadge>}
                        <StatusBadge tone="dark">{absence.type}</StatusBadge>
                        {isLate(absence) && <StatusBadge tone="red">기한 초과 제출</StatusBadge>}
                      </div>
                      <p className="mt-2 text-sm font-bold text-slate-900">{absence.user_name} · 대상일 {absence.target_date} · 제출 {formatKst(absence.created_at)}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${attendance ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>출석 기록: {attendance ? attendance.status : '없음'}</span>
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${exempt ? 'bg-emerald-50 text-emerald-700' : absence.status?.includes('불허') ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>벌금: {exempt ? '결석 벌금 면제' : absence.status?.includes('불허') ? `₩${absenceLateFine.toLocaleString()} 부과` : '결재 전 (미적용)'}</span>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap break-keep text-sm leading-6 text-slate-700">{absence.reason}</p>
                      {absence.proof_url && <a href={absence.proof_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-teal-700 underline-offset-2 hover:underline"><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />증빙 자료 열기</a>}
                      {!pending && absence.admin_comment && <Notice tone="neutral" className="mt-3" title="운영진 코멘트">{absence.admin_comment}</Notice>}
                    </div>
                    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-bold text-slate-600">{pending ? '결재' : '결재 다시 하기'}</p>
                      <Button className="w-full" variant="primary" onClick={() => resolve(absence, 'full')} disabled={!canWrite || Boolean(processingId)} loading={processingId === absence.id}>완전 인정 (출석 인정)</Button>
                      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <input type="checkbox" checked={Boolean(form.hasTask)} onChange={(event) => updateForm(absence.id, { hasTask: event.target.checked })} disabled={!canWrite} className="h-4 w-4 accent-teal-700" />대체 과제 부여
                      </label>
                      {form.hasTask && <textarea aria-label="대체 과제 내용" value={form.task || ''} onChange={(event) => updateForm(absence.id, { task: event.target.value })} placeholder={'예) 1. 관련 아티클 3개 요약\n2. 다음 주 월요일 18:00까지 제출'} className={`${textareaClass} min-h-20`} disabled={!canWrite} />}
                      <Button className="w-full" onClick={() => resolve(absence, 'partial')} disabled={!canWrite || Boolean(processingId)}>부분 인정 (결석·벌금 면제)</Button>
                      <input aria-label="불허 사유" value={form.reject || ''} onChange={(event) => updateForm(absence.id, { reject: event.target.value })} placeholder="불허 사유" className={inputClass} disabled={!canWrite} />
                      <Button className="w-full" variant="danger" onClick={() => resolve(absence, 'reject')} disabled={!canWrite || Boolean(processingId)}>불허 (₩{absenceLateFine.toLocaleString()} 부과)</Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>
    </AdminPage>
  )
}
