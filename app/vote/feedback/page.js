'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// CRITERIA_DATA 생략

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

  // ★ 쿼리 방식 변경: 훨씬 안정적인 2단계 로드 방식
  const fetchMyData = async () => {
    setLoading(true)
    
    // 1. 먼저 해당 주차의 발표 목록을 가져옴
    const { data: pData } = await supabase.from('presentations').select('*').eq('week', week);
    const pIds = pData?.map(p => p.id) || [];

    // 2. 내가 쓴 점수 기록들 중 위 발표 목록에 포함된 것만 가져옴
    const { data: sData, error } = await supabase
      .from('scores')
      .select('*')
      .eq('voter_name', user.user_metadata.name)
      .in('presentation_id', pIds);
    
    if (error) {
      alert("데이터 로드 실패: " + error.message);
    } else {
      // 3. 발표 정보와 점수 정보를 합침 (UI 표시용)
      const combined = sData.map(s => ({
        ...s,
        presenter_info: pData.find(p => p.id === s.presentation_id)
      }));
      
      setEvaluatedScores(combined);
      if (combined.length > 0) selectRecord(combined[0]);
      else setSelectedScore(null);
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

  const handleUpdate = async () => {
    if (!selectedScore) return
    setUpdating(true)

    const updatedDetails = {
      ...selectedScore.details,
      qualitative: editFeedback
    }

    const { error } = await supabase
      .from('scores')
      .update({ details: updatedDetails })
      .eq('id', selectedScore.id)

    if (!error) {
      alert("피드백 수정 완료! ✨");
      fetchMyData();
    } else {
      alert("수정 실패: " + error.message);
    }
    setUpdating(false)
  }

  if (!user) return <div className="p-8 text-center font-black">로딩 중...</div>

  return (
    <div className="p-6 bg-slate-50 min-h-screen text-black font-sans">
      <div className="max-w-[1600px] mx-auto">
        <header className="w-full text-center mb-12">
          <div className="flex justify-between items-center mb-6 max-w-2xl mx-auto">
            <Link href="/vote" className="text-emerald-600 text-xs font-black hover:underline tracking-widest uppercase">← Vote Hub</Link>
            <div className="bg-emerald-600 text-white px-4 py-1.5 rounded-full shadow-lg font-black text-[10px] uppercase">Feedback Editor</div>
          </div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tighter mb-8 uppercase">Edit Your Feedback</h1>
          <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200 max-w-2xl mx-auto">
            <span className="text-[10px] font-black text-slate-300 uppercase block mb-3 tracking-widest">Select Week</span>
            <div className="flex flex-wrap justify-center gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((w) => (
                <button key={w} onClick={() => setWeek(w)} className={`w-10 h-10 rounded-xl font-black text-sm transition-all ${week === w ? 'bg-emerald-500 text-white shadow-lg' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>{w}</button>
              ))}
            </div>
          </div>
        </header>

        <div className="flex flex-col lg:flex-row justify-center items-start gap-8">
          {/* [좌] 내가 채점한 사람 명단 */}
          <aside className="w-full lg:w-72 shrink-0">
            <div className="bg-slate-900 p-6 rounded-[2.5rem] text-white shadow-2xl sticky top-8 border border-slate-800">
              <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-8 flex items-center gap-2"><span className="animate-pulse">●</span> My Evaluations</h3>
              {loading ? <p className="text-xs text-slate-500 italic">조회 중...</p> : 
               evaluatedScores.length === 0 ? <p className="text-xs text-slate-500 text-center py-4">해당 주차의 채점 기록이 없어요.</p> : (
                <div className="space-y-4">
                  {evaluatedScores.map((score) => (
                    <button key={score.id} onClick={() => selectRecord(score)} className={`w-full p-4 rounded-2xl text-left transition-all border-2 ${selectedScore?.id === score.id ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg' : 'bg-transparent border-slate-800 text-slate-400 hover:border-slate-700'}`}>
                      <p className="text-sm font-black">{score.presenter_info?.presenter_name || "이름 없음"}</p>
                      <p className="text-[9px] font-bold opacity-60 mt-1">{score.total_score}점 부여함</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>

          {/* [중] 피드백 수정 메인창 */}
          <div className="w-full max-w-3xl space-y-8 pb-32">
            {!selectedScore ? (
              <div className="bg-white p-20 rounded-[3rem] text-center border-2 border-dashed border-slate-200"><p className="text-slate-400 font-bold">수정할 기록을 왼쪽에서 선택해줘! 👈</p></div>
            ) : (
              <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200 space-y-8">
                <div className="flex justify-between items-end border-b border-slate-100 pb-6">
                  <div>
                    <h2 className="text-3xl font-black text-slate-800">{selectedScore.presenter_info?.presenter_name} 님 피드백</h2>
                    <p className="text-sm text-slate-400 font-bold mt-1">Topic: {selectedScore.presenter_info?.topic}</p>
                  </div>
                  <div className="text-right"><p className="text-[10px] font-black text-slate-300 uppercase">Total Score</p><p className="text-2xl font-black text-emerald-600">{selectedScore.total_score} / 105</p></div>
                </div>
                <div className="space-y-8">
                  <div><label className="text-[10px] font-black text-slate-400 uppercase ml-1 mb-2 block">• 원메세지 수정</label><textarea value={editFeedback.originalMessage} onChange={(e)=>setEditFeedback({...editFeedback, originalMessage: e.target.value})} className="w-full bg-slate-50 p-6 rounded-2xl text-base font-bold min-h-[100px] outline-none" /></div>
                  <EditSection title="1. Insight" plus={editFeedback.insightPlus} minus={editFeedback.insightMinus} onChange={(k, v)=>setEditFeedback({...editFeedback, [k]: v})} />
                  <EditSection title="2. Graphic" plus={editFeedback.graphicPlus} minus={editFeedback.graphicMinus} onChange={(k, v)=>setEditFeedback({...editFeedback, [k]: v})} />
                  <EditSection title="3. Delivery" plus={editFeedback.deliveryPlus} minus={editFeedback.deliveryMinus} onChange={(k, v)=>setEditFeedback({...editFeedback, [k]: v})} />
                </div>
                <button onClick={handleUpdate} disabled={updating} className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black text-xl hover:bg-emerald-600 transition-all shadow-xl">{updating ? "저장 중..." : "수정 내용 저장하기 ✨"}</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function EditSection({ title, plus, minus, onChange }) {
  const plusKey = title.toLowerCase() + 'Plus';
  const minusKey = title.toLowerCase() + 'Minus';
  return (
    <div className="space-y-4">
      <p className="text-lg font-black text-slate-800 border-l-4 border-emerald-500 pl-3">{title}</p>
      <div className="flex flex-col gap-4">
        <div className="space-y-2"><label className="text-[10px] font-black text-emerald-600 ml-1">(+) 장점</label><textarea value={plus} onChange={(e)=>onChange(plusKey, e.target.value)} className="w-full bg-emerald-50/30 p-5 rounded-2xl text-sm font-bold min-h-[120px] outline-none" /></div>
        <div className="space-y-2"><label className="text-[10px] font-black text-red-400 ml-1">(-) 개선점</label><textarea value={minus} onChange={(e)=>onChange(minusKey, e.target.value)} className="w-full bg-red-50/30 p-5 rounded-2xl text-sm font-bold min-h-[120px] outline-none" /></div>
      </div>
    </div>
  )
}