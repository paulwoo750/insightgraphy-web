'use client'
// 메인(루트 랜딩) 문구와 노출 항목
// 다가오는 일정: 자동(현재 학기 공개 일정 중 오늘 이후 가까운 4개) 또는 직접 선택
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { CalendarDays, ExternalLink, RotateCcw, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { DEFAULT_LANDING, mergeContent } from '@/lib/siteContent'
import { formatKstDate, kstDateString, sameJson } from '@/lib/semester'
import { fetchActiveSemesterRef, fetchSemesterSchedules, LANDING_SCHEDULE_LIMIT, pickUpcoming, scheduleTimeLabel } from '@/lib/schedules'
import { useSiteUrls } from '@/lib/siteUrls'
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
  Tabs,
  textareaClass,
  useAsyncAction,
  useToast,
  useUnsavedChanges,
} from '@/app/admin/_components/AdminUI'

export default function LandingManager() {
  const { role, canWrite } = useAdminRole()
  const toast = useToast()
  const site = useSiteUrls()
  const [run, saving] = useAsyncAction()
  const [state, setState] = useState({ status: 'loading', error: '' })
  const [tab, setTab] = useState('select')
  const [land, setLand] = useState(DEFAULT_LANDING)
  const [baseLand, setBaseLand] = useState(DEFAULT_LANDING)
  const [schedules, setSchedules] = useState([])
  const [semesterName, setSemesterName] = useState('')
  const [showcases, setShowcases] = useState([])
  const [selection, setSelection] = useState({ mode: 'auto', schedules: [], showcases: [] })
  const [baseSelection, setBaseSelection] = useState({ mode: 'auto', schedules: [], showcases: [] })
  const [modeColumnReady, setModeColumnReady] = useState(false)
  const [savedAt, setSavedAt] = useState('')
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setState({ status: 'loading', error: '' })
    const [contentResult, { semester, error: semesterError }, showResult, configResult] = await Promise.all([
      supabase.from('pr_config').select('value').eq('key', 'landing_content').maybeSingle(),
      fetchActiveSemesterRef(),
      supabase.from('pr_showcase').select('*').order('created_at', { ascending: false }),
      supabase.from('pr_landing_config').select('*').eq('id', 'main').maybeSingle(),
    ])
    const scheduleResult = await fetchSemesterSchedules(semester, { publicOnly: true })
    const error = contentResult.error || semesterError || showResult.error || configResult.error || scheduleResult.error
    if (error) {
      setState({ status: 'error', error: error.message })
      return
    }
    let saved = null
    try {
      saved = contentResult.data?.value ? JSON.parse(contentResult.data.value) : null
    } catch {
      saved = null
    }
    const content = mergeContent(DEFAULT_LANDING, saved)
    const config = configResult.data || {}
    const nextSelection = {
      mode: config.schedule_mode === 'manual' ? 'manual' : 'auto',
      // 지난 학기·비공개·삭제된 일정 ID는 화면에서 빼지만, 저장하기 전까지 DB 값은 그대로 둔다
      schedules: (config.selected_schedules || []).filter((id) => (scheduleResult.data || []).some((row) => String(row.id) === String(id))),
      showcases: (config.selected_showcases || []).filter((id) => (showResult.data || []).some((row) => row.id === id)),
    }
    setLand(content)
    setBaseLand(content)
    setSchedules(scheduleResult.data || [])
    setSemesterName(semester?.name || '')
    setShowcases(showResult.data || [])
    setSelection(nextSelection)
    setBaseSelection(nextSelection)
    setModeColumnReady(Object.hasOwn(config, 'schedule_mode'))
    setState({ status: 'ready', error: '' })
  }, [])

  useEffect(() => {
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])

  const contentDirty = !sameJson(land, baseLand)
  const selectionDirty = !sameJson(selection, baseSelection)
  const dirtyCount = (contentDirty ? 1 : 0) + (selectionDirty ? 1 : 0)
  useUnsavedChanges(dirtyCount > 0)

  const today = kstDateString()
  const preview = useMemo(() => {
    const auto = pickUpcoming(schedules, { today })
    if (selection.mode === 'auto') return { items: auto, fallback: false }
    const picked = pickUpcoming(schedules.filter((row) => selection.schedules.map(String).includes(String(row.id))), { today, includeBreaks: true })
    return picked.length ? { items: picked, fallback: false } : { items: auto, fallback: true }
  }, [schedules, selection, today])

  const upLand = (section, field, value) => setLand((current) => ({ ...current, [section]: { ...current[section], [field]: value } }))
  const upActItem = (index, field, value) => setLand((current) => ({
    ...current,
    activities: { ...current.activities, items: current.activities.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) },
  }))

  function toggleSchedule(id) {
    setSelection((current) => {
      if (current.schedules.includes(id)) return { ...current, schedules: current.schedules.filter((item) => item !== id) }
      if (current.schedules.length >= LANDING_SCHEDULE_LIMIT) {
        toast.warning(`다가오는 일정은 최대 ${LANDING_SCHEDULE_LIMIT}개까지 고를 수 있습니다.`)
        return current
      }
      return { ...current, schedules: [...current.schedules, id] }
    })
  }

  function toggleShowcase(id) {
    setSelection((current) => {
      if (current.showcases.includes(id)) return { ...current, showcases: current.showcases.filter((item) => item !== id) }
      if (current.showcases.length >= 3) {
        toast.warning('우수 작품은 최대 3개까지 고를 수 있습니다.')
        return current
      }
      return { ...current, showcases: [...current.showcases, id] }
    })
  }

  async function saveAll() {
    if (!canWrite || dirtyCount === 0) return
    if (selection.mode === 'manual' && !modeColumnReady) {
      toast.error('직접 선택 모드를 저장하려면 STEP 18 SQL이 필요합니다. 자동 모드는 SQL 없이도 동작합니다.')
      return
    }
    await run(async () => {
      const failures = []
      if (contentDirty) {
        const { error } = await supabase.from('pr_config').upsert([{ key: 'landing_content', value: JSON.stringify(land) }])
        if (error) failures.push(`대문 문구: ${error.message}`)
        else setBaseLand(land)
      }
      if (selectionDirty) {
        const row = { id: 'main', selected_schedules: selection.schedules, selected_showcases: selection.showcases }
        if (modeColumnReady) row.schedule_mode = selection.mode
        const { error } = await supabase.from('pr_landing_config').upsert(row)
        if (error) failures.push(`노출 항목: ${error.message}`)
        else setBaseSelection(selection)
      }
      if (failures.length) {
        setFailed(true)
        toast.error(failures.join(' / '), { title: contentDirty && selectionDirty && failures.length === 1 ? '일부만 저장되었습니다' : '저장하지 못했습니다', duration: 0 })
        return
      }
      setFailed(false)
      setSavedAt(new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()))
      toast.success('메인 화면 설정을 저장했습니다.')
    })
  }

  if (state.status === 'loading') return <AdminPage><LoadingState /></AdminPage>
  if (state.status === 'error') return <AdminPage><ErrorState title="메인 설정을 불러오지 못했습니다." description={state.error} onRetry={load} /></AdminPage>

  return (
    <AdminPage>
      <PageHeader
        eyebrow="외부 사이트"
        title="메인"
        description="공개 홈페이지 첫 화면의 문구와, 다가오는 일정·우수 작품 노출을 관리합니다."
        actions={
          <>
            <SaveStatus state={saving ? 'saving' : failed ? 'error' : dirtyCount ? 'dirty' : 'clean'} dirtyCount={dirtyCount} savedAt={savedAt} />
            <Button icon={ExternalLink} href={site.publicUrl('/')} target="_blank">공개 메인 열기</Button>
            <Button variant="primary" icon={Save} onClick={saveAll} loading={saving} disabled={!canWrite || dirtyCount === 0}>저장</Button>
          </>
        }
      />
      <ReadOnlyBanner role={role} />

      <div className="mb-5 rounded-md border border-slate-200 bg-white px-2">
        <Tabs tabs={[{ key: 'select', label: '노출 항목' }, { key: 'landing', label: '대문 문구' }]} value={tab} onChange={setTab} />
      </div>

      {tab === 'select' && (
        <div className="grid gap-5 xl:grid-cols-2">
          <Panel
            title="다가오는 일정"
            description={`${semesterName || '현재 학기'} 공개 일정 기준 · 휴회는 자동 목록에서 빠집니다`}
            action={<Button size="sm" variant="ghost" icon={CalendarDays} href="/admin/hub/schedule">전체 일정</Button>}
          >
            <div className="space-y-4 p-4 sm:p-5">
              <SegmentedControl
                label="일정 노출 방식"
                value={selection.mode}
                onChange={(mode) => setSelection((current) => ({ ...current, mode }))}
                disabled={!canWrite}
                options={[
                  { value: 'auto', label: '자동 (가까운 4개)' },
                  { value: 'manual', label: '직접 선택', disabled: !modeColumnReady, title: modeColumnReady ? undefined : 'STEP 18 SQL 적용 후 사용할 수 있습니다' },
                ]}
              />
              {!modeColumnReady && <p className="text-xs text-slate-500">직접 선택 모드는 STEP 18 SQL 적용 후 쓸 수 있습니다. 지금은 자동 모드로 표시됩니다.</p>}

              <div>
                <p className="mb-2 text-sm font-bold text-slate-800">공개 메인에 보일 일정 ({today} 기준)</p>
                {preview.fallback && <Notice tone="warning" className="mb-2">고른 일정이 모두 지났거나 비공개라서 자동 목록으로 보입니다.</Notice>}
                {preview.items.length === 0 ? (
                  <EmptyState title="표시할 일정이 없습니다." description={`메인에는 "${land.sessions.empty}" 문구가 보입니다.`} />
                ) : (
                  <ol className="divide-y divide-slate-100 rounded-md border border-slate-200">
                    {preview.items.map((row) => (
                      <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                        <span className="min-w-0"><span className="font-bold text-slate-900">{formatKstDate(row.full_date)}</span> <span className="text-slate-700">{row.title}</span></span>
                        <span className="shrink-0 text-xs text-slate-500">{scheduleTimeLabel(row)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {selection.mode === 'manual' && (
                <div>
                  <p className="mb-2 text-sm font-bold text-slate-800">직접 고르기 ({selection.schedules.length}/{LANDING_SCHEDULE_LIMIT})</p>
                  <div className="max-h-[420px] space-y-1.5 overflow-y-auto">
                    {schedules.filter((row) => row.full_date >= today).map((row) => (
                      <label key={row.id} className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm ${selection.schedules.includes(row.id) ? 'border-teal-600 bg-teal-50' : 'border-slate-200 hover:border-slate-300'}`}>
                        <input type="checkbox" checked={selection.schedules.includes(row.id)} onChange={() => toggleSchedule(row.id)} disabled={!canWrite} className="h-4 w-4 accent-teal-700" />
                        <span className="w-20 shrink-0 font-bold text-slate-700">{formatKstDate(row.full_date)}</span>
                        <span className="min-w-0 flex-1 truncate text-slate-800">{row.title}</span>
                        {row.is_break && <StatusBadge tone="red">휴회</StatusBadge>}
                      </label>
                    ))}
                    {schedules.filter((row) => row.full_date >= today).length === 0 && <p className="py-6 text-center text-sm text-slate-500">오늘 이후 공개 일정이 없습니다.</p>}
                  </div>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="우수 작품" description={`메인에 노출할 작품 최대 3개 (${selection.showcases.length}/3)`}>
            <div className="max-h-[640px] space-y-1.5 overflow-y-auto p-4">
              {showcases.length === 0 ? <EmptyState title="쇼케이스 작품이 없습니다." description="쇼케이스 화면에서 먼저 작품을 추가하세요." /> : showcases.map((item) => (
                <label key={item.id} className={`flex cursor-pointer items-center gap-3 rounded-md border p-2.5 ${selection.showcases.includes(item.id) ? 'border-teal-600 bg-teal-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <input type="checkbox" checked={selection.showcases.includes(item.id)} onChange={() => toggleShowcase(item.id)} disabled={!canWrite} className="h-4 w-4 accent-teal-700" />
                  <div className="h-12 w-20 shrink-0 overflow-hidden rounded bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.thumb_url || '/showcase/thumb1.png'} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-teal-700">{item.author}</p>
                    <p className="truncate text-sm font-bold text-slate-800">{item.title}</p>
                  </div>
                </label>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {tab === 'landing' && (
        <div className="space-y-5">
          <Panel title="1. 첫 화면" action={<Button size="sm" variant="ghost" icon={RotateCcw} disabled={!canWrite} onClick={() => { if (confirm('대문 문구를 기본값으로 되돌릴까요? 저장해야 반영됩니다.')) setLand(DEFAULT_LANDING) }}>기본값으로</Button>}>
            <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-2">
              <TextField label="상단 작은 문구" value={land.hero.eyebrow} onChange={(value) => upLand('hero', 'eyebrow', value)} disabled={!canWrite} />
              <div />
              <TextField label="큰 제목 첫 줄" value={land.hero.titleLine1} onChange={(value) => upLand('hero', 'titleLine1', value)} disabled={!canWrite} />
              <TextField label="큰 제목 둘째 줄" value={land.hero.titleLine2} onChange={(value) => upLand('hero', 'titleLine2', value)} disabled={!canWrite} />
              <TextField label="소개 문구 (줄바꿈 가능)" value={land.hero.desc} onChange={(value) => upLand('hero', 'desc', value)} disabled={!canWrite} textarea className="md:col-span-2" />
              <TextField label="왼쪽 버튼" value={land.hero.btnPrimary} onChange={(value) => upLand('hero', 'btnPrimary', value)} disabled={!canWrite} />
              <TextField label="오른쪽 버튼" value={land.hero.btnSecondary} onChange={(value) => upLand('hero', 'btnSecondary', value)} disabled={!canWrite} />
            </div>
          </Panel>
          <Panel title="2. 핵심 활동 카드">
            <div className="space-y-4 p-4 sm:p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <TextField label="섹션 제목" value={land.activities.title} onChange={(value) => upLand('activities', 'title', value)} disabled={!canWrite} />
                <TextField label="카드 아래 링크 문구" value={land.activities.cardLink} onChange={(value) => upLand('activities', 'cardLink', value)} disabled={!canWrite} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {land.activities.items.map((item, index) => (
                  <div key={index} className="space-y-3 rounded-md border border-slate-200 p-4">
                    <p className="text-sm font-bold text-teal-800">카드 {index + 1}</p>
                    <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-3">
                      <TextField label="아이콘" value={item.icon} onChange={(value) => upActItem(index, 'icon', value)} disabled={!canWrite} />
                      <TextField label="제목" value={item.title} onChange={(value) => upActItem(index, 'title', value)} disabled={!canWrite} />
                    </div>
                    <TextField label="설명" value={item.desc} onChange={(value) => upActItem(index, 'desc', value)} disabled={!canWrite} textarea />
                    <TextField label="연결 주소" value={item.href} onChange={(value) => upActItem(index, 'href', value)} disabled={!canWrite} />
                  </div>
                ))}
              </div>
            </div>
          </Panel>
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="3. 우수 작품">
              <div className="grid gap-4 p-4 sm:p-5">
                <TextField label="제목" value={land.showcase.title} onChange={(value) => upLand('showcase', 'title', value)} disabled={!canWrite} />
                <TextField label="설명" value={land.showcase.desc} onChange={(value) => upLand('showcase', 'desc', value)} disabled={!canWrite} />
                <TextField label="버튼" value={land.showcase.btn} onChange={(value) => upLand('showcase', 'btn', value)} disabled={!canWrite} />
                <TextField label="작품이 없을 때 문구" value={land.showcase.empty} onChange={(value) => upLand('showcase', 'empty', value)} disabled={!canWrite} />
              </div>
            </Panel>
            <Panel title="4. 다가오는 일정 · 5. 푸터">
              <div className="grid gap-4 p-4 sm:p-5">
                <TextField label="일정 제목" value={land.sessions.title} onChange={(value) => upLand('sessions', 'title', value)} disabled={!canWrite} />
                <TextField label="인용 문구" value={land.sessions.quote} onChange={(value) => upLand('sessions', 'quote', value)} disabled={!canWrite} />
                <TextField label="버튼" value={land.sessions.btn} onChange={(value) => upLand('sessions', 'btn', value)} disabled={!canWrite} />
                <TextField label="일정이 없을 때 문구" value={land.sessions.empty} onChange={(value) => upLand('sessions', 'empty', value)} disabled={!canWrite} />
                <TextField label="푸터 저작권 문구" value={land.footer.text} onChange={(value) => upLand('footer', 'text', value)} disabled={!canWrite} />
              </div>
            </Panel>
          </div>
        </div>
      )}
    </AdminPage>
  )
}

function TextField({ label, value, onChange, disabled, textarea = false, className = '' }) {
  const id = useId()
  return (
    <Field label={label} className={className} htmlFor={id}>
      {textarea ? (
        <textarea id={id} value={value ?? ''} onChange={(event) => onChange(event.target.value)} disabled={disabled} rows={3} className={textareaClass} />
      ) : (
        <input id={id} value={value ?? ''} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={inputClass} />
      )}
    </Field>
  )
}
