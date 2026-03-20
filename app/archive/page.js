'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function ArchiveUserPage() {
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
  
  // 🌟 링크 복붙 업로드 폼 상태
  const [uploadForm, setUploadForm] = useState({ title: '', url: '', description: '' })
  const [isUploading, setIsUploading] = useState(false)

  // 🌟 공용 구글 드라이브 폴더 링크 (필요 시 용도별로 다르게 분리 가능)
  const GOOGLE_DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/1N4BAGYNk5PQEdPxQP5zUAuPehWQkr5bV?usp=drive_link"

  // 🌟 사유서 탭 삭제 및 양식 자료실 추가
  const tabs = [
    { id: 'past', icon: '📦', label: '과거 자료실' },
    { id: 'edu', icon: '📘', label: '교육자료실' },
    { id: 'special', icon: '🌟', label: '특별세션 자료실' },
    { id: 'template', icon: '📑', label: '양식 자료실' },
    { id: 'rules', icon: '📜', label: '회칙 열람실' }
  ]

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
  // 🌟 기능: 교육 & 특별세션 & 양식 구글드라이브 링크 제출
  // ==========================================
  const handleUploadDrive = async (category, folderName) => {
    if (!uploadForm.title.trim() || !uploadForm.url.trim()) return alert("제목과 구글 드라이브 링크를 모두 입력해 줘! 🔗")
    
    if (!uploadForm.url.includes("drive.google.com") && !uploadForm.url.includes("docs.google.com")) {
      return alert("올바른 구글 드라이브 링크가 아닌 것 같아! 다시 확인해 봐! 🤔")
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
      alert("자료 링크 등록 완료! 🎉")
      setUploadForm({ title: '', url: '', description: '' })
      fetchData(user.user_metadata.name)
    } else {
      alert("등록 실패: " + error.message)
    }
    setIsUploading(false)
  }

  // ==========================================
  // 🌟 기능: 특별세션 폴더 생성
  // ==========================================
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

  if (loading) return <div className="min-h-screen flex items-center justify-center font-black text-slate-400">아카이브 여는 중... 🔄</div>

  const pastSemesters = [...new Set(pastFiles.map(f => f.semester))]
  const pastWeeks = pastNav.semester ? [...new Set(pastFiles.filter(f => f.semester === pastNav.semester).map(f => f.week))] : []
  const pastCategories = ['plan', 'slide', 'video']
  const finalPastFiles = pastNav.category ? pastFiles.filter(f => f.semester === pastNav.semester && f.week === pastNav.week && f.file_category === pastNav.category) : []
  const specialFolders = [...new Set(archiveFiles.filter(f => f.category === 'special').map(f => f.file_type))]

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-12 pb-32">
      <div className="max-w-[1400px] mx-auto">
        
        <header className="mb-10 pl-2">
          <Link href="/home" className="text-xs font-black text-blue-600 hover:underline uppercase tracking-widest mb-3 block">← Back to Home</Link>
          <h1 className="text-5xl font-black uppercase tracking-tighter text-slate-800 flex items-center gap-4">
            <span className="text-5xl">🗂️</span> Resource Archive
          </h1>
          <p className="text-sm font-bold text-slate-500 mt-3">학회 통합 자료 열람 공간입니다.</p>
        </header>

        <div className="flex flex-col lg:flex-row gap-8 items-start">
          
          {/* 🌟 좌측 사이드바 내비게이션 */}
          <aside className="w-full lg:w-72 bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200 sticky top-8 shrink-0">
            <div className="flex flex-col gap-2">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setPastNav({ semester: null, week: null, category: null }); setSpecialFolder(null); }}
                  className={`flex items-center gap-4 p-4 rounded-2xl text-left transition-all font-black text-sm ${
                    activeTab === tab.id ? 'bg-slate-900 text-white shadow-md scale-[1.02]' : 'bg-transparent text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-xl">{tab.icon}</span>{tab.label}
                </button>
              ))}

              <hr className="my-4 border-slate-100" />
              
              {/* 🌟 사유서 페이지로 바로 이동하는 버튼 추가 */}
              <Link 
                href="archive/absence" 
                className="flex items-center justify-between gap-4 p-4 rounded-2xl text-left transition-all font-black text-sm bg-rose-50 text-rose-600 hover:bg-rose-100 hover:scale-[1.02] shadow-sm border border-rose-100"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">📝</span>사유서 제출하기
                </div>
                <span className="text-rose-400 text-lg">→</span>
              </Link>
            </div>
          </aside>

          <main className="flex-1 w-full bg-white p-8 md:p-12 rounded-[3.5rem] shadow-xl border border-slate-100 min-h-[70vh]">
            
            {/* ======================================= */}
            {/* 1. 과거 자료실 */}
            {/* ======================================= */}
            {activeTab === 'past' && (
              <div className="animate-in fade-in duration-500 space-y-6">
                <h2 className="text-3xl font-black text-slate-800 border-b border-slate-100 pb-4 mb-6">📦 과거 자료실</h2>
                
                <div className="flex gap-2 text-sm font-black text-slate-400 mb-8 bg-slate-50 p-4 rounded-2xl">
                  <button onClick={() => setPastNav({ semester: null, week: null, category: null })} className="hover:text-blue-600">학기 선택</button>
                  {pastNav.semester && <><span className="opacity-50">{'>'}</span> <button onClick={() => setPastNav({ ...pastNav, week: null, category: null })} className="hover:text-blue-600">{pastNav.semester}</button></>}
                  {pastNav.week && <><span className="opacity-50">{'>'}</span> <button onClick={() => setPastNav({ ...pastNav, category: null })} className="hover:text-blue-600">{pastNav.week}주차</button></>}
                  {pastNav.category && <><span className="opacity-50">{'>'}</span> <span className="text-blue-600">{pastNav.category === 'plan' ? '기획서' : pastNav.category === 'slide' ? '슬라이드' : '발표영상'}</span></>}
                </div>

                {!pastNav.semester && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {pastSemesters.length === 0 ? <p className="col-span-full text-slate-400 font-bold">보관된 학기가 없습니다.</p> : pastSemesters.map(sem => (
                      <button key={sem} onClick={() => setPastNav({ ...pastNav, semester: sem })} className="bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 p-8 rounded-3xl font-black text-xl text-slate-700 transition-all flex flex-col items-center gap-3">
                        <span className="text-4xl">📁</span> {sem} 학기
                      </button>
                    ))}
                  </div>
                )}

                {pastNav.semester && !pastNav.week && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {pastWeeks.map(w => (
                      <button key={w} onClick={() => setPastNav({ ...pastNav, week: w })} className="bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 p-6 rounded-3xl text-left transition-all group">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-black bg-blue-100 text-blue-600 px-3 py-1 rounded-full uppercase">Week {w}</span>
                          <span className="text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity font-black text-xs">열람하기 →</span>
                        </div>
                        <p className="text-lg font-black text-slate-800">{weekTopics[w] || '자유 주제'}</p>
                      </button>
                    ))}
                  </div>
                )}

                {pastNav.semester && pastNav.week && !pastNav.category && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {pastCategories.map(cat => (
                      <button key={cat} onClick={() => setPastNav({ ...pastNav, category: cat })} className="bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 p-8 rounded-3xl font-black text-lg text-slate-700 transition-all flex flex-col items-center gap-3">
                        <span className="text-4xl">{cat === 'plan' ? '📄' : cat === 'slide' ? '🖼️' : '🎬'}</span>
                        {cat === 'plan' ? '기획서' : cat === 'slide' ? '슬라이드' : '발표영상'}
                      </button>
                    ))}
                  </div>
                )}

                {pastNav.category && (
                  <div className="space-y-3">
                    {finalPastFiles.length === 0 ? <p className="text-slate-400 font-bold py-10 text-center">등록된 자료가 없습니다.</p> : finalPastFiles.map(f => (
                      <a key={f.id} href={f.file_url} target="_blank" rel="noopener noreferrer" className="bg-slate-50 p-5 rounded-2xl border border-slate-100 hover:border-blue-400 hover:shadow-md transition-all flex justify-between items-center group">
                        <div className="flex items-center gap-4">
                          <span className="text-2xl">{pastNav.category === 'plan' ? '📄' : pastNav.category === 'slide' ? '🖼️' : '🎬'}</span>
                          <div>
                            <p className="font-black text-slate-800 text-sm group-hover:text-blue-600 transition-colors">{f.file_name}</p>
                            <p className="text-[10px] font-bold text-slate-400 mt-1">👤 {f.uploader}</p>
                          </div>
                        </div>
                        <span className="text-[10px] font-black text-blue-500 opacity-0 group-hover:opacity-100 transition-all">보러가기 →</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ======================================= */}
            {/* 2. 교육자료실 */}
            {/* ======================================= */}
            {activeTab === 'edu' && (
              <div className="animate-in fade-in duration-500 space-y-8">
                <div className="border-b border-slate-100 pb-6">
                  <h2 className="text-3xl font-black text-slate-800 mb-2">📘 교육자료실</h2>
                  <p className="text-xs font-bold text-slate-400">자료를 공용 드라이브에 올린 후, 공유 링크를 제출하세요.</p>
                </div>

                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                  {['Insight', 'Graphic', 'Delivery', '기타'].map(sec => (
                    <button key={sec} onClick={() => setEduSection(sec)} className={`px-6 py-2.5 rounded-full font-black text-xs transition-all ${eduSection === sec ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
                      {sec}
                    </button>
                  ))}
                </div>

                {/* 🌟 2-Step 업로드 UI */}
                <div className="flex flex-col xl:flex-row gap-4 bg-slate-50 p-4 rounded-3xl border border-slate-100">
                  <a href={GOOGLE_DRIVE_FOLDER_URL} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 bg-white border-2 border-slate-200 hover:border-blue-300 text-slate-700 px-6 py-6 rounded-2xl font-black text-xs transition-all shadow-sm flex flex-col items-center justify-center gap-2 group">
                    <span className="text-2xl group-hover:scale-110 transition-transform">📁</span>
                    Step 1. 드라이브에 올리기
                  </a>
                  
                  <div className="flex flex-col gap-2 w-full">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2 mt-2">Step 2. 정보 및 링크 제출</span>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input type="text" placeholder="자료 제목" value={uploadForm.title} onChange={e => setUploadForm({...uploadForm, title: e.target.value})} className="w-full sm:w-1/3 border-2 border-slate-200 p-3 rounded-xl font-bold text-sm outline-none focus:border-blue-500 bg-white" />
                      <input type="text" placeholder="복사한 구글 드라이브 링크 붙여넣기!" value={uploadForm.url} onChange={e => setUploadForm({...uploadForm, url: e.target.value})} className="w-full sm:w-2/3 border-2 border-slate-200 p-3 rounded-xl font-bold text-sm outline-none focus:border-blue-500 bg-white text-blue-600" />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 mt-1">
                      <input type="text" placeholder="간단한 설명 (선택)" value={uploadForm.description} onChange={e => setUploadForm({...uploadForm, description: e.target.value})} className="flex-1 border-2 border-slate-200 p-3 rounded-xl font-bold text-sm outline-none focus:border-blue-500 bg-white" />
                      <button onClick={() => handleUploadDrive('edu', eduSection)} disabled={isUploading} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-black text-sm hover:bg-blue-700 transition-all shrink-0 active:scale-95">
                        {isUploading ? '제출 중...' : '제출하기 🚀'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {archiveFiles.filter(f => f.category === 'edu' && f.file_type === eduSection).map(f => (
                    <a key={f.id} href={f.file_url} target="_blank" rel="noopener noreferrer" className="bg-white p-6 rounded-3xl border border-slate-200 hover:border-blue-400 hover:shadow-lg transition-all group block">
                      <div className="flex justify-between items-start mb-3">
                        <span className="bg-blue-100 text-blue-600 text-[9px] font-black px-2 py-1 rounded uppercase">공유자: {f.uploader_name}</span>
                        <span className="text-[10px] font-black text-blue-400 opacity-0 group-hover:opacity-100 transition-all">자료 열기 ↗</span>
                      </div>
                      <h4 className="font-black text-slate-800 text-lg mb-1">{f.title}</h4>
                      {f.description && <p className="text-xs text-slate-400 font-bold line-clamp-2">{f.description}</p>}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* ======================================= */}
            {/* 3. 특별세션 자료실 */}
            {/* ======================================= */}
            {activeTab === 'special' && (
              <div className="animate-in fade-in duration-500 space-y-8">
                <div className="flex justify-between items-end border-b border-slate-100 pb-6">
                  <div>
                    <h2 className="text-3xl font-black text-slate-800 mb-2">🌟 특별세션 자료실</h2>
                    <p className="text-xs font-bold text-slate-400">특강/행사 폴더를 만들고 공유 링크를 제출하세요.</p>
                  </div>
                  <button onClick={handleCreateFolder} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase hover:bg-blue-600 transition-colors shadow-md">
                    + 새 세션 폴더 만들기
                  </button>
                </div>

                {!specialFolder ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {specialFolders.length === 0 ? <p className="col-span-full text-slate-400 font-bold text-center py-10">생성된 세션 폴더가 없습니다.</p> : specialFolders.map(folder => (
                      <button key={folder} onClick={() => setSpecialFolder(folder)} className="bg-slate-50 hover:bg-yellow-50 border border-slate-200 hover:border-yellow-400 p-8 rounded-3xl font-black text-lg text-slate-700 transition-all flex flex-col items-center gap-3">
                        <span className="text-4xl">📂</span> {folder}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-6">
                    <button onClick={() => setSpecialFolder(null)} className="text-[10px] font-black text-slate-400 hover:text-yellow-600 uppercase tracking-widest mb-2 block">← 폴더 목록으로 돌아가기</button>
                    <h3 className="text-2xl font-black text-yellow-600 flex items-center gap-3"><span className="text-3xl">📂</span> {specialFolder}</h3>
                    
                    <div className="flex flex-col xl:flex-row gap-4 bg-yellow-50 p-4 rounded-3xl border border-yellow-100">
                      <a href={GOOGLE_DRIVE_FOLDER_URL} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 bg-white border-2 border-yellow-200 hover:border-yellow-400 text-slate-700 px-6 py-6 rounded-2xl font-black text-xs transition-all shadow-sm flex flex-col items-center justify-center gap-2 group">
                        <span className="text-2xl group-hover:scale-110 transition-transform">📂</span>
                        Step 1. 드라이브 업로드
                      </a>
                      
                      <div className="flex flex-col gap-2 w-full">
                        <span className="text-[10px] font-black text-yellow-600 uppercase tracking-widest pl-2 mt-2">Step 2. 정보 및 링크 제출</span>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input type="text" placeholder="자료 제목" value={uploadForm.title} onChange={e => setUploadForm({...uploadForm, title: e.target.value})} className="w-full sm:w-1/3 border-2 border-white p-3 rounded-xl font-bold text-sm outline-none focus:border-yellow-400 bg-white" />
                          <input type="text" placeholder="복사한 구글 드라이브 링크 붙여넣기!" value={uploadForm.url} onChange={e => setUploadForm({...uploadForm, url: e.target.value})} className="w-full sm:w-2/3 border-2 border-white p-3 rounded-xl font-bold text-sm outline-none focus:border-yellow-400 bg-white text-yellow-700" />
                        </div>
                        <button onClick={() => handleUploadDrive('special', specialFolder)} disabled={isUploading} className="w-full py-3 bg-yellow-500 text-white rounded-xl font-black text-sm hover:bg-yellow-600 transition-all shrink-0 active:scale-95 mt-1">
                          {isUploading ? '제출 중...' : '제출하기 🚀'}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {archiveFiles.filter(f => f.category === 'special' && f.file_type === specialFolder && f.title !== '--FOLDER--').map(f => (
                        <a key={f.id} href={f.file_url} target="_blank" rel="noopener noreferrer" className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-yellow-400 hover:shadow-md transition-all flex justify-between items-center group block">
                          <div>
                            <p className="font-black text-slate-800 text-sm group-hover:text-yellow-600 transition-colors">{f.title}</p>
                            <p className="text-[10px] font-bold text-slate-400 mt-1">공유자: {f.uploader_name}</p>
                          </div>
                          <span className="text-[10px] font-black text-yellow-500 opacity-0 group-hover:opacity-100 transition-all">자료 열람 ↗</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ======================================= */}
            {/* 🌟 4. 양식 자료실 (새로 추가됨) */}
            {/* ======================================= */}
            {activeTab === 'template' && (
              <div className="animate-in fade-in duration-500 space-y-8">
                <div className="border-b border-slate-100 pb-6">
                  <h2 className="text-3xl font-black text-slate-800 mb-2">📑 양식 자료실</h2>
                  <p className="text-xs font-bold text-slate-400">기획서 양식, 학회 로고 등 공통 양식을 구글 드라이브 링크로 공유하세요.</p>
                </div>

                <div className="flex flex-col xl:flex-row gap-4 bg-slate-50 p-4 rounded-3xl border border-slate-100">
                  <a href={GOOGLE_DRIVE_FOLDER_URL} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 bg-white border-2 border-slate-200 hover:border-blue-300 text-slate-700 px-6 py-6 rounded-2xl font-black text-xs transition-all shadow-sm flex flex-col items-center justify-center gap-2 group">
                    <span className="text-2xl group-hover:scale-110 transition-transform">📁</span>
                    Step 1. 드라이브에 올리기
                  </a>
                  
                  <div className="flex flex-col gap-2 w-full">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2 mt-2">Step 2. 정보 및 링크 제출</span>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input type="text" placeholder="양식 제목 (예: 27기 로고 파일)" value={uploadForm.title} onChange={e => setUploadForm({...uploadForm, title: e.target.value})} className="w-full sm:w-1/3 border-2 border-slate-200 p-3 rounded-xl font-bold text-sm outline-none focus:border-blue-500 bg-white" />
                      <input type="text" placeholder="복사한 구글 드라이브 링크 붙여넣기!" value={uploadForm.url} onChange={e => setUploadForm({...uploadForm, url: e.target.value})} className="w-full sm:w-2/3 border-2 border-slate-200 p-3 rounded-xl font-bold text-sm outline-none focus:border-blue-500 bg-white text-blue-600" />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 mt-1">
                      <input type="text" placeholder="간단한 설명 (선택)" value={uploadForm.description} onChange={e => setUploadForm({...uploadForm, description: e.target.value})} className="flex-1 border-2 border-slate-200 p-3 rounded-xl font-bold text-sm outline-none focus:border-blue-500 bg-white" />
                      <button onClick={() => handleUploadDrive('template', 'common')} disabled={isUploading} className="bg-slate-800 text-white px-8 py-3 rounded-xl font-black text-sm hover:bg-slate-900 transition-all shrink-0 active:scale-95 shadow-md">
                        {isUploading ? '업로드 중...' : '양식 등록하기 🚀'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {archiveFiles.filter(f => f.category === 'template').map(f => (
                    <a key={f.id} href={f.file_url} target="_blank" rel="noopener noreferrer" className="bg-white p-6 rounded-3xl border border-slate-200 hover:border-blue-400 hover:shadow-lg transition-all group block">
                      <div className="flex justify-between items-start mb-3">
                        <span className="bg-slate-800 text-white text-[9px] font-black px-2 py-1 rounded uppercase">공유자: {f.uploader_name}</span>
                        <span className="text-[10px] font-black text-blue-500 opacity-0 group-hover:opacity-100 transition-all">다운로드 ↗</span>
                      </div>
                      <h4 className="font-black text-slate-800 text-lg mb-1 flex items-center gap-2">
                        <span>📑</span> {f.title}
                      </h4>
                      {f.description && <p className="text-xs text-slate-400 font-bold line-clamp-2 mt-2">{f.description}</p>}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* ======================================= */}
            {/* 5. 회칙 열람실 */}
            {/* ======================================= */}
            {activeTab === 'rules' && (
              <div className="animate-in fade-in duration-500 space-y-8">
                <div className="border-b border-slate-100 pb-6">
                  <h2 className="text-3xl font-black text-slate-800 mb-2">📜 인사이트그라피 회칙</h2>
                  <p className="text-xs font-bold text-slate-400">학회 활동의 근간이 되는 공식 회칙입니다.</p>
                </div>
                <div className="space-y-6">
                  {rules.length === 0 ? <p className="text-slate-400 font-bold text-center py-10">등록된 회칙이 없습니다.</p> : rules.map(r => (
                    <div key={r.id} className="bg-slate-50 p-8 rounded-3xl border border-slate-100">
                      <h3 className="text-lg font-black text-emerald-600 mb-4">{r.chapter}</h3>
                      <p className="text-sm font-medium text-slate-700 leading-loose whitespace-pre-wrap">{r.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </main>
        </div>
      </div>
    </div>
  )
}