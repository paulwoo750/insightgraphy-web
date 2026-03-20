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
  
  // 시스템 설정 상태
  const [currentSemester, setCurrentSemester] = useState('2026-1')
  const [deadlines, setDeadlines] = useState({})
  const [weekTopics, setWeekTopics] = useState({}) 

  // 파일 정보 수정 상태
  const [editItem, setEditItem] = useState(null)
  const [newTitle, setNewTitle] = useState('')

  // 통합 뷰어(PDF+댓글) 상태
  const [viewingFile, setViewingFile] = useState(null)
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [editingCommentId, setEditingCommentId] = useState(null)
  const [editCommentText, setEditCommentText] = useState('')

  const weeks = Array.from({ length: 12 }, (_, i) => i + 1);

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
      if (sem) setCurrentSemester(sem)
      if (topics) setWeekTopics(JSON.parse(topics))
    }
    
    const { data: dlData } = await supabase.from('pr_deadlines').select('*').in('category', ['proposal', 'proposal_comment'])
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
      alert("파일 이름 수정이 완료되었어! ✨"); 
      setEditItem(null); 
      fetchFiles(); 
    }
  }

  const handleDeleteFile = async (e, id, filePath) => {
    e.stopPropagation(); 
    if (!confirm("이 기획서를 완전히 삭제할 거야?")) return
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
    if (!confirm("이 피드백을 삭제할 거야?")) return
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
    const currentTopic = weekTopics[targetWeek] || '자유 주제' 
    const autoFileName = `${targetWeek}W (${currentTopic}) ${user.user_metadata.name || '익명'}.${fileExt}`
    const storagePath = `dashboard/proposal/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
    
    const { error: uploadError } = await supabase.storage.from('ig-files').upload(storagePath, file)
    if (uploadError) { alert('업로드 실패: ' + uploadError.message); setUploading(false); return; }
    
    const { data: { publicUrl } } = supabase.storage.from('ig-files').getPublicUrl(storagePath)
    
    const deadline = deadlines[targetWeek]?.proposal
    const isLate = deadline ? new Date() > new Date(deadline) : false

    await supabase.from('files_metadata').insert([{ 
      file_name: autoFileName, 
      file_url: publicUrl, 
      week: targetWeek,
      file_category: 'proposal', 
      is_archive: false,
      uploader: user.user_metadata.name || '익명', 
      storage_path: storagePath,
      semester: currentSemester,
      is_late: isLate
    }])
    
    alert('기획서 제출 완료! 🎉'); 
    setUploading(false); 
    fetchFiles();
  }

  if (!user) return <div className="p-8 text-center font-bold italic">데이터 불러오는 중... 🔄</div>

  return (
    <div className="p-8 bg-white min-h-screen text-slate-900 font-sans pb-32">
      <header className="max-w-6xl mx-auto mb-12">
        <div className="flex justify-between items-end">
          <div>
            <Link href="/dashboard" className="inline-block mb-4 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-black hover:bg-slate-200 transition-all">← 대시보드 메인으로 가기</Link>
            <h1 className="text-5xl font-black text-blue-900 tracking-tighter">Proposal Room 📝</h1>
          </div>
        </div>

        {/* 🌟 명시적인 업로드 패널 */}
        <div className="bg-white p-8 rounded-[2rem] shadow-xl border border-blue-100 flex flex-col md:flex-row justify-between items-center gap-6 mt-8">
          
          <div className="flex flex-col gap-3 w-full md:w-auto">
            <div className="flex items-center gap-4">
              <select value={targetWeek} onChange={(e) => setTargetWeek(Number(e.target.value))} className="p-2 px-4 rounded-xl bg-blue-50 text-blue-900 font-black text-lg outline-none cursor-pointer">
                {weeks.map(w => <option key={w} value={w}>{w}주차</option>)}
              </select>
              <h2 className="text-2xl font-black text-slate-800 tracking-tight">
                {weekTopics[targetWeek] || '자유 주제'}
              </h2>
            </div>
            
            <div className="flex flex-col gap-1.5 mt-2 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <p className="text-xs font-bold text-slate-600 flex items-center gap-2">
                <span className="text-[10px] bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded font-black uppercase tracking-wider">기획서 제출 마감</span>
                {deadlines[targetWeek]?.proposal ? formatDate(deadlines[targetWeek].proposal) : '미설정'}
              </p>
              <p className="text-xs font-bold text-slate-600 flex items-center gap-2">
                <span className="text-[10px] bg-teal-100 text-teal-600 px-2 py-0.5 rounded font-black uppercase tracking-wider">피드백 작성 마감</span>
                {deadlines[targetWeek]?.proposal_comment ? formatDate(deadlines[targetWeek].proposal_comment) : '미설정'}
              </p>
            </div>
          </div>

          <div className="relative group w-full md:w-auto shrink-0">
            <input type="file" id="file-upload" onChange={handleUpload} disabled={uploading} className="hidden" />
            <label htmlFor="file-upload" className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white w-full md:w-auto px-10 py-5 rounded-2xl font-black text-sm transition-all shadow-lg flex items-center justify-center gap-3 active:scale-95">
              <span className="text-2xl">📁</span>
              {uploading ? '업로드 중...' : '기획서 업로드하기'}
            </label>
          </div>

        </div>
      </header>

      <div className="max-w-6xl mx-auto">
        <div className="flex gap-2 mb-12 overflow-x-auto pb-4 no-scrollbar">
          {weeks.map(w => (<button key={w} onClick={() => setSelectedWeek(w)} className={`px-6 py-3 rounded-2xl text-xs font-black transition-all flex-shrink-0 ${selectedWeek === w ? 'bg-blue-900 text-white shadow-xl scale-110' : 'bg-white border border-slate-200 text-slate-400 hover:border-blue-300'}`}>W{w}</button>))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {files.filter(f => f.week === selectedWeek).map(file => (
            <div key={file.id} className="bg-white p-8 rounded-[3rem] border-2 border-slate-100 hover:border-blue-200 hover:shadow-2xl transition-all group cursor-pointer relative" onClick={() => { setViewingFile(file); fetchComments(file.id); }}>
              
              {file.is_late && (
                <span className="absolute -top-3 -right-3 bg-red-500 text-white text-[10px] font-black px-3 py-1.5 rounded-xl shadow-lg z-10 animate-bounce">
                  LATE
                </span>
              )}

              <div className="flex justify-between items-start mb-6">
                <span className="bg-slate-100 text-blue-600 text-[10px] px-3 py-1 rounded-full font-black uppercase">{file.file_name.split('.').pop()}</span>
                <div className="flex gap-3">
                  <button onClick={(e) => { e.stopPropagation(); setEditItem(file); setNewTitle(file.file_name); }} className="text-[10px] font-black text-slate-300 hover:text-blue-600">수정</button>
                  <button onClick={(e) => handleDeleteFile(e, file.id, file.storage_path)} className="text-[10px] font-black text-slate-300 hover:text-red-500">삭제</button>
                </div>
              </div>
              <h3 className="text-lg font-black text-slate-800 mb-6 break-all line-clamp-2">{file.file_name}</h3>
              <div className="flex justify-between items-center pt-6 border-t border-slate-100">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-400">👤 {file.uploader}</span>
                  <span className="text-[9px] font-black text-slate-300">{formatDate(file.created_at)}</span>
                </div>
                <span className="text-[10px] font-black text-blue-600">리뷰 남기기 →</span>
              </div>
            </div>
          ))}
          {files.filter(f => f.week === selectedWeek).length === 0 && (
            <div className="col-span-full text-center py-24 text-slate-300 font-bold border-4 border-dashed border-slate-100 rounded-[3rem]">아직 업로드된 기획서가 없어! 첫 번째로 올려볼까? 👀</div>
          )}
        </div>
      </div>

      {/* 통합 뷰어 모달 (PDF + 댓글) */}
      {viewingFile && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4 z-[100]">
          <div className="bg-slate-100 w-full max-w-7xl h-[90vh] rounded-[3rem] flex overflow-hidden relative shadow-2xl border border-slate-200">
            <button onClick={() => setViewingFile(null)} className="absolute top-6 right-6 z-10 w-10 h-10 bg-white shadow-sm rounded-full font-black text-slate-800 hover:bg-red-500 hover:text-white transition-all">X</button>
            
            <div className="flex-[2] bg-slate-200 border-r border-slate-200">
              {viewingFile.file_name.toLowerCase().endsWith('.pdf') ? (
                <iframe src={viewingFile.file_url} className="w-full h-full border-none" />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 bg-white">
                  <span className="text-6xl mb-4">📄</span>
                  <p className="font-bold">PDF 파일만 미리보기가 가능해!</p>
                  <a href={viewingFile.file_url} target="_blank" className="mt-4 px-6 py-2 bg-slate-900 text-white rounded-xl font-black text-xs">직접 다운로드</a>
                </div>
              )}
            </div>
            
            <div className="flex-1 flex flex-col bg-white">
              <div className="p-8 border-b border-slate-100 flex justify-between items-end bg-slate-50">
                <div>
                  <h2 className="font-black text-xl text-slate-800">피드백 남기기 💬</h2>
                  <p className="text-[10px] text-slate-400 font-bold mt-1 truncate">{viewingFile.file_name}</p>
                </div>
                {deadlines[viewingFile.week]?.proposal_comment && (
                  <span className="text-[9px] font-black text-red-500 bg-red-100/50 px-2 py-1 rounded">
                    마감일: {formatDate(deadlines[viewingFile.week].proposal_comment)}
                  </span>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                {comments.map(c => {
                  const isCommentLate = deadlines[viewingFile.week]?.proposal_comment && new Date(c.created_at) > new Date(deadlines[viewingFile.week].proposal_comment);
                  return (
                    <div key={c.id} className="group">
                      <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-blue-600">{c.user_name}</span>
                          {isCommentLate && <span className="text-[8px] font-black bg-red-500 text-white px-1.5 py-0.5 rounded shadow-sm">LATE</span>}
                          <span className="text-[9px] font-bold text-slate-300 ml-1">{formatDate(c.created_at)}</span>
                        </div>
                        {user.id === c.user_id && (
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingCommentId(c.id); setEditCommentText(c.comment_text); }} className="text-[10px] font-bold text-slate-300 hover:text-blue-500">수정</button>
                            <button onClick={() => handleDeleteComment(c.id)} className="text-[10px] font-bold text-slate-300 hover:text-red-500">삭제</button>
                          </div>
                        )}
                      </div>
                      {editingCommentId === c.id ? (
                        <div className="space-y-2">
                          <textarea value={editCommentText} onChange={(e) => setEditCommentText(e.target.value)} className="w-full border-2 border-blue-100 p-3 rounded-xl text-sm font-medium outline-none" />
                          <div className="flex gap-2">
                            <button onClick={() => handleUpdateComment(c.id)} className="px-3 py-1 bg-blue-600 text-white rounded-lg text-[10px] font-black">저장</button> 
                            <button onClick={() => setEditingCommentId(null)} className="px-3 py-1 bg-slate-100 text-slate-400 rounded-lg text-[10px] font-black">취소</button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-600 font-medium leading-relaxed bg-slate-50 p-4 rounded-2xl whitespace-pre-wrap">{c.comment_text}</p>
                      )}
                    </div>
                  )
                })}
                {comments.length === 0 && <p className="text-center text-xs text-slate-300 font-bold">아직 작성된 피드백이 없어요.</p>}
              </div>
              <div className="p-8 bg-slate-50 border-t border-slate-100">
                <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="건설적인 피드백을 남겨주세요!" className="w-full h-32 border border-slate-200 p-4 rounded-2xl font-bold outline-none focus:border-blue-500 text-sm mb-4 resize-none shadow-sm" />
                <button onClick={handleAddComment} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-sm hover:bg-blue-700 shadow-lg transition-all active:scale-95">댓글 등록하기</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 파일 이름 수정 모달 */}
      {editItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6 z-[110]">
          <div className="bg-white p-10 rounded-[3rem] w-full max-w-sm shadow-2xl">
            <h2 className="font-black mb-6 text-xl text-slate-800">파일명 수정 ✏️</h2>
            <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-full border-2 border-slate-200 p-4 rounded-2xl mb-6 font-bold outline-none focus:border-blue-500" />
            <div className="flex gap-3">
              <button onClick={handleUpdateFile} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black hover:bg-blue-700 shadow-md">저장</button>
              <button onClick={() => setEditItem(null)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black hover:bg-slate-200">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}