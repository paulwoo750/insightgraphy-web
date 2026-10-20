'use client'
// 세션 및 제출 관리자.
// 학기·주차·정규/평일을 먼저 고르고, 그 주차의 설정을 탭으로 나눠 편집한다.
// 주제·조 편성·마감·장소 즐겨찾기는 saveWeekPlan(admin_save_week_plan) 하나로 저장한다.
// 화면을 연 뒤 다른 곳에서 바뀐 값은 덮어쓰지 않고(기준값 비교), 일부 주차 저장이 실패하면 성공으로 표시하지 않는다.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, ExternalLink, RefreshCw, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  currentSemesterIdFilter,
  describeSaveError,
  fetchSemesterContext,
  fetchSemesterMembers,
  formatKst,
  groupDeadlines,
  parseJson,
  sameJson,
  saveWeekPlan,
  weekFromParam,
  weekTopicsFromRows,
} from '@/lib/semester'
import { useSiteUrls } from '@/lib/siteUrls'
import { useAdminContext, useAdminRole } from '@/app/admin/_components/AdminShell'
import {
  AdminPage,
  Button,
  ErrorState,
  LoadingState,
  Notice,
  PageHeader,
  ReadOnlyBanner,
  SaveStatus,
  Tabs,
  useAsyncAction,
  useToast,
  useUnsavedChanges,
} from '@/app/admin/_components/AdminUI'
import { buildRoster, deadlinesToInputs, inputsToIso, readSetup, setupWarnings, submissionStatus, SUBMISSION_TYPES, summarizeAssignments, TABS, validateWeek } from '../_lib'
import WeekPicker from './WeekPicker'
import WeekSummary from './WeekSummary'
import OverviewTab from './OverviewTab'
import AttendanceTab from './AttendanceTab'
import DeadlinesTab from './DeadlinesTab'
import GroupsTab from './GroupsTab'
import SubmissionsTab from './SubmissionsTab'

