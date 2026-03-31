'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function SlideRoom() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [files, setFiles] = useState([])
  
  // 🌟 두 상태가 항상 같이 움직이도록 동기화 처리!
  const [selectedWeek, setSelectedWeek] = useState(1) 
  const [targetWeek, setTargetWeek] = useState(1) 
  
  // 링크 입력 칸 상태 
  const [driveLink, setDriveLink] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // [중요] 여기에 학회 공용 구글 드라이브 폴더 주소를 넣어줘!
  const GOOGLE_DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/1F-YFI422wyYQxd0lBeJ9boaNDlr0iwFJ"
  
  // 시스템 설정 상태
  const [currentSemester, setCurrentSemester] = useState('2026-1')
  const [totalWeeks, setTotalWeeks] = useState(12) 
  const [deadlines, setDeadlines] = useState({})
  const [weekTopics, setWeekTopics] = useState({}) 
  
  // 🌟 조 편성 데이터 상태 (추가됨)
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
      const setupStr = configData.find(c => c.key === 'weekly_setup')?.value // 🌟 조 편성 세팅 불러오기

      if (sem) setCurrentSemester(sem)
      if (topics) setWeekTopics(JSON.parse(topics))
      if (wks) setTotalWeeks(Number(wks))
      if (setupStr) setWeeklySetup(JSON.parse(setupStr))
    }
    
    const { data: dlData } = await supabase.from('pr_deadlines').select('*').eq('category', 'slide')
    
    // 🌟 자동 주차 선택 로직 (가장 최근/임박한 슬라이드 마감일 찾기)
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
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
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
      alert("파일 이름 수정이 완료되었어! ✨"); 
      setEditItem(null); 
      fetchFiles(); 
    }
  }

  const handleDeleteFile = async (e, id) => {
    e.stopPropagation(); 
    if (!confirm("이 슬라이드 제출 기록을 삭제할 거야?\n(구글 드라이브에 올린 원본 파일은 지워지지 않아!)")) return
    const { error } = await supabase.from('files_metadata').delete().eq('id', id)
    if (!error) fetchFiles()
  }

  const handleSubmitLink = async () => {
    if (!driveLink.trim()) {
      alert("구글 드라이브 공유 링크를 입력해 줘! 🔗");
      return;
    }
    if (!driveLink.includes("drive.google.com") && !driveLink.includes("docs.google.com")) {
      alert("올바른 구글 드라이브/프레젠테이션 링크가 아닌 것 같아! 다시 확인해 봐! 🤔");
      return;
    }

    setSubmitting(true)
    
    const currentTopic = weekTopics[targetWeek] || (targetWeek === 0 ? 'OT 및 자유 주제' : '자유 주제')
    const uploaderName = user.user_metadata.name || '익명'
    const autoFileName = `${targetWeek}W (${currentTopic}) ${uploaderName} 발표자료`
    
    // 🌟 선택된 유저의 소속 조(Group) 확인
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
      group_id: myGroup // 🌟 소속된 조 저장
    }])
    
    if (error) {
      alert('제출 실패: ' + error.message);
    } else {
      alert('슬라이드 링크 제출 완료! 🎉'); 
      setDriveLink(''); 
      setSelectedWeek(targetWeek); // 🌟 업로드 후 화면 주차 동기화
      fetchFiles();
    }
    setSubmitting(false); 
  }

  // 🌟 드롭다운이나 탭을 눌렀을 때 두 상태를 동시에 변경해주는 헬퍼 함수
  const handleWeekChange = (w) => {
    setSelectedWeek(w);
    setTargetWeek(w);
  }

  if (!user) return <div className="p-8 text-center font-bold italic">데이터 불러오는 중... 🔄</div>

  // ========================================================
  // 🌟 실시간 조(Group) 분류 및 칸반 렌더링 로직 (기획서 페이지와 동일)
  // ========================================================
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
    <div className="p-8 bg-slate-50 min-h-screen text-slate-900 font-sans pb-32">
      {/* 🌟 와이드 뷰를 위해 max-w-[1550px] 적용 */}
      <header className="max-w-[1550px] mx-auto mb-12">
        <div className="flex justify-between items-end">
          <div>
            <Link href="/dashboard" className="inline-block mb-4 px-4 py-2 bg-slate-200 text-slate-600 rounded-xl text-xs font-black hover:bg-slate-300 transition-all">← 대시보드 메인으로 가기</Link>
            <h1 className="text-5xl font-black text-purple-900 tracking-tighter">Slide Room 📊</h1>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-purple-100 flex flex-col xl:flex-row justify-between items-center gap-8 mt-8">
          
          <div className="flex flex-col gap-3 w-full xl:w-auto">
            <div className="flex items-center gap-4">
              <select 
                value={targetWeek} 
                onChange={(e) => handleWeekChange(Number(e.target.value))} 
                className="p-2 px-4 rounded-xl bg-purple-50 text-purple-900 font-black text-lg outline-none cursor-pointer"
              >
                {weeks.map(w => <option key={w} value={w}>{w}주차</option>)}
              </select>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                {weekTopics[targetWeek] || (targetWeek === 0 ? 'OT 및 자유 주제' : '자유 주제')}
              </h2>
            </div>
            
            <div className="flex flex-col gap-1.5 mt-2 bg-slate-50 p-4 rounded-xl border border-slate-100 w-fit">
              <p className="text-xs font-bold text-slate-600 flex items-center gap-2">
                <span className="text-[10px] bg-purple-100 text-purple-600 px-2 py-0.5 rounded font-black uppercase tracking-wider">슬라이드 제출 마감</span>
                {deadlines[targetWeek]?.slide ? formatDate(deadlines[targetWeek].slide) : '미설정'}
              </p>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4 w-full xl:w-auto bg-slate-50 p-4 rounded-3xl border border-slate-100">
            <a href={GOOGLE_DRIVE_FOLDER_URL} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 bg-white border-2 border-slate-200 hover:border-purple-300 text-slate-700 px-6 py-4 rounded-2xl font-black text-xs transition-all shadow-sm flex flex-col items-center justify-center gap-1 group">
              <span className="text-xl group-hover:scale-110 transition-transform">📁</span>
              Step 1. 드라이브에 파일 올리기
            </a>

            <div className="flex flex-col gap-2 w-full max-w-sm">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Step 2. 공유 링크 제출</span>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={driveLink}
                  onChange={(e) => setDriveLink(e.target.value)}
                  placeholder="복사한 링크를 여기에 붙여넣어!" 
                  className="w-full border-2 border-slate-200 p-3 rounded-xl font-bold text-sm outline-none focus:border-purple-500 bg-white" 
                />
                <button 
                  onClick={handleSubmitLink} 
                  disabled={submitting} 
                  className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl font-black text-sm transition-all shadow-md active:scale-95 whitespace-nowrap"
                >
                  {submitting ? '제출 중...' : '제출'}
                </button>
              </div>
            </div>
          </div>

        </div>
      </header>

      <div className="max-w-[1550px] mx-auto">
        <div className="flex gap-2 mb-12 overflow-x-auto pb-4 no-scrollbar">
          {weeks.map(w => (
            <button 
              key={w} 
              onClick={() => handleWeekChange(w)} 
              className={`px-6 py-3 rounded-2xl text-xs font-black transition-all flex-shrink-0 ${selectedWeek === w ? 'bg-purple-900 text-white shadow-xl scale-110' : 'bg-white border border-slate-200 text-slate-400 hover:border-purple-300'}`}
            >
              W{w}
            </button>
          ))}
        </div>

        {filesThisWeek.length === 0 ? (
          <div className="text-center py-24 text-slate-300 font-bold border-4 border-dashed border-slate-200 bg-white rounded-[3rem]">
            아직 제출된 슬라이드가 없어! 첫 번째로 올려볼까? 👀
          </div>
        ) : (
          /* 🌟 조별 세로 기둥(Kanban) 뷰어 적용 (가운데 정렬) */
          <div className="w-full overflow-x-auto pb-8 no-scrollbar">
            <div className="flex gap-6 items-start w-max mx-auto">
              
              {Array.from({ length: maxGroup }, (_, i) => i + 1).map(gId => {
                const groupList = groupedFiles[gId]
                const isGroupSetup = weeklySetup[selectedWeek] && weeklySetup[selectedWeek].groupCount >= gId;
                if (groupList.length === 0 && !isGroupSetup) return null 
                
                return (
                  <div key={gId} className="flex-shrink-0 w-[320px] flex flex-col gap-4">
                    <h3 className="text-sm font-black text-purple-600 bg-purple-100 px-4 py-2 rounded-xl w-fit shadow-sm">Group {gId}</h3>
                    <div className="space-y-4">
                      {groupList.length === 0 ? (
                        <div className="bg-white/50 border border-dashed border-slate-300 p-6 rounded-[2rem] text-center text-xs font-bold text-slate-400">
                          이 조에 제출된 슬라이드가 없습니다.
                        </div>
                      ) : groupList.map(file => (
                        <SlideCard 
                          key={file.id} 
                          file={file} 
                          onEdit={(e) => { e.stopPropagation(); setEditItem(file); setNewTitle(file.file_name); }}
                          onDelete={(e) => handleDeleteFile(e, file.id)}
                          formatDate={formatDate}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}

              {/* 🌟 조 편성 전 전용 UI 분기 처리 */}
              {groupedFiles['미분류'].length > 0 && (
                <div className={`flex-shrink-0 w-[320px] flex flex-col gap-4 transition-opacity ${maxGroup === 0 ? '' : 'opacity-80 hover:opacity-100'}`}>
                  <h3 className={`text-sm font-black px-4 py-2 rounded-xl w-fit shadow-sm ${maxGroup === 0 ? 'text-purple-600 bg-purple-100' : 'text-slate-500 bg-slate-200'}`}>
                    {maxGroup === 0 ? '제출된 슬라이드 (조 편성 전)' : '미분류 / 개별 제출'}
                  </h3>
                  <div className="space-y-4">
                    {groupedFiles['미분류'].map(file => (
                      <SlideCard 
                        key={file.id} 
                        file={file} 
                        onEdit={(e) => { e.stopPropagation(); setEditItem(file); setNewTitle(file.file_name); }}
                        onDelete={(e) => handleDeleteFile(e, file.id)}
                        formatDate={formatDate}
                      />
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}
      </div>

      {/* 파일 이름 수정 모달 */}
      {editItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6 z-[110]">
          <div className="bg-white p-10 rounded-[3rem] w-full max-w-sm shadow-2xl">
            <h2 className="font-black mb-6 text-xl text-slate-800">파일명 수정 ✏️</h2>
            <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-full border-2 border-slate-200 p-4 rounded-2xl mb-6 font-bold outline-none focus:border-purple-500" />
            <div className="flex gap-3">
              <button onClick={handleUpdateFile} className="flex-1 py-4 bg-purple-600 text-white rounded-2xl font-black hover:bg-purple-700 shadow-md">저장</button>
              <button onClick={() => setEditItem(null)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black hover:bg-slate-200">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 🌟 슬라이드 전용 카드 컴포넌트
function SlideCard({ file, onEdit, onDelete, formatDate }) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 hover:border-purple-300 hover:shadow-xl transition-all group cursor-pointer relative" onClick={() => window.open(file.file_url, '_blank')}>
      {file.is_late && (
        <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[9px] font-black px-2 py-1 rounded-lg shadow-sm">LATE</span>
      )}
      <div className="flex justify-between items-start mb-4">
        <span className="bg-slate-100 text-purple-600 text-[10px] px-2 py-1 rounded-full font-black uppercase">LINK</span>
        <div className="flex gap-3">
          <button onClick={onEdit} className="text-[10px] font-black text-slate-300 hover:text-purple-600">수정</button>
          <button onClick={onDelete} className="text-[10px] font-black text-slate-300 hover:text-red-500">삭제</button>
        </div>
      </div>
      <h3 className="text-lg font-black text-slate-800 mb-6 break-all line-clamp-2 leading-tight">{file.file_name}</h3>
      <div className="flex justify-between items-center pt-4 border-t border-slate-100">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold text-slate-400">👤 {file.uploader}</span>
          <span className="text-[9px] font-black text-slate-300">{formatDate(file.created_at)}</span>
        </div>
        <span className="text-[10px] font-black text-purple-600 flex items-center gap-1">
          드라이브에서 보기 <span className="text-sm">↗</span>
        </span>
      </div>
    </div>
  )
}