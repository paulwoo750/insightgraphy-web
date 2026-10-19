'use client'
// 회칙 문서 (club_rules): 장 단위로 편집하고 학회원 아카이브 회칙 열람실에 보인다
import { useCallback, useEffect, useId, useState } from 'react'
import { ArrowDown, ArrowUp, BookCopy, Plus, Save, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { CLUB_RULES } from '@/lib/clubRules'
import { formatKst, sameJson } from '@/lib/semester'
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
  PageHeader,
  Panel,
  ReadOnlyBanner,
  SaveStatus,
  textareaClass,
  useAsyncAction,
  useToast,
  useUnsavedChanges,
} from '@/app/admin/_components/AdminUI'

export default function RulesDocAdmin() {
  const { role, canWrite } = useAdminRole()
  const toast = useToast()
  const site = useSiteUrls()
  const [run, saving] = useAsyncAction()
  const [state, setState] = useState({ status: 'loading', error: '' })
  const [row, setRow] = useState(null)
  const [chapters, setChapters] = useState([])
  const [base, setBase] = useState([])

  const load = useCallback(async () => {
    setState({ status: 'loading', error: '' })
    const { data, error } = await supabase.from('club_rules').select('*').order('updated_at', { ascending: false }).limit(1)
    if (error) {
      setState({ status: 'error', error: error.message })
      return
    }
    const latest = data?.[0] || null
    let parsed = []
    if (latest) {
      try {
        const value = JSON.parse(latest.content)
        parsed = Array.isArray(value) ? value : [{ id: 1, chapter: '회칙', content: latest.content }]
      } catch {
        parsed = [{ id: 1, chapter: '회칙', content: latest.content || '' }]
      }
    }
    setRow(latest)
    setChapters(parsed)
    setBase(parsed)
    setState({ status: 'ready', error: '' })
  }, [])

  useEffect(() => {
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])

  const dirty = !sameJson(chapters, base)
  useUnsavedChanges(dirty)

  const update = (index, field, value) => setChapters((current) => current.map((chapter, chapterIndex) => chapterIndex === index ? { ...chapter, [field]: value } : chapter))
  const move = (index, direction) => setChapters((current) => {
    const next = index + direction
    if (next < 0 || next >= current.length) return current
    const copy = [...current]
    ;[copy[index], copy[next]] = [copy[next], copy[index]]
    return copy
  })

  async function save() {
    if (!canWrite || !dirty) return
    if (chapters.some((chapter) => !chapter.chapter?.trim())) {
      toast.error('모든 장(章) 제목을 입력하세요.')
      return
    }
    await run(async () => {
      const content = JSON.stringify(chapters.map((chapter, index) => ({ id: chapter.id ?? index + 1, chapter: chapter.chapter, content: chapter.content })))
      const updatedAt = new Date().toISOString()
      const result = row?.id != null
        ? await supabase.from('club_rules').update({ content, updated_at: updatedAt }).eq('id', row.id)
        : await supabase.from('club_rules').insert([{ content, updated_at: updatedAt }])
      if (result.error) {
        toast.error(`회칙을 저장하지 못했습니다: ${result.error.message}`)
        return
      }
      toast.success('회칙을 저장했습니다. 학회원 아카이브의 회칙 열람실에 반영됩니다.')
      await load()
    })
  }

  if (state.status === 'loading') return <AdminPage><LoadingState /></AdminPage>
  if (state.status === 'error') return <AdminPage><ErrorState title="회칙을 불러오지 못했습니다." description={state.error} onRetry={load} /></AdminPage>

  return (
    <AdminPage>
      <PageHeader
        eyebrow="정책 및 시스템"
        title="회칙 문서"
        description={`회칙 원문을 장 단위로 편집합니다.${row?.updated_at ? ` 마지막 저장 ${formatKst(row.updated_at)}.` : ''}`}
        actions={
          <>
            <SaveStatus state={saving ? 'saving' : dirty ? 'dirty' : 'clean'} dirtyCount={dirty ? 1 : 0} />
            <Button href={site.memberUrl('/archive?tab=rules')} target="_blank">회칙 열람실 열기</Button>
            <Button icon={BookCopy} disabled={!canWrite} onClick={() => { if (!chapters.length || confirm('편집 중인 내용을 번들 회칙(26.07.04)으로 바꿀까요? 저장해야 반영됩니다.')) setChapters(CLUB_RULES.map((chapter) => ({ ...chapter }))) }}>번들 회칙 불러오기</Button>
            <Button variant="primary" icon={Save} onClick={save} loading={saving} disabled={!canWrite || !dirty}>저장</Button>
          </>
        }
      />
      <ReadOnlyBanner role={role} />
      {chapters.length === 0 ? <Panel><EmptyState title="저장된 회칙이 없습니다." description="장을 추가하거나 번들 회칙을 불러오세요." /></Panel> : (
        <div className="space-y-4">
          {chapters.map((chapter, index) => <ChapterEditor key={chapter.id ?? index} chapter={chapter} index={index} total={chapters.length} canWrite={canWrite} onChange={update} onMove={move} onRemove={() => { if (confirm(`'${chapter.chapter || '제목 없음'}' 장을 지울까요?`)) setChapters((current) => current.filter((_, chapterIndex) => chapterIndex !== index)) }} />)}
        </div>
      )}
      <Button className="mt-4" icon={Plus} disabled={!canWrite} onClick={() => setChapters((current) => [...current, { id: Date.now(), chapter: '', content: '' }])}>장 추가</Button>
    </AdminPage>
  )
}

function ChapterEditor({ chapter, index, total, canWrite, onChange, onMove, onRemove }) {
  const titleId = useId()
  const bodyId = useId()
  return (
    <Panel
      title={`${index + 1}. ${chapter.chapter || '제목 없음'}`}
      action={
        <div className="flex gap-1">
          <IconButton icon={ArrowUp} label="위로" size="sm" variant="secondary" disabled={!canWrite || index === 0} onClick={() => onMove(index, -1)} />
          <IconButton icon={ArrowDown} label="아래로" size="sm" variant="secondary" disabled={!canWrite || index === total - 1} onClick={() => onMove(index, 1)} />
          <IconButton icon={Trash2} label="장 삭제" size="sm" variant="danger" disabled={!canWrite} onClick={onRemove} />
        </div>
      }
    >
      <div className="grid gap-3 p-4 sm:p-5">
        <Field label="장 제목" htmlFor={titleId}><input id={titleId} value={chapter.chapter || ''} onChange={(event) => onChange(index, 'chapter', event.target.value)} disabled={!canWrite} className={inputClass} /></Field>
        <Field label="본문" htmlFor={bodyId}><textarea id={bodyId} rows={10} value={chapter.content || ''} onChange={(event) => onChange(index, 'content', event.target.value)} disabled={!canWrite} className={textareaClass} /></Field>
      </div>
    </Panel>
  )
}
