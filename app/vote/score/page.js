'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ScorePage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [presentations, setPresentations] = useState([]) 
  const [selectedPid, setSelectedPid] = useState('')
  const [week, setWeek] = useState(1) 
  
  const [insight, setInsight] = useState(5)
  const [graphic, setGraphic] = useState(5)
  const [delivery, setDelivery] = useState(5)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { 
        router.push('/login') 
      } else {
        setUser(session.user)
        fetchPresentations()
      }
    }
    init()
  }, [week])

  const fetchPresentations = async () => {
    const { data } = await supabase
      .from('presentations')
      .select('*')
      .eq('week', week) 
    
    if (data) {
      setPresentations(data)
      setSelectedPid('') 
    }
  }

  const handleSubmit = async () => {
    if (!selectedPid) return alert("발표자를 선택해줘! 👤")
    setSubmitting(true)

    const { error } = await supabase.from('scores').insert([
      {
        presentation_id: selectedPid,
        voter_name: user.user_metadata.name,
        insight: Number(insight),
        graphic: Number(graphic),
        delivery: Number(delivery)
      }
    ])

    if (!error) {
      alert("투표 완료! 결과 창으로 가자. 🏆")
      router.push('/vote/results') 
    } else {
      alert("오류 발생: " + error.message)
    }
    setSubmitting(false)
  }

  if (!user) return <div className="p-8 text-center font-bold italic">준비 중... 🔄</div>

  // 현재 주차의 공통 주제 가져오기
  const currentTopic = presentations.length > 0 ? presentations[0].topic : "등록된 주제가 없어요 🧐"

  return (
    <div className="p-8 bg-slate-50 min-h-screen text-slate-900 font-sans flex flex-col items-center">
      {/* 뒤로가기 버튼 좌측 상단 고정 */}
      <div className="w-full max-w-2xl flex justify-start mb-4">
        <Link href="/vote" className="text-blue-600 text-xs font-black hover:underline tracking-widest uppercase">
          ← Vote Hub
        </Link>
      </div>

      <header className="w-full max-w-md text-center mb-12">
        <h1 className="text-5xl font-black text-slate-800 tracking-tighter mb-8">Live Score</h1>
        
        {/* ★ 주차 선택 & 주제 표시 섹션 (중앙 배치) ★ */}
        <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-blue-50 flex flex-col items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Week</span>
              <input 
                type="number" 
                value={week} 
                onChange={(e) => setWeek(Number(e.target.value))} 
                className="w-20 text-center text-4xl font-black text-blue-600 outline-none bg-slate-50 rounded-2xl p-2"
              />
            </div>
            <div className="h-12 w-[2px] bg-slate-100 mx-2"></div>
            <div className="flex flex-col items-start max-w-[200px]">
              <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Current Topic</span>
              <p className="text-lg font-black text-slate-800 leading-tight break-keep">{currentTopic}</p>
            </div>
          </div>
          <div className="bg-blue-50 px-4 py-1 rounded-full">
            <span className="text-[10px] font-black text-blue-400 uppercase tracking-tighter">Scorer: {user.user_metadata.name}</span>
          </div>
        </div>
      </header>

      <div className="w-full max-w-md bg-white p-10 rounded-[3.5rem] shadow-2xl border border-slate-100">
        <div className="space-y-12">
          {/* 발표자 선택 (이름만 표시) */}
          <div>
            <label className="text-[11px] font-black text-slate-300 uppercase tracking-[0.25em] mb-4 block ml-2">Select Presenter</label>
            <div className="relative">
              <select 
                value={selectedPid} 
                onChange={(e) => setSelectedPid(e.target.value)}
                className="w-full p-6 bg-slate-50 border-4 border-slate-50 rounded-[2rem] outline-none focus:border-blue-500 transition-all font-black text-slate-700 appearance-none shadow-inner text-lg"
              >
                <option value="">발표자를 선택해줘</option>
                {presentations.length > 0 ? (
                  presentations.map(p => (
                    // ★ 이름만 표시하도록 수정함! ★
                    <option key={p.id} value={p.id}>{p.presenter_name}</option>
                  ))
                ) : (
                  <option disabled>이 주차에는 발표자가 없어!</option>
                )}
              </select>
              <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-300 font-black">▼</div>
            </div>
          </div>

          {/* 채점 슬라이더 */}
          <div className="space-y-10">
            {[
              { label: '인사이트', val: insight, set: setInsight, icon: '💡', color: 'bg-blue-600' },
              { label: '그래픽', val: graphic, set: setGraphic, icon: '🎨', color: 'bg-purple-600' },
              { label: '딜리버리', val: delivery, set: setDelivery, icon: '🎤', color: 'bg-pink-600' },
            ].map((item) => (
              <div key={item.label} className="group">
                <div className="flex justify-between items-center mb-4 px-2">
                  <label className="text-sm font-black text-slate-500 uppercase tracking-widest">{item.icon} {item.label}</label>
                  <span className={`${item.color} text-white px-5 py-2 rounded-2xl text-sm font-black shadow-lg shadow-slate-100 transition-transform group-hover:scale-110`}>{item.val}점</span>
                </div>
                <input 
                  type="range" min="1" max="10" value={item.val} 
                  onChange={(e) => item.set(e.target.value)}
                  className="w-full h-4 bg-slate-100 rounded-full appearance-none cursor-pointer accent-blue-600 outline-none"
                />
              </div>
            ))}
          </div>

          <button 
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-7 bg-slate-900 text-white rounded-[2.5rem] font-black text-2xl shadow-2xl shadow-slate-200 active:scale-95 transition-all disabled:bg-slate-300 hover:bg-blue-600"
          >
            {submitting ? "제출 중..." : "점수 확정하기 🚀"}
          </button>
        </div>
      </div>
      
      <p className="mt-12 opacity-10 font-black text-[10px] tracking-[1em] uppercase">InsightGraphy</p>
    </div>
  )
}