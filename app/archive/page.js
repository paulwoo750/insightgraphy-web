'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import InternalNav from '@/app/components/InternalNav'
import { CLUB_RULES } from '@/lib/clubRules'

export default function ArchivePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white flex items-center justify-center font-black text-slate-400">아카이브 여는 중... 🔄</div>}>
      <ArchiveUserPage />
    </Suspense>
  )
}

function ArchiveUserPage() {
  const searchParams = useSearchParams()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('past')

  const [pastFiles, setPastFiles] = useState([])
  const [weekTopics, setWeekTopics] = useState({})
  const [archiveFiles, setArchiveFiles] = useState([])
  const [rules, setRules] = useState([])

  const [pastNav, setPastNav] = useState({ semester: null, week: null, category: null })
  const [eduSection, setEduSection] = useState('Insight')
  const [specialFolder, setSpecialFolder] = useState(null)

  // 🌟 링크 복붙 업로드 폼 및 타입 상태 (드라이브 vs 유튜브)
  const [uploadForm, setUploadForm] = useState({ title: '', url: '', description: '' })
  const [uploadType, setUploadType] = useState('drive') // 'drive' or 'youtube'
  const [isUploading, setIsUploading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)

  // 🌟 본인 자료 수정 모달 상태
  const [editResource, setEditResource] = useState(null)
  const [editForm, setEditForm] = useState({ title: '', file_url: '', description: '' })

  // 🌟 지난 학기 타임라인 뷰어 상태 (파싱된 일정 배열)
  const [timelineView, setTimelineView] = useState(null)
  // 🌟 지난 학기 사유서 뷰어 상태 (파싱된 사유서 배열)
  const [absenceView, setAbsenceView] = useState(null)

  // 🌟 공용 구글 드라이브 폴더 링크
  const GOOGLE_DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/1N4BAGYNk5PQEdPxQP5zUAuPehWQkr5bV?usp=drive_link"

  const tabs = [
    { id: 'past', icon: '📦', label: '과거 자료실' },
    { id: 'edu', icon: '📘', label: '교육자료실' },
    { id: 'special', icon: '🌟', label: '특별세션 자료실' },
    { id: 'template', icon: '📑', label: '양식 자료실' },
    { id: 'rules', icon: '📜', label: '회칙 열람실' }
  ]

  // 🌟 GNB 드롭다운의 ?tab=... 변화에 반응 (이미 아카이브에 있어도 섹션 전환)
  useEffect(() => {
    const t = searchParams.get('tab')
    if (t && ['past', 'edu', 'special', 'template', 'rules'].includes(t)) {
      setActiveTab(t)
      setPastNav({ semester: null, week: null, category: null })
      setSpecialFolder(null)
      setShowUpload(false)
    }
  }, [searchParams])

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setUser(session.user)
        await fetchData(session.user.user_metadata.name)
      }
    }
    init()
  }, [])

  const fetchData = async (userName) => {
    setLoading(true)

    const { data: configData } = await supabase.from('pr_config').select('*').eq('key', 'week_topics').single()
    if (configData) setWeekTopics(JSON.parse(configData.value))

    const { data: pFiles } = await supabase.from('files_metadata').select('*').eq('is_archive', true).order('week', { ascending: true })
    if (pFiles) setPastFiles(pFiles)

    const { data: aFiles } = await supabase.from('archive_files').select('*').order('created_at', { ascending: false })
    if (aFiles) setArchiveFiles(aFiles)

    const { data: rulesData } = await supabase.from('club_rules').select('content').order('updated_at', { ascending: false }).limit(1)
    if (rulesData && rulesData.length > 0) {
      try { setRules(JSON.parse(rulesData[0].content)) }
      catch { setRules([{ id: 1, chapter: '회칙', content: rulesData[0].content }]) }
    }

    setLoading(false)
  }

  // ==========================================
  // 🌟 기능: 교육 & 특별세션 링크 제출 (구글드라이브 OR 유튜브)
  // ==========================================
  const handleUploadResource = async (category, folderName) => {
    if (!uploadForm.title.trim() || !uploadForm.url.trim()) return alert("제목과 링크를 모두 입력해 줘! 🔗")

    // 업로드 타입에 따른 링크 유효성 검사
    if (uploadType === 'drive' && !uploadForm.url.includes("drive.google.com") && !uploadForm.url.includes("docs.google.com")) {
      return alert("올바른 구글 드라이브 링크가 아닌 것 같아! 다시 확인해 봐! 🤔")
    }
    if (uploadType === 'youtube' && !uploadForm.url.includes("youtube.com") && !uploadForm.url.includes("youtu.be")) {
      return alert("올바른 유튜브 링크가 아닌 것 같아! 다시 확인해 봐! 🤔")
    }

    setIsUploading(true)

    const { error } = await supabase.from('archive_files').insert([{
      uploader_name: user.user_metadata.name,
      category: category,
      file_type: folderName,
      semester: '상시',
      title: uploadForm.title,
      file_url: uploadForm.url.trim(),
      description: uploadForm.description
    }])

    if (!error) {
      alert("자료 등록 완료! 🎉")
      setUploadForm({ title: '', url: '', description: '' })
      setShowUpload(false)
      fetchData(user.user_metadata.name)
    } else {
      alert("등록 실패: " + error.message)
    }
    setIsUploading(false)
  }

  // 양식 자료실 전용 업로드 (무조건 드라이브)
  const handleUploadTemplate = async () => {
    if (!uploadForm.title.trim() || !uploadForm.url.trim()) return alert("제목과 링크를 모두 입력해 줘! 🔗")
    if (!uploadForm.url.includes("drive.google.com") && !uploadForm.url.includes("docs.google.com")) {
      return alert("올바른 구글 드라이브 링크가 아닌 것 같아! 다시 확인해 봐! 🤔")
    }

    setIsUploading(true)

    const { error } = await supabase.from('archive_files').insert([{
      uploader_name: user.user_metadata.name,
      category: 'template',
      file_type: 'common',
      semester: '상시',
      title: uploadForm.title,
      file_url: uploadForm.url.trim(),
      description: uploadForm.description
    }])

    if (!error) {
      alert("양식 등록 완료! 🎉")
      setUploadForm({ title: '', url: '', description: '' })
      setShowUpload(false)
      fetchData(user.user_metadata.name)
    } else {
      alert("등록 실패: " + error.message)
    }
    setIsUploading(false)
  }

  const handleCreateFolder = async () => {
    const folderName = prompt("새로운 특별세션 폴더 이름을 입력해 줘! 📁")
    if (!folderName) return

    const { error } = await supabase.from('archive_files').insert([{
      uploader_name: user.user_metadata.name,
      category: 'special',
      file_type: folderName,
      semester: '상시',
      title: '--FOLDER--',
      file_url: ''
    }])

    if (!error) {
      alert("폴더 생성 완료! ✨")
      fetchData(user.user_metadata.name)
    }
  }

  // 🌟 본인이 올린 자료 수정 (archive_files)
  const startEditResource = (f) => {
    setEditResource(f)
    setEditForm({ title: f.title || '', file_url: f.file_url || '', description: f.description || '' })
  }

  const handleSaveResource = async () => {
    if (!editForm.title.trim() || !editForm.file_url.trim()) return alert("제목과 링크는 필수야! 🔗")
    const { error } = await supabase.from('archive_files')
      .update({ title: editForm.title.trim(), file_url: editForm.file_url.trim(), description: editForm.description })
      .eq('id', editResource.id)
    if (!error) {
      setEditResource(null)
      fetchData(user.user_metadata.name)
    } else {
      alert("수정 실패: " + error.message)
    }
  }

  // 🌟 본인이 올린 자료 삭제 (archive_files)
  const handleDeleteResource = async (f) => {
    if (!confirm(`'${f.title}' 자료를 삭제할까요?`)) return
    const { error } = await supabase.from('archive_files').delete().eq('id', f.id)
    if (!error) fetchData(user.user_metadata.name)
    else alert("삭제 실패: " + error.message)
  }

  // 🌟 본인이 올린 과거 자료 삭제 (files_metadata)
  const handleDeletePast = async (f) => {
    if (!confirm(`'${f.file_name}' 자료를 삭제할까요?`)) return
    if (f.storage_path) await supabase.storage.from('ig-files').remove([f.storage_path])
    const { error } = await supabase.from('files_metadata').delete().eq('id', f.id)
    if (!error) fetchData(user.user_metadata.name)
    else alert("삭제 실패: " + error.message)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center font-black text-slate-400">아카이브 여는 중... 🔄</div>

  const myName = user?.user_metadata?.name
  const pastSemesters = [...new Set(pastFiles.map(f => f.semester))]
  const pastWeeks = pastNav.semester ? [...new Set(pastFiles.filter(f => f.semester === pastNav.semester).map(f => f.week))] : []
  // 🌟 정규/평일세션을 분리해서 표시 (평일 자료가 있는 학기·주차에만 평일 폴더 노출)
  const catAliases = {
    proposal: ['proposal', 'plan'], slide: ['slide'], video: ['video'],
    weekday_slide: ['weekday_slide'], weekday_video: ['weekday_video']
  }
  const hasCat = (cat) => pastFiles.some(f => f.semester === pastNav.semester && f.week === pastNav.week && catAliases[cat].includes(f.file_category))
  const pastCategories = ['proposal', 'slide', 'video', ...(pastNav.week != null ? ['weekday_slide', 'weekday_video'].filter(hasCat) : [])]
  const finalPastFiles = pastNav.category ? pastFiles.filter(f => f.semester === pastNav.semester && f.week === pastNav.week && (catAliases[pastNav.category] || [pastNav.category]).includes(f.file_category)) : []
  const specialFolders = [...new Set(archiveFiles.filter(f => f.category === 'special').map(f => f.file_type))]
  const eduFiles = archiveFiles.filter(f => f.category === 'edu' && f.file_type === eduSection)
  const templateFiles = archiveFiles.filter(f => f.category === 'template')
  const specialFiles = archiveFiles.filter(f => f.category === 'special' && f.file_type === specialFolder && f.title !== '--FOLDER--')
  const timelineSnap = pastNav.semester ? archiveFiles.find(f => f.category === 'timeline' && f.file_type === pastNav.semester) : null
  const absenceSnap = pastNav.semester ? archiveFiles.find(f => f.category === 'absence' && f.file_type === pastNav.semester) : null

  // 🌟 주제 복구: 학기별 주제 스냅샷 우선, 없으면 파일명의 (주제)에서 추출
  let topicsSnap = {}
  if (pastNav.semester) {
    const ts = archiveFiles.find(f => f.category === 'topics' && f.file_type === pastNav.semester)
    if (ts) { try { topicsSnap = JSON.parse(ts.description || '{}') } catch { topicsSnap = {} } }
  }
  // weekday=true 이면 평일세션 주제 (없으면 null)
  const topicFor = (w, weekday = false) => {
    const key = weekday ? `weekday_${w}` : w
    if (topicsSnap[key]) return topicsSnap[key]
    if (weekTopics[key]) return weekTopics[key]
    // 파일명 `(주제)`에서 복구 — 평일은 weekday_* 자료에서만
    const cats = weekday ? ['weekday_slide', 'weekday_video'] : ['proposal', 'plan', 'slide', 'video']
    const f = pastFiles.find(pf => pf.semester === pastNav.semester && pf.week === w && cats.includes(pf.file_category) && pf.file_name)
    if (f) { const m = f.file_name.match(/\(([^)]+)\)/); if (m && m[1] && m[1] !== '자유 주제') return m[1] }
    return weekday ? null : '자유 주제'
  }

  const catLabel = (c) => c === 'proposal' || c === 'plan' ? '기획서' : c === 'slide' ? '슬라이드' : c === 'video' ? '발표영상'
    : c === 'weekday_slide' ? '평일세션 슬라이드' : c === 'weekday_video' ? '평일세션 영상' : '자료'
  const catIcon = (c) => c === 'proposal' ? '📄' : c === 'slide' ? '🖼️' : c === 'video' ? '🎬' : c === 'weekday_slide' ? '🏖️🖼️' : '🏖️🎬'

  const openTimeline = (snap) => {
    try { setTimelineView(JSON.parse(snap.description || '[]')) }
    catch { setTimelineView([]) }
  }
  const openAbsence = (snap) => {
    try { setAbsenceView(JSON.parse(snap.description || '[]')) }
    catch { setAbsenceView([]) }
  }

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

        {/* 🌟 가로 섹션 탭 (한눈에 들어오는 네비게이션) */}
        <div className="max-w-[1200px] mx-auto px-6 md:px-8">
          <div className="flex gap-1 border-b border-slate-200 overflow-x-auto no-scrollbar">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setPastNav({ semester: null, week: null, category: null }); setSpecialFolder(null); setShowUpload(false) }}
                className={`px-5 py-3 text-sm font-bold shrink-0 border-b-[3px] -mb-px transition-colors ${activeTab === tab.id ? 'border-teal-800 text-teal-800' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
              >
                <span className="mr-1.5">{tab.icon}</span>{tab.label}
              </button>
            ))}
          </div>
        </div>

        <main className="max-w-[1200px] mx-auto px-6 md:px-8 mt-10">

          {/* ======================================= */}
          {/* 1. 과거 자료실 */}
          {/* ======================================= */}
          {activeTab === 'past' && (
            <div className="space-y-6">
              {/* 브레드크럼 */}
              <div className="flex flex-wrap gap-2 text-sm font-bold text-slate-400 border-b border-slate-200 pb-4">
                <button onClick={() => setPastNav({ semester: null, week: null, category: null })} className="hover:text-teal-800">학기 선택</button>
                {pastNav.semester && <><span className="opacity-40">/</span><button onClick={() => setPastNav({ ...pastNav, week: null, category: null })} className="hover:text-teal-800">{pastNav.semester}</button></>}
                {pastNav.week && <><span className="opacity-40">/</span><button onClick={() => setPastNav({ ...pastNav, category: null })} className="hover:text-teal-800">{pastNav.week}주차</button></>}
                {pastNav.category && <><span className="opacity-40">/</span><span className="text-teal-800">{pastNav.category.startsWith('weekday_') ? '🏖️ ' : ''}{catLabel(pastNav.category)}</span></>}
              </div>

              {!pastNav.semester && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {pastSemesters.length === 0 ? <p className="col-span-full text-slate-400 font-medium py-10 text-center">보관된 학기가 없습니다.</p> : pastSemesters.map(sem => (
                    <button key={sem} onClick={() => setPastNav({ ...pastNav, semester: sem })} className="border border-slate-200 hover:border-teal-700 hover:bg-teal-50 p-6 font-extrabold text-lg text-slate-700 hover:text-teal-800 transition-all flex flex-col items-center gap-2">
                      <span className="text-3xl">📁</span>{sem} 학기
                    </button>
                  ))}
                </div>
              )}

              {pastNav.semester && !pastNav.week && (timelineSnap || absenceSnap) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {timelineSnap && (
                    <button onClick={() => openTimeline(timelineSnap)} className="border border-teal-200 bg-teal-50 hover:bg-teal-100 p-5 flex items-center justify-between transition-colors group">
                      <span className="flex items-center gap-3 font-extrabold text-teal-800"><span className="text-2xl">📅</span> 타임라인 열람</span>
                      <span className="text-teal-500 font-black text-sm group-hover:translate-x-1 transition-transform">보기 →</span>
                    </button>
                  )}
                  {absenceSnap && (
                    <button onClick={() => openAbsence(absenceSnap)} className="border border-teal-200 bg-teal-50 hover:bg-teal-100 p-5 flex items-center justify-between transition-colors group">
                      <span className="flex items-center gap-3 font-extrabold text-teal-800"><span className="text-2xl">📝</span> 사유서 열람</span>
                      <span className="text-teal-500 font-black text-sm group-hover:translate-x-1 transition-transform">보기 →</span>
                    </button>
                  )}
                </div>
              )}

              {pastNav.semester && !pastNav.week && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {pastWeeks.map(w => (
                    <button key={w} onClick={() => setPastNav({ ...pastNav, week: w })} className="border border-slate-200 hover:border-teal-700 hover:bg-teal-50 p-5 text-left transition-all group flex justify-between items-center">
                      <div>
                        <span className="text-[10px] font-black bg-teal-800 text-white px-2 py-0.5 uppercase">Week {w}</span>
                        <p className="text-base font-extrabold text-slate-800 mt-2">📚 {topicFor(w)}</p>
                        {topicFor(w, true) && <p className="text-sm font-bold text-teal-700 mt-1">🏖️ {topicFor(w, true)}</p>}
                      </div>
                      <span className="text-teal-500 opacity-0 group-hover:opacity-100 transition-opacity font-black text-sm">→</span>
                    </button>
                  ))}
                </div>
              )}

              {pastNav.semester && pastNav.week && !pastNav.category && (
                <div className="space-y-5">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">📚 정규세션 · {topicFor(pastNav.week)}</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {pastCategories.filter(c => !c.startsWith('weekday_')).map(cat => (
                        <button key={cat} onClick={() => setPastNav({ ...pastNav, category: cat })} className="border border-slate-200 hover:border-teal-700 hover:bg-teal-50 p-8 font-extrabold text-lg text-slate-700 hover:text-teal-800 transition-all flex flex-col items-center gap-3">
                          <span className="text-3xl">{catIcon(cat)}</span>{catLabel(cat)}
                        </button>
                      ))}
                    </div>
                  </div>
                  {pastCategories.some(c => c.startsWith('weekday_')) && (
                    <div>
                      <p className="text-[10px] font-black text-teal-700 uppercase tracking-widest mb-2">🏖️ 평일세션{topicFor(pastNav.week, true) ? ` · ${topicFor(pastNav.week, true)}` : ''}</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {pastCategories.filter(c => c.startsWith('weekday_')).map(cat => (
                          <button key={cat} onClick={() => setPastNav({ ...pastNav, category: cat })} className="border border-teal-200 bg-teal-50/40 hover:border-teal-700 hover:bg-teal-50 p-8 font-extrabold text-lg text-teal-800 transition-all flex flex-col items-center gap-3">
                            <span className="text-3xl">{catIcon(cat)}</span>{catLabel(cat)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {pastNav.category && (
                <div className="border-t border-slate-200">
                  {finalPastFiles.length === 0 ? <p className="text-slate-400 font-medium py-12 text-center">등록된 자료가 없습니다.</p> : finalPastFiles.map(f => (
                    <PastRow key={f.id} f={f} mine={f.uploader === myName} onDelete={() => handleDeletePast(f)} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ======================================= */}
          {/* 2. 교육자료실 */}
          {/* ======================================= */}
          {activeTab === 'edu' && (
            <div className="space-y-6">
              <SectionHead title="교육자료실" desc="역량별 교육 자료를 드라이브 파일 또는 유튜브 링크로 공유하세요." adding={showUpload} onAdd={() => setShowUpload(v => !v)} />

              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {['Insight', 'Graphic', 'Delivery', '기타'].map(sec => (
                  <button key={sec} onClick={() => setEduSection(sec)} className={`px-5 py-2 text-xs font-bold shrink-0 border transition-colors ${eduSection === sec ? 'bg-teal-800 text-white border-teal-800' : 'bg-white text-slate-500 border-slate-200 hover:border-teal-400'}`}>{sec}</button>
                ))}
              </div>

              {showUpload && (
                <LinkUploadForm form={uploadForm} setForm={setUploadForm} type={uploadType} setType={setUploadType} uploading={isUploading} allowYoutube driveUrl={GOOGLE_DRIVE_FOLDER_URL} onSubmit={() => handleUploadResource('edu', eduSection)} />
              )}

              <div className="border-t border-slate-200">
                {eduFiles.length === 0 ? <p className="text-slate-400 font-medium py-12 text-center">{eduSection} 자료가 아직 없습니다.</p> : eduFiles.map(f => (
                  <ResourceRow key={f.id} f={f} mine={f.uploader_name === myName} onEdit={() => startEditResource(f)} onDelete={() => handleDeleteResource(f)} />
                ))}
              </div>
            </div>
          )}

          {/* ======================================= */}
          {/* 3. 특별세션 자료실 */}
          {/* ======================================= */}
          {activeTab === 'special' && (
            <div className="space-y-6">
              {!specialFolder ? (
                <>
                  <div className="flex justify-between items-end border-b border-slate-200 pb-4">
                    <div>
                      <h2 className="text-2xl font-extrabold text-slate-900">특별세션 자료실</h2>
                      <p className="text-xs font-medium text-slate-400 mt-1">특강·행사 폴더를 만들고 자료를 모아두세요.</p>
                    </div>
                    <button onClick={handleCreateFolder} className="shrink-0 px-5 py-2.5 bg-teal-800 text-white text-xs font-bold hover:bg-teal-900 transition-colors">+ 새 폴더</button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {specialFolders.length === 0 ? <p className="col-span-full text-slate-400 font-medium text-center py-12">생성된 세션 폴더가 없습니다.</p> : specialFolders.map(folder => (
                      <button key={folder} onClick={() => { setSpecialFolder(folder); setShowUpload(false) }} className="border border-slate-200 hover:border-teal-700 hover:bg-teal-50 p-8 font-extrabold text-lg text-slate-700 hover:text-teal-800 transition-all flex flex-col items-center gap-3">
                        <span className="text-3xl">📂</span>{folder}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <button onClick={() => setSpecialFolder(null)} className="text-xs font-black text-slate-400 hover:text-teal-800 uppercase tracking-widest">← 폴더 목록</button>
                  <SectionHead title={specialFolder} desc="이 세션의 자료를 드라이브 파일 또는 유튜브 링크로 공유하세요." adding={showUpload} onAdd={() => setShowUpload(v => !v)} />

                  {showUpload && (
                    <LinkUploadForm form={uploadForm} setForm={setUploadForm} type={uploadType} setType={setUploadType} uploading={isUploading} allowYoutube driveUrl={GOOGLE_DRIVE_FOLDER_URL} onSubmit={() => handleUploadResource('special', specialFolder)} />
                  )}

                  <div className="border-t border-slate-200">
                    {specialFiles.length === 0 ? <p className="text-slate-400 font-medium py-12 text-center">등록된 자료가 없습니다.</p> : specialFiles.map(f => (
                      <ResourceRow key={f.id} f={f} mine={f.uploader_name === myName} onEdit={() => startEditResource(f)} onDelete={() => handleDeleteResource(f)} />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ======================================= */}
          {/* 4. 양식 자료실 */}
          {/* ======================================= */}
          {activeTab === 'template' && (
            <div className="space-y-6">
              <SectionHead title="양식 자료실" desc="기획서 양식·학회 로고 등 공통 양식을 드라이브 링크로 공유하세요." adding={showUpload} onAdd={() => setShowUpload(v => !v)} />

              {showUpload && (
                <LinkUploadForm form={uploadForm} setForm={setUploadForm} type={uploadType} setType={setUploadType} uploading={isUploading} driveUrl={GOOGLE_DRIVE_FOLDER_URL} onSubmit={handleUploadTemplate} />
              )}

              <div className="border-t border-slate-200">
                {templateFiles.length === 0 ? <p className="text-slate-400 font-medium py-12 text-center">등록된 양식이 없습니다.</p> : templateFiles.map(f => (
                  <ResourceRow key={f.id} f={f} mine={f.uploader_name === myName} onEdit={() => startEditResource(f)} onDelete={() => handleDeleteResource(f)} />
                ))}
              </div>
            </div>
          )}

          {/* ======================================= */}
          {/* 5. 회칙 열람실 */}
          {/* ======================================= */}
          {activeTab === 'rules' && (
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
                {(rules.length > 0 ? rules : CLUB_RULES).map(r => (
                  <div key={r.id} className="border border-slate-200 p-8">
                    <h3 className="text-lg font-black text-teal-800 mb-4 border-l-[3px] border-teal-800 pl-3">{r.chapter}</h3>
                    <p className="text-sm font-medium text-slate-700 leading-loose whitespace-pre-wrap">{r.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </main>
      </div>

      {/* 🌟 지난 학기 타임라인 뷰어 모달 */}
      {timelineView && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[110]">
          <div className="bg-white w-full max-w-2xl max-h-[85vh] flex flex-col shadow-xl border border-slate-200 border-t-[3px] border-t-teal-800">
            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-200">
              <h2 className="font-extrabold text-lg text-slate-900 flex items-center gap-2"><span>📅</span> 지난 학기 타임라인</h2>
              <button onClick={() => setTimelineView(null)} className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-900 hover:text-white transition-colors">닫기 ✕</button>
            </div>
            <div className="overflow-y-auto p-6">
              {timelineView.length === 0 ? (
                <p className="text-slate-400 font-medium text-center py-12">보관된 일정이 없습니다.</p>
              ) : (
                <div className="border-t border-slate-200">
                  {timelineView.map((ev, i) => (
                    <div key={i} className="flex items-start gap-4 py-3 border-b border-slate-100">
                      <span className="shrink-0 text-[10px] font-black bg-teal-800 text-white px-2 py-0.5 mt-0.5 w-14 text-center">{ev.type === 'regular' ? `W${ev.week || '?'}` : ev.type === 'special' ? '특별' : '기타'}</span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-bold ${ev.is_break ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{ev.title}</p>
                        {ev.description && <p className="text-xs text-slate-400 font-medium mt-0.5">{ev.description}</p>}
                      </div>
                      <span className="shrink-0 text-xs font-bold text-slate-400">{ev.date_display}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 🌟 지난 학기 사유서 뷰어 모달 */}
      {absenceView && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[110]">
          <div className="bg-white w-full max-w-2xl max-h-[85vh] flex flex-col shadow-xl border border-slate-200 border-t-[3px] border-t-teal-800">
            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-200">
              <h2 className="font-extrabold text-lg text-slate-900 flex items-center gap-2"><span>📝</span> 지난 학기 사유서</h2>
              <button onClick={() => setAbsenceView(null)} className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-900 hover:text-white transition-colors">닫기 ✕</button>
            </div>
            <div className="overflow-y-auto p-6">
              {absenceView.length === 0 ? (
                <p className="text-slate-400 font-medium text-center py-12">보관된 사유서가 없습니다.</p>
              ) : (
                <div className="border-t border-slate-200">
                  {absenceView.map((a, i) => (
                    <div key={i} className="py-3 border-b border-slate-100">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="shrink-0 text-[9px] font-black bg-teal-800 text-white px-2 py-0.5 uppercase">W{a.week ?? '?'}</span>
                        {a.session_type === 'weekday' && <span className="shrink-0 text-[9px] font-black bg-teal-100 text-teal-800 px-2 py-0.5 uppercase">평일</span>}
                        <span className="shrink-0 text-[9px] font-black bg-slate-800 text-white px-2 py-0.5 uppercase">{a.type}</span>
                        <span className="text-sm font-bold text-slate-800">{a.user_name}</span>
                        <span className="text-xs font-medium text-slate-400">{a.target_date}</span>
                        {a.status && a.status !== '대기' && <span className="text-[10px] font-bold text-teal-700">· {a.status}</span>}
                      </div>
                      <p className="text-xs text-slate-500 font-medium whitespace-pre-wrap">{a.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 🌟 본인 자료 수정 모달 */}
      {editResource && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[110]">
          <div className="bg-white p-8 w-full max-w-md shadow-xl border border-slate-200 border-t-[3px] border-t-teal-800">
            <h2 className="font-extrabold mb-6 text-lg text-slate-900">내 자료 수정</h2>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">제목</label>
                <input type="text" value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} className="w-full border border-slate-300 p-3 font-bold text-sm outline-none focus:border-teal-600" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">링크</label>
                <input type="text" value={editForm.file_url} onChange={e => setEditForm({ ...editForm, file_url: e.target.value })} className="w-full border border-slate-300 p-3 font-bold text-sm outline-none focus:border-teal-600 text-teal-700" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">설명 (선택)</label>
                <input type="text" value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} className="w-full border border-slate-300 p-3 font-bold text-sm outline-none focus:border-teal-600" />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={handleSaveResource} className="flex-1 py-2.5 bg-teal-800 text-white font-bold text-xs hover:bg-teal-900 transition-colors">저장</button>
              <button onClick={() => setEditResource(null)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-bold text-xs hover:bg-slate-200 transition-colors">취소</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// 🌟 섹션 헤더 + 등록 토글 버튼
function SectionHead({ title, desc, adding, onAdd }) {
  return (
    <div className="flex justify-between items-end border-b border-slate-200 pb-4">
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900">{title}</h2>
        <p className="text-xs font-medium text-slate-400 mt-1">{desc}</p>
      </div>
      <button onClick={onAdd} className={`shrink-0 px-5 py-2.5 text-xs font-bold transition-colors ${adding ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-teal-800 text-white hover:bg-teal-900'}`}>
        {adding ? '닫기 ✕' : '+ 자료 등록'}
      </button>
    </div>
  )
}

