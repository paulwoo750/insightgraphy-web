'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function FeedbackPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [week, setWeek] = useState(1)
  const [evaluatedScores, setEvaluatedScores] = useState([]) 
  const [selectedItem, setSelectedItem] = useState(null) 
  const [myInfo, setMyInfo] = useState({ cluster_id: null, group_id: null })
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  const [editFeedback, setEditFeedback] = useState({
    originalMessage: '',
    insightPlus: '', insightMinus: '',
    graphicPlus: '', graphicMinus: '',
    deliveryPlus: '', deliveryMinus: '',
    memo: ''
  })

  const weeks = Array.from({ length: 12 }, (_, i) => i + 1);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login') } 
      else { 
        const currentUser = session.user;
        setUser(currentUser);
        const { data: lastScore } = await supabase.from('scores').select('presentation_id').eq('voter_name', currentUser.user_metadata.name).order('created_at', { ascending: false }).limit(1);
        if (lastScore && lastScore.length > 0) {
          const { data: p } = await supabase.from('presentations').select('week').eq('id', lastScore[0].presentation_id).single();
          if (p) setWeek(p.week);
        } else {
          const { data: latestP } = await supabase.from('presentations').select('week').order('created_at', { ascending: false }).limit(1);
          if (latestP && latestP.length > 0) setWeek(latestP[0].week);
        }
      }
    }
    init()
  }, [])

  useEffect(() => { if (user?.user_metadata?.name) fetchMyData() }, [user, week])

  const fetchMyData = async () => {
    setLoading(true)
    const userName = user.user_metadata.name;
    const { data: pAll } = await supabase.from('presentations').select('*').eq('week', week).order('order_index', { ascending: true });
    if (!pAll || pAll.length === 0) { setEvaluatedScores([]); setLoading(false); return; }

    const me = pAll.find(p => p.presenter_name === userName);
    setMyInfo({ cluster_id: me?.cluster_id, group_id: me?.group_id });

    // 내 클러스터 멤버들 로드
    const { data: sData } = await supabase.from('scores').select('*').eq('voter_name', userName);
    const clusterMembers = pAll.filter(p => p.cluster_id === me?.cluster_id && p.presenter_name !== userName);
    
    const combined = clusterMembers.map(p => {
      const scoreRecord = sData?.find(s => s.presentation_id === p.id);
      return {
        id: scoreRecord?.id || null, // DB의 실제 PK ID
        presentation_id: p.id,
        presenter_info: p,
        is_submitted: scoreRecord?.is_submitted || false,
        total_score: scoreRecord?.total_score || 0,
        details: scoreRecord?.details || {}
      };
    });
    setEvaluatedScores(combined);

    // 현재 선택된 아이템의 최신 정보 유지
    if (selectedItem) {
      const current = combined.find(c => c.presentation_id === selectedItem.presentation_id);
      if (current) setSelectedItem(current);
    } else if (combined.length > 0) {
      selectRecord(combined[0]);
    }
    setLoading(false)
  }

  const selectRecord = (item) => {
    setSelectedItem(item)
    const qual = item.details?.qualitative || {}
    setEditFeedback({
      originalMessage: qual.originalMessage || '',
      insightPlus: qual.insightPlus || '', insightMinus: qual.insightMinus || '',
      graphicPlus: qual.graphicPlus || '', graphicMinus: qual.graphicMinus || '',
      deliveryPlus: qual.deliveryPlus || '', deliveryMinus: qual.deliveryMinus || '',
      memo: qual.memo || ''
    })
  }

  // ★ 수정 포인트: Update/Insert 로직을 더 안전하게 분리
  const handleUpdate = async (isSubmit = false) => {
    if (!selectedItem) return
    if (isSubmit && !confirm("최종 제출하면 수정이 불가능할 수 있어! 🚀")) return
    
    setUpdating(true)
    const updatedDetails = { 
      ...selectedItem.details, 
      qualitative: editFeedback 
    }

    try {
      if (selectedItem.id) {
        // 1. 이미 기록(ID)이 있는 경우 -> UPDATE
        const { error } = await supabase
          .from('scores')
          .update({ 
            is_submitted: isSubmit, 
            details: updatedDetails 
          })
          .eq('id', selectedItem.id);
        if (error) throw error;
      } else {
        // 2. 기록이 없는 경우 -> INSERT
        const { error } = await supabase
          .from('scores')
          .insert([{
            presentation_id: selectedItem.presentation_id,
            voter_name: user.user_metadata.name,
            total_score: 0,
            is_submitted: isSubmit,
            details: { version: 'v1', qualitative: editFeedback }
          }]);
        if (error) throw error;
      }
      
      alert(isSubmit ? "최종 제출 완료! ✅" : "안전하게 저장됐어! ✨");
      await fetchMyData(); // 새로고침 대신 데이터만 다시 로드
    } catch (err) {
      alert("제출 실패: " + err.message);
    } finally {
      setUpdating(false);
    }
  }

  // 메모 자동 저장 (디바운싱 생략, 포커스 아웃 시 저장)
  const handleAutoSaveMemo = async (newMemo) => {
    if (!selectedItem || selectedItem.is_submitted) return;
    const updatedDetails = { ...selectedItem.details, qualitative: { ...editFeedback, memo: newMemo } };
    if (selectedItem.id) {
      await supabase.from('scores').update({ details: updatedDetails }).eq('id', selectedItem.id);
    } else {
      await supabase.from('scores').insert([{
        presentation_id: selectedItem.presentation_id,
        voter_name: user.user_metadata.name,
        total_score: 0,
        details: { version: 'v1', qualitative: { ...editFeedback, memo: newMemo } }
      }]);
    }
  }

  if (!user) return <div className="p-8 text-center font-black">로딩 중... 🔄</div>
  const isSameGroup = selectedItem?.presenter_info?.group_id === myInfo.group_id;

  return (
    <div className="p-6 bg-slate-50 min-h-screen text-black font-sans">
      <div className="max-w-[1700px] mx-auto">
        <header className="w-full text-center mb-12">
          <div className="flex justify-between items-center mb-6 max-w-2xl mx-auto">
            <Link href="/vote" className="text-emerald-600 text-xs font-black hover:underline uppercase">← Vote Hub</Link>
            <div className="bg-slate-900 text-white px-4 py-1.5 rounded-full shadow-lg font-black text-[10px] uppercase">Feedback Editor</div>
          </div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tighter mb-8 uppercase italic">Growth Record Editor</h1>
          <div className="bg-slate-900 text-white p-6 rounded-[2.5rem] shadow-xl space-y-6 max-w-2xl mx-auto border border-slate-800">
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-black text-slate-500 uppercase block mb-3">Jump to Week</span>
              <div className="flex flex-wrap justify-center gap-2">
                {weeks.map((w) => (<button key={w} onClick={() => setWeek(w)} className={`w-9 h-9 rounded-xl font-black text-xs transition-all ${week === w ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}>{w}</button>))}
              </div>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_750px_1fr] gap-8 items-start">
          <aside className="w-full lg:w-72 lg:justify-self-end">
            <div className="bg-slate-900 p-6 rounded-[2.5rem] text-white shadow-2xl sticky top-8 border border-slate-800">
              <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-8 flex items-center gap-2">● My Evaluations</h3>
              <div className="space-y-3">
                {evaluatedScores.map((item) => (
                  <button key={item.presentation_id} onClick={() => selectRecord(item)} className={`w-full p-4 rounded-2xl text-left transition-all border-2 ${selectedItem?.presentation_id === item.presentation_id ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg' : 'bg-transparent border-slate-800 text-slate-400 hover:border-slate-700'}`}>
                    <div className="flex justify-between items-center"><p className="text-sm font-black">{item.presenter_info?.presenter_name}</p>{item.is_submitted && <span className="text-[7px] bg-emerald-400 text-slate-900 px-1.5 py-0.5 rounded font-black uppercase">Final</span>}</div>
                    <div className="flex gap-2 mt-1"><span className="text-[8px] font-bold text-slate-500">W{item.presenter_info?.week}</span>{item.presenter_info?.group_id === myInfo.group_id && <span className="text-[8px] font-bold text-emerald-400">My Group</span>}</div>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <div className="w-full space-y-8 pb-32">
            {!selectedItem ? (
              <div className="bg-white p-20 rounded-[3rem] text-center border-2 border-dashed border-slate-200 font-bold text-slate-300">명단을 선택해줘!</div>
            ) : (
              <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200 space-y-10 relative">
                <div className="flex justify-between items-end border-b border-slate-100 pb-6">
                  <div><h2 className="text-3xl font-black text-slate-800">{selectedItem.presenter_info?.presenter_name} 님</h2><p className="text-sm text-slate-400 font-bold mt-1">Topic: {selectedItem.presenter_info?.topic}</p></div>
                  <div className="text-right"><p className={`text-[10px] font-black uppercase mb-1 ${isSameGroup ? 'text-emerald-500' : 'text-amber-500'}`}>{isSameGroup ? 'Group Feedback' : 'Simple Memo'}</p><p className="text-2xl font-black text-emerald-600">{selectedItem.total_score} pts</p></div>
                </div>

                <div className="space-y-10">
                  {isSameGroup ? (
                    <>
                      <div><label className="text-[10px] font-black text-slate-400 uppercase ml-1 mb-2 block tracking-widest">• 원메세지</label>
                        <textarea disabled={selectedItem.is_submitted} value={editFeedback.originalMessage} onChange={(e)=>setEditFeedback({...editFeedback, originalMessage: e.target.value})} className="w-full p-6 rounded-2xl text-base font-bold min-h-[100px] outline-none bg-slate-50 border border-transparent focus:border-emerald-100 disabled:opacity-50" placeholder="메시지 기록" />
                      </div>
                      <EditSection disabled={selectedItem.is_submitted} title="1. Insight" plus={editFeedback.insightPlus} minus={editFeedback.insightMinus} onChange={(k, v)=>setEditFeedback({...editFeedback, [k]: v})} />
                      <EditSection disabled={selectedItem.is_submitted} title="2. Graphic" plus={editFeedback.graphicPlus} minus={editFeedback.graphicMinus} onChange={(k, v)=>setEditFeedback({...editFeedback, [k]: v})} />
                      <EditSection disabled={selectedItem.is_submitted} title="3. Delivery" plus={editFeedback.deliveryPlus} minus={editFeedback.deliveryMinus} onChange={(k, v)=>setEditFeedback({...editFeedback, [k]: v})} />
                    </>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center ml-1"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">● Evaluation Memo</label></div>
                      <textarea 
                        value={editFeedback.memo || ''} 
                        onChange={(e)=>setEditFeedback({...editFeedback, memo: e.target.value})} 
                        onBlur={(e)=>handleAutoSaveMemo(e.target.value)}
                        className="w-full bg-slate-50 p-8 rounded-[2.5rem] text-sm font-bold min-h-[500px] outline-none border-2 border-dashed border-slate-100 focus:border-amber-100 transition-all" 
                        placeholder="이 발표자에 대해 자유롭게 메모를 남겨줘!" 
                      />
                    </div>
                  )}
                </div>

                {isSameGroup && !selectedItem.is_submitted && (
                  <div className="flex gap-4 pt-6 border-t border-slate-50">
                    <button onClick={() => handleUpdate(false)} disabled={updating} className="flex-1 py-6 bg-slate-100 text-slate-500 rounded-[2rem] font-black text-xl hover:bg-slate-200 transition-all">임시 저장 ✨</button>
                    <button onClick={() => handleUpdate(true)} disabled={updating} className="flex-[1.5] py-6 bg-slate-900 text-white rounded-[2.5rem] font-black text-xl hover:bg-emerald-600 shadow-xl transition-all">최종 제출 🚀</button>
                  </div>
                )}
                {selectedItem.is_submitted && isSameGroup && (
                  <div className="w-full py-8 bg-emerald-500 text-white rounded-[2.5rem] font-black text-center text-xl shadow-lg mt-6">제출된 피드백입니다 ✅</div>
                )}
              </div>
            )}
          </div>
          <aside className="w-full lg:w-72 hidden lg:block" />
        </div>
      </div>
    </div>
  )
}

function EditSection({ title, plus, minus, onChange, disabled }) {
  const pKey = title.toLowerCase().split('. ')[1].toLowerCase() + 'Plus';
  const mKey = title.toLowerCase().split('. ')[1].toLowerCase() + 'Minus';
  return (
    <div className="space-y-4">
      <p className="text-lg font-black text-slate-800 border-l-4 border-emerald-500 pl-3 uppercase">{title}</p>
      <div className="flex flex-col gap-3">
        <textarea disabled={disabled} value={plus} onChange={(e)=>onChange(pKey, e.target.value)} className="w-full p-4 rounded-xl text-sm font-bold min-h-[80px] bg-emerald-50/30 outline-none border border-transparent focus:border-emerald-100 disabled:opacity-50" placeholder="(+) 장점" />
        <textarea disabled={disabled} value={minus} onChange={(e)=>onChange(mKey, e.target.value)} className="w-full p-4 rounded-xl text-sm font-bold min-h-[80px] bg-red-50/30 outline-none border border-transparent focus:border-red-100 disabled:opacity-50" placeholder="(-) 개선점" />
      </div>
    </div>
  )
}