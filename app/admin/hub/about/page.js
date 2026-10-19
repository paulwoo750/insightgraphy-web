'use client'
// 학회 소개(/about) 문구와 알럼나이 인터뷰
// 인터뷰는 ID를 유지한 채 저장한다 (기존 /about/interviews/[id] 주소 보호).
// 카드의 큰따옴표 자리에는 "인터뷰 한 줄 요약"을 보여 주며, AI로 만든 뒤 고쳐서 저장할 수 있다.
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ExternalLink, MessageSquareQuote, Plus, Save, Sparkles, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { sameJson } from '@/lib/semester'
import { normalizeQna, qnaFingerprint, summaryLengthNote } from '@/lib/alumniSummary'
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

const DEFAULT_CONTENT = {
  vision: { subtitle: 'Precision in Vision,\nValue in Insight.', desc: '' },
  coreValues: [
    { icon: '📄', title: '기획', desc: '매주 시의적인 주제에 대해 창의적으로 문제 정의 및 해결', color: 'border-[#238986]', bg: 'bg-[#2d3e50]' },
    { icon: '📢', title: '발표', desc: '도출한 해결책을 자신만의 컨텐츠로 공유', color: 'border-[#22c55e]', bg: 'bg-[#2d3d33]' },
    { icon: '👯', title: '소통', desc: '피드백을 통해 성숙한 기획자 및 프레젠터로 성장', color: 'border-[#238986]', bg: 'bg-[#4d452e]' },
  ],
  igdValues: [
    { icon: '💡', title: 'Insight', desc: '깊은 생각으로 끌어내는 통찰력', bg: 'bg-[#2d3e50]' },
    { icon: '🪜', title: 'Graphic', desc: '효과적인 표현을 위한 시각화 능력', bg: 'bg-[#2d3d33]' },
    { icon: '🗣️', title: 'Delivery', desc: '명확하고 자신 있는 전달력', bg: 'bg-[#4d452e]' },
  ],
  welcomeMsg: '자신의 창의적인 아이디어를 당당하게 말하며 성장할\n스스로를 마주하게 될 IGer들을 환영합니다 🖐️',
}

const ALUMNI_FIELDS = ['generation', 'name', 'university', 'dept', 'short_quote', 'qna_json']
const SUMMARY_FIELDS = ['summary_line', 'summary_origin', 'summary_source_hash', 'summary_model', 'summary_generated_at']
let draftCounter = 0

function summaryState(alumnus) {
  if (!alumnus.summary_line) return { label: '요약 없음', tone: 'gray' }
  if (alumnus.summary_source_hash && alumnus.summary_source_hash !== qnaFingerprint(alumnus.qna_json)) return { label: '요약 갱신 필요', tone: 'amber' }
  return alumnus.summary_origin === 'ai' ? { label: 'AI 요약', tone: 'teal' } : { label: '직접 입력 요약', tone: 'blue' }
}

