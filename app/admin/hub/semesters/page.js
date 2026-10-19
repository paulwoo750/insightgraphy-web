'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CalendarRange, Check, ChevronRight, FolderKanban, Plus, RefreshCw, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAdminContext, useAdminRole } from '@/app/admin/_components/AdminShell'
import {
  AdminPage,
  Button,
  EmptyState,
  ErrorState,
  Field,
  inputClass,
  LoadingState,
  Modal,
  Notice,
  PageHeader,
  Panel,
  ReadOnlyBanner,
  SaveStatus,
  StatusBadge,
  useAsyncAction,
  useToast,
  useUnsavedChanges,
} from '@/app/admin/_components/AdminUI'
import { saveSemesterSnapshots } from '@/lib/archive'
import { describeSaveError, fetchSemesterContext, formatKst } from '@/lib/semester'

const semesterStatus = {
  draft: { label: '준비', tone: 'gray' },
  active: { label: '운영 중', tone: 'green' },
  closed: { label: '종료', tone: 'blue' },
  archived: { label: '보관', tone: 'gray' },
}

const semesterTypes = {
  regular: '정규 학기',
  vacation: '방학 학기',
}

const blankSemester = {
  code: '',
  name: '',
  semester_type: 'regular',
  total_weeks: 12,
  starts_on: '',
  ends_on: '',
}

const FIELD_LABELS = { topic: '정규 주제', weekday_topic: '평일 주제', ot_topic: 'W0 주제' }

function weekStatusOf(weekNo, currentWeek, status) {
  if (status === 'cancelled') return 'cancelled'
  if (weekNo < currentWeek) return 'completed'
  if (weekNo === currentWeek) return 'current'
  return 'planned'
}