// 🌟 링크 업로드 폼 (드라이브 / 유튜브)
function LinkUploadForm({ form, setForm, type, setType, uploading, onSubmit, allowYoutube, driveUrl }) {
  const isYt = type === 'youtube'
  return (
    <div className="border border-slate-200 bg-slate-50 p-5 space-y-3">
      {allowYoutube && (
        <div className="flex gap-2">
          <button onClick={() => setType('drive')} className={`flex-1 py-2 text-xs font-bold border transition-colors ${type === 'drive' ? 'bg-teal-800 text-white border-teal-800' : 'bg-white text-slate-500 border-slate-200'}`}>📁 구글 드라이브</button>
          <button onClick={() => setType('youtube')} className={`flex-1 py-2 text-xs font-bold border transition-colors ${isYt ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-500 border-slate-200'}`}>🎬 유튜브</button>
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-2">
        {!isYt && (
          <a href={driveUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 px-4 py-3 bg-white border border-slate-200 hover:border-teal-400 text-slate-700 text-xs font-bold flex items-center justify-center gap-2">📁 드라이브에 올리기</a>
        )}
        <input type="text" placeholder="자료 제목" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full sm:w-1/3 border border-slate-300 p-3 font-bold text-sm outline-none bg-white focus:border-teal-600" />
        <input type="text" placeholder={isYt ? "유튜브 공유 링크 붙여넣기!" : "구글 드라이브 링크 붙여넣기!"} value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} className={`flex-1 border border-slate-300 p-3 font-bold text-sm outline-none bg-white ${isYt ? 'text-red-600 focus:border-red-400' : 'text-teal-700 focus:border-teal-600'}`} />
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input type="text" placeholder="간단한 설명 (선택)" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="flex-1 border border-slate-300 p-3 font-bold text-sm outline-none bg-white focus:border-teal-600" />
        <button onClick={onSubmit} disabled={uploading} className={`shrink-0 px-8 py-3 text-white text-sm font-bold transition-colors active:scale-95 ${isYt ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-800 hover:bg-teal-900'}`}>
          {uploading ? '제출 중...' : '등록 🚀'}
        </button>
      </div>
    </div>
  )
}

// 🌟 자료 행 (archive_files) — 본인 자료면 수정/삭제 노출
function ResourceRow({ f, mine, onEdit, onDelete }) {
  const isYt = f.file_url && (f.file_url.includes('youtube.com') || f.file_url.includes('youtu.be'))
  return (
    <div className="flex items-center justify-between py-4 border-b border-slate-200 hover:bg-slate-50/60 transition-colors group gap-4 px-2">
      <a href={f.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 flex-1 min-w-0">
        <span className={`shrink-0 text-[9px] font-black px-2 py-1 uppercase tracking-widest ${isYt ? 'bg-red-100 text-red-600' : 'bg-teal-100 text-teal-800'}`}>{isYt ? 'YT' : 'DRIVE'}</span>
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-slate-800 truncate group-hover:text-teal-800 transition-colors">{f.title}</h4>
          {f.description && <p className="text-xs text-slate-400 font-medium truncate">{f.description}</p>}
        </div>
      </a>
      <div className="flex items-center gap-5 shrink-0">
        <span className="text-xs font-medium text-slate-400 hidden sm:block">{f.uploader_name}</span>
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

// 🌟 과거 자료 행 (files_metadata) — 본인 자료면 삭제 노출
function PastRow({ f, mine, onDelete }) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-slate-200 hover:bg-slate-50/60 transition-colors group gap-4 px-2">
      <a href={f.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 flex-1 min-w-0">
        <span className="shrink-0 text-[9px] font-black px-2 py-1 uppercase tracking-widest bg-teal-100 text-teal-800">{(f.file_category === 'plan' || f.file_category === 'proposal') ? '기획서' : f.file_category === 'slide' ? '슬라이드' : f.file_category === 'weekday_slide' ? '평일 슬라이드' : f.file_category === 'weekday_video' ? '평일 영상' : '영상'}</span>
        <h4 className="text-sm font-bold text-slate-800 truncate group-hover:text-teal-800 transition-colors">{f.file_name}</h4>
      </a>
      <div className="flex items-center gap-5 shrink-0">
        <span className="text-xs font-medium text-slate-400 hidden sm:block">{f.uploader}</span>
        {mine && (
          <button onClick={onDelete} className="text-[11px] font-bold text-slate-400 hover:text-red-600 transition-colors sm:opacity-0 group-hover:opacity-100">삭제</button>
        )}
      </div>
    </div>
  )
}