export default function AboutManager() {
  const { role, canWrite } = useAdminRole()
  const toast = useToast()
  const site = useSiteUrls()
  const [run, saving] = useAsyncAction()
  const [state, setState] = useState({ status: 'loading', error: '' })
  const [content, setContent] = useState(DEFAULT_CONTENT)
  const [baseContent, setBaseContent] = useState(DEFAULT_CONTENT)
  const [alumni, setAlumni] = useState([])
  const [baseAlumni, setBaseAlumni] = useState([])
  const [deletedIds, setDeletedIds] = useState([])
  const [summaryReady, setSummaryReady] = useState(false)
  const [editingKey, setEditingKey] = useState(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setState({ status: 'loading', error: '' })
    const [contentResult, alumniResult, probe] = await Promise.all([
      supabase.from('pr_about_content').select('*').eq('id', 'main').maybeSingle(),
      supabase.from('pr_about_alumni').select('*').order('order_num', { ascending: true }),
      supabase.from('pr_about_alumni').select('summary_line').limit(1),
    ])
    const error = contentResult.error || alumniResult.error
    if (error) {
      setState({ status: 'error', error: error.message })
      return
    }
    const row = contentResult.data
    const loaded = row ? {
      vision: { subtitle: row.vision_subtitle || '', desc: row.vision_desc || '' },
      coreValues: row.core_values?.length ? row.core_values : DEFAULT_CONTENT.coreValues,
      igdValues: row.igd_values?.length ? row.igd_values : DEFAULT_CONTENT.igdValues,
      welcomeMsg: row.welcome_msg || '',
    } : DEFAULT_CONTENT
    const rows = (alumniResult.data || []).map((item) => ({ ...item, key: `id-${item.id}`, qna_json: normalizeQna(item.qna_json) }))
    setContent(loaded)
    setBaseContent(loaded)
    setAlumni(rows)
    setBaseAlumni(rows)
    setDeletedIds([])
    setSummaryReady(!probe.error)
    setState({ status: 'ready', error: '' })
  }, [])

  useEffect(() => {
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])

  const contentDirty = !sameJson(content, baseContent)
  const alumniDirty = !sameJson(alumni, baseAlumni) || deletedIds.length > 0
  const dirtyCount = (contentDirty ? 1 : 0) + (alumniDirty ? 1 : 0)
  useUnsavedChanges(dirtyCount > 0)

  const editing = alumni.find((item) => item.key === editingKey) || null

  function updateAlumnus(key, patch) {
    setAlumni((rows) => rows.map((row) => row.key === key ? { ...row, ...patch } : row))
  }

  function addAlumnus() {
    draftCounter += 1
    const key = `new-${draftCounter}`
    setAlumni((rows) => [...rows, { key, generation: '', name: '', university: '', dept: '', short_quote: '', qna_json: [], summary_line: '', summary_origin: null }])
    setEditingKey(key)
  }

  function removeAlumnus(key) {
    const target = alumni.find((row) => row.key === key)
    if (!target) return
    const warning = target.id ? `\n이 인터뷰의 공개 주소(/about/interviews/${target.id})도 더 이상 열리지 않습니다.` : ''
    if (!confirm(`${target.name || '이름 없는'} 선배님 인터뷰를 삭제할까요?${warning}\n저장해야 반영됩니다.`)) return
    if (target.id) setDeletedIds((ids) => [...new Set([...ids, target.id])])
    setAlumni((rows) => rows.filter((row) => row.key !== key))
  }

  function move(key, direction) {
    setAlumni((rows) => {
      const index = rows.findIndex((row) => row.key === key)
      const next = index + direction
      if (index < 0 || next < 0 || next >= rows.length) return rows
      const copy = [...rows]
      ;[copy[index], copy[next]] = [copy[next], copy[index]]
      return copy
    })
  }

  async function saveAll() {
    if (!canWrite || dirtyCount === 0) return
    const missingNames = alumni.filter((row) => !row.name?.trim()).length
    if (missingNames) {
      toast.error(`이름이 비어 있는 인터뷰가 ${missingNames}개 있습니다. 이름을 입력하거나 삭제한 뒤 저장하세요.`)
      return
    }
    await run(async () => {
      const done = []
      const fail = []
      if (contentDirty) {
        const { error } = await supabase.from('pr_about_content').upsert({
          id: 'main',
          vision_subtitle: content.vision.subtitle,
          vision_desc: content.vision.desc,
          core_values: content.coreValues,
          igd_values: content.igdValues,
          welcome_msg: content.welcomeMsg,
        })
        if (error) fail.push(`소개 문구: ${error.message}`)
        else done.push('소개 문구')
      }
      if (alumniDirty) {
        const toRow = (row, index) => {
          const record = Object.fromEntries(ALUMNI_FIELDS.map((field) => [field, field === 'qna_json' ? normalizeQna(row.qna_json) : row[field] ?? '']))
          record.order_num = index + 1
          if (summaryReady) for (const field of SUMMARY_FIELDS) record[field] = row[field] ?? null
          return record
        }
        const existing = alumni.map((row, index) => ({ row, index })).filter(({ row }) => row.id)
        const changed = existing.filter(({ row, index }) => {
          const base = baseAlumni.find((item) => item.id === row.id)
          return !base || !sameJson(toRow(row, index), toRow(base, baseAlumni.indexOf(base))) || index !== baseAlumni.indexOf(base)
        })
        if (changed.length) {
          // ID를 그대로 두고 내용·순서만 바꾼다
          const { error } = await supabase.from('pr_about_alumni').upsert(changed.map(({ row, index }) => ({ id: row.id, ...toRow(row, index) })))
          if (error) fail.push(`인터뷰 수정 ${changed.length}건: ${error.message}`)
          else done.push(`인터뷰 수정 ${changed.length}건`)
        }
        const added = alumni.map((row, index) => ({ row, index })).filter(({ row }) => !row.id)
        if (added.length) {
          const { error } = await supabase.from('pr_about_alumni').insert(added.map(({ row, index }) => toRow(row, index)))
          if (error) fail.push(`인터뷰 추가 ${added.length}건: ${error.message}`)
          else done.push(`인터뷰 추가 ${added.length}건`)
        }
        if (deletedIds.length) {
          const { error } = await supabase.from('pr_about_alumni').delete().in('id', deletedIds)
          if (error) fail.push(`인터뷰 삭제 ${deletedIds.length}건: ${error.message}`)
          else done.push(`인터뷰 삭제 ${deletedIds.length}건`)
        }
      }
      if (fail.length) {
        setFailed(true)
        toast.error(`${fail.join(' / ')}${done.length ? ` (저장된 항목: ${done.join(', ')})` : ''}`, { title: done.length ? '일부만 저장되었습니다' : '저장하지 못했습니다', duration: 0 })
        if (done.length) await load()
        return
      }
      setFailed(false)
      toast.success(`저장했습니다: ${done.join(', ')}. 기존 인터뷰 주소는 그대로입니다.`)
      await load()
    })
  }

  if (state.status === 'loading') return <AdminPage><LoadingState /></AdminPage>
  if (state.status === 'error') return <AdminPage><ErrorState title="학회 소개를 불러오지 못했습니다." description={state.error} onRetry={load} /></AdminPage>

  const updateList = (listKey, index, field, value) => setContent((current) => ({ ...current, [listKey]: current[listKey].map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item) }))

  return (
    <AdminPage>
      <PageHeader
        eyebrow="외부 사이트"
        title="학회 소개"
        description="공개 사이트 /about의 비전·핵심 가치·역량 문구와 알럼나이 인터뷰를 관리합니다."
        actions={
          <>
            <SaveStatus state={saving ? 'saving' : failed ? 'error' : dirtyCount ? 'dirty' : 'clean'} dirtyCount={dirtyCount} />
            <Button icon={ExternalLink} href={site.publicUrl('/about')} target="_blank">공개 화면 열기</Button>
            <Button variant="primary" icon={Save} onClick={saveAll} loading={saving} disabled={!canWrite || dirtyCount === 0}>저장</Button>
          </>
        }
      />
      <ReadOnlyBanner role={role} />
      {!summaryReady && (
        <Notice tone="warning" className="mb-4" title="인터뷰 한 줄 요약을 저장하려면 STEP 18 SQL이 필요합니다">
          지금은 기존 인용구(short_quote)만 저장됩니다. STEP 18 실행 후 새로고침하면 요약 편집이 열립니다.
        </Notice>
      )}

      <div className="space-y-5">
        <Panel title="알럼나이 인터뷰" description={`${alumni.length}명 · 순서는 위·아래 버튼으로 바꿉니다. 저장해도 인터뷰 주소(ID)는 바뀌지 않습니다.`} action={<Button size="sm" icon={Plus} onClick={addAlumnus} disabled={!canWrite}>인터뷰 추가</Button>}>
          {alumni.length === 0 ? <EmptyState title="등록된 인터뷰가 없습니다." /> : (
            <ul className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {alumni.map((alumnus, index) => {
                const status = summaryState(alumnus)
                return (
                  <li key={alumnus.key} className="flex flex-col rounded-md border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-teal-700">{[alumnus.generation, alumnus.university, alumnus.dept].filter(Boolean).join(' · ') || '소속 미입력'}</p>
                        <p className="truncate text-base font-bold text-slate-900">{alumnus.name || '이름 없음'}</p>
                        <p className="text-xs text-slate-500">{alumnus.id ? `주소 /about/interviews/${alumnus.id}` : '새 인터뷰 (저장 후 주소 생성)'} · 문답 {alumnus.qna_json.length}개</p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <IconButton icon={ArrowUp} label={`${alumnus.name || '인터뷰'} 위로`} size="sm" variant="secondary" onClick={() => move(alumnus.key, -1)} disabled={!canWrite || index === 0} />
                        <IconButton icon={ArrowDown} label={`${alumnus.name || '인터뷰'} 아래로`} size="sm" variant="secondary" onClick={() => move(alumnus.key, 1)} disabled={!canWrite || index === alumni.length - 1} />
                        <IconButton icon={Trash2} label={`${alumnus.name || '인터뷰'} 삭제`} size="sm" variant="danger" onClick={() => removeAlumnus(alumnus.key)} disabled={!canWrite} />
                      </div>
                    </div>
                    <div className="mt-3 flex-1 rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                      <p className="mt-1.5 break-keep">{alumnus.summary_line || alumnus.short_quote || <span className="text-slate-400">카드에 보일 문장이 없습니다.</span>}</p>
                    </div>
                    <Button className="mt-3 w-full" icon={MessageSquareQuote} onClick={() => setEditingKey(alumnus.key)}>인터뷰·요약 편집</Button>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <Panel title="비전">
          <div className="grid gap-4 p-4 sm:p-5">
            <TextArea label="슬로건 (줄바꿈 가능)" rows={2} value={content.vision.subtitle} disabled={!canWrite} onChange={(value) => setContent((current) => ({ ...current, vision: { ...current.vision, subtitle: value } }))} />
            <TextArea label="상세 설명 (줄바꿈 가능)" rows={6} value={content.vision.desc} disabled={!canWrite} onChange={(value) => setContent((current) => ({ ...current, vision: { ...current.vision, desc: value } }))} />
          </div>
        </Panel>

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel title="3대 핵심 가치">
            <div className="space-y-3 p-4 sm:p-5">
              {content.coreValues.map((item, index) => (
                <div key={index} className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-md border border-slate-200 p-3">
                  <TextInput label="아이콘" value={item.icon} disabled={!canWrite} onChange={(value) => updateList('coreValues', index, 'icon', value)} />
                  <TextInput label="제목" value={item.title} disabled={!canWrite} onChange={(value) => updateList('coreValues', index, 'title', value)} />
                  <div className="col-span-2"><TextInput label="설명" value={item.desc} disabled={!canWrite} onChange={(value) => updateList('coreValues', index, 'desc', value)} /></div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="IGD 핵심 역량">
            <div className="space-y-3 p-4 sm:p-5">
              {content.igdValues.map((item, index) => (
                <div key={index} className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-md border border-slate-200 p-3">
                  <TextInput label="아이콘" value={item.icon} disabled={!canWrite} onChange={(value) => updateList('igdValues', index, 'icon', value)} />
                  <TextInput label="제목" value={item.title} disabled={!canWrite} onChange={(value) => updateList('igdValues', index, 'title', value)} />
                  <div className="col-span-2"><TextInput label="설명" value={item.desc} disabled={!canWrite} onChange={(value) => updateList('igdValues', index, 'desc', value)} /></div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <Panel title="환영 문구">
          <div className="p-4 sm:p-5">
            <TextArea label="페이지 아래 환영 문구 (줄바꿈 가능)" rows={2} value={content.welcomeMsg} disabled={!canWrite} onChange={(value) => setContent((current) => ({ ...current, welcomeMsg: value }))} />
          </div>
        </Panel>
      </div>

      {editing && (
        <InterviewEditor
          alumnus={editing}
          canWrite={canWrite}
          summaryReady={summaryReady}
          onChange={(patch) => updateAlumnus(editing.key, patch)}
          onClose={() => setEditingKey(null)}
        />
      )}
    </AdminPage>
  )
}

function TextInput({ label, value, onChange, disabled }) {
  const id = useId()
  return <Field label={label} htmlFor={id}><input id={id} value={value ?? ''} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={inputClass} /></Field>
}

function TextArea({ label, value, onChange, disabled, rows = 3 }) {
  const id = useId()
  return <Field label={label} htmlFor={id}><textarea id={id} rows={rows} value={value ?? ''} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={textareaClass} /></Field>
}

function InterviewEditor({ alumnus, canWrite, summaryReady, onChange, onClose }) {
  const toast = useToast()
  const [generate, generating] = useAsyncAction()
  const [candidate, setCandidate] = useState(null)
  const qna = useMemo(() => alumnus.qna_json || [], [alumnus.qna_json])
  const currentHash = useMemo(() => qnaFingerprint(qna), [qna])
  const stale = Boolean(alumnus.summary_line) && Boolean(alumnus.summary_source_hash) && alumnus.summary_source_hash !== currentHash

  function setQna(next) {
    onChange({ qna_json: next })
  }

  async function makeSummary() {
    await generate(async () => {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      if (!token) {
        toast.error('로그인이 만료되었습니다. 다시 로그인해 주세요.')
        return
      }
      let result
      try {
        const response = await fetch('/api/alumni-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ alumniId: alumnus.id || null, name: alumnus.name, qna }),
        })
        result = await response.json().catch(() => ({ status: 'failed', message: '응답을 읽지 못했습니다.' }))
      } catch {
        result = { status: 'failed', message: '서버에 연결하지 못했습니다.' }
      }
      if (result.status !== 'ok') {
        toast.error(`${result.message || '요약을 만들지 못했습니다.'} 기존 요약은 그대로입니다.`, { title: result.status === 'not_configured' ? 'AI 요약 준비가 필요합니다' : 'AI 요약 실패' })
        return
      }
      setCandidate(result)
    })
  }

  function applyCandidate() {
    onChange({
      summary_line: candidate.summary,
      summary_origin: 'ai',
      summary_source_hash: candidate.sourceHash,
      summary_model: candidate.model,
      summary_generated_at: candidate.generatedAt,
    })
    setCandidate(null)
    toast.info('요약을 적용했습니다. 저장 버튼을 눌러야 공개 화면에 반영됩니다.')
  }

  function editSummary(value) {
    // 직접 고치면 출처를 직접 입력으로 바꾸고, 지금 본문을 기준으로 확인한 것으로 기록한다
    onChange({ summary_line: value, summary_origin: value ? 'manual' : null, summary_source_hash: value ? currentHash : null, summary_model: null, summary_generated_at: null })
  }

  return (
    <Modal title={`${alumnus.name || '이름 없음'} 선배님 인터뷰`} description="여기서 고친 내용은 페이지 위쪽 저장 버튼을 눌러야 반영됩니다." onClose={onClose} size="xl" footer={<Button variant="primary" onClick={onClose}>편집 완료</Button>}>
      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <TextInput label="기수" value={alumnus.generation} disabled={!canWrite} onChange={(value) => onChange({ generation: value })} />
            <TextInput label="이름" value={alumnus.name} disabled={!canWrite} onChange={(value) => onChange({ name: value })} />
            <TextInput label="대학" value={alumnus.university} disabled={!canWrite} onChange={(value) => onChange({ university: value })} />
            <TextInput label="학과·소속" value={alumnus.dept} disabled={!canWrite} onChange={(value) => onChange({ dept: value })} />
          </div>
          <TextArea label="직접 인용 (선배님이 한 말 그대로, 선택)" rows={2} value={alumnus.short_quote} disabled={!canWrite} onChange={(value) => onChange({ short_quote: value })} />
          <section className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900">문답 ({qna.length}개)</h3>
            {qna.map((item, index) => (
              <div key={index} className="space-y-2 rounded-md border border-slate-200 p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-2 text-sm font-bold text-teal-700">Q{index + 1}</span>
                  <textarea aria-label={`질문 ${index + 1}`} rows={2} value={item.question} onChange={(event) => setQna(qna.map((entry, entryIndex) => entryIndex === index ? { ...entry, question: event.target.value } : entry))} disabled={!canWrite} className={textareaClass} />
                  <IconButton icon={Trash2} label={`문답 ${index + 1} 삭제`} size="sm" variant="danger" onClick={() => { if (confirm('이 문답을 삭제할까요?')) setQna(qna.filter((_, entryIndex) => entryIndex !== index)) }} disabled={!canWrite} />
                </div>
                <textarea aria-label={`답변 ${index + 1}`} rows={5} value={item.answer} onChange={(event) => setQna(qna.map((entry, entryIndex) => entryIndex === index ? { ...entry, answer: event.target.value } : entry))} disabled={!canWrite} className={textareaClass} />
              </div>
            ))}
            <Button icon={Plus} onClick={() => setQna([...qna, { question: '', answer: '' }])} disabled={!canWrite}>문답 추가</Button>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-md border border-slate-200 p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Sparkles className="h-4 w-4 text-teal-700" aria-hidden="true" />인터뷰 한 줄 요약</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">문답 전체를 근거로 한 한국어 한 문장(40~80자). 원문에 없는 내용은 넣지 않습니다. 공개 카드에는 &lsquo;인터뷰 한 줄 요약&rsquo;으로 표시되어 직접 인용과 구분됩니다.</p>
            {stale && <Notice tone="warning" className="mt-3">요약을 만든 뒤 인터뷰 본문이 바뀌었습니다. 다시 만들거나 내용을 확인하세요.</Notice>}
            <div className="mt-3">
              <TextArea label="카드에 보일 요약" rows={3} value={alumnus.summary_line || ''} disabled={!canWrite || !summaryReady} onChange={editSummary} />
              <p className="mt-1 text-xs text-slate-500">{summaryLengthNote(alumnus.summary_line)}{alumnus.summary_origin ? ` · ${alumnus.summary_origin === 'ai' ? `AI 생성${alumnus.summary_model ? ` (${alumnus.summary_model})` : ''}` : '직접 입력'}` : ''}</p>
            </div>
            <Button className="mt-3 w-full" icon={Sparkles} onClick={makeSummary} loading={generating} disabled={!canWrite || !summaryReady || qna.length === 0}>
              {alumnus.summary_line ? 'AI로 다시 만들기' : 'AI로 요약 만들기'}
            </Button>
            {candidate && (
              <div className="mt-3 rounded-md border border-teal-300 bg-teal-50 p-3">
                <p className="text-xs font-bold text-teal-800">새 요약 미리보기 · {summaryLengthNote(candidate.summary)}</p>
                <p className="mt-1 break-keep text-sm leading-6 text-slate-900">{candidate.summary}</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="primary" onClick={applyCandidate}>이 요약 쓰기</Button>
                  <Button size="sm" onClick={() => setCandidate(null)}>버리기</Button>
                </div>
              </div>
            )}
          </section>
          <section>
            <p className="mb-2 text-xs font-bold text-slate-500">공개 카드 미리보기 (저장 전)</p>
            <div className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-widest text-[#32a4a1]">{alumnus.generation} / {alumnus.university} {alumnus.dept}</p>
              <p className="mt-2 text-lg font-black text-slate-900">{alumnus.name} Alumni님</p>
              <div className="my-3 h-px w-8 bg-[#32a4a1]" />
              {alumnus.summary_line ? (
                <>
                  <p className="text-[11px] font-bold text-slate-400">인터뷰 한 줄 요약</p>
                  <p className="mt-1 break-keep text-sm font-medium leading-relaxed text-slate-600">{alumnus.summary_line}</p>
                </>
              ) : (
                <p className="whitespace-pre-wrap break-keep text-sm font-medium leading-relaxed text-slate-500">{alumnus.short_quote ? `“${alumnus.short_quote}”` : ''}</p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </Modal>
  )
}
