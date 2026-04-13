'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function SlideRoom() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [files, setFiles] = useState([])
  
  const [selectedWeek, setSelectedWeek] = useState(1) 
  const [targetWeek, setTargetWeek] = useState(1) 
  
  const [driveLink, setDriveLink] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const GOOGLE_DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/1F-YFI422wyYQxd0lBeJ9boaNDlr0iwFJ"
  
  const [currentSemester, setCurrentSemester] = useState('2026-1')
  const [totalWeeks, setTotalWeeks] = useState(12) 
  const [deadlines, setDeadlines] = useState({})
  const [weekTopics, setWeekTopics] = useState({}) 
  const [weeklySetup, setWeeklySetup] = useState({})

  const [editItem, setEditItem] = useState(null)
  const [newTitle, setNewTitle] = useState('')

  const weeks = Array.from({ length: totalWeeks + 1 }, (_, i) => i)

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login') } 
      else { setUser(session.user); fetchFiles(); fetchSystemData(); }
    }
    checkUser()
  }, [])

  const fetchSystemData = async () => {
    const { data: configData } = await supabase.from('pr_config').select('*')
    if (configData) {
      const sem = configData.find(c => c.key === 'current_semester')?.value
      const topics = configData.find(c => c.key === 'week_topics')?.value
      const wks = configData.find(c => c.key === 'total_weeks')?.value
      const setupStr = configData.find(c => c.key === 'weekly_setup')?.value 

      if (sem) setCurrentSemester(sem)
      if (topics) setWeekTopics(JSON.parse(topics))
      if (wks) setTotalWeeks(Number(wks))
      if (setupStr) setWeeklySetup(JSON.parse(setupStr))
    }
    
    const { data: dlData } = await supabase.from('pr_deadlines').select('*').eq('category', 'slide')
    
    const dlMap = {}
    let initialWeek = 1
    let minDiff = Infinity
    let maxPastWeek = 1
    const now = new Date()

    if (dlData) {
      dlData.forEach(d => {
        if (!dlMap[d.week]) dlMap[d.week] = {}
        dlMap[d.week][d.category] = d.deadline_time

        if (d.category === 'slide' && d.deadline_time) {
          const dlTime = new Date(d.deadline_time)
          if (dlTime > now) {
            const diff = dlTime - now
            if (diff < minDiff) {
              minDiff = diff
              initialWeek = d.week
            }
          } else {
            if (d.week > maxPastWeek) maxPastWeek = d.week
          }
        }
      })
      if (minDiff === Infinity) initialWeek = maxPastWeek
    }
    
    setDeadlines(dlMap)
    setSelectedWeek(initialWeek)
    setTargetWeek(initialWeek)
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const fetchFiles = async () => {
    const { data } = await supabase
      .from('files_metadata')
      .select('*')
      .eq('file_category', 'slide')
      .eq('is_archive', false) 
      .order('created_at', { ascending: false })
    if (data) setFiles(data)
  }

  const handleUpdateFile = async () => {
    if (!newTitle) return
    const { error } = await supabase.from('files_metadata').update({ file_name: newTitle }).eq('id', editItem.id)
    if (!error) { 
      alert("파일 이름 수정 완료!"); 
      setEditItem(null); 
      fetchFiles(); 
    }
  }

  const handleDeleteFile = async (e, id) => {
    e.stopPropagation(); 
    if (!confirm("해당 슬라이드 제출 기록을 삭제하시겠습니까?\n(원본 링크는 지워지지 않습니다.)")) return
    const { error } = await supabase.from('files_metadata').delete().eq('id', id)
    if (!error) fetchFiles()
  }

  const handleSubmitLink = async () => {
    if (!driveLink.trim()) {
      alert("구글 드라이브 공유 링크를 입력해 주세요!");
      return;
    }
    if (!driveLink.includes("drive.google.com") && !driveLink.includes("docs.google.com")) {
      alert("올바른 구글 드라이브 링크가 아닙니다.");
      return;
    }

    setSubmitting(true)
    
    const currentTopic = weekTopics[targetWeek] || (targetWeek === 0 ? 'OT 및 자유 주제' : '자유 주제')
    const uploaderName = user.user_metadata.name || '익명'
    const autoFileName = `${targetWeek}W (${currentTopic}) ${uploaderName} 발표자료`
    
    let myGroup = null
    if (weeklySetup[targetWeek] && weeklySetup[targetWeek].members) {
      const g = weeklySetup[targetWeek].members[uploaderName]
      if (g && g !== '미정' && g !== '결석') {
        myGroup = Number(g) 
      }
    }

    const deadline = deadlines[targetWeek]?.slide
    const isLate = deadline ? new Date() > new Date(deadline) : false

    const { error } = await supabase.from('files_metadata').insert([{ 
      file_name: autoFileName, 
      file_url: driveLink, 
      week: targetWeek,
      file_category: 'slide', 
      is_archive: false,
      uploader: uploaderName, 
      storage_path: 'google_drive_link', 
      semester: currentSemester,
      is_late: isLate,
      group_id: myGroup 
    }])
    
    if (error) {
      alert('제출 실패: ' + error.message);
    } else {
      alert('슬라이드 링크 제출 완료!'); 
      setDriveLink(''); 
      setSelectedWeek(targetWeek); 
      fetchFiles();
    }
    setSubmitting(false); 
  }

  const handleWeekChange = (w) => {
    setSelectedWeek(w);
    setTargetWeek(w);
  }

  if (!user) return <div className="p-8 text-center font-bold text-slate-500">데이터 로딩 중...</div>

  const filesThisWeek = files.filter(f => f.week === selectedWeek)
  const groupedFiles = {}
  
  let maxGroup = 0
  if (weeklySetup[selectedWeek] && weeklySetup[selectedWeek].groupCount) {
    maxGroup = Number(weeklySetup[selectedWeek].groupCount)
  }

  const getDynamicGroup = (file) => {
    if (weeklySetup[selectedWeek] && weeklySetup[selectedWeek].members && weeklySetup[selectedWeek].members[file.uploader]) {
      const g = weeklySetup[selectedWeek].members[file.uploader]
      if (g !== '미정' && g !== '결석') return Number(g)
    }
    if (file.group_id) return file.group_id
    return null
  }
  
  filesThisWeek.forEach(f => {
    const dGroup = getDynamicGroup(f)
    if (dGroup && dGroup > maxGroup) maxGroup = dGroup
  })

  for (let i = 1; i <= maxGroup; i++) {
    groupedFiles[i] = []
  }
  groupedFiles['미분류'] = [] 

  filesThisWeek.forEach(f => {
    const dGroup = getDynamicGroup(f)
    if (dGroup && groupedFiles[dGroup]) {
      groupedFiles[dGroup].push(f)
    } else {
      groupedFiles['미분류'].push(f)
    }
  })

  return (
    <div className="bg-white min-h-screen text-slate-900 font-sans pb-32">
      {/* 🌟 최상단 GNB 스타일의 탭 네비게이션 */}
      <div className="border-b border-slate-200 bg-white sticky top-0 z-20">
        <div className="max-w-[1200px] mx-auto flex items-end px-6 md:px-8 pt-4 overflow-x-auto no-scrollbar">
          <Link href="/home" className="pb-4 pr-6 text-sm font-extrabold text-slate-400 hover:text-purple-800 transition-colors flex items-center shrink-0">
            HOME
          </Link>
          <div className="w-px h-4 bg-slate-300 mx-2 mb-4 shrink-0"></div>
          <Link href="/dashboard/proposal" className="pb-4 px-6 text-sm font-semibold text-slate-400 hover:text-slate-800 transition-colors shrink-0">
            기획서 📝
          </Link>
          <Link href="/dashboard/slide" className="pb-4 px-6 text-sm font-extrabold text-purple-800 border-b-2 border-purple-800 transition-colors shrink-0">
            슬라이드 🖼️
          </Link>
          <Link href="/dashboard/video" className="pb-4 px-6 text-sm font-semibold text-slate-400 hover:text-slate-800 transition-colors shrink-0">
            발표영상 🎬
          </Link>
        </div>
      </div>

      <header className="max-w-[1200px] mx-auto px-6 md:px-8 mt-12 mb-10">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-purple-800 tracking-tight">Slide Board</h1>
          <p className="text-sm font-medium text-slate-500 mt-2">주차별 발표 슬라이드를 제출하고 확인합니다.</p>
        </div>

        {/* 🌟 컨트롤 패널 (선과 면 분할로만 이루어진 미니멀 디자인 - 기획서 완벽 동기화) */}
        <div className="border-y border-slate-200 py-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col gap-2 w-full md:w-auto">
            <div className="flex items-center gap-4">
              <select 
                value={targetWeek} 
                onChange={(e) => handleWeekChange(Number(e.target.value))} 
                className="py-1.5 pr-8 pl-2 bg-transparent text-slate-800 font-extrabold text-lg outline-none cursor-pointer border-b border-slate-300 hover:border-purple-600 transition-all appearance-none"
              >
                {weeks.map(w => <option key={w} value={w}>Week {w}</option>)}
              </select>
              <h2 className="text-lg font-bold text-slate-700 tracking-tight">
                {weekTopics[targetWeek] || (targetWeek === 0 ? 'OT 및 자유 주제' : '자유 주제')}
              </h2>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 mt-2">
              <p className="text-xs font-medium text-slate-500 flex items-center gap-2">
                <span className="text-slate-400 font-bold uppercase tracking-wider">제출 마감 |</span>
                <span className="text-slate-800">{deadlines[targetWeek]?.slide ? formatDate(deadlines[targetWeek].slide) : '미설정'}</span>
              </p>
            </div>
          </div>

          {/* 슬라이드 전용: 링크 제출 폼 (상자 제거, 선 기반) */}
          <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto shrink-0 items-center">
            <a href={GOOGLE_DRIVE_FOLDER_URL} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-slate-600 hover:text-purple-600 transition-colors underline underline-offset-4">
              드라이브 열기 ↗
            </a>
            <div className="flex w-full sm:w-auto items-center ml-0 sm:ml-4">
              <input 
                type="text" 
                value={driveLink}
                onChange={(e) => setDriveLink(e.target.value)}
                placeholder="공유 링크 붙여넣기" 
                className="border-b border-slate-300 px-2 py-2 text-sm font-medium outline-none focus:border-purple-800 w-full sm:w-[220px] bg-transparent transition-colors" 
              />
              <button 
                onClick={handleSubmitLink} 
                disabled={submitting} 
                className="bg-slate-900 hover:bg-purple-600 text-white px-6 py-2.5 font-bold text-sm transition-colors whitespace-nowrap ml-4"
              >
                {submitting ? '제출 중...' : '+ 신규 등록'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 🌟 메인 레이아웃: 사이드바 + 리스트 보드 */}
      <div className="max-w-[1200px] mx-auto px-6 md:px-8 flex flex-col lg:flex-row gap-10 items-start">
        
        {/* 좌측: 텍스트 기반 사이드바 */}
        <aside className="w-full lg:w-[200px] shrink-0 sticky top-24 hidden lg:flex flex-col">
          <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-200 pb-2">Select Week</h3>
          <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto no-scrollbar py-2">
            {weeks.map(w => (
              <button 
                key={w} 
                onClick={() => handleWeekChange(w)} 
                className={`text-left text-sm font-semibold transition-colors py-1 ${selectedWeek === w ? 'text-purple-800 underline underline-offset-4 decoration-2' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {w === 0 ? 'OT / 자유 주제' : `Week ${String(w).padStart(2, '0')}`}
              </button>
            ))}
          </div>
        </aside>

        {/* 모바일용 주차 선택 */}
        <div className="lg:hidden w-full flex gap-4 overflow-x-auto pb-2 mb-6 border-b border-slate-200 no-scrollbar">
          {weeks.map(w => (
            <button 
              key={w} 
              onClick={() => handleWeekChange(w)} 
              className={`pb-3 text-sm font-semibold transition-colors shrink-0 ${selectedWeek === w ? 'text-purple-800 border-b-2 border-purple-800' : 'text-slate-500'}`}
            >
              W{w}
            </button>
          ))}
        </div>

        {/* 우측: 리스트형 메인 보드 */}
        <main className="flex-1 w-full min-w-0 space-y-12">
          {filesThisWeek.length === 0 ? (
            <div className="text-center py-20 text-slate-400 font-medium">
              해당 주차에 등록된 내역이 없습니다.
            </div>
          ) : (
            <div className="space-y-10">
              {Array.from({ length: maxGroup }, (_, i) => i + 1).map(gId => {
                const groupList = groupedFiles[gId]
                const isGroupSetup = weeklySetup[selectedWeek] && weeklySetup[selectedWeek].groupCount >= gId;
                if (groupList.length === 0 && !isGroupSetup) return null 
                
                return (
                  <div key={gId} className="border-t-2 border-purple-800 pt-4">
                    <div className="flex justify-between items-end mb-4">
                      <h3 className="text-lg font-extrabold text-purple-800">Group {String(gId).padStart(2, '0')}</h3>
                      <span className="text-xs font-bold text-slate-400">Total {groupList.length}</span>
                    </div>
                    <div className="border-t border-slate-200">
                      {groupList.length === 0 ? (
                        <div className="py-6 text-center text-xs font-medium text-slate-400 border-b border-slate-200">
                          제출 내역이 없습니다.
                        </div>
                      ) : groupList.map(file => (
                        <SlideListItem 
                          key={file.id} 
                          file={file} 
                          onEdit={(e) => { e.stopPropagation(); setEditItem(file); setNewTitle(file.file_name); }}
                          onDelete={(e) => { e.stopPropagation(); handleDeleteFile(e, file.id); }}
                          formatDate={formatDate}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}

              {/* 미분류 리스트 */}
              {groupedFiles['미분류'].length > 0 && (
                <div className={`border-t-2 border-slate-300 pt-4 transition-opacity ${maxGroup === 0 ? '' : 'opacity-70 hover:opacity-100'}`}>
                  <div className="flex justify-between items-end mb-4">
                    <h3 className="text-lg font-extrabold text-slate-600">
                      {maxGroup === 0 ? '제출 목록 (조 미편성)' : '개별 / 미분류 제출'}
                    </h3>
                    <span className="text-xs font-bold text-slate-400">Total {groupedFiles['미분류'].length}</span>
                  </div>
                  <div className="border-t border-slate-200">
                    {groupedFiles['미분류'].map(file => (
                      <SlideListItem 
                        key={file.id} 
                        file={file} 
                        onEdit={(e) => { e.stopPropagation(); setEditItem(file); setNewTitle(file.file_name); }}
                        onDelete={(e) => { e.stopPropagation(); handleDeleteFile(e, file.id); }}
                        formatDate={formatDate}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

      </div>

      {/* 파일 이름 수정 모달 (기획서 100% 동일) */}
      {editItem && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[110]">
          <div className="bg-white p-8 w-full max-w-sm shadow-xl border border-slate-200">
            <h2 className="font-extrabold mb-6 text-lg text-slate-900 border-l-4 border-purple-800 pl-2">파일명 수정</h2>
            <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-full border-b border-slate-300 py-2 mb-8 font-medium text-sm outline-none focus:border-purple-800 bg-transparent" />
            <div className="flex gap-2">
              <button onClick={handleUpdateFile} className="flex-1 py-2.5 bg-purple-800 text-white font-bold text-xs hover:bg-purple-900">저장</button>
              <button onClick={() => setEditItem(null)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-bold text-xs hover:bg-slate-200">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 🌟 가로형 슬라이드 리스트 아이템 (기획서 UI 100% 동기화)
function SlideListItem({ file, onEdit, onDelete, formatDate }) {
  return (
    <div 
      className="flex flex-col sm:flex-row sm:items-center justify-between py-4 border-b border-slate-200 hover:bg-slate-50/50 transition-colors cursor-pointer group gap-4 px-2" 
      onClick={() => window.open(file.file_url, '_blank')}
    >
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <span className="shrink-0 font-black text-[10px] text-purple-600 uppercase w-8 text-center">
          LINK
        </span>
        <div className="flex flex-col min-w-0 gap-0.5">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-800 truncate group-hover:text-purple-600 transition-colors">{file.file_name}</h4>
            {file.is_late && <span className="border border-red-400 text-red-600 text-[9px] font-black px-1 py-0.5 rounded-sm shrink-0">LATE</span>}
          </div>
          <span className="text-xs font-medium text-slate-400">{file.uploader}</span>
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-6 shrink-0 w-full sm:w-auto pl-12 sm:pl-0">
        <span className="text-xs font-medium text-slate-400">{formatDate(file.created_at)}</span>
        <div className="flex items-center gap-3 sm:opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={(e) => { e.stopPropagation(); onEdit(e); }} className="text-[11px] font-bold text-slate-400 hover:text-purple-600 transition-colors">수정</button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(e); }} className="text-[11px] font-bold text-slate-400 hover:text-red-600 transition-colors">삭제</button>
        </div>
      </div>
    </div>
  )
}