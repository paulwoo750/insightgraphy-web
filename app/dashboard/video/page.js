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
  
  // 영상 주인(활동기수) 목록 상태
  const [activeMembers, setActiveMembers] = useState([]) 
  const [selectedOwnerName, setSelectedOwnerName] = useState('') 
  const [ytUrl, setYtUrl] = useState('') 

  // 시스템 설정 상태
  const [currentSemester, setCurrentSemester] = useState('2026-1')
  const [totalWeeks, setTotalWeeks] = useState(12) 
  const [deadlines, setDeadlines] = useState({})
  const [weekTopics, setWeekTopics] = useState({}) 
  
  // 🌟 관리자가 설정한 주차별 조 편성 데이터 저장용
  const [weeklySetup, setWeeklySetup] = useState({})

  // 통합 뷰어 상태
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
      const setupStr = configData.find(c => c.key === 'weekly_setup')?.value // 🌟 조 편성 세팅 불러오기

      if (sem) setCurrentSemester(sem)
      if (topics) setWeekTopics(JSON.parse(topics))
      if (wks) setTotalWeeks(Number(wks))
      if (setupStr) setWeeklySetup(JSON.parse(setupStr))
    }
    
    const { data: dlData } = await supabase.from('pr_deadlines').select('*')
    const dlMap = {}
    if (dlData) {
      dlData.forEach(d => {
        if (!dlMap[d.week]) dlMap[d.week] = {}
        dlMap[d.week][d.category] = d.deadline_time
      })
    }
    setDeadlines(dlMap)
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const fetchMembers = async () => {
    const { data: memberData } = await supabase.from('members').select('*').order('name');
    if (memberData && memberData.length > 0) {
      const active = memberData.filter(m => 
        m.status === '활동' || m.status === '활동기수' || m.role === '활동기수' || m.is_active === true
      );
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

  const handleRegisterYoutube = async () => {
    if (!selectedOwnerName || !ytUrl.trim()) return alert("영상 주인과 유튜브 링크를 모두 입력해줘! 🔗")
    
    setUploading(true)
    const currentTopic = weekTopics[targetWeek] || (targetWeek === 0 ? 'OT 및 자유 주제' : '자유 주제')
    const autoTitle = `${targetWeek}W (${currentTopic}) ${selectedOwnerName} 발표영상`;
    
    // 🌟 선택된 영상 주인의 소속 조(Group) 확인
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
      group_id: myGroup // 🌟 소속된 조(Group) ID 함께 저장!
    }])
    if (!error) { alert('영상 등록 완료! 🎬'); setYtUrl(''); setSelectedOwnerName(''); fetchFiles(); }
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
    if (!newCommentData.originalMessage.trim()) return alert("원메세지는 필수 입력이야! ✍️");
    
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
      alert("정성 피드백 댓글 등록 완료! ✨");
    } else { alert("오류: " + error.message); }
  }

  const handleToggleRead = async (commentId, currentDetails) => {
    const isCurrentlyRead = currentDetails?.is_read || false;
    const now = new Date().toISOString();
    
    const updatedDetails = { 
      ...currentDetails, 
      is_read: !isCurrentlyRead,
      read_at: !isCurrentlyRead ? now : null 
    };

    const { error } = await supabase.from('file_comments').update({ details: updatedDetails }).eq('id', commentId);
    if (!error) {
      fetchComments(viewingFile.id);
    } else {
      alert("상태 변경 실패: " + error.message);
    }
  }

  const getYoutubeId = (url) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  const handleDeleteFile = async (e, id) => {
    e.stopPropagation();
    if (!confirm("삭제할 거야?")) return
    await supabase.from('files_metadata').delete().eq('id', id); fetchFiles();
  }

  if (!user) return <div className="p-8 text-center font-bold">데이터 불러오는 중... 🔄</div>

  const selfFeedbacks = comments.filter(c => c.user_name === viewingFile?.uploader);
  const peerFeedbacks = comments.filter(c => c.user_name !== viewingFile?.uploader);
  const loggedInUserName = user?.user_metadata?.name;
  const isVideoOwner = loggedInUserName === viewingFile?.uploader;

  const getQualitativeDeadline = (weekNum) => deadlines[weekNum]?.vote_feedback || deadlines[weekNum]?.feedback;

  // ========================================================
  // 🌟 실시간 조(Group) 분류 및 칸반 렌더링 로직
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
      {/* 🌟 전체 컨테이너 너비 확장: 1550px */}
      <header className="max-w-[1550px] mx-auto mb-12">
        <div className="flex justify-between items-end">
          <div>
            <Link href="/dashboard" className="inline-block mb-4 px-4 py-2 bg-slate-200 text-slate-600 rounded-xl text-xs font-black hover:bg-slate-300 transition-all">← 대시보드 메인으로 가기</Link>
            <h1 className="text-5xl font-black text-red-900 tracking-tighter">Video Room 🎬</h1>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-red-100 flex flex-col xl:flex-row justify-between items-center gap-8 mt-8">
          <div className="flex flex-col gap-3 w-full xl:w-auto flex-1">
            <div className="flex items-center gap-4">
              <select value={targetWeek} onChange={(e) => setTargetWeek(Number(e.target.value))} className="p-2 px-4 rounded-xl bg-red-50 text-red-900 font-black text-lg outline-none cursor-pointer">
                {weeks.map(w => <option key={w} value={w}>{w}주차</option>)}
              </select>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                {weekTopics[targetWeek] || (targetWeek === 0 ? 'OT 및 자유 주제' : '자유 주제')}
              </h2>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 w-full">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col gap-1.5">
                <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded font-black uppercase tracking-wider w-fit">1. 영상 등록 마감</span>
                <p className="text-xs font-bold text-slate-600">
                  {deadlines[targetWeek]?.video ? formatDate(deadlines[targetWeek].video) : '미설정'}
                </p>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col gap-1.5">
                <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded font-black uppercase tracking-wider w-fit">2. 정성 피드백 마감 (조원 평가)</span>
                <p className="text-xs font-bold text-slate-600">
                  {getQualitativeDeadline(targetWeek) ? formatDate(getQualitativeDeadline(targetWeek)) : '미설정'}
                </p>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col gap-1.5">
                <span className="text-[10px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded font-black uppercase tracking-wider w-fit">3. 셀프 피드백 마감 (본인 평가)</span>
                <p className="text-xs font-bold text-slate-600">
                  {deadlines[targetWeek]?.video_comment ? formatDate(deadlines[targetWeek].video_comment) : '미설정'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4 w-full xl:w-auto bg-slate-50 p-4 rounded-3xl border border-slate-100 h-fit shrink-0">
            <div className="flex flex-col gap-2 w-full xl:w-[400px]">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">YouTube 영상 등록</span>
              <div className="flex flex-col sm:flex-row gap-2">
                <select value={selectedOwnerName} onChange={(e) => setSelectedOwnerName(e.target.value)} className="w-full sm:w-1/3 p-3 rounded-xl bg-white text-slate-700 font-bold text-xs outline-none border-2 border-slate-200 cursor-pointer focus:border-red-400 transition-all">
                  <option value="">누구 영상이야?</option>
                  {activeMembers.map((m, idx) => (
                    <option key={m.id || idx} value={m.name}>{m.name}</option>
                  ))}
                </select>
                
                <input 
                  type="text" 
                  value={ytUrl}
                  onChange={(e) => setYtUrl(e.target.value)}
                  placeholder="유튜브 링크 붙여넣기" 
                  className="w-full sm:w-2/3 border-2 border-slate-200 p-3 rounded-xl font-bold text-xs outline-none focus:border-red-400 bg-white transition-all" 
                />
              </div>
              <button 
                onClick={handleRegisterYoutube} 
                disabled={uploading} 
                className="w-full mt-1 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl font-black text-sm transition-all shadow-md active:scale-95"
              >
                {uploading ? '등록 중...' : '영상 등록하기'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 🌟 전체 컨테이너 너비 확장: 1550px */}
      <div className="max-w-[1550px] mx-auto">
        <div className="flex gap-2 mb-12 overflow-x-auto pb-4 no-scrollbar">
          {weeks.map(w => (
            <button 
              key={w} 
              onClick={() => setSelectedWeek(w)} 
              className={`px-6 py-3 rounded-2xl text-xs font-black transition-all flex-shrink-0 ${selectedWeek === w ? 'bg-red-900 text-white shadow-xl scale-110' : 'bg-white border border-slate-200 text-slate-400 hover:border-red-300'}`}
            >
              W{w}
            </button>
          ))}
        </div>

        {/* 🌟 조별 세로 기둥(Kanban) 뷰어 적용 */}
        {filesThisWeek.length === 0 ? (
          <div className="text-center py-24 text-slate-300 font-bold border-4 border-dashed border-slate-200 bg-white rounded-[3rem]">
            아직 등록된 영상이 없어! 첫 번째로 올려볼까? 👀
          </div>
        ) : (
          /* 가운데 정렬을 위해 w-full과 w-max mx-auto 조합 */
          <div className="w-full overflow-x-auto pb-8 no-scrollbar">
            <div className="flex gap-6 items-start w-max mx-auto">
              
              {Array.from({ length: maxGroup }, (_, i) => i + 1).map(gId => {
                const groupList = groupedFiles[gId]
                const isGroupSetup = weeklySetup[selectedWeek] && weeklySetup[selectedWeek].groupCount >= gId;
                if (groupList.length === 0 && !isGroupSetup) return null 
                
                return (
                  <div key={gId} className="flex-shrink-0 w-[320px] flex flex-col gap-4">
                    <h3 className="text-sm font-black text-red-600 bg-red-100 px-4 py-2 rounded-xl w-fit shadow-sm">Group {gId}</h3>
                    <div className="space-y-4">
                      {groupList.length === 0 ? (
                        <div className="bg-white/50 border border-dashed border-slate-300 p-6 rounded-[2rem] text-center text-xs font-bold text-slate-400">
                          이 조에 등록된 영상이 없습니다.
                        </div>
                      ) : groupList.map(file => (
                        <VideoCard 
                          key={file.id} 
                          file={file} 
                          onOpen={() => handleOpenVideo(file)}
                          onDelete={(e) => handleDeleteFile(e, file.id)}
                          formatDate={formatDate}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}

              {groupedFiles['미분류'].length > 0 && (
                <div className="flex-shrink-0 w-[320px] flex flex-col gap-4 opacity-80 hover:opacity-100 transition-opacity">
                  <h3 className="text-sm font-black text-slate-500 bg-slate-200 px-4 py-2 rounded-xl w-fit shadow-sm">미분류 / 개별 등록</h3>
                  <div className="space-y-4">
                    {groupedFiles['미분류'].map(file => (
                      <VideoCard 
                        key={file.id} 
                        file={file} 
                        onOpen={() => handleOpenVideo(file)}
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

      {viewingFile && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-4 z-[100]">
          <div className="bg-slate-100 w-full max-w-[1800px] h-[95vh] rounded-[3rem] flex flex-col lg:flex-row overflow-hidden relative shadow-2xl border border-slate-200">
            <button onClick={() => setViewingFile(null)} className="absolute top-6 right-6 z-50 w-10 h-10 bg-white shadow-sm text-slate-800 hover:bg-red-500 hover:text-white rounded-full font-black transition-all">X</button>
            
            <div className="flex-[1.5] bg-black flex flex-col border-r border-slate-200 overflow-hidden">
                <div className={`w-full ${draftFeedback ? 'aspect-video shrink-0 border-b border-slate-800' : 'flex-1'} bg-black transition-all`}>
                  <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${getYoutubeId(viewingFile.file_url)}?autoplay=1`} frameBorder="0" allowFullScreen></iframe>
                </div>

                {draftFeedback && (
                  <div className="flex-1 overflow-y-auto p-8 bg-slate-900">
                    <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                      <span>📝</span> 내 임시저장 피드백 노트
                    </h3>
                    <div className="space-y-4 max-w-4xl mx-auto">
                      <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">● Original Message</p>
                        <p className="text-sm font-bold text-slate-200 leading-relaxed">"{draftFeedback.originalMessage || '작성된 내용이 없습니다.'}"</p>
                      </div>
                      <DraftBox title="1. Insight" plus={draftFeedback.insightPlus} minus={draftFeedback.insightMinus} />
                      <DraftBox title="2. Graphic" plus={draftFeedback.graphicPlus} minus={draftFeedback.graphicMinus} />
                      <DraftBox title="3. Delivery" plus={draftFeedback.deliveryPlus} minus={draftFeedback.deliveryMinus} />
                    </div>
                  </div>
                )}
            </div>

            <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
              <div className="p-8 border-b border-slate-200 bg-white flex justify-between items-end shrink-0">
                <div>
                  <h2 className="font-black text-xl text-red-900">Review Board 💬</h2>
                  <p className="text-[10px] text-slate-400 font-bold mt-1 truncate">{viewingFile.file_name}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="text-[9px] font-black text-blue-500 bg-blue-50 px-2 py-0.5 rounded shadow-sm border border-blue-100">
                    정성 피드백 마감: {getQualitativeDeadline(viewingFile.week) ? formatDate(getQualitativeDeadline(viewingFile.week)) : '미설정'}
                  </span>
                  <span className="text-[9px] font-black text-orange-500 bg-orange-50 px-2 py-0.5 rounded shadow-sm border border-orange-100">
                    셀프(읽음) 마감: {deadlines[viewingFile.week]?.video_comment ? formatDate(deadlines[viewingFile.week].video_comment) : '미설정'}
                  </span>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-slate-50">
                <div className="space-y-4">
                  
                  <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">● 셀프 피드백 (발표자 본인)</h4>
                  {selfFeedbacks.map((c) => {
                    const isLate = deadlines[viewingFile.week]?.video_comment && new Date(c.created_at) > new Date(deadlines[viewingFile.week].video_comment);
                    return <FeedbackCard key={c.id} commentId={c.id} name={c.user_name} data={c.details} date={c.created_at} isLate={isLate} />
                  })}
                  {selfFeedbacks.length === 0 && <p className="text-xs text-slate-400 font-bold ml-2">아직 등록된 셀프 피드백이 없습니다.</p>}

                  <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest pt-4 border-t border-slate-200 mt-4">● 조원 상세 피드백</h4>
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
                      />
                    )
                  })}
                  {peerFeedbacks.length === 0 && <p className="text-xs text-slate-400 font-bold ml-2">아직 등록된 조원 피드백이 없습니다.</p>}
                </div>
              </div>

              <div className="p-6 bg-white border-t border-slate-200 shadow-inner overflow-y-auto max-h-[40vh] shrink-0">
                <div className="flex justify-between items-end mb-4">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">피드백 댓글 작성하기 ✏️</h4>
                </div>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-red-800 ml-1 block uppercase">• Original Message (필수)</label>
                    <textarea value={newCommentData.originalMessage} onChange={(e)=>setNewCommentData({...newCommentData, originalMessage: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl text-xs font-bold min-h-[40px] h-[50px] outline-none border border-slate-200 focus:border-red-400 transition-colors" placeholder="전체적인 핵심 메시지 및 느낀 점을 적어주세요." />
                  </div>
                  
                  <FeedbackInputSection title="1. Insight (내용적 측면)" plus={newCommentData.insightPlus} minus={newCommentData.insightMinus} onChange={(k, v)=>setNewCommentData({...newCommentData, [k]: v})} />
                  <FeedbackInputSection title="2. Graphic (디자인 측면)" plus={newCommentData.graphicPlus} minus={newCommentData.graphicMinus} onChange={(k, v)=>setNewCommentData({...newCommentData, [k]: v})} />
                  <FeedbackInputSection title="3. Delivery (전달력 측면)" plus={newCommentData.deliveryPlus} minus={newCommentData.deliveryMinus} onChange={(k, v)=>setNewCommentData({...newCommentData, [k]: v})} />
                  
                  <button onClick={handleAddComment} className="w-full py-5 bg-red-600 text-white rounded-2xl font-black text-sm hover:bg-red-700 transition-all shadow-lg mt-4 active:scale-95">
                    피드백 등록하기
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 🌟 Video 방을 위한 카드 컴포넌트 (수정버튼 삭제, YOUTUBE 뱃지 유지)
function VideoCard({ file, onOpen, onDelete, formatDate }) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 hover:border-red-300 hover:shadow-xl transition-all group cursor-pointer relative" onClick={onOpen}>
      {file.is_late && (
        <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[9px] font-black px-2 py-1 rounded-lg shadow-sm">LATE</span>
      )}
      <div className="flex justify-between items-start mb-4">
        <span className="bg-red-50 text-red-600 text-[9px] px-2 py-1 rounded-full font-black uppercase tracking-wider">YOUTUBE</span>
        <button onClick={onDelete} className="text-[10px] font-black text-slate-300 hover:text-red-500">삭제</button>
      </div>
      <h3 className="text-base font-black text-slate-800 mb-4 break-all line-clamp-2 leading-snug">{file.file_name}</h3>
      <div className="flex justify-between items-center pt-4 border-t border-slate-100">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-black text-slate-500">👤 {file.uploader}</span>
          <span className="text-[9px] font-bold text-slate-300">{formatDate(file.created_at)}</span>
        </div>
      </div>
    </div>
  )
}

function DraftBox({ title, plus, minus }) {
  if (!plus && !minus) return null;
  return (
    <div className="bg-slate-800 p-4 rounded-2xl space-y-2 border border-slate-700">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
      <div className="grid gap-1.5 pl-1">
        {plus && <p className="text-[11px] font-bold text-emerald-300 leading-relaxed"><span className="text-emerald-500 font-black">+)</span> {plus}</p>}
        {minus && <p className="text-[11px] font-bold text-red-300 leading-relaxed"><span className="text-red-500 font-black">-)</span> {minus}</p>}
      </div>
    </div>
  )
}

function FeedbackInputSection({ title, plus, minus, onChange }) {
  const kP = title.split('. ')[1].split(' ')[0].toLowerCase() + 'Plus';
  const kM = title.split('. ')[1].split(' ')[0].toLowerCase() + 'Minus';
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-black text-slate-800 border-l-4 border-red-600 pl-2 uppercase">{title}</p>
      <div className="grid grid-cols-1 gap-2">
        <textarea value={plus} onChange={(e)=>onChange(kP, e.target.value)} placeholder="(+) 좋았던 점 및 배울 점" className="w-full bg-emerald-50/50 p-3 rounded-xl text-xs font-bold min-h-[50px] outline-none border border-emerald-100 focus:border-emerald-300" />
        <textarea value={minus} onChange={(e)=>onChange(kM, e.target.value)} placeholder="(-) 아쉬운 점 및 개선 제안" className="w-full bg-red-50/50 p-3 rounded-xl text-xs font-bold min-h-[50px] outline-none border border-red-100 focus:border-red-300" />
      </div>
    </div>
  )
}

function FeedbackCard({ commentId, name, data, date, isLate, isPeerFeedback, isVideoOwner, onToggleRead, selfDeadline }) {
  if (!data) return null;
  const d = date ? new Date(date) : null;
  const dateStr = d ? `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';

  const isRead = data.is_read || false;
  const readAtStr = data.read_at ? new Date(data.read_at) : null;
  const deadlineDate = selfDeadline ? new Date(selfDeadline) : null;
  const isReadLate = isRead && readAtStr && deadlineDate && readAtStr > deadlineDate;

  return (
    <div className="p-6 rounded-[2rem] shadow-sm border bg-white border-slate-200">
      <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
          <span className="text-xs font-black text-slate-800">{name}</span>
          {isLate && <span className="text-[8px] font-black bg-red-500 text-white px-1.5 py-0.5 rounded shadow-sm ml-1">LATE (작성지각)</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-bold text-slate-300">{dateStr}</span>
          
          {isPeerFeedback && (
            <div className="flex items-center gap-1">
              {isVideoOwner ? (
                <button 
                  onClick={() => onToggleRead(commentId, data)} 
                  className={`text-[9px] font-black px-2 py-1 rounded transition-all active:scale-95 ${isRead ? 'bg-emerald-500 text-white shadow-sm' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                >
                  {isRead ? '✅ 읽음 완료' : '읽음 확인 클릭'}
                </button>
              ) : (
                isRead && <span className="text-[9px] font-black text-emerald-500 bg-emerald-50 px-2 py-1 rounded">✅ 발표자가 읽음</span>
              )}
              {isReadLate && <span className="text-[8px] font-black bg-orange-500 text-white px-1.5 py-0.5 rounded shadow-sm">LATE (확인지각)</span>}
            </div>
          )}
        </div>
      </div>
      <div className="space-y-5">
        <div><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">● Original Message</p><p className="text-xs font-bold text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl">"{data.originalMessage}"</p></div>
        <div className="space-y-4">
          <FeedbackBox title="Insight" plus={data.insightPlus} minus={data.insightMinus} />
          <FeedbackBox title="Graphic" plus={data.graphicPlus} minus={data.graphicMinus} />
          <FeedbackBox title="Delivery" plus={data.deliveryPlus} minus={data.deliveryMinus} />
        </div>
      </div>
    </div>
  )
}

function FeedbackBox({ title, plus, minus }) {
  if (!plus && !minus) return null;
  return (
    <div className="space-y-1">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{title}</p>
      <div className="grid gap-1.5 pl-1">
        {plus && <p className="text-[11px] font-bold text-emerald-700 leading-relaxed bg-emerald-50/50 p-2 rounded-lg"><span className="font-black text-emerald-500">+)</span> {plus}</p>}
        {minus && <p className="text-[11px] font-bold text-red-700 leading-relaxed bg-red-50/50 p-2 rounded-lg"><span className="font-black text-red-500">-)</span> {minus}</p>}
      </div>
    </div>
  )
}