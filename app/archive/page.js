'use client'
import { useCallback, useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Download, ExternalLink, FileText, FolderOpen, FolderPlus, Pencil, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { CLUB_RULES } from '@/lib/clubRules'
import { fetchCurrentSemester, formatKst, parseJson } from '@/lib/semester'
import { FOLDER_PLACEHOLDER_TITLE, deleteSubmittedFile } from '@/lib/archive'
import { canWrite } from '@/lib/permissions'
import { MemberHeader, MemberPage, useMember } from '@/app/components/MemberShell'
import FileThumbnail from '@/app/components/FileThumbnail'
import { Button, EmptyState, ErrorState, Field, IconButton, inputClass, LoadingState, SegmentedControl, useAsyncAction, useToast } from '@/app/components/ui'
import PastArchive from './_components/PastArchive'
import ArchiveModal from './_components/ArchiveModal'

const TABS = [
  { key: 'past', label: '과거 자료실' },
  { key: 'edu', label: '교육자료실' },
  { key: 'special', label: '특별세션 자료실' },
  { key: 'template', label: '양식 자료실' },
  { key: 'rules', label: '회칙 열람실' },
]
const EDU_SECTIONS = ['Insight', 'Graphic', 'Delivery', '기타']
const GOOGLE_DRIVE_FOLDER_URL = 'https://drive.google.com/drive/folders/1N4BAGYNk5PQEdPxQP5zUAuPehWQkr5bV?usp=drive_link'

const isDriveUrl = (url) => url.includes('drive.google.com') || url.includes('docs.google.com')
const isYoutubeUrl = (url) => url.includes('youtube.com') || url.includes('youtu.be')

const EMPTY_ARCHIVE = { currentCode: '', pastFiles: [], semesters: [], weekRows: [], archiveFiles: [], absenceRows: [], rules: [] }

export default function ArchivePage() {
  return (
    <Suspense fallback={<MemberPage><LoadingState label="아카이브를 여는 중입니다." /></MemberPage>}>
      <ArchiveUserPage />
    </Suspense>
  )
}

function ArchiveUserPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const identity = useMember()
  const toast = useToast()
  const [run, busy] = useAsyncAction()
  // 탭은 URL(?tab=)이 단일 기준이다. 탭 버튼은 공통 틀의 섹션 탭(아카이브 메뉴)이 그린다
  const tabParam = searchParams.get('tab')
  const activeTab = TABS.some((tab) => tab.key === tabParam) ? tabParam : 'past'

  const [state, setState] = useState({ status: 'loading', error: '' })
  const [archive, setArchive] = useState(EMPTY_ARCHIVE)
  const [editResource, setEditResource] = useState(null)
  const [creatingFolder, setCreatingFolder] = useState(false)

  const loadArchive = useCallback(async () => {
    const current = await fetchCurrentSemester()
    // 과거 자료 = 예전 방식으로 이관된 파일 + 현재 학기가 아닌 학기의 파일 (학기 전환은 is_archive를 바꾸지 않는다)
    const pastQuery = supabase.from('files_metadata').select('*').order('week', { ascending: true }).order('created_at', { ascending: true })
    const [pastRes, archiveRes, semesterRes, weekRes, rulesRes] = await Promise.all([
      current.code ? pastQuery.or(`is_archive.eq.true,semester.neq."${current.code}"`) : pastQuery.eq('is_archive', true),
      supabase.from('archive_files').select('*').order('created_at', { ascending: false }),
      supabase.from('semesters').select('id, code, name, status'),
      supabase.from('semester_weeks').select('semester_id, week_no, topic, weekday_topic'),
      supabase.from('club_rules').select('content').order('updated_at', { ascending: false }).limit(1),
    ])
    const failed = [pastRes, archiveRes, semesterRes].find((result) => result.error)
    if (failed) throw failed.error

    const semesters = semesterRes.data || []
    const pastSemesterIds = semesters.filter((row) => row.code !== current.code).map((row) => row.id)
    const absenceRes = pastSemesterIds.length > 0
      ? await supabase.from('absence_forms').select('*').in('semester_id', pastSemesterIds).order('created_at', { ascending: false })
      : { data: [] }

    const rulesContent = rulesRes.data?.[0]?.content
    const parsedRules = rulesContent ? parseJson(rulesContent, null) : null

    setArchive({
      currentCode: current.code,
      pastFiles: pastRes.data || [],
      semesters,
      weekRows: weekRes.data || [],
      archiveFiles: archiveRes.data || [],
      absenceRows: absenceRes.data || [],
      rules: Array.isArray(parsedRules) ? parsedRules : rulesContent ? [{ id: 1, chapter: '회칙', content: rulesContent }] : [],
    })
  }, [])

  useEffect(() => {
    if (identity.status !== 'ready') return undefined
    if (!identity.session) {
      router.replace('/login?next=%2Farchive')
      return undefined
    }
    let active = true
    async function load() {
      try {
        await loadArchive()
        if (active) setState({ status: 'ready', error: '' })
      } catch (error) {
        if (active) setState({ status: 'error', error: error.message })
      }
    }
    load()
    return () => { active = false }
  }, [identity.status, identity.session, router, loadArchive])

  const myName = identity.member?.name || identity.session?.user?.user_metadata?.name || ''
  const adminCanManage = canWrite(identity.admin?.role)
  const canManageResource = (row) => adminCanManage || (Boolean(myName) && row.uploader_name === myName)
  const canManageFile = (file) => adminCanManage || (identity.member && file.uploader_member_id ? file.uploader_member_id === identity.member.id : Boolean(myName) && file.uploader === myName)

  const refresh = async () => {
    try {
      await loadArchive()
    } catch (error) {
      toast.error(`목록을 새로 불러오지 못했습니다: ${error.message}`)
    }
  }

  const addResource = async (row) => {
    const { error } = await supabase.from('archive_files').insert([{ uploader_name: myName, semester: '상시', ...row }])
    if (error) {
      toast.error(`등록하지 못했습니다: ${error.message}`)
      return false
    }
    await refresh()
    return true
  }

  const handleCreateFolder = (folderName) => run(async () => {
    const name = folderName.trim()
    if (!name) return
    if (archive.archiveFiles.some((row) => row.category === 'special' && row.file_type === name)) {
      toast.error('같은 이름의 폴더가 이미 있습니다.')
      return
    }
    if (await addResource({ category: 'special', file_type: name, title: FOLDER_PLACEHOLDER_TITLE, file_url: '' })) {
      toast.success(`'${name}' 폴더를 만들었습니다.`)
      setCreatingFolder(false)
    }
  })

  const handleSaveResource = (form) => run(async () => {
    if (!form.title.trim() || !form.file_url.trim()) {
      toast.error('제목과 링크를 모두 입력하세요.')
      return
    }
    const { data, error } = await supabase.from('archive_files')
      .update({ title: form.title.trim(), file_url: form.file_url.trim(), description: form.description })
      .eq('id', editResource.id)
      .select('id')
    if (error || !data?.length) {
      toast.error(`수정하지 못했습니다${error ? `: ${error.message}` : ' (권한이 없거나 이미 삭제됨)'}`)
      return
    }
    toast.success('자료를 수정했습니다.')
    setEditResource(null)
    await refresh()
  })

  const handleDeleteResource = (row) => {
    if (!confirm(`'${row.title}' 자료를 삭제할까요?\n드라이브·유튜브 원본은 지워지지 않습니다.`)) return
    run(async () => {
      const { data, error } = await supabase.from('archive_files').delete().eq('id', row.id).select('id')
      if (error || !data?.length) {
        toast.error(`삭제하지 못했습니다${error ? `: ${error.message}` : ' (권한이 없거나 이미 삭제됨)'}`)
        return
      }
      toast.success('자료를 삭제했습니다.')
      await refresh()
    })
  }

  const handleDeletePast = (file) => {
    if (!confirm(`'${file.file_name}' 자료를 삭제할까요?`)) return
    run(async () => {
      const { error, storageError } = await deleteSubmittedFile(file)
      if (error) {
        toast.error(`삭제하지 못했습니다: ${error.message}`)
        return
      }
      if (storageError) toast.warning('목록에서는 지웠지만 저장소 파일 삭제에 실패했습니다. 운영진에게 알려 주세요.')
      else toast.success('자료를 삭제했습니다.')
      await refresh()
    })
  }

  if (identity.status !== 'ready' || state.status === 'loading') return <MemberPage><LoadingState label="아카이브를 여는 중입니다." /></MemberPage>
  if (state.status === 'error') return <MemberPage><ErrorState title="아카이브를 불러오지 못했습니다." description={state.error} onRetry={() => window.location.reload()} /></MemberPage>

  const resourceProps = { canManage: canManageResource, onAdd: addResource, onEdit: setEditResource, onDelete: handleDeleteResource }
  const resources = archive.archiveFiles

  return (
    <MemberPage>
      <MemberHeader
        eyebrow="아카이브"
        title={TABS.find((tab) => tab.key === activeTab)?.label || '학회 자료실'}
        description="지난 학기 제출물, 교육·특별세션 자료, 양식과 회칙을 한곳에서 봅니다."
        actions={<Button href="/archive/absence" icon={FileText}>사유서 게시판</Button>}
      />

      {/* 탭 컴포넌트는 탭을 바꿀 때 언마운트되므로 하위 탐색·업로드 폼 상태가 자동으로 초기화된다 */}
      <div key={activeTab}>
        {activeTab === 'past' && (
          <PastArchive
            currentCode={archive.currentCode}
            files={archive.pastFiles}
            semesters={archive.semesters}
            weekRows={archive.weekRows}
            archiveRows={resources}
            absenceRows={archive.absenceRows}
            canManage={canManageFile}
            onDeleteFile={handleDeletePast}
          />
        )}
        {activeTab === 'edu' && <EduTab resources={resources} {...resourceProps} />}
        {activeTab === 'special' && <SpecialTab resources={resources} onCreateFolder={() => setCreatingFolder(true)} {...resourceProps} />}
        {activeTab === 'template' && (
          <ResourceSection
            title="양식 자료실"
            desc="기획서 양식·학회 로고 등 공통 양식을 드라이브 링크로 공유하세요."
            emptyText="등록된 양식이 없습니다."
            rows={resources.filter((row) => row.category === 'template')}
            target={{ category: 'template', file_type: 'common' }}
            {...resourceProps}
          />
        )}
        {activeTab === 'rules' && <RulesTab rules={archive.rules.length > 0 ? archive.rules : CLUB_RULES} />}
      </div>

      {editResource && <EditResourceModal resource={editResource} saving={busy} onSave={handleSaveResource} onClose={() => setEditResource(null)} />}
      {creatingFolder && <CreateFolderModal saving={busy} onSave={handleCreateFolder} onClose={() => setCreatingFolder(false)} />}
    </MemberPage>
  )
}

