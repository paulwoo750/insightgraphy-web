'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function ProposalRoom() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  
  const [selectedWeek, setSelectedWeek] = useState(1) 
  const [targetWeek, setTargetWeek] = useState(1) 
  
  const [currentSemester, setCurrentSemester] = useState('2026-1')
  const [totalWeeks, setTotalWeeks] = useState(12) 
  const [deadlines, setDeadlines] = useState({})
  const [weekTopics, setWeekTopics] = useState({}) 
  const [weeklySetup, setWeeklySetup] = useState({})

  const [editItem, setEditItem] = useState(null)
  const [newTitle, setNewTitle] = useState('')

  const [viewingFile, setViewingFile] = useState(null)
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [editingCommentId, setEditingCommentId] = useState(null)
  const [editCommentText, setEditCommentText] = useState('')

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
    
    const { data: dlData } = await supabase.from('pr_deadlines').select('*').in('category', ['proposal', 'proposal_comment'])
    
    const dlMap = {}
    let initialWeek = 1
    let minDiff = Infinity
    let maxPastWeek = 1
    const now = new Date()

    if (dlData) {
      dlData.forEach(d => {
        if (!dlMap[d.week]) dlMap[d.week] = {}
        dlMap[d.week][d.category] = d.deadline_time

        if (d.category === 'proposal' && d.deadline_time) {
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
      .eq('file_category', 'proposal')
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

  const handleDeleteFile = async (e, id, filePath) => {
    e.stopPropagation(); 
    if (!confirm("해당 기획서를 완전히 삭제하시겠습니까?")) return
    if (filePath) await supabase.storage.from('ig-files').remove([filePath])
    const { error } = await supabase.from('files_metadata').delete().eq('id', id)
    if (!error) fetchFiles()
  }

  const fetchComments = async (fileId) => {
    const { data } = await supabase.from('file_comments').select('*').eq('file_id', fileId).order('created_at', { ascending: true })
    if (data) setComments(data)
  }

  const handleAddComment = async () => {
    if (!newComment.trim()) return
    const { error } = await supabase.from('file_comments').insert([
      { file_id: viewingFile.id, user_id: user.id, user_name: user.user_metadata.name || '익명', comment_text: newComment }
    ])
    if (!error) { setNewComment(''); fetchComments(viewingFile.id); }
  }

  const handleDeleteComment = async (commentId) => {
    if (!confirm("해당 피드백을 삭제하시겠습니까?")) return
    const { error } = await supabase.from('file_comments').delete().eq('id', commentId)
    if (!error) fetchComments(viewingFile.id)
  }

  const handleUpdateComment = async (commentId) => {
    const { error } = await supabase.from('file_comments').update({ comment_text: editCommentText }).eq('id', commentId)
    if (!error) { setEditingCommentId(null); fetchComments(viewingFile.id); }
  }

  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file || !user) return
    setUploading(true)
    
    const fileExt = file.name.split('.').pop()
    const currentTopic = weekTopics[targetWeek] || (targetWeek === 0 ? 'OT 및 자유 주제' : '자유 주제') 
    const uploaderName = user.user_metadata.name || '익명'
    const autoFileName = `${targetWeek}W (${currentTopic}) ${uploaderName}.${fileExt}`
    const storagePath = `dashboard/proposal/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
    
    let myGroup = null
    if (weeklySetup[targetWeek] && weeklySetup[targetWeek].members) {
      const g = weeklySetup[targetWeek].members[uploaderName]
      if (g && g !== '미정' && g !== '결석') {
        myGroup = Number(g) 
      }
    }

    const { error: uploadError } = await supabase.storage.from('ig-files').upload(storagePath, file)
    if (uploadError) { alert('업로드 실패: ' + uploadError.message); setUploading(false); return; }
    
    const { data: { publicUrl } } = supabase.storage.from('ig-files').getPublicUrl(storagePath)
    
    const deadline = deadlines[targetWeek]?.proposal
    const isLate = deadline ? new Date() > new Date(deadline) : false

    const { error: dbError } = await supabase.from('files_metadata').insert([{ 
      file_name: autoFileName, 
      file_url: publicUrl, 
      week: targetWeek,
      file_category: 'proposal', 
      is_archive: false,
      uploader: uploaderName, 
      storage_path: storagePath,
      semester: currentSemester,
      is_late: isLate,
      group_id: myGroup 
    }])

    if (dbError) {
      alert('DB 저장 실패: ' + dbError.message);
      setUploading(false);
      return;
    }
    
    alert('기획서 제출 완료!'); 
    setSelectedWeek(targetWeek);
    setUploading(false); 
    fetchFiles();
  }

  const handleWeekChange = (w) => {
    setSelectedWeek(w);
    setTargetWeek(w);
  }

  if (!user) return <div className="p-8 text-center font-bold text-slate-400">데이터 로딩 중...</div>

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
          <Link href="/home" className="pb-4 pr-6 text-sm font-extrabold text-slate-400 hover:text-blue-600 transition-colors flex items-center shrink-0">
            HOME
          </Link>
          <div className="w-px h-4 bg-slate-300 mx-2 mb-4 shrink-0"></div>
          <Link href="/dashboard/proposal" className="pb-4 px-6 text-sm font-extrabold text-blue-600 border-b-2 border-blue-600 transition-colors shrink-0">
            기획서 📝
          </Link>
          <Link href="/dashboard/slide" className="pb-4 px-6 text-sm font-semibold text-slate-400 hover:text-slate-800 transition-colors shrink-0">
            슬라이드 🖼️
          </Link>
          <Link href="/dashboard/video" className="pb-4 px-6 text-sm font-semibold text-slate-400 hover:text-slate-800 transition-colors shrink-0">
            발표영상 🎬
          </Link>
        </div>
      </div>

      <header className="max-w-[1200px] mx-auto px-6 md:px-8 mt-12 mb-10">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-blue-800 tracking-tight">Proposal Board</h1>
          <p className="text-sm font-medium text-slate-500 mt-2">주차별 기획서를 업로드하고 피드백을 진행합니다.</p>
        </div>

        {/* 🌟 컨트롤 패널 (선과 면 분할로만 이루어진 미니멀 디자인) */}
        <div className="border-y border-slate-200 py-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col gap-2 w-full md:w-auto">
            <div className="flex items-center gap-4">
              <select 
                value={targetWeek} 
                onChange={(e) => handleWeekChange(Number(e.target.value))} 
                className="py-1.5 pr-8 pl-2 bg-transparent text-slate-800 font-extrabold text-lg outline-none cursor-pointer border-b border-slate-300 hover:border-blue-600 transition-all appearance-none"
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
                <span className="text-slate-800">{deadlines[targetWeek]?.proposal ? formatDate(deadlines[targetWeek].proposal) : '미설정'}</span>
              </p>
              <p className="text-xs font-medium text-slate-500 flex items-center gap-2">
                <span className="text-slate-400 font-bold uppercase tracking-wider">피드백 마감 |</span>
                <span className="text-slate-800">{deadlines[targetWeek]?.proposal_comment ? formatDate(deadlines[targetWeek].proposal_comment) : '미설정'}</span>
              </p>
            </div>
          </div>

          <div className="w-full md:w-auto shrink-0">
            <input type="file" id="file-upload" onChange={handleUpload} disabled={uploading} className="hidden" />
            <label htmlFor="file-upload" className="cursor-pointer bg-slate-900 hover:bg-blue-600 text-white w-full md:w-auto px-8 py-3 font-bold text-sm transition-colors flex items-center justify-center">
              {uploading ? '업로드 진행 중...' : '+ 신규 등록'}
            </label>
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
                className={`text-left text-sm font-semibold transition-colors py-1 ${selectedWeek === w ? 'text-blue-600 underline underline-offset-4 decoration-2' : 'text-slate-500 hover:text-slate-800'}`}
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
              className={`pb-3 text-sm font-semibold transition-colors shrink-0 ${selectedWeek === w ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500'}`}
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
                  <div key={gId} className="border-t-2 border-blue-800 pt-4">
                    <div className="flex justify-between items-end mb-4">
                      <h3 className="text-lg font-extrabold text-blue-800">Group {String(gId).padStart(2, '0')}</h3>
                      <span className="text-xs font-bold text-slate-400">Total {groupList.length}</span>
                    </div>
                    <div className="border-t border-slate-200">
                      {groupList.length === 0 ? (
                        <div className="py-6 text-center text-xs font-medium text-slate-400 border-b border-slate-200">
                          제출 내역이 없습니다.
                        </div>
                      ) : groupList.map(file => (
                        <ProposalListItem 
                          key={file.id} 
                          file={file} 
                          onOpen={() => { setViewingFile(file); fetchComments(file.id); }}
                          onEdit={(e) => { e.stopPropagation(); setEditItem(file); setNewTitle(file.file_name); }}
                          onDelete={(e) => handleDeleteFile(e, file.id, file.storage_path)}
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
                      <ProposalListItem 
                        key={file.id} 
                        file={file} 
                        onOpen={() => { setViewingFile(file); fetchComments(file.id); }}
                        onEdit={(e) => { e.stopPropagation(); setEditItem(file); setNewTitle(file.file_name); }}
                        onDelete={(e) => handleDeleteFile(e, file.id, file.storage_path)}
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

      {/* 🌟 뷰어 모달 (직각, 플랫 디자인) */}
      {viewingFile && (
        <div className="fixed inset-0 bg-white/95 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
          <div className="bg-white w-full max-w-[1400px] h-[90vh] flex flex-col md:flex-row overflow-hidden relative border border-slate-200 shadow-2xl">
            <button onClick={() => setViewingFile(null)} className="absolute top-4 right-4 z-10 px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-900 hover:text-white transition-colors">닫기 ✕</button>
            
            <div className="flex-[2] bg-slate-50 border-r border-slate-200">
              {viewingFile.file_name.toLowerCase().endsWith('.pdf') ? (
                <iframe src={viewingFile.file_url} className="w-full h-full border-none" />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <span className="text-4xl mb-4">📄</span>
                  <p className="font-bold text-sm text-slate-500">PDF 형식만 미리보기가 지원됩니다.</p>
                  <a href={viewingFile.file_url} target="_blank" className="mt-4 px-6 py-2.5 bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 transition-colors">원본 파일 다운로드</a>
                </div>
              )}
            </div>
            
            <div className="flex-1 flex flex-col bg-white">
              <div className="p-6 border-b border-slate-200">
                <h2 className="font-extrabold text-lg text-slate-900">Feedback</h2>
                <p className="text-xs text-slate-500 font-semibold mt-1 truncate">{viewingFile.file_name}</p>
                {deadlines[viewingFile.week]?.proposal_comment && (
                  <p className="text-[10px] font-bold text-red-600 mt-3 border border-red-200 bg-red-50 inline-block px-2 py-0.5">
                    마감 기한: {formatDate(deadlines[viewingFile.week].proposal_comment)}
                  </p>
                )}
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {comments.map(c => {
                  const isCommentLate = deadlines[viewingFile.week]?.proposal_comment && new Date(c.created_at) > new Date(deadlines[viewingFile.week].proposal_comment);
                  return (
                    <div key={c.id} className="group bg-white border-b border-slate-100 pb-4">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-blue-600">{c.user_name}</span>
                          {isCommentLate && <span className="text-[9px] font-black text-red-500 border border-red-200 px-1 py-0.5 rounded-sm">LATE</span>}
                          <span className="text-[10px] font-medium text-slate-400 ml-1">{formatDate(c.created_at)}</span>
                        </div>
                        {user.id === c.user_id && (
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingCommentId(c.id); setEditCommentText(c.comment_text); }} className="text-[10px] font-bold text-slate-400 hover:text-blue-600">수정</button>
                            <button onClick={() => handleDeleteComment(c.id)} className="text-[10px] font-bold text-slate-400 hover:text-red-600">삭제</button>
                          </div>
                        )}
                      </div>
                      {editingCommentId === c.id ? (
                        <div className="space-y-2 mt-2">
                          <textarea value={editCommentText} onChange={(e) => setEditCommentText(e.target.value)} className="w-full border border-slate-300 p-2.5 text-xs font-medium outline-none focus:border-blue-600" />
                          <div className="flex gap-2">
                            <button onClick={() => handleUpdateComment(c.id)} className="px-4 py-1.5 bg-blue-600 text-white text-[10px] font-bold">저장</button> 
                            <button onClick={() => setEditingCommentId(null)} className="px-4 py-1.5 bg-slate-100 text-slate-600 text-[10px] font-bold">취소</button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-700 font-medium leading-relaxed whitespace-pre-wrap">{c.comment_text}</p>
                      )}
                    </div>
                  )
                })}
                {comments.length === 0 && <p className="text-center text-xs text-slate-400 font-medium py-10">등록된 피드백이 없습니다.</p>}
              </div>
              
              <div className="p-6 border-t border-slate-200 bg-slate-50/50">
                <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="피드백 내용을 입력하세요." className="w-full h-24 border border-slate-300 p-3 font-medium outline-none focus:border-blue-600 text-xs mb-3 resize-none bg-white" />
                <button onClick={handleAddComment} className="w-full py-3 bg-slate-900 text-white font-bold text-xs hover:bg-blue-600 transition-colors">댓글 등록</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 파일 이름 수정 모달 */}
      {editItem && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[110]">
          <div className="bg-white p-8 w-full max-w-sm shadow-xl border border-slate-200">
            <h2 className="font-extrabold mb-6 text-lg text-slate-900 border-l-4 border-blue-600 pl-2">파일명 수정</h2>
            <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-full border-b border-slate-300 py-2 mb-8 font-medium text-sm outline-none focus:border-blue-600 bg-transparent" />
            <div className="flex gap-2">
              <button onClick={handleUpdateFile} className="flex-1 py-2.5 bg-blue-600 text-white font-bold text-xs hover:bg-blue-700">저장</button>
              <button onClick={() => setEditItem(null)} className="flex-1 py-2.5 bg-slate-100 text-slate-600 font-bold text-xs hover:bg-slate-200">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 🌟 가로형 리스트 아이템 (선명한 텍스트 위계, 각진 디자인)
function ProposalListItem({ file, onOpen, onEdit, onDelete, formatDate }) {
  return (
    <div 
      className="flex flex-col sm:flex-row sm:items-center justify-between py-4 border-b border-slate-200 hover:bg-slate-50/50 transition-colors cursor-pointer group gap-4 px-2" 
      onClick={onOpen}
    >
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <span className="shrink-0 font-black text-[10px] text-blue-600 uppercase w-8 text-center">
          {file.file_name.split('.').pop()}
        </span>
        <div className="flex flex-col min-w-0 gap-0.5">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-800 truncate group-hover:text-blue-600 transition-colors">{file.file_name}</h4>
            {file.is_late && <span className="border border-red-400 text-red-600 text-[9px] font-black px-1 py-0.5 rounded-sm shrink-0">LATE</span>}
          </div>
          <span className="text-xs font-medium text-slate-400">{file.uploader}</span>
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-6 shrink-0 w-full sm:w-auto pl-12 sm:pl-0">
        <span className="text-xs font-medium text-slate-400">{formatDate(file.created_at)}</span>
        <div className="flex items-center gap-3 sm:opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="text-[11px] font-bold text-slate-400 hover:text-blue-600 transition-colors">수정</button>
          <button onClick={onDelete} className="text-[11px] font-bold text-slate-400 hover:text-red-600 transition-colors">삭제</button>
        </div>
      </div>
    </div>
  )
}