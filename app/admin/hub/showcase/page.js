'use client'
// 쇼케이스: 썸네일·PDF를 Storage에 올리고 작품 행을 만든다.
// 중간에 실패하면 이미 올린 파일 주소를 기억해 두고, 다시 시도할 때 남은 단계만 진행한다.
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ExternalLink, FileUp, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSiteUrls } from '@/lib/siteUrls'
import { useAdminRole } from '@/app/admin/_components/AdminShell'
import { AdminPage, Button, EmptyState, ErrorState, Field, inputClass, LoadingState, Notice, PageHeader, Panel, ReadOnlyBanner, StatusBadge, useAsyncAction, useToast } from '@/app/admin/_components/AdminUI'

const blankForm = { author: '', generation: '', topic: '', title: '' }

export default function AdminShowcasePage() {
  const { role, canWrite } = useAdminRole()
  const toast = useToast()
  const site = useSiteUrls()
  const [run, pending] = useAsyncAction()
  const [state, setState] = useState({ status: 'loading', error: '' })
  const [works, setWorks] = useState([])
  const [featured, setFeatured] = useState([])
  const [form, setForm] = useState(blankForm)
  const [files, setFiles] = useState({ thumb: null, pdf: null })
  const [uploaded, setUploaded] = useState({ thumbUrl: '', pdfUrl: '' })
  const thumbRef = useRef(null)
  const pdfRef = useRef(null)

  const load = useCallback(async () => {
    setState({ status: 'loading', error: '' })
    const [workResult, landingResult] = await Promise.all([
      supabase.from('pr_showcase').select('*').order('created_at', { ascending: false }),
      supabase.from('pr_landing_config').select('selected_showcases').eq('id', 'main').maybeSingle(),
    ])
    if (workResult.error) {
      setState({ status: 'error', error: workResult.error.message })
      return
    }
    setWorks(workResult.data || [])
    setFeatured(landingResult.data?.selected_showcases || [])
    setState({ status: 'ready', error: '' })
  }, [])

  useEffect(() => {
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])

  async function uploadFile(file, folder) {
    const ext = file.name.split('.').pop()
    const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
    const { error } = await supabase.storage.from('showcase').upload(path, file)
    if (error) throw new Error(`${folder === 'thumbnails' ? '썸네일' : 'PDF'} 업로드 실패: ${error.message}`)
    return supabase.storage.from('showcase').getPublicUrl(path).data.publicUrl
  }

  async function submit(event) {
    event.preventDefault()
    if (!canWrite) return
    if (Object.values(form).some((value) => !value.trim()) || (!files.thumb && !uploaded.thumbUrl) || (!files.pdf && !uploaded.pdfUrl)) {
      toast.error('모든 항목을 입력하고 썸네일과 PDF를 첨부하세요.')
      return
    }
    await run(async () => {
      let progress = { ...uploaded }
      try {
        if (!progress.thumbUrl) {
          progress = { ...progress, thumbUrl: await uploadFile(files.thumb, 'thumbnails') }
          setUploaded(progress)
        }
        if (!progress.pdfUrl) {
          progress = { ...progress, pdfUrl: await uploadFile(files.pdf, 'pdfs') }
          setUploaded(progress)
        }
        const { error } = await supabase.from('pr_showcase').insert([{ ...form, thumb_url: progress.thumbUrl, pdf_url: progress.pdfUrl }])
        if (error) throw new Error(`작품 등록 실패: ${error.message}`)
      } catch (error) {
        toast.error(`${error.message}. 이미 올린 파일은 기억해 두었으니 '다시 시도'를 누르세요.`, { duration: 0 })
        return
      }
      toast.success('쇼케이스 작품을 등록했습니다. 메인 노출은 메인 화면에서 고릅니다.')
      setForm(blankForm)
      setFiles({ thumb: null, pdf: null })
      setUploaded({ thumbUrl: '', pdfUrl: '' })
      if (thumbRef.current) thumbRef.current.value = ''
      if (pdfRef.current) pdfRef.current.value = ''
      await load()
    })
  }

  async function remove(work) {
    const isFeatured = featured.includes(work.id)
    if (!confirm(`'${work.title}' 작품을 쇼케이스에서 지울까요?${isFeatured ? '\n메인 화면에 노출 중인 작품입니다. 지우면 메인에서도 빠집니다.' : ''}\n올린 파일은 Storage에 남습니다.`)) return
    await run(async () => {
      const { error } = await supabase.from('pr_showcase').delete().eq('id', work.id)
      if (error) {
        toast.error(`삭제하지 못했습니다: ${error.message}`)
        return
      }
      toast.success('작품을 지웠습니다.')
      await load()
    })
  }

  if (state.status === 'loading') return <AdminPage><LoadingState /></AdminPage>
  if (state.status === 'error') return <AdminPage><ErrorState title="쇼케이스를 불러오지 못했습니다." description={state.error} onRetry={load} /></AdminPage>

  const retrying = Boolean(uploaded.thumbUrl || uploaded.pdfUrl)

  return (
    <AdminPage>
      <PageHeader eyebrow="외부 사이트" title="쇼케이스" description="공개 사이트 Showcase에 보이는 우수 작품을 관리합니다." actions={<Button icon={ExternalLink} href={site.publicUrl('/showcase')} target="_blank">공개 화면 열기</Button>} />
      <ReadOnlyBanner role={role} />
      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Panel title="새 작품 등록" className="self-start">
          <form onSubmit={submit} className="space-y-3 p-4">
            {retrying && <Notice tone="warning">이전 시도에서 {[uploaded.thumbUrl && '썸네일', uploaded.pdfUrl && 'PDF'].filter(Boolean).join('·')}은 올라갔습니다. 다시 시도하면 남은 단계만 진행합니다.</Notice>}
            <div className="grid grid-cols-2 gap-3">
              <TextField label="발표자" value={form.author} onChange={(value) => setForm({ ...form, author: value })} disabled={!canWrite} />
              <TextField label="기수" value={form.generation} onChange={(value) => setForm({ ...form, generation: value })} disabled={!canWrite} />
            </div>
            <TextField label="주차 주제" value={form.topic} onChange={(value) => setForm({ ...form, topic: value })} disabled={!canWrite} />
            <TextField label="발표 제목" value={form.title} onChange={(value) => setForm({ ...form, title: value })} disabled={!canWrite} />
            <Field label="표지 썸네일 (이미지)" htmlFor="showcase-thumb" hint={uploaded.thumbUrl ? '올라감' : undefined}>
              <input id="showcase-thumb" ref={thumbRef} type="file" accept="image/*" onChange={(event) => setFiles((current) => ({ ...current, thumb: event.target.files?.[0] || null }))} disabled={!canWrite || Boolean(uploaded.thumbUrl)} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-sm file:font-bold file:text-teal-800" />
            </Field>
            <Field label="발표자료 (PDF)" htmlFor="showcase-pdf" hint={uploaded.pdfUrl ? '올라감' : undefined}>
              <input id="showcase-pdf" ref={pdfRef} type="file" accept="application/pdf" onChange={(event) => setFiles((current) => ({ ...current, pdf: event.target.files?.[0] || null }))} disabled={!canWrite || Boolean(uploaded.pdfUrl)} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-sm file:font-bold file:text-teal-800" />
            </Field>
            <Button type="submit" variant="primary" icon={FileUp} className="w-full" loading={pending} disabled={!canWrite}>{retrying ? '다시 시도' : '등록'}</Button>
          </form>
        </Panel>
        <Panel title="등록된 작품" description={`${works.length}개 · 메인 노출 ${featured.length}개`}>
          {works.length === 0 ? <EmptyState title="등록된 작품이 없습니다." /> : (
            <ul className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {works.map((work) => (
                <li key={work.id} className="overflow-hidden rounded-md border border-slate-200">
                  <div className="aspect-video bg-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={work.thumb_url} alt="" loading="lazy" className="h-full w-full object-contain" />
                  </div>
                  <div className="space-y-1 p-3">
                    <p className="truncate text-xs font-bold text-teal-700">{work.topic}</p>
                    <p className="truncate text-sm font-bold text-slate-900">{work.title}</p>
                    <p className="text-xs text-slate-500">{work.author} · {work.generation}</p>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {featured.includes(work.id) && <StatusBadge tone="teal">메인 노출</StatusBadge>}
                      <Button size="sm" href={work.pdf_url} target="_blank" icon={ExternalLink}>PDF</Button>
                      <Button size="sm" variant="danger" icon={Trash2} onClick={() => remove(work)} disabled={!canWrite || pending}>삭제</Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </AdminPage>
  )
}

function TextField({ label, value, onChange, disabled }) {
  const id = useId()
  return <Field label={label} htmlFor={id}><input id={id} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={inputClass} /></Field>
}