function EduTab({ resources, ...resourceProps }) {
  const [section, setSection] = useState(EDU_SECTIONS[0])
  return (
    <ResourceSection
      title="교육자료실"
      desc="역량별 교육 자료를 드라이브 파일 또는 유튜브 링크로 공유하세요."
      emptyText={`${section} 자료가 아직 없습니다.`}
      rows={resources.filter((row) => row.category === 'edu' && row.file_type === section)}
      target={{ category: 'edu', file_type: section }}
      allowYoutube
      toolbar={<SegmentedControl label="교육 분야" value={section} onChange={setSection} options={EDU_SECTIONS.map((item) => ({ value: item, label: item }))} />}
      {...resourceProps}
    />
  )
}

function SpecialTab({ resources, onCreateFolder, ...resourceProps }) {
  const [folder, setFolder] = useState(null)
  const folders = [...new Set(resources.filter((row) => row.category === 'special').map((row) => row.file_type))]

  if (folder) {
    return (
      <div className="space-y-5">
        <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={() => setFolder(null)}>폴더 목록</Button>
        <ResourceSection
          title={folder}
          desc="이 세션의 자료를 드라이브 파일 또는 유튜브 링크로 공유하세요."
          emptyText="등록된 자료가 없습니다."
          rows={resources.filter((row) => row.category === 'special' && row.file_type === folder && row.title !== FOLDER_PLACEHOLDER_TITLE)}
          target={{ category: 'special', file_type: folder }}
          allowYoutube
          {...resourceProps}
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <SectionHeader title="특별세션 자료실" desc="특강·행사 폴더를 만들고 자료를 모아두세요." action={<Button variant="primary" icon={FolderPlus} onClick={onCreateFolder}>새 폴더</Button>} />
      {folders.length === 0 ? <EmptyState icon={FolderOpen} title="만든 세션 폴더가 없습니다." description="새 폴더를 만들어 특강·행사 자료를 모아 보세요." /> : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {folders.map((name) => {
            const count = resources.filter((row) => row.category === 'special' && row.file_type === name && row.title !== FOLDER_PLACEHOLDER_TITLE).length
            return (
              <button key={name} type="button" onClick={() => setFolder(name)} className="flex min-h-28 flex-col items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-teal-600 hover:bg-teal-50/40">
                <FolderOpen className="h-6 w-6 text-teal-700" aria-hidden="true" />
                <span className="w-full">
                  <span className="block break-keep text-base font-bold text-slate-900">{name}</span>
                  <span className="text-xs text-slate-500">자료 {count}건</span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RulesTab({ rules }) {
  return (
    <div className="space-y-5">
      <SectionHeader
        title="인사이트그라피 회칙"
        desc="학회 활동의 근간이 되는 공식 회칙입니다. (26.07.04 기준)"
        action={<a href="/files/IG_%ED%9A%8C%EC%B9%99_260704.docx" download className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" aria-hidden="true" />회칙 원문 받기</a>}
      />
      <div className="space-y-4">
        {rules.map((rule) => (
          <article key={rule.id} className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6">
            <h3 className="mb-3 border-l-[3px] border-teal-700 pl-3 text-base font-bold text-teal-800">{rule.chapter}</h3>
            <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{rule.content}</p>
          </article>
        ))}
      </div>
    </div>
  )
}

function SectionHeader({ title, desc, action }) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="break-keep text-xl font-bold text-slate-900">{title}</h2>
        {desc && <p className="mt-1 text-sm text-slate-500">{desc}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

// 교육·특별세션·양식 자료실 공통: 섹션 헤더 + 링크 등록 폼 + 미리보기 카드 목록
function ResourceSection({ title, desc, emptyText, rows, target, allowYoutube = false, toolbar, canManage, onAdd, onEdit, onDelete }) {
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', url: '', description: '' })
  const [type, setType] = useState('drive')
  const [uploading, setUploading] = useState(false)
  const isYt = allowYoutube && type === 'youtube'

  const submit = async (event) => {
    event.preventDefault()
    if (uploading) return
    const url = form.url.trim()
    if (!form.title.trim() || !url) {
      toast.error('제목과 링크를 모두 입력하세요.')
      return
    }
    if (isYt ? !isYoutubeUrl(url) : !isDriveUrl(url)) {
      toast.error(`${isYt ? '유튜브' : '구글 드라이브'} 링크가 아닙니다. 주소를 다시 확인하세요.`)
      return
    }
    setUploading(true)
    const ok = await onAdd({ ...target, title: form.title.trim(), file_url: url, description: form.description })
    setUploading(false)
    if (!ok) return
    toast.success('자료를 등록했습니다.')
    setForm({ title: '', url: '', description: '' })
    setAdding(false)
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title={title}
        desc={desc}
        action={<Button variant={adding ? 'secondary' : 'primary'} icon={adding ? X : Plus} onClick={() => setAdding((value) => !value)} aria-expanded={adding}>{adding ? '닫기' : '자료 등록'}</Button>}
      />

      {toolbar}

      {adding && (
        <form onSubmit={submit} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          {allowYoutube && <SegmentedControl label="링크 종류" value={type} onChange={setType} options={[{ value: 'drive', label: '구글 드라이브' }, { value: 'youtube', label: '유튜브' }]} />}
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Field label="자료 제목" htmlFor={`resource-title-${title}`}>
              <input id={`resource-title-${title}`} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={inputClass} />
            </Field>
            <Field label={isYt ? '유튜브 링크' : '구글 드라이브 링크'} htmlFor={`resource-url-${title}`} hint={isYt ? undefined : '드라이브에 먼저 올린 뒤 공유 링크를 붙여 넣으세요. 공유를 바꾸지 않아도 등록은 됩니다.'}>
              <input id={`resource-url-${title}`} value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder={isYt ? 'https://youtu.be/…' : 'https://drive.google.com/…'} className={inputClass} />
            </Field>
          </div>
          <Field label="간단한 설명 (선택)" htmlFor={`resource-desc-${title}`}>
            <input id={`resource-desc-${title}`} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={inputClass} />
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            {!isYt && <Button href={GOOGLE_DRIVE_FOLDER_URL} target="_blank" icon={ExternalLink}>공유 드라이브 열기</Button>}
            <Button type="submit" variant="primary" loading={uploading}>등록</Button>
          </div>
        </form>
      )}

      {rows.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 px-4 py-12 text-center text-sm text-slate-500">{emptyText}</p> : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {rows.map((row) => (
            <ResourceCard key={row.id} row={row} manage={canManage(row)} onEdit={() => onEdit(row)} onDelete={() => onDelete(row)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ResourceCard({ row, manage, onEdit, onDelete }) {
  return (
    <li className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-2 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <FileThumbnail url={row.file_url} title={row.title} />
      <div className="mt-2 min-w-0">
        <p className="truncate text-sm font-bold text-slate-900" title={row.title}>{row.title}</p>
        {row.description && <p className="line-clamp-2 text-xs leading-5 text-slate-500">{row.description}</p>}
        <p className="mt-0.5 text-xs text-slate-500">{row.uploader_name || '작성자 미상'}{row.created_at ? ` · ${formatKst(row.created_at, { year: true })}` : ''}</p>
      </div>
      <div className="mt-2 flex items-center gap-1">
        <Button size="sm" className="flex-1" href={row.file_url} target="_blank" icon={ExternalLink}>원본</Button>
        {manage && <IconButton size="sm" icon={Pencil} label="수정" onClick={onEdit} />}
        {manage && <IconButton size="sm" icon={Trash2} label="삭제" onClick={onDelete} className="text-red-600 hover:bg-red-50" />}
      </div>
    </li>
  )
}

function EditResourceModal({ resource, saving, onSave, onClose }) {
  const [form, setForm] = useState({ title: resource.title || '', file_url: resource.file_url || '', description: resource.description || '' })
  const fields = [
    { key: 'title', label: '제목' },
    { key: 'file_url', label: '링크' },
    { key: 'description', label: '설명 (선택)' },
  ]
  return (
    <ArchiveModal title="자료 수정" onClose={onClose} size="max-w-md" footer={<><Button onClick={onClose}>취소</Button><Button variant="primary" loading={saving} onClick={() => onSave(form)}>저장</Button></>}>
      <div className="space-y-4">
        {fields.map((field) => (
          <Field key={field.key} label={field.label} htmlFor={`edit-${field.key}`}>
            <input id={`edit-${field.key}`} value={form[field.key]} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} className={inputClass} />
          </Field>
        ))}
      </div>
    </ArchiveModal>
  )
}

function CreateFolderModal({ saving, onSave, onClose }) {
  const [name, setName] = useState('')
  return (
    <ArchiveModal title="새 특별세션 폴더" onClose={onClose} size="max-w-md" footer={<><Button onClick={onClose}>취소</Button><Button variant="primary" loading={saving} disabled={!name.trim()} onClick={() => onSave(name)}>만들기</Button></>}>
      <Field label="폴더 이름" htmlFor="folder-name" hint="예: 2026 여름 특강, 외부 연사 세션">
        <input id="folder-name" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && name.trim()) onSave(name) }} className={inputClass} />
      </Field>
    </ArchiveModal>
  )
}