async function fetchRoster(semesterId) {
  const { data, error } = await supabase
    .from('semester_memberships')
    .select('member_id, participation_status, role, members(id, name, generation, university, status)')
    .eq('semester_id', semesterId)
  if (error) return { members: [], error }
  const members = (data || [])
    .filter((row) => ['active', 'completed'].includes(row.participation_status) && row.members)
    .map((row) => ({ ...row.members, semesterRole: row.role }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  return { members, error: null }
}

export default function SessionManager() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const adminContext = useAdminContext()
  const { role, canWrite } = useAdminRole()
  const toast = useToast()
  const site = useSiteUrls()
  const [runSave, saving] = useAsyncAction()

  const [semesterList, setSemesterList] = useState([])
  const [ctx, setCtx] = useState(null)
  const [load, setLoad] = useState({ status: 'loading', error: '', reloadKey: 0 })
  const [members, setMembers] = useState([])
  const [rosterNote, setRosterNote] = useState('')
  const [schedules, setSchedules] = useState([])
  const [baseDeadlines, setBaseDeadlines] = useState({})
  const [baseFavorites, setBaseFavorites] = useState([])
  const [files, setFiles] = useState([])
  const [filesError, setFilesError] = useState('')
  const [drafts, setDrafts] = useState({})
  const [favoritesDraft, setFavoritesDraft] = useState(null)
  const [validation, setValidation] = useState([])
  const [weekErrors, setWeekErrors] = useState({})
  const [saveResult, setSaveResult] = useState({ state: 'clean', savedAt: '' })

  const requestedSemester = searchParams.get('semester') || ''
  const activeSemesterId = adminContext?.semester?.id || ''
  const semesterId = requestedSemester || activeSemesterId

  // ---------------------------------------------------------------- 불러오기
  useEffect(() => {
    let active = true
    async function loadAll() {
      setLoad((current) => ({ ...current, status: 'loading', error: '' }))
      const { data: list, error: listError } = await supabase.from('semesters').select('*').order('created_at', { ascending: false })
      if (!active) return
      if (listError) {
        setLoad((current) => ({ ...current, status: 'error', error: listError.message }))
        return
      }
      const rows = list || []
      setSemesterList(rows)
      const target = rows.find((item) => item.id === semesterId) || rows.find((item) => item.status === 'active') || rows[0]
      if (!target) {
        setLoad((current) => ({ ...current, status: 'empty' }))
        return
      }
      const isActive = target.status === 'active'
      const [context, roster, deadlineResult, scheduleResult, favoritesResult, fileResult] = await Promise.all([
        fetchSemesterContext(target),
        fetchRoster(target.id),
        supabase.from('pr_deadlines').select('week, category, deadline_time').eq('semester_id', target.id),
        isActive
          ? supabase.from('pr_schedules').select('*').or(currentSemesterIdFilter(target)).order('full_date')
          : supabase.from('pr_schedules').select('*').eq('semester_id', target.id).order('full_date'),
        supabase.from('pr_config').select('value').eq('key', 'favorite_locations').maybeSingle(),
        supabase.from('files_metadata').select('*').eq('semester', target.code).order('created_at', { ascending: false }),
      ])
      if (!active) return
      const firstError = deadlineResult.error || scheduleResult.error || favoritesResult.error
      if (firstError) {
        setLoad((current) => ({ ...current, status: 'error', error: firstError.message }))
        return
      }
      let roll = roster.members
      let note = ''
      if (roster.error) note = `학기 명단을 읽지 못했습니다: ${roster.error.message}`
      if (!roster.error && roll.length === 0) {
        roll = isActive ? await fetchSemesterMembers(null, 'id, name, generation, university, status') : []
        note = isActive ? '이 학기 참여 명단이 비어 있어 활동 학회원 전체를 대상으로 보여 줍니다. 학회원 화면에서 학기 명단을 편성하세요.' : '이 학기 참여 명단이 없습니다.'
      }
      setCtx(context)
      setMembers(roll)
      setRosterNote(note)
      setSchedules(scheduleResult.data || [])
      setBaseDeadlines(groupDeadlines(deadlineResult.data))
      setBaseFavorites(parseJson(favoritesResult.data?.value, []))
      setFiles(fileResult.data || [])
      setFilesError(fileResult.error?.message || '')
      setLoad((current) => ({ ...current, status: 'ready' }))
    }
    loadAll()
    return () => {
      active = false
    }
  }, [semesterId, load.reloadKey])

  // ---------------------------------------------------------------- 주소 문맥
  const totalWeeks = ctx?.totalWeeks || 0
  const week = ctx ? weekFromParam(searchParams.get('week'), totalWeeks, Math.min(ctx.currentWeek, totalWeeks)) : 0
  const isVacation = ctx?.type === 'vacation'
  const mode = isVacation && searchParams.get('session') === 'weekday' ? 'weekday' : 'regular'
  const tab = TABS.some((item) => item.key === searchParams.get('tab')) ? searchParams.get('tab') : 'overview'

  const setParams = useCallback((patch) => {
    const next = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined || value === '') next.delete(key)
      else next.set(key, String(value))
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false })
  }, [pathname, router, searchParams])

  // ---------------------------------------------------------------- 기준값·편집값
  const baseOf = useCallback((weekNo) => ({
    topic: weekNo === 0 ? ctx?.otTopic || '' : ctx?.weeks?.[weekNo]?.topic || '',
    weekday_topic: ctx?.weeks?.[weekNo]?.weekday_topic || '',
    setup: ctx?.weeklySetup?.[weekNo] ?? null,
    deadlines: deadlinesToInputs(baseDeadlines[weekNo] || {}),
  }), [ctx, baseDeadlines])

  const effectiveOf = useCallback((weekNo) => {
    const base = baseOf(weekNo)
    const draft = drafts[weekNo] || {}
    return {
      topic: draft.topic ?? base.topic,
      weekday_topic: draft.weekday_topic ?? base.weekday_topic,
      setup: draft.setup !== undefined ? draft.setup : base.setup,
      deadlines: { ...base.deadlines, ...(draft.deadlines || {}) },
    }
  }, [baseOf, drafts])

  const changesOf = useCallback((weekNo) => {
    const draft = drafts[weekNo]
    if (!draft) return []
    const base = baseOf(weekNo)
    const list = []
    if (draft.topic !== undefined && draft.topic.trim() !== base.topic.trim()) list.push('topic')
    if (draft.weekday_topic !== undefined && draft.weekday_topic.trim() !== base.weekday_topic.trim()) list.push('weekday_topic')
    if (draft.setup !== undefined && !sameJson(draft.setup, base.setup)) list.push('setup')
    for (const [category, value] of Object.entries(draft.deadlines || {})) {
      if ((value || '') !== (base.deadlines[category] || '')) list.push(`deadline:${category}`)
    }
    return list
  }, [drafts, baseOf])

  const favorites = favoritesDraft ?? baseFavorites
  const favoritesDirty = favoritesDraft !== null && !sameJson(favoritesDraft, baseFavorites)
  const dirtyWeeks = useMemo(() => Object.keys(drafts).map(Number).filter((weekNo) => changesOf(weekNo).length > 0).sort((a, b) => a - b), [drafts, changesOf])
  const dirtyCount = dirtyWeeks.reduce((sum, weekNo) => sum + changesOf(weekNo).length, 0) + (favoritesDirty ? 1 : 0)
  const dirty = dirtyCount > 0
  useUnsavedChanges(dirty)

  const current = ctx ? effectiveOf(week) : null
  const currentChanges = ctx ? changesOf(week) : []

  function patchDraft(weekNo, patch) {
    setDrafts((all) => ({ ...all, [weekNo]: { ...(all[weekNo] || {}), ...patch } }))
    setSaveResult((result) => result.state === 'error' ? result : { ...result, state: 'clean' })
  }

  function setTopic(field, value) {
    patchDraft(week, { [field]: value })
  }

  function updateSetup(updater) {
    const base = baseOf(week)
    setDrafts((all) => {
      const draft = all[week] || {}
      const currentSetup = draft.setup !== undefined ? draft.setup : base.setup
      return { ...all, [week]: { ...draft, setup: updater({ ...(currentSetup || {}) }) } }
    })
  }

  function setDeadline(category, value) {
    setDrafts((all) => {
      const draft = all[week] || {}
      return { ...all, [week]: { ...draft, deadlines: { ...(draft.deadlines || {}), [category]: value } } }
    })
  }

  function discardWeek(weekNo) {
    setDrafts((all) => {
      const next = { ...all }
      delete next[weekNo]
      return next
    })
    setWeekErrors((errors) => ({ ...errors, [weekNo]: undefined }))
  }

  // ---------------------------------------------------------------- 저장
  function buildPlan(weekNo, includeFavorites) {
    const base = baseOf(weekNo)
    const draft = drafts[weekNo] || {}
    const changes = changesOf(weekNo)
    const plan = {}
    if (changes.includes('topic')) {
      plan.topic = draft.topic.trim()
      plan.expected_topic = base.topic
    }
    if (changes.includes('weekday_topic')) {
      plan.weekday_topic = draft.weekday_topic.trim()
      plan.expected_weekday_topic = base.weekday_topic
    }
    if (changes.includes('setup')) {
      plan.setup = draft.setup && Object.keys(draft.setup).length > 0 ? draft.setup : null
      plan.expected_setup = base.setup
    }
    const deadlineChanges = changes.filter((item) => item.startsWith('deadline:')).map((item) => item.slice('deadline:'.length))
    if (deadlineChanges.length > 0) {
      const values = inputsToIso(Object.fromEntries(deadlineChanges.map((category) => [category, draft.deadlines[category]])))
      plan.deadlines = values
      plan.expected_deadlines = Object.fromEntries(deadlineChanges.map((category) => [category, baseDeadlines[weekNo]?.[category] || null]))
    }
    if (includeFavorites) {
      plan.favorite_locations = favoritesDraft
      plan.expected_favorite_locations = baseFavorites
    }
    return plan
  }

  function applySaved(weekNo, data) {
    setCtx((context) => {
      const weeks = { ...context.weeks, [weekNo]: { ...(context.weeks[weekNo] || {}), week_no: weekNo, topic: data.topic, weekday_topic: data.weekday_topic } }
      const weeklySetup = { ...context.weeklySetup }
      if (data.setup) weeklySetup[weekNo] = data.setup
      else delete weeklySetup[weekNo]
      const otTopic = weekNo === 0 ? data.topic || '' : context.otTopic
      return { ...context, weeks: weekNo === 0 ? context.weeks : weeks, weeklySetup, otTopic, weekTopics: weekTopicsFromRows(Object.values(weekNo === 0 ? context.weeks : weeks), otTopic) }
    })
    setBaseDeadlines((all) => ({ ...all, [weekNo]: data.deadlines || {} }))
    if (Array.isArray(data.favorite_locations)) setBaseFavorites(data.favorite_locations)
  }

  async function saveAll() {
    if (!canWrite || !ctx) return
    const weeksToSave = dirtyWeeks.length > 0 ? dirtyWeeks : favoritesDirty ? [week] : []
    if (weeksToSave.length === 0) return
    const errors = weeksToSave.flatMap((weekNo) => {
      const effective = effectiveOf(weekNo)
      return validateWeek({ week: weekNo, setup: effective.setup, deadlines: effective.deadlines, mode })
    })
    setValidation(errors)
    if (errors.length > 0) {
      toast.error('입력값을 확인하세요. 아무것도 저장하지 않았습니다.', { title: `확인이 필요한 항목 ${errors.length}개` })
      return
    }

    await runSave(async () => {
      setSaveResult((result) => ({ ...result, state: 'saving' }))
      const saved = []
      const failed = []
      let favoritesPending = favoritesDirty
      for (const weekNo of weeksToSave) {
        const plan = buildPlan(weekNo, favoritesPending)
        const { data, error } = await saveWeekPlan(ctx.id, weekNo, plan)
        if (error) {
          failed.push({ weekNo, message: describeSaveError(error) })
          continue
        }
        saved.push(weekNo)
        if (favoritesPending) {
          favoritesPending = false
          setFavoritesDraft(null)
        }
        applySaved(weekNo, data)
        discardWeek(weekNo)
      }
      setWeekErrors(Object.fromEntries(failed.map((item) => [item.weekNo, item.message])))
      const time = formatKst(new Date(), { weekday: false })
      if (failed.length === 0) {
        setSaveResult({ state: 'clean', savedAt: time })
        toast.success(`${saved.map((weekNo) => `W${weekNo}`).join(', ')} 설정을 저장했습니다.`)
        return
      }
      setSaveResult({ state: 'error', savedAt: saved.length ? time : '' })
      toast.error(
        `${failed.map((item) => `W${item.weekNo}: ${item.message}`).join(' / ')}${saved.length ? ` (저장된 주차: ${saved.map((weekNo) => `W${weekNo}`).join(', ')})` : ''}`,
        { title: saved.length ? '일부 주차만 저장되었습니다' : '저장하지 못했습니다', duration: 0 },
      )
    })
  }

  function reload() {
    if (dirty && !confirm('최신 값을 불러옵니다. 저장하지 않은 변경은 화면에 남고, 저장 기준값만 최신으로 바뀝니다. 계속할까요?')) return
    setLoad((current) => ({ ...current, reloadKey: current.reloadKey + 1 }))
  }

  function changeSemester(nextId) {
    if (nextId === ctx?.id) return
    if (dirty && !confirm('저장하지 않은 변경이 있습니다. 다른 학기로 이동하면 변경 내용이 사라집니다. 이동할까요?')) return
    setDrafts({})
    setFavoritesDraft(null)
    setWeekErrors({})
    setValidation([])
    setParams({ semester: nextId, week: null })
  }

  // ---------------------------------------------------------------- 계산
  const memberFiles = useMemo(() => files.filter((file) => Number(file.week) === week), [files, week])
  const submissionSummary = useMemo(() => {
    if (!ctx) return null
    const types = SUBMISSION_TYPES[mode]
    return types.map((type) => {
      const roster = buildRoster(current?.setup, mode, members, type.key)
      const weekFiles = memberFiles.filter((file) => (file.file_category === 'plan' ? 'proposal' : file.file_category) === type.key)
      const deadline = mode === 'weekday' ? null : baseDeadlines[week]?.[type.deadline]
      return { type, roster, ...submissionStatus(roster, weekFiles, deadline) }
    })
  }, [ctx, mode, current?.setup, members, memberFiles, baseDeadlines, week])

  if (load.status === 'loading' && !ctx) return <AdminPage><LoadingState label="세션 설정을 불러오는 중입니다." /></AdminPage>
  if (load.status === 'error') return <AdminPage><ErrorState title="세션 설정을 불러오지 못했습니다." description={load.error} onRetry={() => setLoad((state) => ({ ...state, reloadKey: state.reloadKey + 1 }))} /></AdminPage>
  if (load.status === 'empty' || !ctx || !current) return <AdminPage><ErrorState title="학기가 없습니다." description="학기 및 주차 화면에서 학기를 먼저 만드세요." /></AdminPage>

  const assignments = summarizeAssignments(current.setup, mode, members)
  const warnings = setupWarnings(current.setup, members)
  const weekSchedules = schedules.filter((row) => String(row.week || '') === String(week))
  const saveState = saving ? 'saving' : saveResult.state === 'error' ? 'error' : dirty ? 'dirty' : 'clean'
  const memberLinks = ['proposal', 'slide', 'video'].map((kind) => ({ kind, href: site.memberUrl(`/dashboard/${kind}?week=${week}${mode === 'weekday' ? '&session=weekday' : ''}`) }))
  const setupView = readSetup(current.setup)

  const tabProps = {
    ctx, week, mode, current, base: baseOf(week), changes: currentChanges, canWrite, members, favorites, schedules: weekSchedules,
    setTopic, updateSetup, setDeadline, setFavorites: setFavoritesDraft, baseFavorites, assignments, setupView,
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="학회원 시스템"
        title="세션 및 제출"
        description="학기와 주차를 고른 뒤 그 주차의 주제·출석·마감·편성을 설정하고, 대상 명단 기준으로 제출 현황을 확인합니다."
        actions={
          <div className="flex flex-wrap items-center gap-2" data-tour="session-save">
            <SaveStatus state={saveState} dirtyCount={dirtyCount} savedAt={saveResult.savedAt} />
            <Button variant="ghost" size="sm" icon={RefreshCw} onClick={reload} disabled={saving}>최신 값</Button>
            <Button variant="primary" icon={Save} onClick={saveAll} loading={saving} disabled={!dirty || !canWrite}>
              {dirtyWeeks.length > 1 ? `${dirtyWeeks.length}개 주차 저장` : '저장'}
            </Button>
          </div>
        }
      />
      <ReadOnlyBanner role={role} />

      <WeekPicker
        semesterList={semesterList}
        ctx={ctx}
        week={week}
        mode={mode}
        dirtyWeeks={dirtyWeeks}
        weekErrors={weekErrors}
        onSemester={changeSemester}
        onWeek={(weekNo) => setParams({ week: weekNo })}
        onMode={(nextMode) => setParams({ session: nextMode === 'weekday' ? 'weekday' : null })}
        memberLinks={memberLinks}
        crossHost={site.crossHost}
      />

      {!ctx.isActive && (
        <Notice tone="info" className="mb-4" title={`${ctx.name}은 현재 운영 학기가 아닙니다`}>
          이 학기 값을 고치면 이 학기 기록에만 저장되고, 학회원 화면의 현재 학기에는 영향이 없습니다.
        </Notice>
      )}
      {rosterNote && <Notice tone="warning" className="mb-4">{rosterNote}</Notice>}
      {ctx.legacy.setupMismatch && (
        <Notice tone="warning" className="mb-4" title="조 편성 사본이 서로 다릅니다">
          학기 기록(semesters.weekly_setup)과 예전 설정(pr_config.weekly_setup)이 다릅니다. 이 화면은 예전 설정(작업본)을 기준으로 보여 주며, 주차를 저장하면 두 곳이 같아집니다.
        </Notice>
      )}
      {weekErrors[week] && (
        <Notice tone="danger" className="mb-4" title={`W${week}을 저장하지 못했습니다`} action={<Button size="sm" onClick={reload}>최신 값 불러오기</Button>}>
          {weekErrors[week]}
        </Notice>
      )}
      {validation.length > 0 && (
        <Notice tone="danger" className="mb-4" title="저장 전에 고쳐야 할 항목" onClose={() => setValidation([])}>
          <ul className="list-disc pl-4">{validation.map((item) => <li key={item}>{item}</li>)}</ul>
        </Notice>
      )}
      {warnings.length > 0 && (
        <Notice tone="warning" className="mb-4" title="확인해 주세요">
          <ul className="list-disc pl-4">{warnings.map((item) => <li key={item}>{item}</li>)}</ul>
        </Notice>
      )}

      <WeekSummary
        ctx={ctx}
        week={week}
        mode={mode}
        current={current}
        favorites={favorites}
        assignments={assignments}
        submissionSummary={submissionSummary}
        schedules={weekSchedules}
        onTab={(key) => setParams({ tab: key })}
      />

      <div className="mt-5 rounded-md border border-slate-200 bg-white">
        <div className="px-2 sm:px-3" data-tour="session-tabs">
          <Tabs
            tabs={TABS.map((item) => ({
              ...item,
              badge: item.key === 'submissions' ? submissionSummary?.reduce((sum, entry) => sum + entry.counts.missing, 0) || '' : item.key === 'groups' && assignments.unassigned.length ? assignments.unassigned.length : '',
              badgeTone: item.key === 'submissions' ? 'red' : 'amber',
            }))}
            value={tab}
            onChange={(key) => setParams({ tab: key })}
            label="주차 설정 영역"
          />
        </div>
        <div className="p-4 sm:p-5">
          {tab === 'overview' && <OverviewTab {...tabProps} memberLinks={memberLinks} crossHost={site.crossHost} dirty={currentChanges.length > 0} />}
          {tab === 'attendance' && <AttendanceTab {...tabProps} />}
          {tab === 'deadlines' && <DeadlinesTab {...tabProps} />}
          {tab === 'groups' && <GroupsTab {...tabProps} />}
          {tab === 'submissions' && (
            <SubmissionsTab
              {...tabProps}
              summary={submissionSummary}
              filesError={filesError}
              onFilesChanged={(updater) => setFiles((list) => updater(list))}
            />
          )}
        </div>
      </div>

      {currentChanges.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" aria-hidden="true" />W{week}에 저장하지 않은 변경 {currentChanges.length}건이 있습니다.</span>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => discardWeek(week)}>이 주차 변경 취소</Button>
            <Button size="sm" variant="primary" icon={Save} onClick={saveAll} loading={saving} disabled={!canWrite}>저장</Button>
          </div>
        </div>
      )}
      <p className="mt-6 flex items-center gap-1.5 text-xs text-slate-500">
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        모든 시간은 한국 시간(KST) 기준입니다.
      </p>
    </AdminPage>
  )
}
