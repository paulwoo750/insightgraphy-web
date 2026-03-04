'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function FeedbackArxiv() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [myPresentations, setMyPresentations] = useState([]) 
  const [selectedP, setSelectedP] = useState(null) 
  const [receivedFeedbacks, setReceivedFeedbacks] = useState([]) 
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
      } else {
        setUser(session.user)
        fetchMyPresentations(session.user.user_metadata.name)
      }
    }
    init()
  }, [])

  const fetchMyPresentations = async (userName) => {
    setLoading(true)
    const { data, error } = await supabase
      .from('presentations')
      .select('*')
      .eq('presenter_name', userName)
      .order('week', { ascending: false })

    if (!error && data) {
      setMyPresentations(data)
      if (data.length > 0) fetchFeedbacks(data[0]) 
    }
    setLoading(false)
  }

  // ★ 핵심 수정: 조원 필터링 로직 추가
  const fetchFeedbacks = async (presentation) => {
    setSelectedP(presentation)
    
    // 1. 해당 주차에 나와 같은 조(group_id)였던 멤버 이름들 가져오기
    const { data: groupMembers } = await supabase
      .from('presentations')
      .select('presenter_name')
      .eq('week', presentation.week)
      .eq('group_id', presentation.group_id);

    const memberNames = groupMembers?.map(m => m.presenter_name) || [];

    // 2. 피드백 중 작성자가 우리 조원이고, 최종 제출된 것만 필터링
    const { data, error } = await supabase
      .from('scores')
      .select('*')
      .eq('presentation_id', presentation.id)
      .eq('is_submitted', true)
      .in('voter_name', memberNames) // ★ 우리 조원인 경우만!
      .order('created_at', { ascending: true });

    if (!error) {
      // 3. 메모만 적힌 데이터는 제외하고 실제 정성 피드백이 있는 것만 세팅
      const onlyRealFeedbacks = data?.filter(fb => fb.details?.qualitative?.originalMessage) || [];
      setReceivedFeedbacks(onlyRealFeedbacks)
    }
  }

  const handleCheckFeedback = async (scoreId) => {
    const { error } = await supabase
      .from('scores')
      .update({ is_checked: true })
      .eq('id', scoreId);

    if (!error) {
      setReceivedFeedbacks(prev => 
        prev.map(fb => fb.id === scoreId ? { ...fb, is_checked: true } : fb)
      );
    } else {
      alert("체크 처리 중 오류 발생: " + error.message);
    }
  }

  if (!user) return <div className="p-8 text-center font-black text-black">데이터 로딩 중... 🔄</div>

  return (
    <div className="p-6 bg-slate-50 min-h-screen text-black font-sans">
      <div className="max-w-[1400px] mx-auto">
        
        <header className="w-full text-center mb-12">
          <div className="flex justify-between items-center mb-6 max-w-2xl mx-auto">
            <Link href="/vote/results" className="text-emerald-600 text-xs font-black hover:underline tracking-widest uppercase">← Results Hub</Link>
            <div className="bg-emerald-600 text-white px-4 py-1.5 rounded-full shadow-lg font-black text-[10px] uppercase">
              Feedback Arxiv
            </div>
          </div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tighter mb-2 uppercase italic">My Growth Record</h1>
          <p className="text-slate-400 font-bold text-sm">우리 조원들이 남겨준 소중한 피드백 보관소</p>
        </header>

        <div className="flex flex-col lg:flex-row justify-center items-start gap-10">
          
          <aside className="w-full lg:w-72 shrink-0">
            <div className="bg-slate-900 p-6 rounded-[2.5rem] text-white shadow-2xl sticky top-8 border border-slate-800">
              <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
                <span className="animate-pulse">●</span> My Presentations
              </h3>
              {loading ? <p className="text-xs text-slate-500 italic">조회 중...</p> : 
               myPresentations.length === 0 ? <p className="text-xs text-slate-500 text-center py-4">아직 발표 기록이 없어요.</p> : (
                <div className="space-y-3">
                  {myPresentations.map((p) => (
                    <button 
                      key={p.id} 
                      onClick={() => fetchFeedbacks(p)}
                      className={`w-full p-5 rounded-2xl text-left transition-all border-2 ${selectedP?.id === p.id ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg' : 'bg-transparent border-slate-800 text-slate-400 hover:border-slate-700'}`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-[10px] font-black opacity-60 uppercase">Week {p.week}</p>
                        <span className="text-[8px] bg-slate-800 px-1.5 py-0.5 rounded text-emerald-400 font-bold">Group {p.group_id}</span>
                      </div>
                      <p className="text-sm font-black leading-tight">{p.topic}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>

          <main className="flex-1 max-w-4xl space-y-8 pb-32">
            {!selectedP ? (
              <div className="bg-white p-20 rounded-[3rem] text-center border-2 border-dashed border-slate-200">
                <p className="text-slate-400 font-bold font-sans">확인할 발표 주차를 선택해줘! 👈</p>
              </div>
            ) : (
              <>
                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 flex justify-between items-center">
                  <div>
                    <span className="bg-slate-100 text-slate-500 px-3 py-1 rounded-full text-[9px] font-black uppercase mb-2 block w-fit">Current View</span>
                    <h2 className="text-2xl font-black text-slate-800">{selectedP.week}주차 발표: {selectedP.topic}</h2>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-slate-300 uppercase">From Group Members</p>
                    <p className="text-2xl font-black text-emerald-600">{receivedFeedbacks.length} Feedbacks</p>
                  </div>
                </div>

                <div className="space-y-6">
                  {receivedFeedbacks.length === 0 ? (
                    <div className="py-20 text-center bg-white rounded-[2.5rem] border border-slate-100">
                      <p className="text-slate-400 font-bold mb-1">우리 조원이 남긴 확정 피드백이 없어요! ✉️</p>
                    </div>
                  ) : (
                    receivedFeedbacks.map((fb, idx) => (
                      <FeedbackCard 
                        key={fb.id} 
                        index={idx + 1} 
                        data={fb.details?.qualitative} 
                        isChecked={fb.is_checked} 
                        onCheck={() => handleCheckFeedback(fb.id)} 
                      />
                    ))
                  )}
                </div>
              </>
            )}
          </main>

        </div>
      </div>
    </div>
  )
}

// FeedbackCard 및 FeedbackDetail 컴포넌트는 기존 디자인 그대로 유지
function FeedbackCard({ index, data, isChecked, onCheck }) {
  if (!data) return null;
  return (
    <div className={`bg-white p-8 rounded-[2.5rem] shadow-sm border space-y-6 hover:shadow-md transition-all relative overflow-hidden ${isChecked ? 'border-emerald-100 opacity-80' : 'border-slate-100'}`}>
      {isChecked && (
        <div className="absolute top-0 right-0 bg-emerald-500 text-white px-6 py-1.5 font-black text-[9px] uppercase tracking-tighter rounded-bl-2xl">
          Checked ✅
        </div>
      )}

      <div className="flex justify-between items-center border-b border-slate-50 pb-4">
        <div className="flex items-center gap-3">
          <span className="bg-slate-900 text-white w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black">{index}</span>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Group Member Feedback</p>
        </div>
        {!isChecked && (
          <button 
            onClick={onCheck}
            className="bg-emerald-50 text-emerald-600 px-4 py-1.5 rounded-full font-black text-[10px] hover:bg-emerald-500 hover:text-white transition-all uppercase border border-emerald-100"
          >
            확인하기
          </button>
        )}
      </div>

      <div className="space-y-6">
        {data.originalMessage && (
          <div>
            <label className="text-[9px] font-black text-blue-500 uppercase tracking-tighter mb-1 block">● Original Message</label>
            <p className="text-sm font-bold text-slate-700 bg-blue-50/30 p-4 rounded-xl leading-relaxed">{data.originalMessage}</p>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FeedbackDetail title="Insight" plus={data.insightPlus} minus={data.insightMinus} />
          <FeedbackDetail title="Graphic" plus={data.graphicPlus} minus={data.graphicMinus} />
          <FeedbackDetail title="Delivery" plus={data.deliveryPlus} minus={data.deliveryMinus} />
        </div>
      </div>
    </div>
  )
}

function FeedbackDetail({ title, plus, minus }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-black text-slate-800 border-l-2 border-slate-800 pl-2">{title}</p>
      <div className="space-y-2">
        {plus && (
          <div className="bg-emerald-50/50 p-3 rounded-xl">
            <p className="text-[10px] font-bold text-emerald-600 mb-1">(+)</p>
            <p className="text-[11px] font-medium text-slate-600 leading-snug whitespace-pre-wrap">{plus}</p>
          </div>
        )}
        {minus && (
          <div className="bg-red-50/50 p-3 rounded-xl">
            <p className="text-[10px] font-bold text-red-400 mb-1">(-)</p>
            <p className="text-[11px] font-medium text-slate-600 leading-snug whitespace-pre-wrap">{minus}</p>
          </div>
        )}
      </div>
    </div>
  )
}