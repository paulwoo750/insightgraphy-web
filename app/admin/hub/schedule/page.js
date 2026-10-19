'use client'
// 전체 일정 (pr_schedules, 학기별 행) + 공개 타임라인(/schedule) 문구
// 공개 일정만 메인·/schedule에 보이고, 내부 일정은 학회원 홈에만 보인다.
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Copy, ExternalLink, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { DEFAULT_SCHEDULE, mergeContent } from '@/lib/siteContent'
import { formatKstDate, kstDateString, sameJson } from '@/lib/semester'
import { fetchActiveSemesterRef, pickUpcoming } from '@/lib/schedules'
import { useSiteUrls } from '@/lib/siteUrls'
import { useAdminRole } from '@/app/admin/_components/AdminShell'
import {
  AdminPage,
  Button,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  inputClass,
  LoadingState,
  Modal,
  Notice,
  PageHeader,
  Panel,
  ReadOnlyBanner,
  SaveStatus,
  StatusBadge,
  textareaClass,
  useAsyncAction,
  useToast,
  useUnsavedChanges,
} from '@/app/admin/_components/AdminUI'

const contentSections = [
  { key: 'header', title: '페이지 헤더', fields: [{ key: 'eyebrow', label: '상단 작은 문구' }, { key: 'title', label: '페이지 제목' }] },
  { key: 'table', title: '전체 일정표', fields: [{ key: 'semesterBadge', label: '학기 배지' }, { key: 'quote', label: '인용 문구', wide: true }, { key: 'colType', label: '유형 열 이름' }, { key: 'colDate', label: '날짜 열 이름' }, { key: 'colTitle', label: '내용 열 이름' }, { key: 'colNote', label: '비고 열 이름' }, { key: 'breakLabel', label: '휴회 표시 문구' }] },
  { key: 'journey', title: '가로 타임라인', fields: [{ key: 'title', label: '섹션 제목' }, { key: 'desc', label: '섹션 설명', wide: true }, { key: 'defaultDesc', label: '일정 기본 설명', wide: true }] },
  { key: 'calendar', title: '월별 달력', fields: [{ key: 'title', label: '달력 제목' }, { key: 'eventsTitle', label: '월별 목록 제목' }, { key: 'empty', label: '일정 없음 문구', wide: true }] },
  { key: 'footer', title: '푸터', fields: [{ key: 'text', label: '하단 문구', wide: true }] },
]

const TYPE_LABELS = { regular: '정규 세션', special: '특별 세션', other: '기타' }
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
let draftCounter = 0

function omit(object, keys) {
  return Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)))
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  return `${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}`
}

function blankSchedule(date = '') {
  draftCounter += 1
  return { key: `new-${draftCounter}`, full_date: date, date_display: formatDateDisplay(date), type: 'regular', week: '', title: '', description: '', is_break: false, is_public: true, is_allday: true, start_time: '', end_time: '' }
}

function validate(rows) {
  const errors = []
  rows.forEach((row, index) => {
    const label = `${index + 1}번째 줄${row.title ? `(${row.title})` : ''}`
    if (!row.full_date) errors.push(`${label}: 날짜가 비어 있습니다.`)
    if (!row.title?.trim()) errors.push(`${label}: 일정 이름이 비어 있습니다.`)
    if (!row.is_allday) {
      if (!TIME_PATTERN.test(row.start_time || '')) errors.push(`${label}: 시작 시간은 14:00 형식으로 입력하세요.`)
      if (row.end_time && !TIME_PATTERN.test(row.end_time)) errors.push(`${label}: 종료 시간은 18:00 형식으로 입력하세요.`)
      if (row.end_time && row.start_time && row.end_time < row.start_time) errors.push(`${label}: 종료 시간이 시작 시간보다 빠릅니다.`)
    }
    if (row.type === 'regular' && row.week && !/^\d{1,2}$/.test(String(row.week))) errors.push(`${label}: 주차는 숫자만 입력하세요.`)
  })
  return errors
}

