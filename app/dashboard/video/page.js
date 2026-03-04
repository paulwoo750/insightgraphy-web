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
  
  const [presentationsInWeek, setPresentationsInWeek] = useState([]) 
  const [selectedPId, setSelectedPId] = useState('') 
  const [ytUrl, setYtUrl] = useState('') 

  const [viewingFile, setViewingFile] = useState(null)
  const [verifiedFeedbacks, setVerifiedFeedbacks] = useState([])
  
  const [comments, setComments] = useState([])
  const [newCommentData, setNewCommentData] = useState({
    originalMessage: '',
    insightPlus: '', insightMinus: '',
    graphicPlus: '', graphicMinus: '',
    deliveryPlus: '', deliveryMinus: ''
  })

  const weeks = Array.from({ length: 12 }, (_, i) => i + 1);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login') } 
      else { setUser(session.user); fetchFiles(); }
    }
    checkUser()
  }, [])

  useEffect(() => {
    if (user) fetchPresentations();
  }, [targetWeek, user])

  const fetchPresentations = async () => {
    const { data } = await supabase.from('presentations').select('*').eq('week', targetWeek).order('presenter_name');
    if (data) setPresentationsInWeek(data);
  }

  const fetchFiles = async () => {
    const { data } = await supabase.from('files_metadata').select('*').eq('file_category', 'video').order('created_at', { ascending: false })
    if (data) setFiles(data)
  }

  // ★ 등록 시 ID 비교 문제 해결 (String 변환)
  const handleRegisterYoutube = async () => {
    const pInfo = presentationsInWeek.find(p => String(p.id) === String(selectedPId));
    if (!pInfo || !ytUrl.trim()) return alert("발표자와 유튜브 링크를 확인해줘! 🔗")
    
    setUploading(true)
    const autoTitle = `${pInfo.week}주차 (${pInfo.topic}) ${pInfo.presenter_name}`;
    const { error } = await supabase.from('files_metadata').insert([{ 
      file_name: autoTitle, file_url: ytUrl.trim(), week: targetWeek,
      file_category: 'video', is_archive: false, uploader: pInfo.presenter_name, storage_path: 'youtube'
    }])
    if (!error) { alert('영상 등록 완료! 🎬'); setYtUrl(''); setSelectedPId(''); fetchFiles(); }
    else { alert("등록 실패: " + error.message); }
    setUploading(false)
  }

  const handleOpenVideo = async (file) => {
    setViewingFile(file);
    fetchVerifiedFeedbacks(file);
    fetchComments(file.id);
  }

  const fetchVerifiedFeedbacks = async (videoItem) => {
    const { data: pData } = await supabase.from('presentations').select('id').eq('week', videoItem.week).eq('presenter_name', videoItem.uploader).single();
    if (pData) {
      const { data: fData } = await supabase.from('scores').select('*').eq('presentation_id', pData.id).eq('is_checked', true);
      if (fData) setVerifiedFeedbacks(fData);
    } else { setVerifiedFeedbacks([]); }
  }

  const fetchComments = async (fileId) => {
    const { data } = await supabase.from('file_comments').select('*').eq('file_id', fileId).order('created_at', { ascending: true });
    if (data) setComments(data);
  }

  const handleAddComment = async () => {
    if (!newCommentData.originalMessage.trim()) return alert("원메세지는 필수 입력이야! ✍️");
    
    // ★ 새로 만든 'details' 컬럼에 JSON 데이터 저장
    const { error } = await supabase.from('file_comments').insert([{
      file_id: viewingFile.id,
      user_id: user.id,
      user_name: user.user_metadata.name || '익명',
      details: newCommentData 
    }]);

    if (!error) {
      setNewCommentData({ originalMessage: '', insightPlus: '', insightMinus: '', graphicPlus: '', graphicMinus: '', deliveryPlus: '', deliveryMinus: '' });
      fetchComments(viewingFile.id);
      alert("셀프 피드백 등록 완료! ✨");
    } else { alert("오류: " + error.message); }
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

  if (!user) return <div className="p-8 text-center font-bold">로딩 중... 🔄</div>

  return (
    <div className="p-8 bg-white min-h-screen text-slate-900 font-sans">
      <header className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-8">
        <div>
          <Link href="/dashboard" className="inline-block mb-4 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-black">← Dashboard</Link>
          <h1 className="text-5xl font-black text-red-900 tracking-tighter">Video Room 🎬</h1>
          <p className="text-slate-400 mt-2 font-bold text-xs uppercase">Self Feedback System</p>
        </div>

        <div className="bg-slate-900 p-6 rounded-[2.5rem] flex flex-col gap-3 w-full md:w-[450px] shadow-2xl">
            <div className="flex gap-2">
              <select value={targetWeek} onChange={(e) => setTargetWeek(Number(e.target.value))} className="p-3 rounded-xl bg-slate-800 text-white font-bold text-xs outline-none flex-shrink-0">
                {weeks.map(w => <option key={w} value={w}>{w}W</option>)}
              </select>
              <select value={selectedPId} onChange={(e) => setSelectedPId(e.target.value)} className="p-3 rounded-xl bg-slate-800 text-white font-bold text-xs outline-none flex-1">
                <option value="">영상 주인 선택</option>
                {presentationsInWeek.map(p => <option key={p.id} value={p.id}>{p.presenter_name} ({p.topic})</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <input type="text" placeholder="유튜브 URL 주소" value={ytUrl} onChange={(e)=>setYtUrl(e.target.value)} className="p-3 rounded-xl bg-white text-slate-900 text-xs font-bold flex-1 outline-none focus:ring-2 focus:ring-red-500" />
              <button onClick={handleRegisterYoutube} disabled={uploading} className="bg-red-600 text-white px-6 py-3 rounded-xl text-xs font-black hover:bg-red-500 transition-all">등록</button>
            </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto">
        <div className="flex gap-2 mb-12 overflow-x-auto pb-4 no-scrollbar">
          {weeks.map(w => (<button key={w} onClick={() => setSelectedWeek(w)} className={`px-6 py-3 rounded-2xl text-xs font-black transition-all ${selectedWeek === w ? 'bg-red-900 text-white shadow-xl' : 'bg-slate-50 text-slate-300 hover:bg-slate-100'}`}>W{w}</button>))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {files.filter(f => f.week === selectedWeek).map(file => (
            <div key={file.id} className="bg-slate-50 p-8 rounded-[3rem] border-2 border-transparent hover:border-red-200 hover:bg-white hover:shadow-2xl transition-all group cursor-pointer" onClick={() => handleOpenVideo(file)}>
              <div className="flex justify-between items-start mb-6">
                <span className="bg-red-600 text-white text-[10px] px-3 py-1 rounded-full font-black uppercase">YOUTUBE</span>
                <button onClick={(e) => handleDeleteFile(e, file.id)} className="text-[10px] font-black text-slate-300 hover:text-red-500">DEL</button>
              </div>
              <h3 className="text-lg font-black text-slate-800 mb-6 break-all line-clamp-2 leading-tight">{file.file_name}</h3>
              <div className="flex justify-between items-center pt-6 border-t border-slate-200">
                <span className="text-xs font-bold text-slate-400">👤 {file.uploader}</span>
                <span className="text-[10px] font-black text-red-600">Enter Room →</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {viewingFile && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-4 z-[100]">
          <div className="bg-white w-full max-w-[1800px] h-[95vh] rounded-[3rem] flex flex-col lg:flex-row overflow-hidden relative shadow-2xl">
            <button onClick={() => setViewingFile(null)} className="absolute top-6 right-6 z-50 w-10 h-10 bg-black/50 text-white rounded-full font-black">X</button>
            
            <div className="flex-[1.5] bg-black">
                <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${getYoutubeId(viewingFile.file_url)}?autoplay=1`} frameBorder="0" allowFullScreen></iframe>
            </div>

            <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden border-l border-slate-100">
              <div className="p-8 border-b border-slate-200 bg-white">
                <h2 className="font-black text-xl text-red-900">Review Board ✅</h2>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {/* 피드백 리스트 섹션 */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-red-600 uppercase tracking-widest">● Verified Feedbacks</h4>
                  {verifiedFeedbacks.map((fb) => <FeedbackCard key={fb.id} name="Official" data={fb.details?.qualitative} isOfficial />)}
                  
                  <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest pt-4 border-t">● Self Feedbacks</h4>
                  {comments.map((c) => <FeedbackCard key={c.id} name={c.user_name} data={c.details} />)}
                </div>
              </div>

              {/* ★ 개선된 댓글 작성 폼: 한 줄에 하나씩 배치하여 가로폭 최대로 활용 */}
              <div className="p-8 bg-white border-t border-slate-200 shadow-inner overflow-y-auto max-h-[45%]">
                <h4 className="text-xs font-black mb-6 text-red-900 uppercase">Write Detailed Feedback ✍️</h4>
                <div className="space-y-6">
                  {/* 원메세지 */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 ml-1 block uppercase">• Original Message</label>
                    <textarea value={newCommentData.originalMessage} onChange={(e)=>setNewCommentData({...newCommentData, originalMessage: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl text-xs font-bold min-h-[40px] h-[50px] outline-none border border-transparent focus:border-red-200" placeholder="전체적인 핵심 메시지 (필수)" />
                  </div>
                  
                  {/* 세부 항목들 (가로로 길게, 한 줄에 하나씩 배치) */}
                  <FeedbackInputSection title="1. Insight" plus={newCommentData.insightPlus} minus={newCommentData.insightMinus} onChange={(k, v)=>setNewCommentData({...newCommentData, [k]: v})} />
                  <FeedbackInputSection title="2. Graphic" plus={newCommentData.graphicPlus} minus={newCommentData.graphicMinus} onChange={(k, v)=>setNewCommentData({...newCommentData, [k]: v})} />
                  <FeedbackInputSection title="3. Delivery" plus={newCommentData.deliveryPlus} minus={newCommentData.deliveryMinus} onChange={(k, v)=>setNewCommentData({...newCommentData, [k]: v})} />
                  
                  <button onClick={handleAddComment} className="w-full py-5 bg-red-900 text-white rounded-2xl font-black text-sm hover:bg-red-800 transition-all shadow-lg mt-4">피드백 등록하기</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ★ 가로폭을 최대로 사용하는 새로운 입력 섹션 컴포넌트
function FeedbackInputSection({ title, plus, minus, onChange }) {
  const kP = title.split('. ')[1].toLowerCase() + 'Plus';
  const kM = title.split('. ')[1].toLowerCase() + 'Minus';
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-black text-slate-800 border-l-4 border-red-900 pl-2 uppercase">{title}</p>
      <div className="grid grid-cols-1 gap-2">
        <textarea value={plus} onChange={(e)=>onChange(kP, e.target.value)} placeholder="(+) 장점 및 배운 점" className="w-full bg-emerald-50/30 p-3 rounded-xl text-xs font-bold min-h-[50px] outline-none border border-transparent focus:border-emerald-200" />
        <textarea value={minus} onChange={(e)=>onChange(kM, e.target.value)} placeholder="(-) 아쉬운 점 및 개선 제안" className="w-full bg-red-50/30 p-3 rounded-xl text-xs font-bold min-h-[50px] outline-none border border-transparent focus:border-red-200" />
      </div>
    </div>
  )
}

function FeedbackCard({ name, data, isOfficial }) {
  if (!data) return null;
  return (
    <div className={`p-6 rounded-[2rem] shadow-sm border ${isOfficial ? 'bg-white border-red-100' : 'bg-slate-50 border-slate-200'}`}>
      <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-2">
        <span className={`w-2 h-2 rounded-full ${isOfficial ? 'bg-red-500' : 'bg-blue-400'}`}></span>
        <span className="text-[10px] font-black text-slate-800">{name}</span>
      </div>
      <div className="space-y-5">
        <div><p className="text-[9px] font-black text-blue-500 uppercase mb-1">● Original Message</p><p className="text-xs font-bold text-slate-600 leading-relaxed italic">"{data.originalMessage}"</p></div>
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
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">{title}</p>
      <div className="grid gap-1 pl-1">
        {plus && <p className="text-[11px] font-bold text-emerald-600 leading-tight">+) {plus}</p>}
        {minus && <p className="text-[11px] font-bold text-red-500 leading-tight">-) {minus}</p>}
      </div>
    </div>
  )
}