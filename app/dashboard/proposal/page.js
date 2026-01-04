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
  
  // 파일 정보 수정 상태 (부활! 💡)
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
      else { setUser(session.user); fetchFiles(); }
    }
    checkUser()
  }, [])

  // 1. 파일 목록 불러오기
  const fetchFiles = async () => {
    const { data } = await supabase
      .from('files_metadata')
      .select('*')
      .eq('file_category', 'proposal')
      .eq('is_archive', false) 
      .order('created_at', { ascending: false })
    if (data) setFiles(data)
  }

  // 2. 파일 이름 수정 (부활! ✏️)
  const handleUpdateFile = async () => {
    if (!newTitle) return
    const { error } = await supabase.from('files_metadata').update({ file_name: newTitle }).eq('id', editItem.id)
    if (!error) { 
      alert("파일 이름 수정 완료! ✨"); 
      setEditItem(null); 
      fetchFiles(); 
    }
  }

  // 3. 파일 삭제 (부활! 🗑️)
  const handleDeleteFile = async (e, id, filePath) => {
    e.stopPropagation(); // 카드 클릭 이벤트 전파 방지
    if (!confirm("이 기획서를 완전히 삭제할 거야?")) return
    if (filePath) await supabase.storage.from('ig-files').remove([filePath])
    const { error } = await supabase.from('files_metadata').delete().eq('id', id)
    if (!error) fetchFiles()
  }

  // 4. 댓글 관련 로직
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
    if (!confirm("댓글을 지울 거야?")) return
    const { error } = await supabase.from('file_comments').delete().eq('id', commentId)
    if (!error) fetchComments(viewingFile.id)
  }

  const handleUpdateComment = async (commentId) => {
    const { error } = await supabase.from('file_comments').update({ comment_text: editCommentText }).eq('id', commentId)
    if (!error) { setEditingCommentId(null); fetchComments(viewingFile.id); }
  }

  // 5. 파일 업로드
  const handleUpload = async (e) => {
    const file = e.target.files[0]
    if (!file || !user) return
    setUploading(true)
    const fileExt = file.name.split('.').pop()
    const storagePath = `dashboard/proposal/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
    const { error: uploadError } = await supabase.storage.from('ig-files').upload(storagePath, file)
    if (uploadError) { alert('실패: ' + uploadError.message); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('ig-files').getPublicUrl(storagePath)
    await supabase.from('files_metadata').insert([{ 
      file_name: file.name, file_url: publicUrl, week: targetWeek,
      file_category: 'proposal', is_archive: false,
      uploader: user.user_metadata.name || '익명 학회원', storage_path: storagePath 
    }])
    alert('기획서 제출 완료! 🎉'); setUploading(false); fetchFiles();
  }

  if (!user) return <div className="p-8 text-center font-bold italic">로딩 중... 🔄</div>

  return (
    <div className="p-8 bg-white min-h-screen text-slate-900 font-sans">
      <header className="max-w-6xl mx-auto flex justify-between items-end mb-12">
        <div>
          <Link href="/dashboard" className="inline-block mb-4 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-black hover:bg-slate-200 transition-all">← 대시보드 메인으로 돌아가기</Link>
          <h1 className="text-5xl font-black text-blue-900 tracking-tighter">Proposal Room 📝</h1>
        </div>
        <div className="bg-blue-50 p-6 rounded-[2rem] border-2 border-blue-100 flex gap-4 items-center">
            <select value={targetWeek} onChange={(e) => setTargetWeek(Number(e.target.value))} className="p-2 rounded-xl bg-white border-none font-bold text-sm outline-none">
              {weeks.map(w => <option key={w} value={w}>{w}주차</option>)}
            </select>
            <input type="file" onChange={handleUpload} disabled={uploading} className="text-xs font-bold" />
        </div>
      </header>

      <div className="max-w-6xl mx-auto">
        <div className="flex gap-2 mb-12 overflow-x-auto pb-4 no-scrollbar">
          {weeks.map(w => (<button key={w} onClick={() => setSelectedWeek(w)} className={`px-6 py-3 rounded-2xl text-xs font-black transition-all ${selectedWeek === w ? 'bg-blue-900 text-white shadow-xl scale-110' : 'bg-slate-50 text-slate-300'}`}>W{w}</button>))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {files.filter(f => f.week === selectedWeek).map(file => (
            <div key={file.id} className="bg-slate-50 p-8 rounded-[3rem] border-2 border-transparent hover:border-blue-200 hover:bg-white hover:shadow-2xl transition-all group cursor-pointer relative" onClick={() => { setViewingFile(file); fetchComments(file.id); }}>
              <div className="flex justify-between items-start mb-6">
                <span className="bg-white text-blue-600 text-[10px] px-3 py-1 rounded-full font-black shadow-sm uppercase">{file.file_name.split('.').pop()}</span>
                {/* [부활] 수정/삭제 버튼 섹션 */}
                <div className="flex gap-3">
                  <button onClick={(e) => { e.stopPropagation(); setEditItem(file); setNewTitle(file.file_name); }} className="text-[10px] font-black text-slate-300 hover:text-blue-600">EDIT</button>
                  <button onClick={(e) => handleDeleteFile(e, file.id, file.storage_path)} className="text-[10px] font-black text-slate-300 hover:text-red-500">DEL</button>
                </div>
              </div>
              <h3 className="text-lg font-black text-slate-800 mb-6 break-all line-clamp-2">{file.file_name}</h3>
              <div className="flex justify-between items-center pt-6 border-t border-slate-200/50">
                <span className="text-xs font-bold text-slate-400">👤 {file.uploader}</span>
                <span className="text-[10px] font-black text-blue-600">Review & Comment →</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 1. 통합 뷰어 모달 (PDF + 댓글) */}
      {viewingFile && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4 z-[100]">
          <div className="bg-white w-full max-w-7xl h-[90vh] rounded-[3rem] flex overflow-hidden relative">
            <button onClick={() => setViewingFile(null)} className="absolute top-6 right-6 z-10 w-10 h-10 bg-slate-100 rounded-full font-black hover:bg-red-500 hover:text-white transition-all">X</button>
            <div className="flex-[2] bg-slate-200 border-r border-slate-100">
              {viewingFile.file_name.toLowerCase().endsWith('.pdf') ? (
                <iframe src={viewingFile.file_url} className="w-full h-full border-none" />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <span className="text-6xl mb-4">📄</span>
                  <p className="font-bold">PDF만 미리보기가 가능해!</p>
                  <a href={viewingFile.file_url} target="_blank" className="mt-4 px-6 py-2 bg-slate-900 text-white rounded-xl font-black text-xs">직접 다운로드</a>
                </div>
              )}
            </div>
            <div className="flex-1 flex flex-col bg-white">
              <div className="p-8 border-b border-slate-50">
                <h2 className="font-black text-xl">Comments 💬</h2>
                <p className="text-[10px] text-slate-400 font-bold mt-1 truncate">{viewingFile.file_name}</p>
              </div>
              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                {comments.map(c => (
                  <div key={c.id} className="group">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-black text-blue-600">{c.user_name}</span>
                      {user.id === c.user_id && (
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => { setEditingCommentId(c.id); setEditCommentText(c.comment_text); }} className="text-[10px] font-bold text-slate-300 hover:text-blue-500">수정</button>
                          <button onClick={() => handleDeleteComment(c.id)} className="text-[10px] font-bold text-slate-300 hover:text-red-500">삭제</button>
                        </div>
                      )}
                    </div>
                    {editingCommentId === c.id ? (
                      <div className="space-y-2">
                        <textarea value={editCommentText} onChange={(e) => setEditCommentText(e.target.value)} className="w-full border-2 border-blue-100 p-3 rounded-xl text-sm font-medium" />
                        <div className="flex gap-2"><button onClick={() => handleUpdateComment(c.id)} className="px-3 py-1 bg-blue-600 text-white rounded-lg text-[10px] font-black">저장</button> <button onClick={() => setEditingCommentId(null)} className="px-3 py-1 bg-slate-100 text-slate-400 rounded-lg text-[10px] font-black">취소</button></div>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-600 font-medium leading-relaxed bg-slate-50 p-4 rounded-2xl whitespace-pre-wrap">{c.comment_text}</p>
                    )}
                  </div>
                ))}
              </div>
              <div className="p-8 bg-slate-50 border-t border-slate-100">
                <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="의견을 남겨주세요!" className="w-full h-32 border-4 border-white p-4 rounded-2xl font-bold outline-none focus:border-blue-500 text-sm mb-4 resize-none shadow-inner" />
                <button onClick={handleAddComment} className="w-full py-4 bg-blue-900 text-white rounded-2xl font-black text-sm hover:bg-blue-800 shadow-lg transition-all">댓글 등록</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* [부활] 파일 이름 수정 모달 */}
      {editItem && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-6 z-[110]">
          <div className="bg-white p-10 rounded-[3rem] w-full max-w-sm shadow-2xl">
            <h2 className="font-black mb-6 text-xl text-slate-800">파일명 수정 ✏️</h2>
            <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-full border-4 border-slate-50 p-4 rounded-2xl mb-6 font-bold outline-none focus:border-blue-500" />
            <div className="flex gap-3">
              <button onClick={handleUpdateFile} className="flex-1 py-4 bg-blue-900 text-white rounded-2xl font-black hover:bg-blue-800">저장</button>
              <button onClick={() => setEditItem(null)} className="flex-1 py-4 bg-slate-100 text-slate-400 rounded-2xl font-black hover:bg-slate-200">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}