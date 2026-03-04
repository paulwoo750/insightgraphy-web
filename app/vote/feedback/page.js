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
  const [selectedScore, setSelectedScore] = useState(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  const [editFeedback, setEditFeedback] = useState({
    originalMessage: '',
    insightPlus: '', insightMinus: '',
    graphicPlus: '', graphicMinus: '',
    deliveryPlus: '', deliveryMinus: ''
  })

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { 
        router.push('/login') 
      } else { 
        setUser(session.user)
        const { data: latestP } = await supabase.from('presentations').select('week').order('created_at', { ascending: false }).limit(1)
        if (latestP && latestP.length > 0) setWeek(latestP[0].week)
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (user?.user_metadata?.name) fetchMyData()
  }, [user, week])

  const fetchMyData = async () => {
    setLoading(true)
    const { data: pData } = await supabase.from('presentations').select('*').eq('week', week);
    const pIds = pData?.map(p => p.id) || [];

    const { data: sData, error } = await supabase
      .from('scores')
      .select('*')
      .eq('voter_name', user.user_metadata.name)
      .in('presentation_id', pIds);
    
    if (!error) {
      const combined = sData.map(s => ({
        ...s,
        presenter_info: pData.find(p => p.id === s.presentation_id)
      }));
      setEvaluatedScores(combined);
      
      // 새로고침 후에도 선택된 상태 유지를 위해 ID 체크
      if (selectedScore) {
        const current = combined.find(c => c.id === selectedScore.id);
        if (current) selectRecord(current);
      } else if (combined.length > 0) {
        selectRecord(combined[0]);
      }
    }
    setLoading(false)
  }

  const selectRecord = (scoreRecord) => {
    setSelectedScore(scoreRecord)
    const qual = scoreRecord.details?.qualitative || {}
    setEditFeedback({
      originalMessage: qual.originalMessage || '',
      insightPlus: qual.insightPlus || '',
      insightMinus: qual.insightMinus || '',
      graphicPlus: qual.graphicPlus || '',
      graphicMinus: qual.graphicMinus || '',
      deliveryPlus: qual.deliveryPlus || '',
      deliveryMinus: qual.deliveryMinus || ''
    })
  }

  // ★ 제윤이의 필승 로직: 제출 후 새로고침!
  const handleUpdate = async (isSubmit = false) => {
    if (!selectedScore) return
    if (isSubmit && !confirm("최종 제출하면 진짜 끝이야! 고칠 수 없어! 🚀")) return

    setUpdating(true)
    const updatedDetails = {
      ...selectedScore.details,
      qualitative: editFeedback
    }

    const { error } = await supabase
      .from('scores')
      .update({ 
        is_submitted: isSubmit,
        details: updatedDetails
      })
      .eq('id', selectedScore.id)

    if (!error) {
      alert(isSubmit ? "제출 완료! ✅" : "임시 저장 완료! ✨");
      
      // ★ 핵심: 제출 시에만 화면 강제 새로고침 실행
      if (isSubmit) {
        window.location.reload(); 
      } else {
        await fetchMyData(); // 임시 저장은 그냥 목록만 갱신
      }
    } else {
      alert("오류 발생: " + error.message);
    }
    setUpdating(false)
  }

  if (!user) return <div className="p-8 text-center font-black">데이터 로딩 중... 🔄</div>

  // DB에서 가져온 진짜 컬럼 값으로 판단
  const isSubmitted = selectedScore?.is_submitted === true;

  return (
    <div className="p-6 bg-slate-50 min-h-screen text-black font-sans">
      <div className="max-w-[1600px] mx-auto">
        <header className="w-full text-center mb-12">
          <div className="flex justify-between items-center mb-6 max-w-2xl mx-auto">
            <Link href="/vote" className="text-emerald-600 text-xs font-black hover:underline tracking-widest uppercase">← Vote Hub</Link>
            <div className="bg-emerald-600 text-white px-4 py-1.5 rounded-full shadow-lg font-black text-[10px] uppercase">Feedback Editor</div>
          </div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tighter mb-8 uppercase italic">Edit Feedback</h1>
        </header>

        <div className="flex flex-col lg:flex-row justify-center items-start gap-8">
          {/* [좌] 명단 사이드바 (점수 표시 복구) */}
          <aside className="w-full lg:w-72 shrink-0">
            <div className="bg-slate-900 p-6 rounded-[2.5rem] text-white shadow-2xl sticky top-8 border border-slate-800">
              <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-8 flex items-center gap-2">● My Evaluations</h3>
              <div className="space-y-4">
                {evaluatedScores.map((score) => (
                  <button key={score.id} onClick={() => selectRecord(score)} className={`w-full p-4 rounded-2xl text-left transition-all border-2 ${selectedScore?.id === score.id ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg' : 'bg-transparent border-slate-800 text-slate-400 hover:border-slate-700'}`}>
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-black">{score.presenter_info?.presenter_name}</p>
                      {score.is_submitted && <span className="text-[7px] bg-emerald-400 text-slate-900 px-1.5 py-0.5 rounded font-black uppercase">Final</span>}
                    </div>
                    <p className="text-[9px] font-bold opacity-40 mt-1">{score.total_score}점 부여함</p>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          {/* [중] 피드백 수정 창 */}
          <div className="w-full max-w-3xl space-y-8 pb-32">
            {!selectedScore ? (
              <div className="bg-white p-20 rounded-[3rem] text-center border-2 border-dashed border-slate-200">명단을 선택해줘!</div>
            ) : (
              <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200 space-y-8 relative overflow-hidden">
                
                <div className="flex justify-between items-end border-b border-slate-100 pb-6">
                  <div>
                    <h2 className="text-3xl font-black text-slate-800">{selectedScore.presenter_info?.presenter_name} 님</h2>
                    <p className="text-sm text-slate-400 font-bold mt-1">Topic: {selectedScore.presenter_info?.topic}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-emerald-600">{selectedScore.total_score} / 105</p>
                  </div>
                </div>

                <div className="space-y-8">
                  {/* 원메세지 잠금 (태그 교체) */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1 mb-2 block">• 원메세지</label>
                    {isSubmitted ? (
                      <div className="w-full p-6 rounded-2xl text-base font-bold min-h-[100px] bg-slate-50 text-slate-600 border border-slate-200 whitespace-pre-wrap select-none">
                        {editFeedback.originalMessage || "내용이 없습니다."}
                      </div>
                    ) : (
                      <textarea 
                        value={editFeedback.originalMessage} 
                        onChange={(e)=>setEditFeedback({...editFeedback, originalMessage: e.target.value})} 
                        className="w-full p-6 rounded-2xl text-base font-bold min-h-[100px] outline-none bg-slate-50 focus:ring-1 focus:ring-emerald-200"
                        placeholder="메시지를 입력해줘."
                      />
                    )}
                  </div>

                  <EditSection title="1. Insight" isSubmitted={isSubmitted} plus={editFeedback.insightPlus} minus={editFeedback.insightMinus} onChange={(k, v)=>setEditFeedback({...editFeedback, [k]: v})} />
                  <EditSection title="2. Graphic" isSubmitted={isSubmitted} plus={editFeedback.graphicPlus} minus={editFeedback.graphicMinus} onChange={(k, v)=>setEditFeedback({...editFeedback, [k]: v})} />
                  <EditSection title="3. Delivery" isSubmitted={isSubmitted} plus={editFeedback.deliveryPlus} minus={editFeedback.deliveryMinus} onChange={(k, v)=>setEditFeedback({...editFeedback, [k]: v})} />
                </div>

                {/* 하단 버튼 영역 */}
                {!isSubmitted ? (
                  <div className="flex gap-4 pt-4">
                    <button onClick={() => handleUpdate(false)} disabled={updating} className="flex-1 py-6 bg-slate-100 text-slate-500 rounded-[2rem] font-black text-xl hover:bg-slate-200 transition-all">
                      임시 저장하기 ✨
                    </button>
                    <button onClick={() => handleUpdate(true)} disabled={updating} className="flex-[1.5] py-6 bg-slate-900 text-white rounded-[2rem] font-black text-xl hover:bg-emerald-600 active:scale-95 shadow-xl transition-all">
                      최종 제출하기 🚀
                    </button>
                  </div>
                ) : (
                  <div className="w-full py-10 bg-emerald-500 text-white rounded-[2rem] font-black text-center text-2xl shadow-lg tracking-tighter">
                     제출 완료 ✅
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function EditSection({ title, isSubmitted, plus, minus, onChange }) {
  const plusKey = title.toLowerCase() + 'Plus';
  const minusKey = title.toLowerCase() + 'Minus';

  const renderBox = (val, key, color, label) => {
    if (isSubmitted) {
      return (
        <div className="w-full p-5 rounded-2xl text-sm font-bold min-h-[120px] bg-slate-50 text-slate-600 border border-slate-100 whitespace-pre-wrap select-none">
          <p className={`text-[10px] font-black uppercase mb-2 ${color}`}>{label}</p>
          {val || "내용 없음"}
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <label className={`text-[10px] font-black ml-1 ${color}`}>{label}</label>
        <textarea value={val} onChange={(e)=>onChange(key, e.target.value)} className={`w-full p-5 rounded-2xl text-sm font-bold min-h-[120px] outline-none ${color === 'text-emerald-600' ? 'bg-emerald-50/30' : 'bg-red-50/30'}`} />
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-lg font-black text-slate-800 border-l-4 border-emerald-500 pl-3">{title}</p>
      <div className="flex flex-col gap-4">
        {renderBox(plus, plusKey, 'text-emerald-600', '(+) 장점')}
        {renderBox(minus, minusKey, 'text-red-400', '(-) 개선점')}
      </div>
    </div>
  )
}