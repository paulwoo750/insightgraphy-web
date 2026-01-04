'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ResultsPage() {
  const [view, setView] = useState('hub') 
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // 데이터 원본 상태
  const [allPresentations, setAllPresentations] = useState([])
  const [allScores, setAllScores] = useState([])

  // 내 성적 관련 상태
  const [myWeeklyTrends, setMyWeeklyTrends] = useState([])
  const [myCurrentWeek, setMyCurrentWeek] = useState(null)

  // 랭킹 관련 상태
  const [rankingWeek, setRankingWeek] = useState(1) // ★ 조회할 랭킹 주차
  const [topRankers, setTopRankers] = useState([])
  const [mostImproved, setMostImproved] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setUser(session.user)

      const { data: presentations } = await supabase.from('presentations').select('*')
      const { data: scores } = await supabase.from('scores').select('*')

      if (presentations && scores) {
        setAllPresentations(presentations)
        setAllScores(scores)
        
        // 내 성적 계산 (한 번만 실행)
        calculateMyStats(session.user.user_metadata.name, presentations, scores)
        
        // 초기 랭킹 주차 설정 (가장 최신 주차)
        const maxWeek = Math.max(...presentations.map(p => p.week), 1)
        setRankingWeek(maxWeek)
      }
      setLoading(false)
    }
    fetchData()
  }, [])

  // 주차(rankingWeek)가 바뀔 때마다 랭킹 다시 계산
  useEffect(() => {
    if (allPresentations.length > 0) {
      calculateRankings(rankingWeek)
    }
  }, [rankingWeek, allPresentations, allScores])

  // 내 성적 계산 함수
  const calculateMyStats = (userName, presentations, scores) => {
    const myPresentations = presentations.filter(p => p.presenter_name === userName)
    const trends = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(w => {
      const pInWeek = myPresentations.find(p => p.week === w)
      if (!pInWeek) return { week: w, insight: 0, graphic: 0, delivery: 0 }
      const pScores = scores.filter(s => s.presentation_id === pInWeek.id)
      if (pScores.length === 0) return { week: w, insight: 0, graphic: 0, delivery: 0 }
      return {
        week: w,
        insight: (pScores.reduce((a, b) => a + b.insight, 0) / pScores.length).toFixed(1),
        graphic: (pScores.reduce((a, b) => a + b.graphic, 0) / pScores.length).toFixed(1),
        delivery: (pScores.reduce((a, b) => a + b.delivery, 0) / pScores.length).toFixed(1)
      }
    })
    setMyWeeklyTrends(trends)
    setMyCurrentWeek(trends.filter(t => t.insight > 0).pop())
  }

  // 랭킹 계산 함수
  const calculateRankings = (targetWeek) => {
    const getRankData = (weekNum) => {
      const weekPs = allPresentations.filter(p => p.week === weekNum)
      return weekPs.map(p => {
        const pScores = allScores.filter(s => s.presentation_id === p.id)
        const avg = pScores.length > 0 
          ? (pScores.reduce((a, b) => a + (b.insight + b.graphic + b.delivery), 0) / (pScores.length * 3)).toFixed(2)
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
    } else {
      setMostImproved(null)
    }
  }

  if (loading) return <div className="p-8 text-center font-bold">인사이트 분석 중... 📊</div>

  return (
    <div className="p-8 bg-slate-50 min-h-screen text-slate-900 font-sans">
      <header className="max-w-2xl mx-auto mb-10 text-center">
        <Link href="/home" className="text-blue-600 text-xs font-black hover:underline tracking-widest uppercase">← Back to Home</Link>
        <h1 className="text-5xl font-black mt-4 text-slate-800 tracking-tighter">RESULTS</h1>
      </header>

      <div className="max-w-2xl mx-auto">
        {/* --- 1. 허브 화면 --- */}
        {view === 'hub' && (
          <div className="grid grid-cols-1 gap-6">
            <button onClick={() => setView('my')} className="bg-white p-12 rounded-[3rem] shadow-sm border-2 border-transparent hover:border-blue-500 transition-all text-left group">
              <span className="text-4xl mb-4 block group-hover:scale-110 transition-transform">📈</span>
              <h2 className="text-2xl font-black mb-2">내 성적 확인하기</h2>
              <p className="text-slate-400 text-sm font-bold">주차별 성장 곡선과 상세 점수 리포트</p>
            </button>
            <button onClick={() => setView('ranking')} className="bg-white p-12 rounded-[3rem] shadow-sm border-2 border-transparent hover:border-yellow-400 transition-all text-left group">
              <span className="text-4xl mb-4 block group-hover:scale-110 transition-transform">👑</span>
              <h2 className="text-2xl font-black mb-2">랭킹 확인하기</h2>
              <p className="text-slate-400 text-sm font-bold">주차별 TOP 3와 폭풍 성장왕 확인</p>
            </button>
          </div>
        )}

        {/* --- 2. 내 성적 (MY) --- */}
        {view === 'my' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <button onClick={() => setView('hub')} className="text-xs font-black text-slate-300 hover:text-slate-800 uppercase tracking-widest">← Back</button>
            <div className="bg-blue-600 p-10 rounded-[3rem] text-white shadow-2xl shadow-blue-100">
              <h3 className="text-sm font-black mb-6 opacity-70 uppercase tracking-widest">Recent Performance ✨</h3>
              {myCurrentWeek ? (
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div><p className="text-[10px] opacity-60 uppercase font-black mb-1">Insight</p><p className="text-3xl font-black">{myCurrentWeek.insight}</p></div>
                  <div><p className="text-[10px] opacity-60 uppercase font-black mb-1">Graphic</p><p className="text-3xl font-black">{myCurrentWeek.graphic}</p></div>
                  <div><p className="text-[10px] opacity-60 uppercase font-black mb-1">Delivery</p><p className="text-3xl font-black">{myCurrentWeek.delivery}</p></div>
                </div>
              ) : <p className="font-bold">아직 발표 기록이 없어요! 😅</p>}
            </div>
            <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
              <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] mb-8">Weekly Performance Trend</h3>
              <div className="space-y-3">
                {myWeeklyTrends.map(t => (
                  <div key={t.week} className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl">
                    <span className="font-black text-slate-800 text-sm">{t.week}주차</span>
                    <div className="flex gap-4 text-[10px] font-black uppercase">
                      <span className="text-blue-500">I: {t.insight}</span>
                      <span className="text-purple-500">G: {t.graphic}</span>
                      <span className="text-orange-500">D: {t.delivery}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* --- 3. 랭킹 확인 (RANKING) --- */}
        {view === 'ranking' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center">
              <button onClick={() => setView('hub')} className="text-xs font-black text-slate-300 hover:text-slate-800 uppercase tracking-widest">← Back</button>
              
              {/* ★ 주차 입력 칸 ★ */}
              <div className="flex items-center gap-3 bg-white px-5 py-2 rounded-2xl shadow-sm border border-slate-100">
                <span className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">Week Number</span>
                <input 
                  type="number" 
                  value={rankingWeek} 
                  onChange={(e) => setRankingWeek(Number(e.target.value))} 
                  className="w-12 text-center font-black text-blue-600 bg-slate-50 rounded-lg outline-none"
                />
              </div>
            </div>

            <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100">
              <h3 className="text-center text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] mb-10">
                Best Presenters of Week {rankingWeek}
              </h3>
              <div className="space-y-6">
                {topRankers.length > 0 ? topRankers.map((r, idx) => (
                  <div key={r.name} className={`flex items-center justify-between p-8 rounded-[2rem] ${idx === 0 ? 'bg-yellow-50 border-4 border-yellow-100' : 'bg-slate-50'}`}>
                    <div className="flex items-center gap-5">
                      <span className="text-3xl">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</span>
                      <div>
                        <p className="font-black text-xl text-slate-800">{r.name}</p>
                        <p className="text-[10px] text-slate-300 font-black uppercase mt-1">TOP {idx + 1}</p>
                      </div>
                    </div>
                    <span className="text-2xl font-black text-slate-800">{r.score}</span>
                  </div>
                )) : <p className="text-center py-10 font-bold text-slate-300 italic">이 주차에는 데이터가 없어요! 🧐</p>}
              </div>
            </div>

            {/* 폭풍 성장상 섹션 */}
            <div className="bg-slate-900 p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-[-20px] right-[-20px] text-8xl opacity-10">🚀</div>
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">Most Improved Player</h3>
              {mostImproved && Number(mostImproved.diff) > 0 ? (
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-3xl font-black mb-2">{mostImproved.name} 님!</p>
                    <p className="text-xs text-slate-400 font-bold">지난주보다 점수가 비약적으로 상승했어요.</p>
                  </div>
                  <div className="text-right">
                    <p className="text-4xl font-black text-green-400">+{mostImproved.diff}</p>
                    <p className="text-[10px] font-black uppercase text-slate-500 mt-1">Growth</p>
                  </div>
                </div>
              ) : <p className="font-bold text-slate-600 text-center py-4 italic">비교 가능한 성장 데이터가 없습니다. 🐢</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}