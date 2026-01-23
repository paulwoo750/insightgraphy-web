'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function RankingPage() {
  const [rankingWeek, setRankingWeek] = useState(1)
  const [topRankers, setTopRankers] = useState([])
  const [weekTopic, setWeekTopic] = useState('') 
  const [mostImproved, setMostImproved] = useState(null)
  const [loading, setLoading] = useState(true)

  // 1. 초기화: 관리자가 가장 최근에 등록한 발표 데이터의 주차 감지
  useEffect(() => {
    const init = async () => {
      setLoading(true)
      
      // 관리자 모드(presentations 테이블)에서 가장 마지막에 등록된 데이터 조회
      const { data: latestPresentation } = await supabase
        .from('presentations')
        .select('week')
        .order('created_at', { ascending: false }) // 생성일 기준 최신순
        .limit(1);

      if (latestPresentation && latestPresentation.length > 0) {
        const latestWeek = latestPresentation[0].week;
        setRankingWeek(latestWeek);
      } else {
        // 등록된 발표 정보가 전혀 없을 경우 1주차 로드
        fetchRankingData(1);
      }
    }
    init()
  }, [])

  // 주차 변경 시마다 데이터 다시 로드
  useEffect(() => {
    if (rankingWeek) fetchRankingData(rankingWeek);
  }, [rankingWeek])

  const fetchRankingData = async (targetWeek = rankingWeek) => {
    setLoading(true)
    const { data: presentations } = await supabase.from('presentations').select('*')
    const { data: scores } = await supabase.from('scores').select('*')

    if (presentations && scores) {
      // 해당 주차 주제 가져오기
      const currentWeekP = presentations.find(p => p.week === targetWeek)
      setWeekTopic(currentWeekP ? currentWeekP.topic : '등록된 주제 없음')

      const getRankData = (weekNum) => {
        const weekPs = presentations.filter(p => p.week === weekNum)
        return weekPs.map(p => {
          const pScores = scores.filter(s => s.presentation_id === p.id)
          const avg = pScores.length > 0 
            ? (pScores.reduce((a, b) => a + (b.total_score || (b.insight + b.graphic + b.delivery + (b.complementarity || 0))), 0) / pScores.length).toFixed(2)
            : 0
          return { name: p.presenter_name, score: Number(avg) }
        }).sort((a, b) => b.score - a.score)
      }

      const curRanking = getRankData(targetWeek)
      setTopRankers(curRanking.slice(0, 3))

      const prevRanking = getRankData(targetWeek - 1)
      if (prevRanking.length > 0) {
        const improvements = curRanking.map(curr => {
          const prev = prevRanking.find(p => p.name === curr.name)
          return prev && prev.score > 0 ? { name: curr.name, diff: (curr.score - prev.score).toFixed(2) } : null
        }).filter(Boolean).sort((a, b) => b.diff - a.diff)
        setMostImproved(improvements[0])
      } else { setMostImproved(null) }
    }
    setLoading(false)
  }

  return (
    <div className="p-8 bg-slate-50 min-h-screen text-black font-sans flex flex-col items-center">
      <header className="max-w-2xl w-full mb-8 text-center">
        <Link href="/home" className="text-blue-600 text-[10px] font-black hover:underline uppercase tracking-widest block mb-4">← Back to Home</Link>
        <h1 className="text-5xl font-black text-slate-800 tracking-tighter uppercase mb-10">Results</h1>
        
        {/* 주차 선택 박스 그리드 */}
        <div className="flex flex-col gap-4 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
          <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Select Week</span>
          <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(w => (
              <button
                key={w}
                onClick={() => setRankingWeek(w)}
                className={`h-10 rounded-xl font-black text-xs transition-all ${
                  rankingWeek === w 
                  ? 'bg-blue-600 text-white shadow-md scale-110' 
                  : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="max-w-2xl w-full space-y-6 animate-in fade-in duration-500">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-50">
          <div className="text-center mb-10">
            <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] mb-2">Best Presenters of Week {rankingWeek}</h3>
            <p className="text-xl font-black text-blue-600 uppercase tracking-tight">{weekTopic}</p>
          </div>
          
          <div className="space-y-4">
            {loading ? (
               <div className="py-20 text-center text-slate-400 font-bold">데이터 분석 중... 🔄</div>
            ) : topRankers.length > 0 ? topRankers.map((r, idx) => (
              <div key={r.name} className={`flex items-center justify-between p-6 rounded-3xl transition-all ${idx === 0 ? 'bg-yellow-50 border-2 border-yellow-100' : 'bg-slate-50'}`}>
                <div className="flex items-center gap-5">
                  <span className="text-3xl">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</span>
                  <div>
                    <p className="font-black text-xl text-black">
                      {r.name} {idx === 0 && '👑'}
                    </p>
                    <p className="text-[10px] text-slate-400 font-black uppercase">Top {idx + 1}</p>
                  </div>
                </div>
                <p className="text-2xl font-black text-black">{r.score}</p>
              </div>
            )) : (
              <div className="py-20 text-center">
                <p className="text-slate-300 font-bold">데이터가 아직 없습니다. 🧐</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-slate-900 p-8 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
            <div className="absolute top-[-10px] right-[-10px] text-7xl opacity-10">🚀</div>
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-6">Most Improved Player</h3>
            
            {!loading && mostImproved && Number(mostImproved.diff) > 0 ? (
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-3xl font-black mb-2 text-white">{mostImproved.name} 님!</p>
                  <p className="text-xs text-slate-400 font-bold">지난주보다 점수가 비약적으로 상승했어요.</p>
                </div>
                <div className="text-right">
                  <p className="text-4xl font-black text-green-400">+{mostImproved.diff}</p>
                  <p className="text-[10px] font-black uppercase text-slate-500 mt-1">Growth</p>
                </div>
              </div>
            ) : (
              <p className="text-center py-4 text-slate-500 font-bold text-sm">비교할 데이터가 부족합니다. 🐢</p>
            )}
        </div>
      </div>
      
      <footer className="mt-12 text-center">
        <p className="opacity-5 font-black text-[10px] tracking-[1em] uppercase">InsightGraphy</p>
      </footer>
    </div>
  )
}