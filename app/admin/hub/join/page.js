'use client'
// 지원 안내: 모집 기수와 지원서 양식 파일
// 파일은 먼저 Storage에 올리고, 그다음 공개 주소를 설정에 저장한다. 두 번째 단계만 실패하면
// 올린 파일을 다시 연결하는 버튼을 보여 준다 (다시 올릴 필요 없음).
import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, FileUp, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSiteUrls } from '@/lib/siteUrls'
import { useAdminRole } from '@/app/admin/_components/AdminShell'
import { AdminPage, Button, ErrorState, Field, inputClass, LoadingState, Notice, PageHeader, Panel, ReadOnlyBanner, useAsyncAction, useToast } from '@/app/admin/_components/AdminUI'

export default function AdminJoinPage() {
  const { role, canWrite } = useAdminRole()
  const toast = useToast()
  const site = useSiteUrls()
  const [run, pending] = useAsyncAction()
  const [state, setState] = useState({ status: 'loading', error: '' })
  const [generation, setGeneration] = useState('')
  const [savedGeneration, setSavedGeneration] = useState('')
  const [docUrl, setDocUrl] = useState('')
  const [docFile, setDocFile] = useState(null)
  const [pendingLink, setPendingLink] = useState(null)

  const load = useCallback(async () => {
    setState({ status: 'loading', error: '' })
    const { data, error } = await supabase.from('pr_config').select('key, value').in('key', ['recruiting_generation', 'application_form_url'])
    if (error) {
      setState({ status: 'error', error: error.message })
      return
    }
    const config = Object.fromEntries((data || []).map((row) => [row.key, row.value]))
    setGeneration(config.recruiting_generation || '')
    setSavedGeneration(config.recruiting_generation || '')
    setDocUrl(config.application_form_url || '')
    setState({ status: 'ready', error: '' })
  }, [])

  useEffect(() => {
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])

  async function saveGeneration() {
    if (!generation.trim()) {
      toast.error('모집 기수를 입력하세요.')
      return
    }
    await run(async () => {
      const { error } = await supabase.from('pr_config').upsert({ key: 'recruiting_generation', value: generation.trim() })
      if (error) {
        toast.error(`모집 기수를 저장하지 못했습니다: ${error.message}`)
        return
      }
      setSavedGeneration(generation.trim())
      toast.success('모집 기수를 저장했습니다.')
    })
  }

  async function linkUrl(url) {
    const { error } = await supabase.from('pr_config').upsert({ key: 'application_form_url', value: url })
    if (error) {
      setPendingLink(url)
      toast.error(`파일은 올렸지만 지원 안내에 연결하지 못했습니다: ${error.message}. 아래 '다시 연결'을 누르세요.`, { duration: 0 })
      return
    }
    setPendingLink(null)
    setDocUrl(url)
    toast.success('지원서 양식을 바꿨습니다.')
  }

  async function upload() {
    if (!docFile) {
      toast.error('올릴 지원서 파일을 고르세요.')
      return
    }
    if (docFile.size > 20 * 1024 * 1024) {
      toast.error('20MB 이하 파일만 올릴 수 있습니다.')
      return
    }
    await run(async () => {
      const ext = docFile.name.split('.').pop()
      const path = `join/application_form_${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('showcase').upload(path, docFile)
      if (uploadError) {
        toast.error(`파일을 올리지 못했습니다: ${uploadError.message}`)
        return
      }
      const publicUrl = supabase.storage.from('showcase').getPublicUrl(path).data.publicUrl
      setDocFile(null)
      await linkUrl(publicUrl)
    })
  }

  if (state.status === 'loading') return <AdminPage><LoadingState /></AdminPage>
  if (state.status === 'error') return <AdminPage><ErrorState title="지원 안내 설정을 불러오지 못했습니다." description={state.error} onRetry={load} /></AdminPage>

  return (
    <AdminPage>
      <PageHeader eyebrow="외부 사이트" title="지원 안내" description="공개 사이트 Join Us 페이지의 모집 기수와 지원서 양식 파일을 관리합니다." actions={<Button icon={ExternalLink} href={site.publicUrl('/join')} target="_blank">공개 화면 열기</Button>} />
      <ReadOnlyBanner role={role} />
      {pendingLink && (
        <Notice tone="danger" className="mb-4" title="올린 파일이 아직 연결되지 않았습니다" action={<Button size="sm" variant="primary" onClick={() => run(() => linkUrl(pendingLink))} loading={pending}>다시 연결</Button>}>
          {pendingLink}
        </Notice>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="모집 기수" description="예: 31기">
          <form className="flex flex-wrap items-end gap-2 p-4 sm:p-5" onSubmit={(event) => { event.preventDefault(); saveGeneration() }}>
            <Field label="현재 모집 기수" htmlFor="recruit-generation" className="min-w-[200px] flex-1">
              <input id="recruit-generation" value={generation} onChange={(event) => setGeneration(event.target.value)} disabled={!canWrite} className={inputClass} />
            </Field>
            <Button type="submit" variant="primary" icon={Save} loading={pending} disabled={!canWrite || generation.trim() === savedGeneration}>저장</Button>
          </form>
        </Panel>
        <Panel title="지원서 양식 (.doc, .docx)" description="지원자가 내려받는 최신 지원서 파일입니다.">
          <div className="space-y-3 p-4 sm:p-5">
            {docUrl ? <a href={docUrl} target="_blank" rel="noopener noreferrer" className="block break-all rounded-md bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800 hover:underline">현재 파일: {decodeURIComponent(docUrl.split('/').pop())}</a> : <p className="text-sm text-slate-500">등록된 파일이 없습니다.</p>}
            <Field label="새 파일" htmlFor="join-file" hint="20MB 이하">
              <input id="join-file" type="file" accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setDocFile(event.target.files?.[0] || null)} disabled={!canWrite} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-sm file:font-bold file:text-teal-800" />
            </Field>
            <Button variant="primary" icon={FileUp} onClick={upload} loading={pending} disabled={!canWrite || !docFile}>올리고 바꾸기</Button>
          </div>
        </Panel>
      </div>
    </AdminPage>
  )
}
