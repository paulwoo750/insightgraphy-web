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
  const [submitting, setSubmitting] = useState(false)

  // --- 세부 평가 점수 상태 ---
  const [scores, setScores] = useState({
    i1: 0, i2: 0, i3: 0, i4: 0, // 인사이트 (각 10점)
    g1: 0, g2: 0, g3: 0,         // 그래픽 (각 10점)
    d1: 0, d2: 0, d3: 0,         // 딜리버리 (각 10점)
    c1: 0                        // 상호보완성 (5점)
  })

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login') } 
      else { setUser(session.user); fetchPresentations(); }
    }
    init()
  }, [week])

  const fetchPresentations = async () => {
    const { data } = await supabase.from('presentations').select('*').eq('week', week) 
    if (data) { setPresentations(data); setSelectedPid(''); }
  }

  const handleScoreChange = (key, val) => {
    setScores(prev => ({ ...prev, [key]: Number(val) }))
  }

  const insightTotal = scores.i1 + scores.i2 + scores.i3 + scores.i4
  const graphicTotal = scores.g1 + scores.g2 + scores.g3
  const deliveryTotal = scores.d1 + scores.d2 + scores.d3
  const complementarityTotal = scores.c1
  const grandTotal = insightTotal + graphicTotal + deliveryTotal + complementarityTotal

  const handleSubmit = async () => {
    if (!selectedPid) return alert("발표자를 선택해줘! 👤")
    setSubmitting(true)

    const { error } = await supabase.from('scores').insert([
      {
        presentation_id: selectedPid,
        voter_name: user.user_metadata.name,
        insight: insightTotal,
        graphic: graphicTotal,
        delivery: deliveryTotal,
        complementarity: complementarityTotal,
        total_score: grandTotal,
        details: scores 
      }
    ])

    if (!error) {
      alert(`투표 완료! 총점 ${grandTotal}점이 기록됐어. 🏆`)
      router.push('/vote/results') 
    } else {
      alert("오류 발생: " + error.message)
    }
    setSubmitting(false)
  }

  if (!user) return <div className="p-8 text-center font-bold italic">데이터 불러오는 중... 🔄</div>
  const currentTopic = presentations.length > 0 ? presentations[0].topic : "등록된 주제 없음"

  return (
    <div className="p-6 bg-slate-50 min-h-screen text-slate-900 font-sans flex flex-col items-center">
      <div className="w-full max-w-2xl flex justify-start mb-4">
        <Link href="/vote" className="text-blue-600 text-sm font-black hover:underline tracking-widest uppercase">← Vote Hub</Link>
      </div>

      <header className="w-full max-w-2xl text-center mb-6">
        <h1 className="text-4xl font-black text-slate-800 tracking-tighter mb-6 italic">EVALUATION SYSTEM</h1>
        
        {/* 상단 정보 카드: 박스는 줄이고 글씨는 키움 */}
        <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl flex flex-col gap-4">
          <div className="flex justify-around items-center divide-x divide-slate-700">
            <div className="px-4">
              <span className="text-[10px] font-black text-slate-500 uppercase block mb-1">Week</span>
              <input type="number" value={week} onChange={(e) => setWeek(Number(e.target.value))} className="w-20 text-center text-5xl font-black bg-transparent outline-none text-blue-400" />
            </div>
            <div className="px-6 flex-1 text-left">
              <span className="text-[10px] font-black text-slate-500 uppercase block mb-1">Current Topic</span>
              <p className="text-2xl font-black text-white leading-tight break-keep">{currentTopic}</p>
            </div>
            <div className="px-4">
              <span className="text-[10px] font-black text-slate-500 uppercase block mb-1">Evaluator</span>
              <p className="text-2xl font-black text-blue-400">{user.user_metadata.name}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full max-w-2xl space-y-6 pb-20">
        {/* 발표자 선택 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <label className="text-xs font-black text-slate-300 uppercase tracking-widest mb-4 block">Select Presenter</label>
          <select value={selectedPid} onChange={(e) => setSelectedPid(e.target.value)} className="w-full p-4 bg-slate-50 border-none rounded-xl font-black text-slate-700 text-2xl outline-none focus:ring-4 ring-blue-500/20">
            <option value="">발표자를 선택해줘</option>
            {presentations.map(p => <option key={p.id} value={p.id}>{p.presenter_name}</option>)}
          </select>
        </div>

        {/* 1. 인사이트 (40점) */}
        <CategoryCard title="1. 인사이트" icon="💡" total={insightTotal} max={40} color="text-blue-600">
          <ScoreButtons label="1-1. 주제의 명료성" val={scores.i1} max={10} onChange={(v)=>handleScoreChange('i1', v)} />
          <ScoreButtons label="1-2. 논리적 구조" val={scores.i2} max={10} onChange={(v)=>handleScoreChange('i2', v)} />
          <ScoreButtons label="1-3. 분석의 깊이" val={scores.i3} max={10} onChange={(v)=>handleScoreChange('i3', v)} />
          <ScoreButtons label="1-4. 독창성" val={scores.i4} max={10} onChange={(v)=>handleScoreChange('i4', v)} />
        </CategoryCard>

        {/* 2. 그래픽 (30점) */}
        <CategoryCard title="2. 그래픽" icon="🎨" total={graphicTotal} max={30} color="text-purple-600">
          <ScoreButtons label="2-1. 명료성" val={scores.g1} max={10} onChange={(v)=>handleScoreChange('g1', v)} />
          <ScoreButtons label="2-2. 디자인 스킬" val={scores.g2} max={10} onChange={(v)=>handleScoreChange('g2', v)} />
          <ScoreButtons label="2-3. 창의성" val={scores.g3} max={10} onChange={(v)=>handleScoreChange('g3', v)} />
        </CategoryCard>

        {/* 3. 딜리버리 (30점) */}
        <CategoryCard title="3. 딜리버리" icon="🎤" total={deliveryTotal} max={30} color="text-pink-600">
          <ScoreButtons label="3-1. 언어적 표현" val={scores.d1} max={10} onChange={(v)=>handleScoreChange('d1', v)} />
          <ScoreButtons label="3-2. 비언어적 표현" val={scores.d2} max={10} onChange={(v)=>handleScoreChange('d2', v)} />
          <ScoreButtons label="3-3. 청중과의 교감" val={scores.d3} max={10} onChange={(v)=>handleScoreChange('d3', v)} />
        </CategoryCard>

        {/* 4. 상호보완성 (5점) */}
        <CategoryCard title="4. 상호보완성" icon="🔗" total={complementarityTotal} max={5} color="text-emerald-600">
          <ScoreButtons label="4-1. IGD간 상호보완성" val={scores.c1} max={5} onChange={(v)=>handleScoreChange('c1', v)} />
        </CategoryCard>

        {/* ★ 최종 총점 표시: 스크롤 따라오지 않게 일반 배치 ★ */}
        <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl text-white flex flex-col items-center border-4 border-blue-500/30">
          <div className="mb-6 text-center">
            <p className="text-sm font-black text-slate-500 uppercase tracking-[0.4em] mb-2">Grand Total Score</p>
            <h2 className="text-8xl font-black text-blue-400">
              {grandTotal}<span className="text-2xl text-slate-700 ml-3">/ 105</span>
            </h2>
          </div>
          <button onClick={handleSubmit} disabled={submitting} className="w-full py-6 bg-blue-600 rounded-2xl font-black text-2xl hover:bg-blue-500 active:scale-95 transition-all shadow-xl">
            {submitting ? "제출 중..." : "최종 점수 제출하기 🚀"}
          </button>
        </div>
      </main>
    </div>
  )
}

function CategoryCard({ title, icon, total, max, color, children }) {
  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
      <div className="flex justify-between items-center mb-8 border-b-2 border-slate-50 pb-4">
        <h3 className={`text-2xl font-black ${color}`}>{icon} {title}</h3>
        <p className="font-black text-slate-300">Score: <span className={`text-3xl ${color}`}>{total}</span> / {max}</p>
      </div>
      <div className="space-y-8">{children}</div>
    </div>
  )
}

function ScoreButtons({ label, val, max, onChange }) {
  const points = Array.from({ length: max + 1 }, (_, i) => i);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center px-1">
        <span className="text-xl font-black text-slate-800">{label}</span>
        <span className="text-xl font-black text-blue-600 bg-blue-50 px-4 py-1 rounded-xl">{val}점</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {points.map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`flex-1 min-w-[36px] h-11 rounded-lg font-black text-base transition-all border-2 ${
              val === p 
              ? 'bg-blue-600 border-blue-600 text-white shadow-md scale-105 z-10' 
              : 'bg-slate-50 border-slate-50 text-slate-400 hover:border-slate-200'
            }`}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}