export default function ScheduleManager() {
  const { role, canWrite } = useAdminRole()
  const toast = useToast()
  const site = useSiteUrls()
  const [run, saving] = useAsyncAction()
  const [state, setState] = useState({ status: 'loading', error: '' })
  const [semester, setSemester] = useState(null)
  const [schedules, setSchedules] = useState([])
  const [baseSchedules, setBaseSchedules] = useState([])
  const [deletedIds, setDeletedIds] = useState([])
  const [content, setContent] = useState(DEFAULT_SCHEDULE)
  const [baseContent, setBaseContent] = useState(DEFAULT_SCHEDULE)
  const [errors, setErrors] = useState([])
  const [failed, setFailed] = useState(false)
  const [savedAt, setSavedAt] = useState('')
  const [currentDate, setCurrentDate] = useState(() => {
    const [year, month] = kstDateString().split('-').map(Number)
    return new Date(year, month - 1, 1)
  })
  const [selectedDate, setSelectedDate] = useState(null)

  const load = useCallback(async () => {
    setState({ status: 'loading', error: '' })
    const { semester: active, error: semesterError } = await fetchActiveSemesterRef()
    if (semesterError) {
      setState({ status: 'error', error: semesterError.message })
      return
    }
    const filter = active?.id ? `semester_id.eq.${active.id},semester_id.is.null` : 'semester_id.is.null'
    const [scheduleResult, contentResult] = await Promise.all([
      supabase.from('pr_schedules').select('*').or(filter).order('full_date', { ascending: true }),
      supabase.from('pr_config').select('value').eq('key', 'schedule_content').maybeSingle(),
    ])
    const error = scheduleResult.error || contentResult.error
    if (error) {
      setState({ status: 'error', error: error.message })
      return
    }
    let loadedContent = DEFAULT_SCHEDULE
    try {
      if (contentResult.data?.value) loadedContent = mergeContent(DEFAULT_SCHEDULE, JSON.parse(contentResult.data.value))
    } catch {
      loadedContent = DEFAULT_SCHEDULE
    }
    const rows = (scheduleResult.data || []).map((row) => ({ ...row, key: row.id }))
    setSemester(active)
    setSchedules(rows)
    setBaseSchedules(rows)
    setContent(loadedContent)
    setBaseContent(loadedContent)
    setDeletedIds([])
    setErrors([])
    setState({ status: 'ready', error: '' })
  }, [])

  useEffect(() => {
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])

  const schedulesDirty = !sameJson(schedules, baseSchedules) || deletedIds.length > 0
  const contentDirty = !sameJson(content, baseContent)
  const dirtyCount = (schedulesDirty ? 1 : 0) + (contentDirty ? 1 : 0)
  useUnsavedChanges(dirtyCount > 0)

  const landingPreview = useMemo(() => pickUpcoming(schedules.filter((row) => row.is_public && row.full_date), {}), [schedules])

  function updateRow(key, field, value) {
    setSchedules((rows) => rows.map((row) => {
      if (row.key !== key) return row
      const next = { ...row, [field]: value }
      if (field === 'full_date') next.date_display = formatDateDisplay(value)
      if (field === 'type' && value !== 'regular') {
        next.week = ''
        next.is_break = false
      }
      return next
    }))
  }

  function addRow(date = '') {
    setSchedules((rows) => [...rows, blankSchedule(date)])
  }

  function duplicateRow(key) {
    setSchedules((rows) => {
      const index = rows.findIndex((row) => row.key === key)
      if (index < 0) return rows
      draftCounter += 1
      return [...rows.slice(0, index + 1), { ...omit(rows[index], ['id']), key: `new-${draftCounter}` }, ...rows.slice(index + 1)]
    })
  }

  function removeRow(key) {
    const row = schedules.find((item) => item.key === key)
    if (!row || !confirm(`'${row.title || '이름 없는 일정'}' 일정을 삭제할까요? 저장해야 반영됩니다.`)) return
    if (row.id) setDeletedIds((ids) => [...new Set([...ids, row.id])])
    setSchedules((rows) => rows.filter((item) => item.key !== key))
  }

  async function saveAll() {
    if (!canWrite || dirtyCount === 0) return
    const found = validate(schedules)
    setErrors(found)
    if (found.length) {
      toast.error('입력값을 확인하세요. 아무것도 저장하지 않았습니다.', { title: `확인이 필요한 항목 ${found.length}개` })
      return
    }
    await run(async () => {
      const done = []
      const fail = []
      const rows = schedules.map((row) => ({
        ...(row.id ? { id: row.id } : {}),
        semester_id: row.semester_id || semester?.id || null,
        full_date: row.full_date,
        date_display: formatDateDisplay(row.full_date),
        type: row.type || 'regular',
        week: row.type === 'regular' ? String(row.week || '') : '',
        title: row.title.trim(),
        description: row.description || '',
        is_break: Boolean(row.is_break),
        is_public: Boolean(row.is_public),
        is_allday: Boolean(row.is_allday),
        start_time: row.is_allday ? '' : row.start_time || '',
        end_time: row.is_allday ? '' : row.end_time || '',
      }))
      if (schedulesDirty) {
        // 바뀐 행만 보낸다 (다른 관리자가 고친 다른 행을 덮지 않도록)
        const baseRow = (id) => {
          const base = baseSchedules.find((item) => item.id === id)
          if (!base) return null
          const rest = omit(base, ['key', 'calendar_event_id'])
          return { ...rest, semester_id: rest.semester_id || semester?.id || null, date_display: formatDateDisplay(rest.full_date) }
        }
        const changed = rows.filter((row) => row.id && !sameJson(row, baseRow(row.id)))
        const added = rows.filter((row) => !row.id)
        if (changed.length) {
          const { error } = await supabase.from('pr_schedules').upsert(changed)
          if (error) fail.push(`수정 ${changed.length}건: ${error.message}`)
          else done.push(`수정 ${changed.length}건`)
        }
        if (added.length) {
          const { error } = await supabase.from('pr_schedules').insert(added)
          if (error) fail.push(`추가 ${added.length}건: ${error.message}`)
          else done.push(`추가 ${added.length}건`)
        }
        if (deletedIds.length) {
          const { error } = await supabase.from('pr_schedules').delete().in('id', deletedIds)
          if (error) fail.push(`삭제 ${deletedIds.length}건: ${error.message}`)
          else done.push(`삭제 ${deletedIds.length}건`)
        }
      }
      if (contentDirty) {
        const { error } = await supabase.from('pr_config').upsert({ key: 'schedule_content', value: JSON.stringify(content) })
        if (error) fail.push(`타임라인 문구: ${error.message}`)
        else done.push('타임라인 문구')
      }
      if (fail.length) {
        setFailed(true)
        toast.error(`${fail.join(' / ')}${done.length ? ` (저장된 항목: ${done.join(', ')})` : ''}`, { title: done.length ? '일부만 저장되었습니다' : '저장하지 못했습니다', duration: 0 })
        if (done.length) await load()
        return
      }
      setFailed(false)
      setSavedAt(new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()))
      toast.success(`저장했습니다: ${done.join(', ')}. 공개 일정은 메인과 공개 타임라인에 바로 반영됩니다.`)
      await load()
    })
  }

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay()

  if (state.status === 'loading') return <AdminPage><LoadingState /></AdminPage>
  if (state.status === 'error') return <AdminPage><ErrorState title="일정을 불러오지 못했습니다." description={state.error} onRetry={load} /></AdminPage>

  const dayRows = selectedDate ? schedules.filter((row) => row.full_date === selectedDate) : []

  return (
    <AdminPage>
      <PageHeader
        eyebrow="운영 기준"
        title="전체 일정"
        description={`${semester?.name || '현재 학기'} 일정입니다. 공개 일정은 메인(다가오는 일정)과 공개 타임라인에, 내부 일정은 학회원 홈에만 보입니다.`}
        actions={
          <>
            <SaveStatus state={saving ? 'saving' : failed ? 'error' : dirtyCount ? 'dirty' : 'clean'} dirtyCount={dirtyCount} savedAt={savedAt} />
            <Button icon={ExternalLink} href={site.publicUrl('/schedule')} target="_blank">공개 타임라인 열기</Button>
            <Button variant="primary" icon={Save} onClick={saveAll} loading={saving} disabled={!canWrite || dirtyCount === 0}>저장</Button>
          </>
        }
      />
      <ReadOnlyBanner role={role} />
      {errors.length > 0 && (
        <Notice tone="danger" className="mb-4" title="저장 전에 고쳐야 할 항목" onClose={() => setErrors([])}>
          <ul className="list-disc pl-4">{errors.map((item) => <li key={item}>{item}</li>)}</ul>
        </Notice>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title="일정 목록" description="주차는 정규 세션에만 씁니다. 세션 및 제출 화면의 주차와 연결됩니다." action={<Button size="sm" icon={Plus} onClick={() => addRow('')} disabled={!canWrite}>일정 추가</Button>}>
          {schedules.length === 0 ? <EmptyState title="등록된 일정이 없습니다." action={<Button icon={Plus} onClick={() => addRow('')} disabled={!canWrite}>첫 일정 추가</Button>} /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-600">
                  <tr className="border-b border-slate-200">
                    <th className="w-36 px-3 py-2.5">유형 · 주차</th>
                    <th className="w-44 px-3 py-2.5">날짜 · 시간</th>
                    <th className="px-3 py-2.5">일정 이름</th>
                    <th className="px-3 py-2.5">세부 사항</th>
                    <th className="w-32 px-3 py-2.5">노출</th>
                    <th className="w-24 px-3 py-2.5"><span className="sr-only">관리</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {schedules.map((row) => <ScheduleRow key={row.key} row={row} canWrite={canWrite} onChange={updateRow} onDuplicate={duplicateRow} onRemove={removeRow} />)}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="min-w-0 space-y-5">
          <Panel title="메인에 보일 일정" description="자동 모드 기준 · 오늘 이후 공개 일정 4개 (휴회 제외)">
            {landingPreview.length === 0 ? <EmptyState title="오늘 이후 공개 일정이 없습니다." /> : (
              <ol className="divide-y divide-slate-100">
                {landingPreview.map((row) => (
                  <li key={row.key} className="px-4 py-2.5 text-sm"><span className="font-bold text-slate-900">{formatKstDate(row.full_date)}</span> <span className="text-slate-700">{row.title}</span></li>
                ))}
              </ol>
            )}
          </Panel>
          <Panel title="달력" description="날짜를 누르면 그날 일정을 편집합니다.">
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <IconButton icon={ChevronLeft} label="이전 달" onClick={() => setCurrentDate(new Date(year, month - 1, 1))} />
                <p className="text-sm font-bold text-slate-800">{year}년 {month + 1}월</p>
                <IconButton icon={ChevronRight} label="다음 달" onClick={() => setCurrentDate(new Date(year, month + 1, 1))} />
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-500">
                {['일', '월', '화', '수', '목', '금', '토'].map((day) => <div key={day} className="py-1">{day}</div>)}
                {Array.from({ length: firstDay }, (_, index) => <div key={`blank-${index}`} />)}
                {Array.from({ length: daysInMonth }, (_, index) => {
                  const day = index + 1
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  const events = schedules.filter((row) => row.full_date === dateStr)
                  return (
                    <button key={day} type="button" onClick={() => setSelectedDate(dateStr)} aria-label={`${month + 1}월 ${day}일 일정 ${events.length}개`} className={`relative grid aspect-square place-items-center rounded-md text-sm font-semibold ${events.length ? 'border border-teal-500 bg-teal-50 text-teal-900' : 'border border-slate-200 text-slate-600 hover:border-teal-300'} ${dateStr === kstDateString() ? 'ring-2 ring-slate-900' : ''}`}>
                      {day}
                      {events.length > 0 && <span className="absolute bottom-1 flex gap-0.5">{events.slice(0, 3).map((event) => <span key={event.key} className={`h-1 w-1 rounded-full ${event.is_public ? 'bg-teal-600' : 'bg-amber-500'}`} />)}</span>}
                    </button>
                  )
                })}
              </div>
              <p className="mt-3 flex gap-3 text-xs text-slate-500"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-teal-600" />공개</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" />내부</span></p>
            </div>
          </Panel>
        </div>
      </div>

      <Panel className="mt-5" title="공개 타임라인 문구" description="공개 사이트 /schedule의 헤더·일정표·여정·달력·푸터 문구입니다." action={<Button size="sm" variant="ghost" icon={RotateCcw} disabled={!canWrite} onClick={() => { if (confirm('타임라인 문구를 기본값으로 되돌릴까요? 저장해야 반영됩니다.')) setContent(DEFAULT_SCHEDULE) }}>기본값으로</Button>}>
        <div className="grid gap-px bg-slate-200 lg:grid-cols-2">
          {contentSections.map((section) => (
            <div key={section.key} className="bg-white p-4 sm:p-5">
              <h3 className="mb-3 text-sm font-bold text-teal-800">{section.title}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {section.fields.map((field) => (
                  <ContentField key={field.key} label={field.label} wide={field.wide} value={content[section.key]?.[field.key] || ''} disabled={!canWrite} onChange={(value) => setContent((current) => ({ ...current, [section.key]: { ...current[section.key], [field.key]: value } }))} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {selectedDate && (
        <Modal title={`${formatKstDate(selectedDate)} 일정`} description="여기서 고친 내용도 저장 버튼을 눌러야 반영됩니다." onClose={() => setSelectedDate(null)} size="lg" footer={<><Button icon={Plus} onClick={() => addRow(selectedDate)} disabled={!canWrite}>이 날짜에 일정 추가</Button><Button variant="primary" onClick={() => setSelectedDate(null)}>편집 완료</Button></>}>
          {dayRows.length === 0 ? <EmptyState title="이 날짜에 일정이 없습니다." /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <tbody className="divide-y divide-slate-100">
                  {dayRows.map((row) => <ScheduleRow key={row.key} row={row} canWrite={canWrite} onChange={updateRow} onDuplicate={duplicateRow} onRemove={removeRow} />)}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </AdminPage>
  )
}

function ContentField({ label, value, onChange, disabled, wide }) {
  const id = useId()
  return (
    <Field label={label} htmlFor={id} className={wide ? 'sm:col-span-2' : ''}>
      <input id={id} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={inputClass} />
    </Field>
  )
}

function ScheduleRow({ row, canWrite, onChange, onDuplicate, onRemove }) {
  const label = row.title || '이름 없는 일정'
  return (
    <tr className={`align-top ${row.is_break ? 'bg-slate-50 text-slate-500' : ''}`}>
      <td className="px-3 py-2.5">
        <select aria-label={`${label} 유형`} value={row.type || 'regular'} onChange={(event) => onChange(row.key, 'type', event.target.value)} disabled={!canWrite} className={`${inputClass} h-9`}>
          {Object.entries(TYPE_LABELS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select>
        {row.type === 'regular' && <input aria-label={`${label} 주차`} value={row.week || ''} onChange={(event) => onChange(row.key, 'week', event.target.value.replace(/[^0-9]/g, ''))} disabled={!canWrite} placeholder="주차 (휴회는 비움)" inputMode="numeric" className={`${inputClass} mt-1.5 h-9`} />}
      </td>
      <td className="px-3 py-2.5">
        <input aria-label={`${label} 날짜`} type="date" value={row.full_date || ''} onChange={(event) => onChange(row.key, 'full_date', event.target.value)} disabled={!canWrite} className={`${inputClass} h-9 ${!row.full_date ? 'border-red-300' : ''}`} />
        <label className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          <input type="checkbox" checked={Boolean(row.is_allday)} onChange={(event) => onChange(row.key, 'is_allday', event.target.checked)} disabled={!canWrite} className="h-4 w-4 accent-teal-700" />종일
        </label>
        {!row.is_allday && (
          <div className="mt-1.5 flex items-center gap-1">
            <input aria-label={`${label} 시작 시간`} value={row.start_time || ''} onChange={(event) => onChange(row.key, 'start_time', event.target.value)} disabled={!canWrite} placeholder="14:00" className={`${inputClass} h-9 px-2 text-center`} />
            <span className="text-slate-400">–</span>
            <input aria-label={`${label} 종료 시간`} value={row.end_time || ''} onChange={(event) => onChange(row.key, 'end_time', event.target.value)} disabled={!canWrite} placeholder="18:00" className={`${inputClass} h-9 px-2 text-center`} />
          </div>
        )}
      </td>
      <td className="px-3 py-2.5"><input aria-label={`${label} 이름`} value={row.title || ''} onChange={(event) => onChange(row.key, 'title', event.target.value)} disabled={!canWrite} placeholder="일정 이름" className={`${inputClass} h-9 ${!row.title ? 'border-amber-300' : ''}`} /></td>
      <td className="px-3 py-2.5"><textarea aria-label={`${label} 세부 사항`} rows={2} value={row.description || ''} onChange={(event) => onChange(row.key, 'description', event.target.value)} disabled={!canWrite} placeholder="세부 사항 (선택)" className={`${textareaClass} min-h-9 py-1.5`} /></td>
      <td className="space-y-1.5 px-3 py-2.5">
        <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={Boolean(row.is_public)} onChange={(event) => onChange(row.key, 'is_public', event.target.checked)} disabled={!canWrite} className="h-4 w-4 accent-teal-700" />공개
        </label>
        {row.type === 'regular' && (
          <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={Boolean(row.is_break)} onChange={(event) => onChange(row.key, 'is_break', event.target.checked)} disabled={!canWrite} className="h-4 w-4 accent-slate-700" />휴회
          </label>
        )}
        <StatusBadge tone={row.is_public ? 'green' : 'amber'}>{row.is_public ? '메인·타임라인' : '학회원 홈만'}</StatusBadge>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex gap-1">
          <IconButton icon={Copy} label={`${label} 복사`} size="sm" variant="secondary" onClick={() => onDuplicate(row.key)} disabled={!canWrite} />
          <IconButton icon={Trash2} label={`${label} 삭제`} size="sm" variant="danger" onClick={() => onRemove(row.key)} disabled={!canWrite} />
        </div>
      </td>
    </tr>
  )
}
