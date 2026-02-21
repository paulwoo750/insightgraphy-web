'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function FeedbackArxiv() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [myPresentations, setMyPresentations] = useState([]) // 내가 발표한 주차 목록
  const [selectedP, setSelectedP] = useState(null) // 선택된 발표 정보
  const [receivedFeedbacks, setReceivedFeedbacks] = useState([]) // 받은 피드백들
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

  // 1. 내가 발표자로 참여한 모든 주차 가져오기
  const fetchMyPresentations = async (userName) => {
    setLoading(true)
    const { data, error } = await supabase
      .from('presentations')
      .select('*')
      .eq('presenter_name', userName)
      .order('week', { ascending: false })

    if (!error && data) {
      setMyPresentations(data)
      if (data.length > 0) fetchFeedbacks(data[0]) // 가장 최근 발표 피드백 자동 로드
    }
    setLoading(false)
  }

  // 2. 특정 발표에 대해 학회원들이 남긴 피드백 가져오기
  const fetchFeedbacks = async (presentation) => {
    setSelectedP(presentation)
    const { data, error } = await supabase
      .from('scores')
      .select('*')
      .eq('presentation_id', presentation.id)

    if (!error) {
      setReceivedFeedbacks(data || [])
    }
  }

  if (!user) return <div className="p-8 text-center font-black">데이터 로딩 중... 🔄</div>

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
          <p className="text-slate-400 font-bold text-sm">학회원들이 남겨준 소중한 정성 피드백 보관소</p>
        </header>

        <div className="flex flex-col lg:flex-row justify-center items-start gap-10">
          
          {/* [좌] 내 발표 히스토리 (주차 선택) */}
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
                      className={`w-full p-5 rounded-2xl text-left transition-all border-2 ${selectedP?.id === p.id ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg' : 'bg-transparent border-slate-800 text-slate-500 hover:border-slate-700'}`}
                    >
                      <p className="text-[10px] font-black opacity-60 uppercase mb-1">Week {p.week}</p>
                      <p className="text-sm font-black leading-tight">{p.topic}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>

          {/* [우] 받은 피드백 리스트 */}
          <main className="flex-1 max-w-4xl space-y-8 pb-32">
            {!selectedP ? (
              <div className="bg-white p-20 rounded-[3rem] text-center border-2 border-dashed border-slate-200">
                <p className="text-slate-400 font-bold">확인할 발표 주차를 왼쪽에서 선택해줘! 👈</p>
              </div>
            ) : (
              <>
                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 flex justify-between items-center">
                  <div>
                    <span className="bg-slate-100 text-slate-500 px-3 py-1 rounded-full text-[9px] font-black uppercase mb-2 block w-fit">Current View</span>
                    <h2 className="text-2xl font-black text-slate-800">{selectedP.week}주차 발표: {selectedP.topic}</h2>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-slate-300 uppercase">Received</p>
                    <p className="text-2xl font-black text-emerald-600">{receivedFeedbacks.length} Feedbacks</p>
                  </div>
                </div>

                <div className="space-y-6">
                  {receivedFeedbacks.length === 0 ? (
                    <p className="text-center py-20 text-slate-400 font-bold">아직 도착한 피드백이 없어요! ✉️</p>
                  ) : (
                    receivedFeedbacks.map((fb, idx) => (
                      <FeedbackCard key={fb.id} index={idx + 1} data={fb.details?.qualitative} />
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

// 개별 피드백 카드 컴포넌트
function FeedbackCard({ index, data }) {
  if (!data) return null;

  return (
    <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-6 hover:shadow-md transition-all">
      <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
        <span className="bg-slate-900 text-white w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black">{index}</span>
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Member Feedback</p>
      </div>

      <div className="space-y-6">
        {/* 원메세지 */}
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