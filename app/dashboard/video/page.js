'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function VideoRoom() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  
  const [selectedWeek, setSelectedWeek] = useState(1) 
  const [targetWeek, setTargetWeek] = useState(1) 
  
  const [activeMembers, setActiveMembers] = useState([]) 
  const [selectedOwnerName, setSelectedOwnerName] = useState('') 
  const [ytUrl, setYtUrl] = useState('') 

  const [currentSemester, setCurrentSemester] = useState('2026-1')
  const [totalWeeks, setTotalWeeks] = useState(12) 
  const [deadlines, setDeadlines] = useState({})
  const [weekTopics, setWeekTopics] = useState({}) 
  const [weeklySetup, setWeeklySetup] = useState({})

  const [editItem, setEditItem] = useState(null)
  const [newTitle, setNewTitle] = useState('')

  const [viewingFile, setViewingFile] = useState(null)
  const [draftFeedback, setDraftFeedback] = useState(null) 
  
  const [comments, setComments] = useState([])
  const [newCommentData, setNewCommentData] = useState({
    originalMessage: '',
    insightPlus: '', insightMinus: '',
    graphicPlus: '', graphicMinus: '',
    deliveryPlus: '', deliveryMinus: ''
  })

  const weeks = Array.from({ length: totalWeeks + 1 }, (_, i) => i)

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login') } 
      else { setUser(session.user); fetchFiles(); fetchSystemData(); }
    }
    checkUser()
  }, [])

  useEffect(() => {
    if (user) fetchMembers();
  }, [user])

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
    
    const { data: dlData } = await supabase.from('pr_deadlines').select('*')
    
    const dlMap = {}
    let initialWeek = 1
    let minDiff = Infinity
    let maxPastWeek = 1
    const now = new Date()

    if (dlData) {
      dlData.forEach(d => {
        if (!dlMap[d.week]) dlMap[d.week] = {}
        dlMap[d.week][d.category] = d.deadline_time

        if (d.category === 'video' && d.deadline_time) {
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

  const fetchMembers = async () => {
    const { data: memberData } = await supabase.from('members').select('*').order('name');
    if (memberData && memberData.length > 0) {
      const active = memberData.filter(m => m.status === '활동' || m.status === '활동기수' || m.role === '활동기수' || m.is_active === true);
      setActiveMembers(active.length > 0 ? active : memberData);
    } else {
      const { data: profData } = await supabase.from('profiles').select('*').order('name');
      if (profData) setActiveMembers(profData);
    }
  }

  const fetchFiles = async () => {
    const { data } = await supabase.from('files_metadata').select('*').eq('file_category', 'video').order('created_at', { ascending: false })
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

  const handleRegisterYoutube = async () => {
    if (!selectedOwnerName || !ytUrl.trim()) return alert("영상 주인과 유튜브 링크를 모두 입력해줘! 🔗")
    
    setUploading(true)
    const currentTopic = weekTopics[targetWeek] || (targetWeek === 0 ? 'OT 및 자유 주제' : '자유 주제')
    const autoTitle = `${targetWeek}W (${currentTopic}) ${selectedOwnerName} 발표영상`;
    
    let myGroup = null
    if (weeklySetup[targetWeek] && weeklySetup[targetWeek].members) {
      const g = weeklySetup[targetWeek].members[selectedOwnerName]
      if (g && g !== '미정' && g !== '결석') {
        myGroup = Number(g) 
      }
    }

    const deadline = deadlines[targetWeek]?.video
    const isLate = deadline ? new Date() > new Date(deadline) : false

    const { error } = await supabase.from('files_metadata').insert([{ 
      file_name: autoTitle, 
      file_url: ytUrl.trim(), 
      week: targetWeek,
      file_category: 'video', 
      is_archive: false, 
      uploader: selectedOwnerName, 
      storage_path: 'youtube',
      semester: currentSemester,
      is_late: isLate,
      group_id: myGroup 
    }])
    if (!error) { 
      alert('영상 등록 완료!'); 
      setYtUrl(''); 
      setSelectedOwnerName(''); 
      setSelectedWeek(targetWeek);
      fetchFiles(); 
    }
    else { alert("등록 실패: " + error.message); }
    setUploading(false)
  }

  const handleOpenVideo = async (file) => {
    setViewingFile(file);
    setDraftFeedback(null); 
    fetchComments(file.id);

    const { data: pData } = await supabase.from('presentations').select('id').eq('week', file.week).eq('presenter_name', file.uploader).single();
    if (pData) {
      const userName = user?.user_metadata?.name;
      if (userName) {
        const { data: myDraft } = await supabase.from('scores').select('*').eq('presentation_id', pData.id).eq('voter_name', userName).single();
        if (myDraft) setDraftFeedback(myDraft.details?.qualitative || null);
      }
    }
  }

  const fetchComments = async (fileId) => {
    const { data } = await supabase.from('file_comments').select('*').eq('file_id', fileId).order('created_at', { ascending: true });
    if (data) setComments(data);
  }

  const handleAddComment = async () => {
    if (!newCommentData.originalMessage.trim()) return alert("Original Message는 필수 입력입니다.");
    
    const realName = user.user_metadata.name || '알 수 없는 유저';
    const { error } = await supabase.from('file_comments').insert([{
      file_id: viewingFile.id,
      user_id: user.id,
      user_name: realName, 
      details: newCommentData 
    }]);

    if (!error) {
      setNewCommentData({ originalMessage: '', insightPlus: '', insightMinus: '', graphicPlus: '', graphicMinus: '', deliveryPlus: '', deliveryMinus: '' });
      fetchComments(viewingFile.id);
      alert("피드백 등록 완료!");
    } else { alert("오류: " + error.message); }
  }

  const handleToggleRead = async (commentId, currentDetails) => {
    const isCurrentlyRead = currentDetails?.is_read || false;
    const now = new Date().toISOString();
    
    const updatedDetails = { ...currentDetails, is_read: !isCurrentlyRead, read_at: !isCurrentlyRead ? now : null };

    const { error } = await supabase.from('file_comments').update({ details: updatedDetails }).eq('id', commentId);
    if (!error) {
      fetchComments(viewingFile.id);
    } else {
      alert("상태 변경 실패: " + error.message);
    }
  }

  const handleDeleteComment = async (commentId) => {
    if (!confirm("해당 피드백을 삭제하시겠습니까?")) return
    const { error } = await supabase.from('file_comments').delete().eq('id', commentId)
    if (!error) fetchComments(viewingFile.id)
  }

  const handleUpdateComment = async (commentId, editText) => {
    const { error } = await supabase.from('file_comments').update({ 
      details: { ...comments.find(c => c.id === commentId).details, originalMessage: editText } 
    }).eq('id', commentId)
    if (!error) { setEditingCommentId(null); fetchComments(viewingFile.id); }
  }

  const getYoutubeId = (url) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  const handleDeleteFile = async (e, id) => {
    e.stopPropagation();
    if (!confirm("해당 영상을 삭제하시겠습니까?")) return
    await supabase.from('files_metadata').delete().eq('id', id); fetchFiles();
  }

  const handleWeekChange = (w) => {
    setSelectedWeek(w);
    setTargetWeek(w);
  }

  if (!user) return <div className="p-8 text-center font-bold text-slate-500">데이터 로딩 중...</div>

  const selfFeedbacks = comments.filter(c => c.user_name === viewingFile?.uploader);
  const peerFeedbacks = comments.filter(c => c.user_name !== viewingFile?.uploader);
  const loggedInUserName = user?.user_metadata?.name;
  const isVideoOwner = loggedInUserName === viewingFile?.uploader;

  const getQualitativeDeadline = (weekNum) => deadlines[weekNum]?.vote_feedback || deadlines[weekNum]?.feedback;

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
      {/* 최상단 GNB 스타일의 탭 네비게이션 */}
      <div className="border-b border-slate-200 bg-white sticky top-0 z-20">
        <div className="max-w-[1200px] mx-auto flex items-end px-6 md:px-8 pt-4 overflow-x-auto no-scrollbar">
          <Link href="/home" className="pb-4 pr-6 text-sm font-extrabold text-slate-400 hover:text-red-800 transition-colors flex items-center shrink-0">
            HOME
          </Link>
          <div className="w-px h-4 bg-slate-300 mx-2 mb-4 shrink-0"></div>
          <Link href="/dashboard/proposal" className="pb-4 px-6 text-sm font-semibold text-slate-400 hover:text-slate-800 transition-colors shrink-0">
            기획서 📝
          </Link>
          <Link href="/dashboard/slide" className="pb-4 px-6 text-sm font-semibold text-slate-400 hover:text-slate-800 transition-colors shrink-0">
            슬라이드 🖼️
          </Link>
          <Link href="/dashboard/video" className="pb-4 px-6 text-sm font-extrabold text-red-800 border-b-2 border-red-800 transition-colors shrink-0">
            발표영상 🎬
          </Link>
        </div>
      </div>

      <header className="max-w-[1200px] mx-auto px-6 md:px-8 mt-12 mb-10">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-red-800 tracking-tight">Video Board</h1>
          <p className="text-sm font-medium text-slate-500 mt-2">주차별 발표 영상을 확인하고 피드백을 진행합니다.</p>
        </div>

        {/* 컨트롤 패널 */}
        <div className="border-y border-slate-200 py-6 flex flex-col xl:flex-row justify-between items-center gap-6">
          <div className="flex flex-col gap-2 w-full xl:w-auto">
            <div className="flex items-center gap-4">
              <select 
                value={targetWeek} 
                onChange={(e) => handleWeekChange(Number(e.target.value))} 
                className="font-extrabold text-2xl text-slate-900 bg-transparent outline-none cursor-pointer appearance-none hover:text-red-800 transition-colors pl-1"
              >
                {weeks.map(w => <option key={w} value={w}>Week {w}</option>)}
              </select>
              <h2 className="text-xl font-bold text-slate-700 tracking-tight">
                {weekTopics[targetWeek] || (targetWeek === 0 ? 'OT 및 자유 주제' : '자유 주제')}
              </h2>
            </div>
            
            <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2">
              <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <span className="font-bold text-slate-400">등록 마감 |</span>
                <span className="text-slate-800">{deadlines[targetWeek]?.video ? formatDate(deadlines[targetWeek].video) : '미설정'}</span>
              </p>
              <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <span className="font-bold text-slate-400">조원 평가 |</span>
                <span className="text-slate-800">{getQualitativeDeadline(targetWeek) ? formatDate(getQualitativeDeadline(targetWeek)) : '미설정'}</span>
              </p>
              <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <span className="font-bold text-slate-400">본인 평가 |</span>
                <span className="text-slate-800">{deadlines[targetWeek]?.video_comment ? formatDate(deadlines[targetWeek].video_comment) : '미설정'}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto shrink-0">
            <select 
              value={selectedOwnerName} 
              onChange={(e) => setSelectedOwnerName(e.target.value)} 
              className="border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-slate-500 bg-white cursor-pointer rounded-none"
            >
              <option value="">발표자 선택</option>
              {activeMembers.map((m, idx) => (
                <option key={m.id || idx} value={m.name}>{m.name}</option>
              ))}
            </select>
            <div className="flex w-full sm:w-auto">
              <input 
                type="text" 
                value={ytUrl}
                onChange={(e) => setYtUrl(e.target.value)}
                placeholder="유튜브 링크 붙여넣기" 
                className="border-y border-l border-slate-300 px-4 py-2.5 text-sm font-medium outline-none focus:border-slate-500 w-full sm:w-[250px] bg-white transition-colors rounded-none" 
              />
              <button 
                onClick={handleRegisterYoutube} 
                disabled={uploading} 
                className="bg-[#0f172a] hover:bg-slate-800 text-white px-6 py-2.5 font-bold text-sm transition-colors whitespace-nowrap rounded-none"
              >
                {uploading ? '등록 중...' : '+ 신규 등록'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 레이아웃: 사이드바 + 리스트 보드 */}
      <div className="max-w-[1200px] mx-auto px-6 md:px-8 flex flex-col lg:flex-row gap-10 items-start">
        
        <aside className="w-full lg:w-[200px] shrink-0 sticky top-24 hidden lg:flex flex-col">
          <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-4 border-b border-slate-200 pb-2">Select Week</h3>
          <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto no-scrollbar py-2">
            {weeks.map(w => (
              <button 
                key={w} 
                onClick={() => handleWeekChange(w)} 
                className={`text-left text-sm font-semibold transition-colors py-1 ${selectedWeek === w ? 'text-red-700 underline underline-offset-4 decoration-2' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {w === 0 ? 'OT / 자유 주제' : `Week ${String(w).padStart(2, '0')}`}
              </button>
            ))}
          </div>
        </aside>

        <div className="lg:hidden w-full flex gap-4 overflow-x-auto pb-2 mb-6 border-b border-slate-200 no-scrollbar">
          {weeks.map(w => (
            <button 
              key={w} 
              onClick={() => handleWeekChange(w)} 
              className={`pb-3 text-sm font-semibold transition-colors shrink-0 ${selectedWeek === w ? 'text-red-700 border-b-2 border-red-700' : 'text-slate-500'}`}
            >
              W{w}
            </button>
          ))}
        </div>

        <main className="flex-1 w-full min-w-0 space-y-12">
          {filesThisWeek.length === 0 ? (
            <div className="text-center py-20 text-slate-400 font-medium">
              해당 주차에 등록된 영상이 없습니다.
            </div>
          ) : (
            <div className="space-y-10">
              {Array.from({ length: maxGroup }, (_, i) => i + 1).map(gId => {
                const groupList = groupedFiles[gId]
                const isGroupSetup = weeklySetup[selectedWeek] && weeklySetup[selectedWeek].groupCount >= gId;
                if (groupList.length === 0 && !isGroupSetup) return null 
                
                return (
                  <div key={gId} className="border-t-2 border-red-800 pt-4">
                    <div className="flex justify-between items-end mb-4">
                      <h3 className="text-lg font-extrabold text-red-800">Group {String(gId).padStart(2, '0')}</h3>
                      <span className="text-xs font-bold text-slate-400">Total {groupList.length}</span>
                    </div>
                    <div className="border-t border-slate-200">
                      {groupList.length === 0 ? (
                        <div className="py-6 text-center text-xs font-medium text-slate-400 border-b border-slate-200">
                          등록된 영상이 없습니다.
                        </div>
                      ) : groupList.map(file => (
                        <VideoListItem 
                          key={file.id} 
                          file={file} 
                          onOpen={() => handleOpenVideo(file)}
                          onEdit={(e) => { e.stopPropagation(); setEditItem(file); setNewTitle(file.file_name); }}
                          onDelete={(e) => { e.stopPropagation(); handleDeleteFile(e, file.id); }}
                          formatDate={formatDate}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}

              {groupedFiles['미분류'].length > 0 && (
                <div className={`border-t-2 border-slate-300 pt-4 transition-opacity ${maxGroup === 0 ? '' : 'opacity-70 hover:opacity-100'}`}>
                  <div className="flex justify-between items-end mb-4">
                    <h3 className={`text-lg font-extrabold ${maxGroup === 0 ? 'text-red-800' : 'text-slate-600'}`}>
                      {maxGroup === 0 ? '영상 목록 (조 미편성)' : '개별 / 미분류 영상'}
                    </h3>
                    <span className="text-xs font-bold text-slate-400">Total {groupedFiles['미분류'].length}</span>
                  </div>
                  <div className="border-t border-slate-200">
                    {groupedFiles['미분류'].map(file => (
                      <VideoListItem 
                        key={file.id} 
                        file={file} 
                        onOpen={() => handleOpenVideo(file)}
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

      {/* 파일 이름 수정 모달 */}
      {editItem && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[110]">
          <div className="bg-white p-8 w-full max-w-sm shadow-xl border border-slate-300 rounded-sm">
            <h2 className="font-extrabold mb-6 text-lg text-slate-900 border-l-4 border-red-700 pl-2">파일명 수정</h2>
            <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-full border-b border-slate-300 py-2 mb-8 font-medium text-sm outline-none focus:border-red-700 bg-transparent" />
            <div className="flex gap-2">
              <button onClick={handleUpdateFile} className="flex-1 py-2.5 bg-red-700 text-white rounded-sm font-bold text-xs border border-red-800 hover:bg-red-800">저장</button>
              <button onClick={() => setEditItem(null)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-sm font-bold text-xs border border-slate-300 hover:bg-slate-200">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 🌟 뷰어 모달 (선 위주의 미니멀 다이어트 UI) */}
      {viewingFile && (
        <div className="fixed inset-0 bg-white/95 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white w-full max-w-[1500px] h-[90vh] flex flex-col lg:flex-row overflow-hidden relative shadow-2xl border border-slate-400 rounded-sm">
            <button onClick={() => setViewingFile(null)} className="absolute top-4 right-4 z-50 px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-900 hover:text-white transition-colors rounded-sm border border-slate-300">닫기 ✕</button>
            
            <div className="flex-[1.5] bg-black flex flex-col border-r border-slate-300 overflow-hidden">
              <div className={`w-full ${draftFeedback ? 'aspect-video shrink-0' : 'flex-1'} bg-black transition-all`}>
                <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${getYoutubeId(viewingFile.file_url)}?autoplay=1`} frameBorder="0" allowFullScreen></iframe>
              </div>

              {/* 임시저장 노트: 상자 제거, 선으로만 구분 */}
              {draftFeedback && (
                <div className="flex-1 overflow-y-auto p-8 bg-[#0f172a]">
                  <h3 className="text-sm font-extrabold text-emerald-400 uppercase tracking-widest mb-6 pb-2 border-b border-slate-700">
                    내 임시저장 노트
                  </h3>
                  <div className="space-y-6">
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Original Message</p>
                      <p className="text-sm font-medium text-slate-300 leading-relaxed border-l-2 border-slate-600 pl-3">{draftFeedback.originalMessage || '작성된 내용이 없습니다.'}</p>
                    </div>
                    <DraftBox title="Insight" plus={draftFeedback.insightPlus} minus={draftFeedback.insightMinus} />
                    <DraftBox title="Graphic" plus={draftFeedback.graphicPlus} minus={draftFeedback.graphicMinus} />
                    <DraftBox title="Delivery" plus={draftFeedback.deliveryPlus} minus={draftFeedback.deliveryMinus} />
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 flex flex-col bg-white">
              <div className="p-6 border-b border-slate-200">
                <h2 className="font-extrabold text-lg text-slate-900 border-l-4 border-red-700 pl-2">Feedback</h2>
                <p className="text-xs text-slate-500 font-semibold mt-2 truncate">{viewingFile.file_name}</p>
                <div className="flex flex-col sm:flex-row gap-2 mt-3">
                  {getQualitativeDeadline(viewingFile.week) && (
                    <span className="text-[10px] font-bold text-red-600 border border-red-200 bg-red-50 px-2 py-0.5 rounded-sm w-fit">
                      조원 마감: {formatDate(getQualitativeDeadline(viewingFile.week))}
                    </span>
                  )}
                  {deadlines[viewingFile.week]?.video_comment && (
                    <span className="text-[10px] font-bold text-red-600 border border-red-200 bg-red-50 px-2 py-0.5 rounded-sm w-fit">
                      본인 마감: {formatDate(deadlines[viewingFile.week].video_comment)}
                    </span>
                  )}
                </div>
              </div>
              
              {/* 피드백 리스트: 상자 제거, 선으로만 구분 */}
              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                <div>
                  <h4 className="text-sm font-extrabold text-slate-800 border-b-2 border-slate-800 pb-2 mb-4">셀프 피드백 (본인)</h4>
                  {selfFeedbacks.map((c) => {
                    const isLate = deadlines[viewingFile.week]?.video_comment && new Date(c.created_at) > new Date(deadlines[viewingFile.week].video_comment);
                    return <FeedbackCard key={c.id} commentId={c.id} name={c.user_name} data={c.details} date={c.created_at} isLate={isLate} currentUserId={user.id} onDelete={handleDeleteComment} />
                  })}
                  {selfFeedbacks.length === 0 && <p className="text-xs text-slate-400 font-medium pb-2">등록된 셀프 피드백이 없습니다.</p>}
                </div>

                <div>
                  <h4 className="text-sm font-extrabold text-slate-800 border-b-2 border-slate-800 pb-2 mb-4">조원 상세 피드백</h4>
                  {peerFeedbacks.map((c) => {
                    const isLate = getQualitativeDeadline(viewingFile.week) && new Date(c.created_at) > new Date(getQualitativeDeadline(viewingFile.week));
                    return (
                      <FeedbackCard 
                        key={c.id} 
                        commentId={c.id} 
                        name={c.user_name} 
                        data={c.details} 
                        date={c.created_at} 
                        isLate={isLate} 
                        isPeerFeedback={true}
                        isVideoOwner={isVideoOwner}
                        onToggleRead={handleToggleRead}
                        selfDeadline={deadlines[viewingFile.week]?.video_comment}
                        currentUserId={user.id}
                        onDelete={handleDeleteComment}
                      />
                    )
                  })}
                  {peerFeedbacks.length === 0 && <p className="text-xs text-slate-400 font-medium">등록된 조원 피드백이 없습니다.</p>}
                </div>
              </div>

              {/* 🌟 작성 폼: Original Message 한줄 축소, 하단 선 색상 포인트 추가 */}
              <div className="p-6 border-t border-slate-300 bg-slate-50/50 max-h-[40vh] overflow-y-auto shrink-0">
                <h4 className="text-sm font-extrabold text-slate-800 mb-4 border-l-4 border-red-700 pl-2">피드백 작성</h4>
                <div className="space-y-5">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 mb-1 block uppercase tracking-wider">Original Message (필수)</label>
                    <input 
                      type="text" 
                      value={newCommentData.originalMessage} 
                      onChange={(e)=>setNewCommentData({...newCommentData, originalMessage: e.target.value})} 
                      className="w-full border-b border-slate-300 py-1 text-sm font-medium outline-none focus:border-red-800 bg-transparent" 
                      placeholder="전체적인 핵심 메시지 및 느낀 점" 
                    />
                  </div>
                  <FeedbackInputSection title="Insight" plus={newCommentData.insightPlus} minus={newCommentData.insightMinus} onChange={(k, v)=>setNewCommentData({...newCommentData, [k]: v})} />
                  <FeedbackInputSection title="Graphic" plus={newCommentData.graphicPlus} minus={newCommentData.graphicMinus} onChange={(k, v)=>setNewCommentData({...newCommentData, [k]: v})} />
                  <FeedbackInputSection title="Delivery" plus={newCommentData.deliveryPlus} minus={newCommentData.deliveryMinus} onChange={(k, v)=>setNewCommentData({...newCommentData, [k]: v})} />
                  
                  <button onClick={handleAddComment} className="w-full py-3 bg-slate-900 text-white font-bold text-sm hover:bg-red-800 transition-colors rounded-sm mt-4">댓글 등록</button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 🌟 가로형 리스트 아이템 (기획서 100% 동일)
function VideoListItem({ file, onOpen, onEdit, onDelete, formatDate }) {
  return (
    <div 
      className="flex flex-col sm:flex-row sm:items-center justify-between py-4 px-6 border-b border-slate-100 hover:bg-red-50/30 transition-colors cursor-pointer group gap-4 last:border-b-0" 
      onClick={onOpen}
    >
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <span className="shrink-0 font-black text-[10px] text-red-600 uppercase w-8 text-center">
          YT
        </span>
        <div className="flex flex-col min-w-0 gap-0.5">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-800 truncate group-hover:text-red-700 transition-colors">{file.file_name}</h4>
            {file.is_late && <span className="border border-red-300 text-red-600 bg-red-50 text-[9px] font-black px-1.5 py-0.5 rounded-sm shrink-0">LATE</span>}
          </div>
          <span className="text-xs font-medium text-slate-500">{file.uploader}</span>
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-6 shrink-0 w-full sm:w-auto pl-14 sm:pl-0">
        <span className="text-xs font-medium text-slate-400">{formatDate(file.created_at)}</span>
        <div className="flex items-center gap-3 sm:opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={(e) => { e.stopPropagation(); onEdit(e); }} className="text-[11px] font-bold text-slate-400 hover:text-red-600 transition-colors">수정</button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(e); }} className="text-[11px] font-bold text-slate-400 hover:text-red-600 transition-colors">삭제</button>
        </div>
      </div>
    </div>
  )
}

function DraftBox({ title, plus, minus }) {
  if (!plus && !minus) return null;
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{title}</p>
      <div className="grid gap-2 border-l-2 border-slate-600 pl-3">
        {plus && <p className="text-xs font-medium text-emerald-300 leading-relaxed"><span className="font-bold text-emerald-400 mr-1">+)</span> {plus}</p>}
        {minus && <p className="text-xs font-medium text-red-300 leading-relaxed"><span className="font-bold text-red-400 mr-1">-)</span> {minus}</p>}
      </div>
    </div>
  )
}

// 🌟 작성 폼 피드백 섹션 (+/- 얇은 하단 컬러 포인트 적용)
function FeedbackInputSection({ title, plus, minus, onChange }) {
  const kP = title.toLowerCase() + 'Plus';
  const kM = title.toLowerCase() + 'Minus';
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{title}</p>
      <div className="grid grid-cols-1 gap-2">
        <textarea 
          value={plus} 
          onChange={(e)=>onChange(kP, e.target.value)} 
          placeholder="(+) 좋았던 점 및 배울 점" 
          className="w-full border-b-2 border-emerald-400 p-2 text-xs font-medium outline-none focus:border-emerald-600 min-h-[40px] resize-none bg-transparent" 
        />
        <textarea 
          value={minus} 
          onChange={(e)=>onChange(kM, e.target.value)} 
          placeholder="(-) 아쉬운 점 및 개선 제안" 
          className="w-full border-b-2 border-red-400 p-2 text-xs font-medium outline-none focus:border-red-600 min-h-[40px] resize-none bg-transparent" 
        />
      </div>
    </div>
  )
}

function FeedbackCard({ commentId, name, data, date, isLate, isPeerFeedback, isVideoOwner, onToggleRead, selfDeadline, currentUserId, onDelete }) {
  if (!data) return null;
  const d = date ? new Date(date) : null;
  const dateStr = d ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';

  const isRead = data.is_read || false;
  const readAtStr = data.read_at ? new Date(data.read_at) : null;
  const deadlineDate = selfDeadline ? new Date(selfDeadline) : null;
  const isReadLate = isRead && readAtStr && deadlineDate && readAtStr > deadlineDate;

  return (
    <div className="border-b border-slate-200 pb-6 mb-6 last:border-0 group">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-800">{name}</span>
          {isLate && <span className="text-[9px] font-bold bg-red-50 text-red-600 border border-red-200 px-1 py-0.5 rounded-sm">LATE</span>}
          <span className="text-xs font-medium text-slate-400 ml-2">{dateStr}</span>
        </div>
        
        <div className="flex items-center gap-3">
          {currentUserId === data.user_id && (
             <button onClick={() => onDelete(commentId)} className="opacity-0 group-hover:opacity-100 text-[10px] font-bold text-slate-400 hover:text-red-600 transition-opacity">삭제</button>
          )}

          {isPeerFeedback && (
            <div className="flex items-center gap-2">
              {isVideoOwner ? (
                <button onClick={() => onToggleRead(commentId, data)} className={`text-[9px] font-bold px-2 py-1 transition-colors border rounded-sm ${isRead ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-white text-slate-500 border-slate-300 hover:bg-slate-50'}`}>
                  {isRead ? '✅ 확인 완료' : '읽음 확인'}
                </button>
              ) : (
                isRead && <span className="text-[10px] font-bold text-emerald-600 border border-emerald-200 bg-emerald-50 px-2 py-0.5 rounded-sm">✅ 작성자가 확인</span>
              )}
              {isReadLate && <span className="text-[9px] font-bold bg-orange-50 text-orange-600 border border-orange-200 px-1 py-0.5 rounded-sm">LATE 확인</span>}
            </div>
          )}
        </div>
      </div>
      
      <div className="space-y-4 pl-1">
        <div>
          <p className="text-[10px] font-bold text-slate-400 mb-1 uppercase">Original Message</p>
          <p className="text-sm font-medium text-slate-700 leading-relaxed border-l-2 border-slate-300 pl-3 py-1">{data.originalMessage}</p>
        </div>
        <FeedbackBox title="Insight" plus={data.insightPlus} minus={data.insightMinus} />
        <FeedbackBox title="Graphic" plus={data.graphicPlus} minus={data.graphicMinus} />
        <FeedbackBox title="Delivery" plus={data.deliveryPlus} minus={data.deliveryMinus} />
      </div>
    </div>
  )
}

function FeedbackBox({ title, plus, minus }) {
  if (!plus && !minus) return null;
  return (
    <div className="space-y-1.5 mt-2">
      <p className="text-[10px] font-bold text-slate-400 uppercase">{title}</p>
      <div className="grid gap-1.5 border-l-2 border-slate-200 pl-3">
        {plus && <p className="text-xs font-medium text-slate-700 leading-relaxed"><span className="font-bold text-emerald-500 mr-1">+)</span> {plus}</p>}
        {minus && <p className="text-xs font-medium text-slate-700 leading-relaxed"><span className="font-bold text-red-500 mr-1">-)</span> {minus}</p>}
      </div>
    </div>
  )
}