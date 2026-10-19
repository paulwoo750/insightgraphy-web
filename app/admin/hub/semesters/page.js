'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarRange, Check, ChevronRight, Plus, Save, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAdminContext } from '@/app/admin/_components/AdminShell'
import { AdminPage, EmptyState, PageHeader, Panel, StatusBadge } from '@/app/admin/_components/AdminUI'
import { saveSemesterSnapshots } from '@/lib/archive'

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

export default function SemesterManagerPage() {
  const adminContext = useAdminContext()
  const [semesters, setSemesters] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState(null)
  const [weeks, setWeeks] = useState([])
  const [sessionCounts, setSessionCounts] = useState({})
  const [deadlineCounts, setDeadlineCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [newSemester, setNewSemester] = useState(blankSemester)

  useEffect(() => {
    let active = true

    async function fetchSemesters() {
      const { data, error } = await supabase.from('semesters').select('*').order('created_at', { ascending: false })
      if (!active) return
      if (error) setMessage(`학기 조회 실패: ${error.message}`)
      const rows = data || []
      setSemesters(rows)
      setSelectedId((current) => current || adminContext?.semester?.id || rows.find((item) => item.status === 'active')?.id || rows[0]?.id || '')
      setLoading(false)
    }

    fetchSemesters()
    return () => {
      active = false
    }
  }, [adminContext?.semester?.id])

  useEffect(() => {
    let active = true

    async function fetchSemesterDetail() {
      const selected = semesters.find((item) => item.id === selectedId)
      if (!selected) {
        setDraft(null)
        setWeeks([])
        return
      }

      setDraft({
        ...selected,
        starts_on: selected.starts_on || '',
        ends_on: selected.ends_on || '',
        current_week_no: selected.current_week_no || 1,
      })

      const { data: weekData, error: weekError } = await supabase
        .from('semester_weeks')
        .select('id, week_no, topic, weekday_topic, status')
        .eq('semester_id', selectedId)
        .order('week_no')

      if (!active) return
      if (weekError) {
        setMessage(`주차 조회 실패: ${weekError.message}`)
        return
      }

      const existingWeeks = weekData || []
      const existingMap = Object.fromEntries(existingWeeks.map((week) => [week.week_no, week]))
      const normalizedWeeks = Array.from({ length: selected.total_weeks }, (_, index) => {
        const weekNo = index + 1
        return existingMap[weekNo] || {
          id: null,
          week_no: weekNo,
          topic: '',
          weekday_topic: '',
          status: weekNo === selected.current_week_no ? 'current' : weekNo < (selected.current_week_no || 1) ? 'completed' : 'planned',
        }
      })
      setWeeks(normalizedWeeks)

      const weekIds = existingWeeks.map((week) => week.id).filter(Boolean)
      if (weekIds.length === 0) {
        setSessionCounts({})
        setDeadlineCounts({})
        return
      }

      const [sessionResult, deadlineResult] = await Promise.all([
        supabase.from('sessions').select('semester_week_id').in('semester_week_id', weekIds),
        supabase.from('semester_deadlines').select('semester_week_id').in('semester_week_id', weekIds),
      ])
      if (!active) return
      setSessionCounts(countByWeek(sessionResult.data || []))
      setDeadlineCounts(countByWeek(deadlineResult.data || []))
    }

    fetchSemesterDetail()
    return () => {
      active = false
    }
  }, [selectedId, semesters])

  const maxStoredWeek = useMemo(() => Math.max(0, ...weeks.map((week) => week.week_no)), [weeks])

  function setTotalWeeks(value) {
    const total = Math.max(1, Math.min(52, Number(value) || 1))
    if (total < maxStoredWeek && weeks.slice(total).some((week) => week.id)) {
      setMessage('기존 데이터가 있는 주차보다 전체 주차를 줄일 수 없습니다. 해당 주차의 세션과 마감을 먼저 정리해야 합니다.')
      return
    }
    setDraft((current) => ({ ...current, total_weeks: total, current_week_no: Math.min(current.current_week_no || 1, total) }))
    setWeeks((current) => Array.from({ length: total }, (_, index) => current[index] || {
      id: null,
      week_no: index + 1,
      topic: '',
      weekday_topic: '',
      status: 'planned',
    }))
  }

  function updateWeek(weekNo, key, value) {
    setWeeks((current) => current.map((week) => week.week_no === weekNo ? { ...week, [key]: value } : week))
  }

  async function saveSemester() {
    if (!draft) return
    if (!draft.code.trim() || !draft.name.trim()) {
      setMessage('학기 코드와 이름을 입력해주세요.')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      const currentWeek = Math.max(1, Math.min(draft.total_weeks, Number(draft.current_week_no) || 1))
      const normalizedWeeks = weeks.slice(0, Number(draft.total_weeks)).map((week) => ({
        week_no: week.week_no,
        topic: week.topic?.trim() || null,
        weekday_topic: week.weekday_topic?.trim() || null,
        status: week.status === 'cancelled' ? 'cancelled' : week.week_no < currentWeek ? 'completed' : week.week_no === currentWeek ? 'current' : 'planned',
      }))
      const { data: saveData, error: saveError } = await supabase.rpc('admin_save_semester_configuration', {
        p_semester_id: draft.id,
        p_code: draft.code.trim(),
        p_name: draft.name.trim(),
        p_semester_type: draft.semester_type,
        p_total_weeks: Number(draft.total_weeks),
        p_current_week_no: currentWeek,
        p_starts_on: draft.starts_on || null,
        p_ends_on: draft.ends_on || null,
        p_weeks: normalizedWeeks,
      })
      if (saveError) throw saveError
      const savedSemester = Array.isArray(saveData) ? saveData[0] : saveData
      if (!savedSemester?.id) throw new Error('저장된 학기 정보를 확인할 수 없습니다.')

      const { data: savedWeeks, error: weekError } = await supabase
        .from('semester_weeks')
        .select('id, week_no, topic, weekday_topic, status')
        .eq('semester_id', draft.id)
        .order('week_no')
      if (weekError) throw weekError

      setSemesters((current) => current.map((item) => item.id === savedSemester.id ? savedSemester : item))
      setWeeks((savedWeeks || []).sort((a, b) => a.week_no - b.week_no))
      if (savedSemester.status === 'active') adminContext?.setSemester(savedSemester)
      setMessage('학기와 주차 설정을 저장했습니다.')
    } catch (error) {
      setMessage(`저장 실패: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function activateSemester() {
    if (!draft || draft.status === 'active') return
    if (!confirm(`${draft.name}을 현재 운영 학기로 전환할까요? 기존 운영 학기는 종료 상태가 되고, 타임라인·주차 주제는 아카이브에 학기별로 보관됩니다. 타임라인·마감·조 편성은 학기별로 저장되어, 처음 운영하는 학기는 빈 상태로 시작합니다.`)) return
    setSaving(true)
    setMessage('')
    try {
      // 전환하면 pr_config의 주제가 새 학기 것으로 바뀌므로, 그 전에 기존 학기 기록을 아카이브에 남긴다
      const outgoing = semesters.find((item) => item.status === 'active')
      if (outgoing) {
        const { error: snapshotError } = await saveSemesterSnapshots(outgoing)
        if (snapshotError) throw snapshotError
      }
      const { data: activateData, error: activateError } = await supabase.rpc('admin_activate_semester', { p_semester_id: draft.id })
      if (activateError) throw activateError
      const activated = Array.isArray(activateData) ? activateData[0] : activateData
      if (!activated?.id) throw new Error('전환된 학기 정보를 확인할 수 없습니다.')

      setSemesters((current) => current.map((item) => {
        if (item.id === activated.id) return activated
        if (item.status === 'active') return { ...item, status: 'closed' }
        return item
      }))
      setDraft(activated)
      adminContext?.setSemester(activated)
      setMessage(`${activated.name}을 현재 운영 학기로 전환했습니다.`)
    } catch (error) {
      setMessage(`학기 전환 실패: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function createSemester(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const { data: createData, error } = await supabase.rpc('admin_create_semester', {
        p_code: newSemester.code.trim(),
        p_name: newSemester.name.trim(),
        p_semester_type: newSemester.semester_type,
        p_total_weeks: Number(newSemester.total_weeks),
        p_starts_on: newSemester.starts_on || null,
        p_ends_on: newSemester.ends_on || null,
      })
      if (error) throw error
      const data = Array.isArray(createData) ? createData[0] : createData
      if (!data?.id) throw new Error('생성된 학기 정보를 확인할 수 없습니다.')
      setSemesters((current) => [data, ...current])
      setSelectedId(data.id)
      setCreateOpen(false)
      setNewSemester(blankSemester)
      setMessage('새 학기를 준비 상태로 생성했습니다.')
    } catch (error) {
      setMessage(`학기 생성 실패: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Semester Operations"
        title="학기 및 주차"
        description="학기 정보는 semesters, 주차 주제와 진행 상태는 semester_weeks에서 관리합니다. 현재 학기 정보는 기존 화면과 자동으로 동기화됩니다."
        actions={
          <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800">
            <Plus className="h-4 w-4" aria-hidden="true" />
            새 학기
          </button>
        }
      />

      {message && <div className={`mb-4 rounded-md border px-4 py-3 text-sm font-semibold ${message.includes('실패') || message.includes('없습니다') || message.includes('줄일 수') ? 'border-red-200 bg-red-50 text-red-700' : 'border-teal-200 bg-teal-50 text-teal-800'}`}>{message}</div>}

      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Panel title="학기 목록" description={`${semesters.length}개 학기`} className="self-start">
          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-slate-400">불러오는 중입니다.</div>
          ) : semesters.length === 0 ? (
            <EmptyState title="등록된 학기가 없습니다." />
          ) : (
            <div className="divide-y divide-slate-100">
              {semesters.map((item) => {
                const status = semesterStatus[item.status] || semesterStatus.draft
                return (
                  <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-slate-50 ${selectedId === item.id ? 'bg-teal-50/70' : ''}`}>
                    <CalendarRange className={`h-5 w-5 shrink-0 ${selectedId === item.id ? 'text-teal-700' : 'text-slate-400'}`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-900">{item.name}</p>
                      <div className="mt-1 flex items-center gap-2"><StatusBadge tone={status.tone}>{status.label}</StatusBadge><span className="text-[10px] text-slate-400">{item.total_weeks}주</span></div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  </button>
                )
              })}
            </div>
          )}
        </Panel>

        {!draft ? (
          <Panel><EmptyState title="관리할 학기를 선택하세요." /></Panel>
        ) : (
          <div className="space-y-5">
            <Panel
              title="학기 기본 설정"
              description={`${semesterTypes[draft.semester_type]} · ${semesterStatus[draft.status]?.label || draft.status}`}
              action={draft.status !== 'active' && draft.status !== 'archived' ? <button type="button" onClick={activateSemester} disabled={saving} className="min-h-9 rounded-md border border-teal-300 bg-teal-50 px-3 text-xs font-bold text-teal-800 hover:bg-teal-100 disabled:opacity-50">현재 학기로 전환</button> : null}
            >
              <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
                <Field label="학기 코드"><input value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} className="field" /></Field>
                <Field label="표시 이름"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="field" /></Field>
                <Field label="학기 유형"><select value={draft.semester_type} onChange={(event) => setDraft({ ...draft, semester_type: event.target.value })} className="field"><option value="regular">정규 학기</option><option value="vacation">방학 학기</option></select></Field>
                <Field label="전체 주차"><input type="number" min="1" max="52" value={draft.total_weeks} onChange={(event) => setTotalWeeks(event.target.value)} className="field" /></Field>
                <Field label="시작일"><input type="date" value={draft.starts_on} onChange={(event) => setDraft({ ...draft, starts_on: event.target.value })} className="field" /></Field>
                <Field label="종료일"><input type="date" value={draft.ends_on} onChange={(event) => setDraft({ ...draft, ends_on: event.target.value })} className="field" /></Field>
                <Field label="현재 주차"><select value={draft.current_week_no} onChange={(event) => setDraft({ ...draft, current_week_no: Number(event.target.value) })} className="field">{weeks.map((week) => <option key={week.week_no} value={week.week_no}>{week.week_no}주차</option>)}</select></Field>
                <div className="flex items-end"><button type="button" onClick={saveSemester} disabled={saving} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"><Save className="h-4 w-4" aria-hidden="true" />{saving ? '저장 중' : '전체 저장'}</button></div>
              </div>
            </Panel>

            <Panel title="주차 구성" description="주제와 상태는 세션, 마감, 제출 화면에서 공통으로 사용됩니다.">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left">
                  <thead className="bg-slate-50 text-[11px] font-bold text-slate-500">
                    <tr className="border-b border-slate-200"><th className="w-20 px-4 py-3">주차</th><th className="px-3 py-3">정규 주제</th><th className="px-3 py-3">평일 주제</th><th className="w-24 px-3 py-3">세션</th><th className="w-24 px-3 py-3">마감</th><th className="w-24 px-3 py-3">상태</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {weeks.map((week) => (
                      <tr key={week.week_no} className={Number(draft.current_week_no) === week.week_no ? 'bg-teal-50/60' : 'bg-white'}>
                        <td className="px-4 py-3 text-sm font-bold text-slate-900">{week.week_no}주차</td>
                        <td className="px-3 py-2"><input value={week.topic || ''} onChange={(event) => updateWeek(week.week_no, 'topic', event.target.value)} placeholder="주제 입력" className="table-field" /></td>
                        <td className="px-3 py-2"><input value={week.weekday_topic || ''} onChange={(event) => updateWeek(week.week_no, 'weekday_topic', event.target.value)} placeholder={draft.semester_type === 'vacation' ? '평일 세션 주제' : '-'} disabled={draft.semester_type !== 'vacation'} className="table-field disabled:bg-slate-100" /></td>
                        <td className="px-3 py-3 text-xs font-semibold text-slate-500">{sessionCounts[week.id] || 0}개</td>
                        <td className="px-3 py-3 text-xs font-semibold text-slate-500">{deadlineCounts[week.id] || 0}개</td>
                        <td className="px-3 py-3"><StatusBadge tone={week.status === 'current' ? 'teal' : week.status === 'completed' ? 'green' : week.status === 'cancelled' ? 'red' : 'gray'}>{week.status === 'current' ? '현재' : week.status === 'completed' ? '완료' : week.status === 'cancelled' ? '취소' : '예정'}</StatusBadge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        )}
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="new-semester-title">
          <div className="w-full max-w-lg rounded-md border border-slate-200 bg-white shadow-xl">
            <div className="flex min-h-16 items-center justify-between border-b border-slate-200 px-5">
              <div><p className="text-[10px] font-bold uppercase text-teal-700">New Semester</p><h2 id="new-semester-title" className="text-base font-bold text-slate-950">새 학기 생성</h2></div>
              <button type="button" onClick={() => setCreateOpen(false)} className="grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100" aria-label="닫기"><X className="h-5 w-5" aria-hidden="true" /></button>
            </div>
            <form onSubmit={createSemester} className="p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="학기 코드"><input required value={newSemester.code} onChange={(event) => setNewSemester({ ...newSemester, code: event.target.value })} placeholder="2026-2" className="field" /></Field>
                <Field label="표시 이름"><input required value={newSemester.name} onChange={(event) => setNewSemester({ ...newSemester, name: event.target.value })} placeholder="2026년 2학기" className="field" /></Field>
                <Field label="학기 유형"><select value={newSemester.semester_type} onChange={(event) => setNewSemester({ ...newSemester, semester_type: event.target.value })} className="field"><option value="regular">정규 학기</option><option value="vacation">방학 학기</option></select></Field>
                <Field label="전체 주차"><input type="number" min="1" max="52" value={newSemester.total_weeks} onChange={(event) => setNewSemester({ ...newSemester, total_weeks: Math.max(1, Math.min(52, Number(event.target.value) || 1)) })} className="field" /></Field>
                <Field label="시작일"><input type="date" value={newSemester.starts_on} onChange={(event) => setNewSemester({ ...newSemester, starts_on: event.target.value })} className="field" /></Field>
                <Field label="종료일"><input type="date" value={newSemester.ends_on} onChange={(event) => setNewSemester({ ...newSemester, ends_on: event.target.value })} className="field" /></Field>
              </div>
              <p className="mt-4 rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-600">새 학기는 준비 상태로 생성됩니다. 기존 현재 학기는 변경되지 않으며, 검토 후 별도로 전환합니다.</p>
              <div className="mt-6 flex justify-end gap-2 border-t border-slate-200 pt-4"><button type="button" onClick={() => setCreateOpen(false)} className="min-h-10 rounded-md border border-slate-200 px-4 text-sm font-bold text-slate-600">취소</button><button type="submit" disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-bold text-white disabled:opacity-50"><Check className="h-4 w-4" aria-hidden="true" />생성</button></div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .field { width: 100%; height: 40px; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0 12px; background: white; color: #0f172a; font-size: 14px; outline: none; }
        .table-field { width: 100%; height: 34px; border: 1px solid #e2e8f0; border-radius: 5px; padding: 0 10px; background: white; color: #0f172a; font-size: 12px; outline: none; }
        .field:focus, .table-field:focus { border-color: #0f766e; box-shadow: 0 0 0 3px rgba(15, 118, 110, .1); }
      `}</style>
    </AdminPage>
  )
}

function countByWeek(rows) {
  return rows.reduce((counts, row) => {
    counts[row.semester_week_id] = (counts[row.semester_week_id] || 0) + 1
    return counts
  }, {})
}

function Field({ label, children }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span>{children}</label>
}
