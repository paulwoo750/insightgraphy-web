'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function VotePage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [presentations, setPresentations] = useState([])
  const [selectedPid, setSelectedPid] = useState('')
  
  // 평가 항목 상태 (기본값 5점)
  const [insight, setInsight] = useState(5)
  const [graphic, setGraphic] = useState(5)
  const [delivery, setDelivery] = useState(5)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { 
        router.push('/signup') 
      } else {
        setUser(session.user)
        // 발표 명단 불러오기
        const { data } = await supabase.from('presentations').select('*')
        if (data) setPresentations(data)
      }
    }
    init()
  }, [])

  const handleSubmit = async () => {
    if (!selectedPid) return alert("발표자를 선택해줘! 👤")
    setSubmitting(true)

    const { error } = await supabase.from('scores').insert([
      {
        presentation_id: selectedPid,
        voter_name: user.user_metadata.name, // 채점자 이름 자동 기록
        insight: Number(insight),
        graphic: Number(graphic),
        delivery: Number(delivery)
      }
    ])

    if (!error) {
      alert("투표 완료! 결과는 리더보드에서 확인하자. 🏆")
      router.push('/vote/results') 
    } else {
      alert("오류가 발생했어: " + error.message)
    }
    setSubmitting(false)
  }

  if (!user) return <div className="p-8 text-center font-bold">로딩 중... 🔄</div>

  return (
    <div className="p-8 bg-slate-50 min-h-screen text-slate-900 font-sans">
      <header className="max-w-md mx-auto mb-10">
        <div className="flex justify-between items-center mb-6">
          <Link href="/home" className="text-blue-600 text-xs font-bold hover:underline">← 홈으로</Link>
          {/* 발표자 세팅 버튼 추가 */}
          <Link href="/vote/setup" className="bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-[10px] font-black hover:bg-slate-800 hover:text-white transition-all">
            ⚙️ 발표 세팅
          </Link>
        </div>
        
        <div className="text-center">
          <h1 className="text-3xl font-black text-slate-800">실시간 발표 채점 🗳️</h1>
          {/* 채점자 이름 표시 부분 */}
          <div className="mt-4 inline-block bg-white border border-blue-100 px-5 py-2 rounded-full shadow-sm">
            <span className="text-xs font-bold text-slate-400 mr-2 uppercase tracking-widest">Scorer</span>
            <span className="text-sm font-black text-blue-600">{user.user_metadata.name}님</span>
          </div>
        </div>
      </header>

      <div className="max-w-md mx-auto bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
        <div className="space-y-8">
          {/* 발표자 선택 */}
          <div>
            <label className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] mb-3 block ml-1">Presenter Selection</label>
            <select 
              value={selectedPid} 
              onChange={(e) => setSelectedPid(e.target.value)}
              className="w-full p-4 bg-slate-50 border-2 border-slate-50 rounded-2xl outline-none focus:border-blue-500 transition-all font-bold text-slate-700"
            >
              <option value="">발표자를 선택해줘</option>
              {presentations.map(p => (
                <option key={p.id} value={p.id}>{p.presenter_name} - {p.topic}</option>
              ))}
            </select>
          </div>

          {/* 점수 입력 섹션 */}
          <div className="space-y-6">
            {[
              { label: '인사이트 (Insight)', val: insight, set: setInsight, icon: '💡' },
              { label: '그래픽 (Graphic)', val: graphic, set: setGraphic, icon: '🎨' },
              { label: '딜리버리 (Delivery)', val: delivery, set: setDelivery, icon: '🎤' },
            ].map((item) => (
              <div key={item.label} className="bg-slate-50/50 p-4 rounded-2xl">
                <div className="flex justify-between items-center mb-3">
                  <label className="text-xs font-black text-slate-500">{item.icon} {item.label}</label>
                  <span className="bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-black shadow-md shadow-blue-100">{item.val}점</span>
                </div>
                <input 
                  type="range" min="1" max="10" value={item.val} 
                  onChange={(e) => item.set(e.target.value)}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
            ))}
          </div>

          <button 
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-lg shadow-xl shadow-slate-200 active:scale-95 transition-all disabled:bg-slate-300"
          >
            {submitting ? "채점표 제출 중..." : "점수 확정하기 🚀"}
          </button>
        </div>
      </div>
      
      <p className="text-center text-[10px] text-slate-300 mt-10 font-bold uppercase tracking-widest">
        InsightGraphy Live Evaluation System
      </p>
    </div>
  )
}