export default function SemesterManagerPage() {
  const adminContext = useAdminContext()
  const { role, canWrite } = useAdminRole()
  const toast = useToast()
  const [runAction, saving] = useAsyncAction()
  const [semesters, setSemesters] = useState([])
  const [listError, setListError] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [context, setContext] = useState(null)
  const [detailError, setDetailError] = useState('')
  const [draft, setDraft] = useState(null)
  const [baseDraft, setBaseDraft] = useState(null)
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState({ deadlines: {}, setups: {} })
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [saveState, setSaveState] = useState('clean')
  const [savedAt, setSavedAt] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [newSemester, setNewSemester] = useState(blankSemester)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    async function fetchSemesters() {
      const { data, error } = await supabase.from('semesters').select('*').order('created_at', { ascending: false })
      if (!active) return
      setListError(error ? error.message : '')
      const list = data || []
      setSemesters(list)
      setSelectedId((current) => current || adminContext?.semester?.id || list.find((item) => item.status === 'active')?.id || list[0]?.id || '')
      setLoading(false)
    }
    fetchSemesters()
    return () => {
      active = false
    }
  }, [adminContext?.semester?.id, reloadKey])

  // 선택한 학기의 주차·주제·마감·편성 집계
  useEffect(() => {
    let active = true
    async function fetchDetail() {
      const selected = semesters.find((item) => item.id === selectedId)
      if (!selected) return
      setDetailLoading(true)
      setDetailError('')
      const [nextContext, deadlineResult] = await Promise.all([
        fetchSemesterContext(selected),
        supabase.from('pr_deadlines').select('week, category').eq('semester_id', selected.id),
      ])
      if (!active) return
      if (nextContext.legacy.weeksError) setDetailError(`주차 기록을 읽지 못했습니다: ${nextContext.legacy.weeksError}`)
      setContext(nextContext)
      const loadedDraft = {
        ...selected,
        starts_on: selected.starts_on || '',
        ends_on: selected.ends_on || '',
        current_week_no: selected.current_week_no || 1,
      }
      setDraft(loadedDraft)
      setBaseDraft(loadedDraft)
      setRows(buildRows(nextContext, selected.total_weeks))
      const deadlineCounts = {}
      for (const row of deadlineResult.data || []) deadlineCounts[row.week] = (deadlineCounts[row.week] || 0) + 1
      const setupCounts = {}
      for (const [week, setup] of Object.entries(nextContext.weeklySetup || {})) {
        if (setup && Object.keys(setup).length > 0) setupCounts[week] = setup
      }
      setCounts({ deadlines: deadlineCounts, setups: setupCounts })
      setSaveState('clean')
      setDetailLoading(false)
    }
    fetchDetail()
    return () => {
      active = false
    }
  }, [selectedId, semesters])

  const changedCells = useMemo(() => rows.flatMap((row) => ['topic', 'weekday_topic'].filter((field) => row.editable.includes(field) && (row[field] || '').trim() !== (row.original[field] || '').trim()).map((field) => ({ row, field }))), [rows])
  const changedStatus = useMemo(() => rows.filter((row) => row.week_no > 0 && (row.status === 'cancelled') !== (row.original.status === 'cancelled')), [rows])
  const settingsChanged = Boolean(draft && baseDraft) && ['code', 'name', 'semester_type', 'total_weeks', 'current_week_no', 'starts_on', 'ends_on'].some((key) => String(draft[key] ?? '') !== String(baseDraft[key] ?? ''))
  // STEP 15 전의 저장 함수는 보내지 않은 주제를 비워 버리므로 그 전에는 저장을 막는다
  const saveReady = Boolean(context?.otColumnReady)
  const dirtyCount = changedCells.length + changedStatus.length + (settingsChanged ? 1 : 0)
  const dirty = dirtyCount > 0
  useUnsavedChanges(dirty)

  const conflicts = context?.legacy?.topicConflicts || []
  const missing = context?.legacy?.topicsMissing || []

  function setTotalWeeks(value) {
    const total = Math.max(1, Math.min(52, Number(value) || 1))
    const storedRows = rows.filter((row) => row.week_no > total && row.id)
    if (storedRows.length > 0) {
      toast.warning('기존 기록이 있는 주차보다 전체 주차를 줄일 수 없습니다. 해당 주차의 세션과 마감을 먼저 정리해야 합니다.')
      return
    }
    setDraft((current) => ({ ...current, total_weeks: total, current_week_no: Math.min(current.current_week_no || 1, total) }))
    setRows((current) => {
      const kept = current.filter((row) => row.week_no <= total)
      for (let week = kept.filter((row) => row.week_no > 0).length + 1; week <= total; week++) kept.push(blankRow(week))
      return kept
    })
  }

  function updateRow(weekNo, key, value) {
    setRows((current) => current.map((row) => row.week_no === weekNo ? { ...row, [key]: value } : row))
  }

  const reloadDetail = useCallback(() => {
    setSemesters((current) => [...current])
  }, [])

  async function saveSemester() {
    if (!draft || !canWrite) return
    if (!saveReady) {
      toast.error('STEP 15 SQL을 먼저 실행해야 저장할 수 있습니다. 적용 전 저장 함수는 바꾸지 않은 주제까지 비울 수 있습니다.')
      return
    }
    if (!draft.code.trim() || !draft.name.trim()) {
      toast.error('학기 코드와 이름을 입력해주세요.')
      return
    }
    await runAction(async () => {
      setSaveState('saving')
      const currentWeek = Math.max(1, Math.min(draft.total_weeks, Number(draft.current_week_no) || 1))
      // 상태는 모든 주차를 보내고, 주제는 바꾼 칸만 원래 값과 함께 보낸다 (다른 탭에서 바뀐 값을 덮지 않도록)
      const payload = rows.filter((row) => row.week_no <= Number(draft.total_weeks)).map((row) => {
        const item = { week_no: row.week_no }
        if (row.week_no > 0) item.status = row.status === 'cancelled' ? 'cancelled' : weekStatusOf(row.week_no, currentWeek)
        for (const { row: changed, field } of changedCells) {
          if (changed.week_no !== row.week_no) continue
          item[field] = (row[field] || '').trim()
          item[`expected_${field}`] = row.original[field] || ''
        }
        return item
      }).filter((item) => item.week_no > 0 || Object.hasOwn(item, 'topic'))

      const { data: saveData, error: saveError } = await supabase.rpc('admin_save_semester_configuration', {
        p_semester_id: draft.id,
        p_code: draft.code.trim(),
        p_name: draft.name.trim(),
        p_semester_type: draft.semester_type,
        p_total_weeks: Number(draft.total_weeks),
        p_current_week_no: currentWeek,
        p_starts_on: draft.starts_on || null,
        p_ends_on: draft.ends_on || null,
        p_weeks: payload,
      })
      const savedSemester = Array.isArray(saveData) ? saveData[0] : saveData
      if (saveError || !savedSemester?.id) {
        setSaveState('error')
        toast.error(describeSaveError(saveError || new Error('저장된 학기 정보를 확인할 수 없습니다.')), { title: '저장하지 못했습니다' })
        return
      }
      setSemesters((current) => current.map((item) => item.id === savedSemester.id ? savedSemester : item))
      if (savedSemester.status === 'active') adminContext?.setSemester(savedSemester)
      setSavedAt(formatKst(new Date(), { weekday: false }))
      setSaveState('clean')
      toast.success('학기와 주차 설정을 저장했습니다. 세션 및 제출·자료실·아카이브에 같은 주제가 표시됩니다.')
    })
  }

  async function activateSemester() {
    if (!draft || draft.status === 'active' || !canWrite) return
    if (dirty) {
      toast.warning('저장하지 않은 변경이 있습니다. 먼저 저장하거나 되돌린 뒤 전환하세요.')
      return
    }
    if (!confirm(`${draft.name}을 현재 운영 학기로 전환할까요?\n\n기존 운영 학기는 종료 상태가 되고 타임라인·주차 주제는 아카이브에 학기별로 보관됩니다. 일정·마감·조 편성은 학기별로 저장되어, 처음 운영하는 학기는 빈 상태로 시작합니다.`)) return
    await runAction(async () => {
      setSaveState('saving')
      const outgoing = semesters.find((item) => item.status === 'active')
      if (outgoing) {
        const { error: snapshotError } = await saveSemesterSnapshots(outgoing)
        if (snapshotError) {
          setSaveState('error')
          toast.error(`기존 학기 기록을 아카이브에 남기지 못해 전환하지 않았습니다: ${snapshotError.message}`)
          return
        }
      }
      const { data: activateData, error: activateError } = await supabase.rpc('admin_activate_semester', { p_semester_id: draft.id })
      const activated = Array.isArray(activateData) ? activateData[0] : activateData
      if (activateError || !activated?.id) {
        setSaveState('error')
        toast.error(describeSaveError(activateError || new Error('전환된 학기 정보를 확인할 수 없습니다.')), { title: '학기를 전환하지 못했습니다' })
        return
      }
      setSemesters((current) => current.map((item) => {
        if (item.id === activated.id) return activated
        if (item.status === 'active') return { ...item, status: 'closed' }
        return item
      }))
      adminContext?.setSemester(activated)
      setSaveState('clean')
      toast.success(`${activated.name}을 현재 운영 학기로 전환했습니다.`)
    })
  }

  async function createSemester(event) {
    event.preventDefault()
    await runAction(async () => {
      const { data: createData, error } = await supabase.rpc('admin_create_semester', {
        p_code: newSemester.code.trim(),
        p_name: newSemester.name.trim(),
        p_semester_type: newSemester.semester_type,
        p_total_weeks: Number(newSemester.total_weeks),
        p_starts_on: newSemester.starts_on || null,
        p_ends_on: newSemester.ends_on || null,
      })
      const data = Array.isArray(createData) ? createData[0] : createData
      if (error || !data?.id) {
        toast.error(describeSaveError(error || new Error('생성된 학기 정보를 확인할 수 없습니다.')), { title: '학기를 만들지 못했습니다' })
        return
      }
      setSemesters((current) => [data, ...current])
      setSelectedId(data.id)
      setCreateOpen(false)
      setNewSemester(blankSemester)
      toast.success('새 학기를 준비 상태로 만들었습니다.')
    })
  }

  function applyLegacy(item) {
    if (item.field === 'ot_topic') updateRow(0, 'topic', item.legacy)
    else updateRow(item.week, item.field, item.legacy)
    toast.info(`W${item.week} ${FIELD_LABELS[item.field]}에 예전 값을 넣었습니다. 저장해야 반영됩니다.`)
  }

  const currentWeek = Number(draft?.current_week_no) || 1

  return (
    <AdminPage>
      <PageHeader
        eyebrow="운영 기준"
        title="학기 및 주차"
        description="학기 정보와 주차별 주제·진행 상태를 관리합니다. 여기서 고친 주제는 세션 및 제출, 학회원 자료실·투표·아카이브에 같은 값으로 표시됩니다."
        actions={
          <>
            {draft && <SaveStatus state={saveState === 'saving' ? 'saving' : saveState === 'error' ? 'error' : dirty ? 'dirty' : 'clean'} dirtyCount={dirtyCount} savedAt={savedAt} />}
            <Button icon={Plus} onClick={() => setCreateOpen(true)} disabled={!canWrite}>새 학기</Button>
            <Button variant="primary" icon={Save} onClick={saveSemester} loading={saving} disabled={!draft || !dirty || !canWrite || !saveReady}>저장</Button>
          </>
        }
      />
      <ReadOnlyBanner role={role} />

      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Panel title="학기 목록" description={`${semesters.length}개 학기`} className="self-start">
          {loading ? <LoadingState /> : listError ? (
            <ErrorState description={listError} onRetry={() => setReloadKey((key) => key + 1)} />
          ) : semesters.length === 0 ? (
            <EmptyState title="등록된 학기가 없습니다." description="새 학기 버튼으로 첫 학기를 만드세요." />
          ) : (
            <div className="divide-y divide-slate-100">
              {semesters.map((item) => {
                const status = semesterStatus[item.status] || semesterStatus.draft
                const selected = selectedId === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (dirty && !confirm('저장하지 않은 변경이 있습니다. 다른 학기로 이동할까요?')) return
                      setSelectedId(item.id)
                    }}
                    aria-current={selected ? 'true' : undefined}
                    className={`flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-slate-50 ${selected ? 'bg-teal-50/70' : ''}`}
                  >
                    <CalendarRange className={`h-5 w-5 shrink-0 ${selected ? 'text-teal-700' : 'text-slate-400'}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{item.name}</p>
                      <div className="mt-1 flex items-center gap-2"><StatusBadge tone={status.tone}>{status.label}</StatusBadge><span className="text-xs text-slate-500">{item.total_weeks}주</span></div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  </button>
                )
              })}
            </div>
          )}
        </Panel>

        {!draft ? (
          <Panel>{loading || detailLoading ? <LoadingState /> : <EmptyState title="관리할 학기를 선택하세요." />}</Panel>
        ) : (
          <div className="min-w-0 space-y-5">
            {detailError && <Notice tone="danger" title="일부 정보를 불러오지 못했습니다">{detailError}</Notice>}
            {context?.legacy?.codeMismatch && (
              <Notice tone="warning" title="예전 설정의 현재 학기 값이 다릅니다">
                운영 학기는 {context.code}인데 예전 설정(pr_config.current_semester)은 {context.legacy.legacyCode}입니다. 이 화면에서 저장하면 운영 학기 값으로 맞춰집니다.
              </Notice>
            )}
            {(conflicts.length > 0 || missing.length > 0) && (
              <Panel title="예전 설정값과 다른 주제" description="학기별 주차 기록(원본)과 예전 설정(pr_config.week_topics)이 다른 칸입니다. 자동으로 덮어쓰지 않았습니다.">
                <div className="divide-y divide-slate-100">
                  {[...missing.map((item) => ({ ...item, kind: 'missing' })), ...conflicts.map((item) => ({ ...item, kind: 'conflict' }))].map((item) => (
                    <div key={`${item.kind}-${item.field}-${item.week}`} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                      <div className="min-w-0 text-sm">
                        <p className="font-bold text-slate-800">
                          W{item.week} {FIELD_LABELS[item.field]}
                          <StatusBadge tone={item.kind === 'conflict' ? 'amber' : 'blue'} className="ml-2">{item.kind === 'conflict' ? '값이 다름' : '원본 비어 있음'}</StatusBadge>
                        </p>
                        <p className="mt-1 break-keep text-slate-600">원본: <span className="font-semibold text-slate-900">{item.source || '(비어 있음)'}</span> · 예전 값: <span className="font-semibold text-slate-900">{item.legacy}</span></p>
                      </div>
                      <Button size="sm" disabled={!canWrite} onClick={() => applyLegacy(item)}>예전 값으로 채우기</Button>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            <Panel
              title="학기 기본 설정"
              description={`${semesterTypes[draft.semester_type]} · ${semesterStatus[draft.status]?.label || draft.status}`}
              action={draft.status !== 'active' && draft.status !== 'archived' ? <Button size="sm" onClick={activateSemester} disabled={saving || !canWrite}>현재 학기로 전환</Button> : null}
            >
              <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
                <Field label="학기 코드" htmlFor="semester-code"><input id="semester-code" value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} disabled={!canWrite} className={inputClass} /></Field>
                <Field label="표시 이름" htmlFor="semester-name"><input id="semester-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} disabled={!canWrite} className={inputClass} /></Field>
                <Field label="학기 유형" htmlFor="semester-type"><select id="semester-type" value={draft.semester_type} onChange={(event) => setDraft({ ...draft, semester_type: event.target.value })} disabled={!canWrite} className={inputClass}><option value="regular">정규 학기</option><option value="vacation">방학 학기</option></select></Field>
                <Field label="전체 주차" htmlFor="semester-weeks"><input id="semester-weeks" type="number" min="1" max="52" value={draft.total_weeks} onChange={(event) => setTotalWeeks(event.target.value)} disabled={!canWrite} className={inputClass} /></Field>
                <Field label="시작일" htmlFor="semester-start"><input id="semester-start" type="date" value={draft.starts_on} onChange={(event) => setDraft({ ...draft, starts_on: event.target.value })} disabled={!canWrite} className={inputClass} /></Field>
                <Field label="종료일" htmlFor="semester-end"><input id="semester-end" type="date" value={draft.ends_on} onChange={(event) => setDraft({ ...draft, ends_on: event.target.value })} disabled={!canWrite} className={inputClass} /></Field>
                <Field label="현재 주차" htmlFor="semester-current"><select id="semester-current" value={draft.current_week_no} onChange={(event) => setDraft({ ...draft, current_week_no: Number(event.target.value) })} disabled={!canWrite} className={inputClass}>{rows.filter((row) => row.week_no > 0).map((row) => <option key={row.week_no} value={row.week_no}>{row.week_no}주차</option>)}</select></Field>
              </div>
            </Panel>

            <Panel
              tour="semester-weeks"
              title="주차 구성"
              description="주제를 고친 칸만 저장됩니다. 마감·편성 수는 세션 및 제출 화면에서 저장한 값입니다."
              action={<Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => { if (!dirty || confirm('저장하지 않은 변경을 버리고 최신 값을 불러올까요?')) reloadDetail() }}>최신 값 불러오기</Button>}
            >
              {detailLoading ? <LoadingState /> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[880px] border-collapse text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-bold text-slate-600">
                      <tr className="border-b border-slate-200">
                        <th className="w-20 px-4 py-3">주차</th>
                        <th className="px-3 py-3">정규 주제</th>
                        <th className="px-3 py-3">평일 주제</th>
                        <th className="w-24 px-3 py-3">마감</th>
                        <th className="w-24 px-3 py-3">조 편성</th>
                        <th className="w-32 px-3 py-3">진행</th>
                        <th className="w-20 px-3 py-3"><span className="sr-only">세션 설정</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((row) => {
                        const status = row.week_no === 0 ? null : row.status === 'cancelled' ? 'cancelled' : weekStatusOf(row.week_no, currentWeek)
                        const topicChanged = (row.topic || '').trim() !== (row.original.topic || '').trim()
                        const weekdayChanged = (row.weekday_topic || '').trim() !== (row.original.weekday_topic || '').trim()
                        return (
                          <tr key={row.week_no} className={currentWeek === row.week_no ? 'bg-teal-50/60' : 'bg-white'}>
                            <td className="px-4 py-3 font-bold text-slate-900">{row.week_no === 0 ? 'W0 (OT)' : `${row.week_no}주차`}</td>
                            <td className="px-3 py-2">
                              <input aria-label={`${row.week_no}주차 정규 주제`} value={row.topic || ''} onChange={(event) => updateRow(row.week_no, 'topic', event.target.value)} placeholder={row.week_no === 0 ? 'OT 주제' : '주제 입력'} disabled={!canWrite || !row.editable.includes('topic')} className={`${inputClass} h-9 ${topicChanged ? 'border-amber-400 bg-amber-50/40' : ''}`} />
                            </td>
                            <td className="px-3 py-2">
                              {row.week_no === 0 ? <span className="text-xs text-slate-400">-</span> : (
                                <input aria-label={`${row.week_no}주차 평일 주제`} value={row.weekday_topic || ''} onChange={(event) => updateRow(row.week_no, 'weekday_topic', event.target.value)} placeholder={draft.semester_type === 'vacation' ? '평일 세션 주제' : '정규 학기는 비워 둡니다'} disabled={!canWrite} className={`${inputClass} h-9 ${weekdayChanged ? 'border-amber-400 bg-amber-50/40' : ''}`} />
                              )}
                            </td>
                            <td className="px-3 py-3 text-sm text-slate-600">{counts.deadlines[row.week_no] || 0}개</td>
                            <td className="px-3 py-3 text-sm text-slate-600">{counts.setups[row.week_no] ? <StatusBadge tone="teal">설정됨</StatusBadge> : <span className="text-slate-400">없음</span>}</td>
                            <td className="px-3 py-2">
                              {status && (
                                <select aria-label={`${row.week_no}주차 진행 상태`} value={row.status === 'cancelled' ? 'cancelled' : 'run'} onChange={(event) => updateRow(row.week_no, 'status', event.target.value === 'cancelled' ? 'cancelled' : 'planned')} disabled={!canWrite} className={`${inputClass} h-9 ${row.status === 'cancelled' ? 'border-red-300 text-red-700' : ''}`}>
                                  <option value="run">{status === 'current' ? '현재' : status === 'completed' ? '완료' : '예정'}</option>
                                  <option value="cancelled">취소(휴강)</option>
                                </select>
                              )}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <Link href={`/admin/hub/dashboard?semester=${draft.id}&week=${row.week_no}`} className="inline-flex items-center gap-1 text-sm font-bold text-teal-700 hover:text-teal-900" title={`${row.week_no}주차 세션 설정 열기`}>
                                <FolderKanban className="h-4 w-4" aria-hidden="true" />
                                <span className="sr-only">{row.week_no}주차</span>세션
                              </Link>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {!context?.otColumnReady && !detailLoading && (
                <p className="flex items-start gap-2 border-t border-slate-100 px-4 py-3 text-xs leading-5 text-amber-800 sm:px-5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  STEP 15 SQL이 아직 적용되지 않아 저장이 잠겨 있습니다. 적용 전 저장 함수는 바꾸지 않은 주제까지 비울 수 있어서입니다. SQL을 실행한 뒤 새로고침하세요.
                </p>
              )}
            </Panel>
          </div>
        )}
      </div>

      {createOpen && (
        <Modal
          title="새 학기 만들기"
          description="새 학기는 준비 상태로 만들어집니다. 현재 운영 학기는 바뀌지 않으며, 검토 후 따로 전환합니다."
          onClose={() => setCreateOpen(false)}
          footer={
            <>
              <Button onClick={() => setCreateOpen(false)}>취소</Button>
              <Button variant="primary" icon={Check} type="submit" form="new-semester-form" loading={saving}>만들기</Button>
            </>
          }
        >
          <form id="new-semester-form" onSubmit={createSemester} className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="학기 코드" required htmlFor="new-code" hint="예: 2027-1, 2026-겨울"><input id="new-code" required value={newSemester.code} onChange={(event) => setNewSemester({ ...newSemester, code: event.target.value })} placeholder="2027-1" className={inputClass} /></Field>
            <Field label="표시 이름" required htmlFor="new-name"><input id="new-name" required value={newSemester.name} onChange={(event) => setNewSemester({ ...newSemester, name: event.target.value })} placeholder="2027년 1학기" className={inputClass} /></Field>
            <Field label="학기 유형" htmlFor="new-type"><select id="new-type" value={newSemester.semester_type} onChange={(event) => setNewSemester({ ...newSemester, semester_type: event.target.value })} className={inputClass}><option value="regular">정규 학기</option><option value="vacation">방학 학기</option></select></Field>
            <Field label="전체 주차" htmlFor="new-weeks"><input id="new-weeks" type="number" min="1" max="52" value={newSemester.total_weeks} onChange={(event) => setNewSemester({ ...newSemester, total_weeks: Math.max(1, Math.min(52, Number(event.target.value) || 1)) })} className={inputClass} /></Field>
            <Field label="시작일" htmlFor="new-start"><input id="new-start" type="date" value={newSemester.starts_on} onChange={(event) => setNewSemester({ ...newSemester, starts_on: event.target.value })} className={inputClass} /></Field>
            <Field label="종료일" htmlFor="new-end"><input id="new-end" type="date" value={newSemester.ends_on} onChange={(event) => setNewSemester({ ...newSemester, ends_on: event.target.value })} className={inputClass} /></Field>
          </form>
        </Modal>
      )}
    </AdminPage>
  )
}

function blankRow(weekNo) {
  return { id: null, week_no: weekNo, topic: '', weekday_topic: '', status: 'planned', editable: ['topic', 'weekday_topic'], original: { topic: '', weekday_topic: '', status: 'planned' } }
}

// W0(OT) + 1..전체 주차. original은 화면을 열 때의 값으로, 저장 시 다른 탭의 변경을 감지하는 기준이다.
function buildRows(context, totalWeeks) {
  const rows = [{
    id: null,
    week_no: 0,
    topic: context.otTopic || '',
    weekday_topic: '',
    status: 'planned',
    editable: context.otColumnReady ? ['topic'] : [],
    original: { topic: context.otTopic || '', weekday_topic: '', status: 'planned' },
  }]
  for (let week = 1; week <= totalWeeks; week++) {
    const stored = context.weeks[week]
    if (!stored) {
      rows.push(blankRow(week))
      continue
    }
    rows.push({
      id: stored.id,
      week_no: week,
      topic: stored.topic || '',
      weekday_topic: stored.weekday_topic || '',
      status: stored.status,
      editable: ['topic', 'weekday_topic'],
      original: { topic: stored.topic || '', weekday_topic: stored.weekday_topic || '', status: stored.status },
    })
  }
  return rows
}
