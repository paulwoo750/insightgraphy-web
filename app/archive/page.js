'use client'
import { useCallback, useEffect, useState, Suspense } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import InternalNav from '@/app/components/InternalNav'
import { CLUB_RULES } from '@/lib/clubRules'
import { fetchCurrentSemester, parseJson } from '@/lib/semester'
import { FOLDER_PLACEHOLDER_TITLE, deleteSubmittedFile } from '@/lib/archive'
import PastArchive from './_components/PastArchive'
import ArchiveModal from './_components/ArchiveModal'

const TABS = [
  { id: 'past', icon: '📦', label: '과거 자료실' },
  { id: 'edu', icon: '📘', label: '교육자료실' },
  { id: 'special', icon: '🌟', label: '특별세션 자료실' },
  { id: 'template', icon: '📑', label: '양식 자료실' },
  { id: 'rules', icon: '📜', label: '회칙 열람실' },
]
const EDU_SECTIONS = ['Insight', 'Graphic', 'Delivery', '기타']
const GOOGLE_DRIVE_FOLDER_URL = 'https://drive.google.com/drive/folders/1N4BAGYNk5PQEdPxQP5zUAuPehWQkr5bV?usp=drive_link'

const isDriveUrl = (url) => url.includes('drive.google.com') || url.includes('docs.google.com')
const isYoutubeUrl = (url) => url.includes('youtube.com') || url.includes('youtu.be')

const EMPTY_ARCHIVE = { currentCode: '', pastFiles: [], semesters: [], weekRows: [], archiveFiles: [], absenceRows: [], rules: [] }

export default function ArchivePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white flex items-center justify-center font-black text-slate-400">아카이브 여는 중... 🔄</div>}>
      <ArchiveUserPage />
    </Suspense>
  )
}

function ArchiveUserPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // 탭은 URL(?tab=)이 단일 기준이라 GNB 드롭다운과 탭 버튼이 같은 상태를 본다
  const tabParam = searchParams.get('tab')
  const activeTab = TABS.some((tab) => tab.id === tabParam) ? tabParam : 'past'

  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [archive, setArchive] = useState(EMPTY_ARCHIVE)
  const [editResource, setEditResource] = useState(null)
  // 탭 버튼을 다시 누르면 그 탭의 첫 화면(학기 선택·폴더 목록)으로 돌아간다
  const [tabResetKey, setTabResetKey] = useState(0)

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
    setLoading(false)
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!active || !session) return
      setUser(session.user)
      await loadArchive()
    })
    return () => { active = false }
  }, [loadArchive])

  const myName = user?.user_metadata?.name

  const addResource = async (row) => {
    const { error } = await supabase.from('archive_files').insert([{ uploader_name: myName, semester: '상시', ...row }])
    if (error) {
      alert('등록 실패: ' + error.message)
      return false
    }
    await loadArchive()
    return true
  }

  const handleCreateFolder = async () => {
    const folderName = prompt('새로운 특별세션 폴더 이름을 입력해 줘! 📁')
    if (!folderName?.trim()) return
    if (await addResource({ category: 'special', file_type: folderName.trim(), title: FOLDER_PLACEHOLDER_TITLE, file_url: '' })) alert('폴더 생성 완료! ✨')
  }

  const handleSaveResource = async (form) => {
    if (!form.title.trim() || !form.file_url.trim()) return alert('제목과 링크는 필수야! 🔗')
    const { error } = await supabase.from('archive_files')
      .update({ title: form.title.trim(), file_url: form.file_url.trim(), description: form.description })
      .eq('id', editResource.id)
    if (error) return alert('수정 실패: ' + error.message)
    setEditResource(null)
    loadArchive()
  }

  const handleDeleteResource = async (row) => {
    if (!confirm(`'${row.title}' 자료를 삭제할까요?`)) return
    const { error } = await supabase.from('archive_files').delete().eq('id', row.id)
    if (error) alert('삭제 실패: ' + error.message)
    else loadArchive()
  }

  const handleDeletePast = async (file) => {
    if (!confirm(`'${file.file_name}' 자료를 삭제할까요?`)) return
    const { error } = await deleteSubmittedFile(file)
    if (error) alert('삭제 실패: ' + error.message)
    else loadArchive()
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center font-black text-slate-400">아카이브 여는 중... 🔄</div>

  const resourceProps = { myName, onAdd: addResource, onEdit: setEditResource, onDelete: handleDeleteResource }
  const resources = archive.archiveFiles

  return (
    <>
      <InternalNav />
      <div className="bg-white min-h-screen text-slate-900 font-sans pb-32">

        <header className="max-w-[1200px] mx-auto px-6 md:px-8 mt-12 mb-8 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-teal-800 tracking-tight">Resource Archive</h1>
            <p className="text-sm font-medium text-slate-500 mt-2">학회 통합 자료 열람 공간입니다.</p>
          </div>
          <Link href="/archive/absence" className="shrink-0 px-5 py-2.5 border border-slate-300 text-slate-700 text-xs font-bold hover:border-teal-700 hover:text-teal-800 transition-colors flex items-center gap-2 w-fit">
            📝 사유서 게시판 →
          </Link>
        </header>

        <div className="max-w-[1200px] mx-auto px-6 md:px-8">
          <div className="flex gap-1 border-b border-slate-200 overflow-x-auto no-scrollbar">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setTabResetKey((key) => key + 1); router.replace(`${pathname}?tab=${tab.id}`, { scroll: false }) }}
                className={`px-5 py-3 text-sm font-bold shrink-0 border-b-[3px] -mb-px transition-colors ${activeTab === tab.id ? 'border-teal-800 text-teal-800' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
              >
                <span className="mr-1.5">{tab.icon}</span>{tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 탭 컴포넌트는 탭을 바꿀 때 언마운트되므로 하위 탐색·업로드 폼 상태가 자동으로 초기화된다 */}
        <main key={tabResetKey} className="max-w-[1200px] mx-auto px-6 md:px-8 mt-10">
          {activeTab === 'past' && (
            <PastArchive
              currentCode={archive.currentCode}
              files={archive.pastFiles}
              semesters={archive.semesters}
              weekRows={archive.weekRows}
              archiveRows={resources}
              absenceRows={archive.absenceRows}
              myName={myName}
              onDeleteFile={handleDeletePast}
            />
          )}
          {activeTab === 'edu' && <EduTab resources={resources} {...resourceProps} />}
          {activeTab === 'special' && <SpecialTab resources={resources} onCreateFolder={handleCreateFolder} {...resourceProps} />}
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
        </main>
      </div>

      {editResource && <EditResourceModal resource={editResource} onSave={handleSaveResource} onClose={() => setEditResource(null)} />}
    </>
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
      toolbar={(
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {EDU_SECTIONS.map((item) => (
            <button key={item} onClick={() => setSection(item)} className={`px-5 py-2 text-xs font-bold shrink-0 border transition-colors ${section === item ? 'bg-teal-800 text-white border-teal-800' : 'bg-white text-slate-500 border-slate-200 hover:border-teal-400'}`}>{item}</button>
          ))}
        </div>
      )}
      {...resourceProps}
    />
  )
}

function SpecialTab({ resources, onCreateFolder, ...resourceProps }) {
  const [folder, setFolder] = useState(null)
  const folders = [...new Set(resources.filter((row) => row.category === 'special').map((row) => row.file_type))]

  if (folder) {
    return (
      <div className="space-y-6">
        <button onClick={() => setFolder(null)} className="text-xs font-black text-slate-400 hover:text-teal-800 uppercase tracking-widest">← 폴더 목록</button>
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
    <div className="space-y-6">
      <div className="flex justify-between items-end border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900">특별세션 자료실</h2>
          <p className="text-xs font-medium text-slate-400 mt-1">특강·행사 폴더를 만들고 자료를 모아두세요.</p>
        </div>
        <button onClick={onCreateFolder} className="shrink-0 px-5 py-2.5 bg-teal-800 text-white text-xs font-bold hover:bg-teal-900 transition-colors">+ 새 폴더</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {folders.length === 0 ? <p className="col-span-full text-slate-400 font-medium text-center py-12">생성된 세션 폴더가 없습니다.</p> : folders.map((name) => (
          <button key={name} onClick={() => setFolder(name)} className="border border-slate-200 hover:border-teal-700 hover:bg-teal-50 p-8 font-extrabold text-lg text-slate-700 hover:text-teal-800 transition-all flex flex-col items-center gap-3">
            <span className="text-3xl">📂</span>{name}
          </button>
        ))}
      </div>
    </div>
  )
}

function RulesTab({ rules }) {
  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900">인사이트그라피 회칙</h2>
          <p className="text-xs font-medium text-slate-400 mt-1">학회 활동의 근간이 되는 공식 회칙입니다. (26.07.04 기준)</p>
        </div>
        <a href="/files/IG_%ED%9A%8C%EC%B9%99_260704.docx" download className="shrink-0 px-5 py-2.5 border border-slate-300 text-slate-700 text-xs font-bold hover:border-teal-700 hover:text-teal-800 transition-colors flex items-center gap-2 w-fit">
          📄 회칙 원문 다운로드
        </a>
      </div>
      <div className="space-y-6">
        {rules.map((rule) => (
          <div key={rule.id} className="border border-slate-200 p-8">
            <h3 className="text-lg font-black text-teal-800 mb-4 border-l-[3px] border-teal-800 pl-3">{rule.chapter}</h3>
            <p className="text-sm font-medium text-slate-700 leading-loose whitespace-pre-wrap">{rule.content}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// 교육·특별세션·양식 자료실 공통: 섹션 헤더 + 링크 등록 폼 + 자료 목록
function ResourceSection({ title, desc, emptyText, rows, target, allowYoutube = false, toolbar, myName, onAdd, onEdit, onDelete }) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', url: '', description: '' })
  const [type, setType] = useState('drive')
  const [uploading, setUploading] = useState(false)
  const isYt = allowYoutube && type === 'youtube'

  const submit = async () => {
    const url = form.url.trim()
    if (!form.title.trim() || !url) return alert('제목과 링크를 모두 입력해 줘! 🔗')
    if (isYt ? !isYoutubeUrl(url) : !isDriveUrl(url)) {
      return alert(`올바른 ${isYt ? '유튜브' : '구글 드라이브'} 링크가 아닌 것 같아! 다시 확인해 봐! 🤔`)
    }
    setUploading(true)
    const ok = await onAdd({ ...target, title: form.title, file_url: url, description: form.description })
    setUploading(false)
    if (!ok) return
    alert('자료 등록 완료! 🎉')
    setForm({ title: '', url: '', description: '' })
    setAdding(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900">{title}</h2>
          <p className="text-xs font-medium text-slate-400 mt-1">{desc}</p>
        </div>
        <button onClick={() => setAdding((value) => !value)} className={`shrink-0 px-5 py-2.5 text-xs font-bold transition-colors ${adding ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-teal-800 text-white hover:bg-teal-900'}`}>
          {adding ? '닫기 ✕' : '+ 자료 등록'}
        </button>
      </div>

      {toolbar}

      {adding && (
        <div className="border border-slate-200 bg-slate-50 p-5 space-y-3">
          {allowYoutube && (
            <div className="flex gap-2">
              <button onClick={() => setType('drive')} className={`flex-1 py-2 text-xs font-bold border transition-colors ${!isYt ? 'bg-teal-800 text-white border-teal-800' : 'bg-white text-slate-500 border-slate-200'}`}>📁 구글 드라이브</button>
              <button onClick={() => setType('youtube')} className={`flex-1 py-2 text-xs font-bold border transition-colors ${isYt ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-500 border-slate-200'}`}>🎬 유튜브</button>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            {!isYt && (
              <a href={GOOGLE_DRIVE_FOLDER_URL} target="_blank" rel="noopener noreferrer" className="shrink-0 px-4 py-3 bg-white border border-slate-200 hover:border-teal-400 text-slate-700 text-xs font-bold flex items-center justify-center gap-2">📁 드라이브에 올리기</a>
            )}
            <input type="text" placeholder="자료 제목" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="w-full sm:w-1/3 border border-slate-300 p-3 font-bold text-sm outline-none bg-white focus:border-teal-600" />
            <input type="text" placeholder={isYt ? '유튜브 공유 링크 붙여넣기!' : '구글 드라이브 링크 붙여넣기!'} value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} className={`flex-1 border border-slate-300 p-3 font-bold text-sm outline-none bg-white ${isYt ? 'text-red-600 focus:border-red-400' : 'text-teal-700 focus:border-teal-600'}`} />
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input type="text" placeholder="간단한 설명 (선택)" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="flex-1 border border-slate-300 p-3 font-bold text-sm outline-none bg-white focus:border-teal-600" />
            <button onClick={submit} disabled={uploading} className={`shrink-0 px-8 py-3 text-white text-sm font-bold transition-colors active:scale-95 ${isYt ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-800 hover:bg-teal-900'}`}>
              {uploading ? '제출 중...' : '등록 🚀'}
            </button>
          </div>
        </div>
      )}

      <div className="border-t border-slate-200">
        {rows.length === 0 ? <p className="text-slate-400 font-medium py-12 text-center">{emptyText}</p> : rows.map((row) => (
          <ResourceRow key={row.id} row={row} mine={row.uploader_name === myName} onEdit={() => onEdit(row)} onDelete={() => onDelete(row)} />
        ))}
      </div>
    </div>
  )
}

function ResourceRow({ row, mine, onEdit, onDelete }) {
  const isYt = row.file_url && isYoutubeUrl(row.file_url)
  return (
    <div className="flex items-center justify-between py-4 border-b border-slate-200 hover:bg-slate-50/60 transition-colors group gap-4 px-2">
      <a href={row.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 flex-1 min-w-0">
        <span className={`shrink-0 text-[9px] font-black px-2 py-1 uppercase tracking-widest ${isYt ? 'bg-red-100 text-red-600' : 'bg-teal-100 text-teal-800'}`}>{isYt ? 'YT' : 'DRIVE'}</span>
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-slate-800 truncate group-hover:text-teal-800 transition-colors">{row.title}</h4>
          {row.description && <p className="text-xs text-slate-400 font-medium truncate">{row.description}</p>}
        </div>
      </a>
      <div className="flex items-center gap-5 shrink-0">
        <span className="text-xs font-medium text-slate-400 hidden sm:block">{row.uploader_name}</span>
        {mine && (
          <div className="flex gap-3 sm:opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onEdit} className="text-[11px] font-bold text-slate-400 hover:text-teal-800 transition-colors">수정</button>
            <button onClick={onDelete} className="text-[11px] font-bold text-slate-400 hover:text-red-600 transition-colors">삭제</button>
          </div>
        )}
      </div>
    </div>
  )
}

function EditResourceModal({ resource, onSave, onClose }) {
  const [form, setForm] = useState({ title: resource.title || '', file_url: resource.file_url || '', description: resource.description || '' })
  const fields = [
    { key: 'title', label: '제목' },
    { key: 'file_url', label: '링크', className: 'text-teal-700' },
    { key: 'description', label: '설명 (선택)' },
  ]
  return (
    <ArchiveModal title="내 자료 수정" onClose={onClose} size="max-w-md">
      <div className="space-y-4">
        {fields.map((field) => (
          <div key={field.key}>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">{field.label}</label>
            <input type="text" value={form[field.key]} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} className={`w-full border border-slate-300 p-3 font-bold text-sm outline-none focus:border-teal-600 ${field.className || ''}`} />
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-6">
        <button onClick={() => onSave(form)} className="flex-1 py-2.5 bg-teal-800 text-white font-bold text-xs hover:bg-teal-900 transition-colors">저장</button>
        <button onClick={onClose} className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-bold text-xs hover:bg-slate-200 transition-colors">취소</button>
      </div>
    </ArchiveModal>
  )
}
