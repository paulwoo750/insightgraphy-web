'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ResultsPage() {
  const [view, setView] = useState('hub') // 'hub', 'my', 'ranking'
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // 데이터 상태
  const [myWeeklyTrends, setMyWeeklyTrends] = useState([])
  const [myCurrentWeek, setMyCurrentWeek] = useState(null)
  const [topRankers, setTopRankers] = useState([])
  const [mostImproved, setMostImproved] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setUser(session.user)
      const userName = session.user.user_metadata.name

      // 1. 전체 발표 및 점수 데이터 가져오기
      const { data: presentations } = await supabase.from('presentations').select('*')
      const { data: scores } = await supabase.from('scores').select('*')

      if (!presentations || !scores) {
        setLoading(false)
        return
      }

      // --- [내 성적 계산 로직] ---
      const myPresentations = presentations.filter(p => p.presenter_name === userName)
      const trends = [1, 2, 3, 4, 5, 6, 7, 8].map(w => {
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
      setMyCurrentWeek(trends.filter(t => t.insight > 0).pop()) // 가장 최근 성적

      // --- [랭킹 및 상승폭 계산 로직] ---
      const currentWeekNum = Math.max(...presentations.map(p => p.week))
      
      const getRankings = (weekNum) => {
        const weekPs = presentations.filter(p => p.week === weekNum)
        return weekPs.map(p => {
          const pScores = scores.filter(s => s.presentation_id === p.id)
          const avg = pScores.length > 0 
            ? (pScores.reduce((a, b) => a + (b.insight + b.graphic + b.delivery), 0) / (pScores.length * 3)).toFixed(2)
            : 0
          return { name: p.presenter_name, score: Number(avg) }
        }).sort((a, b) => b.score - a.score)
      }

      const curRanking = getRankings(currentWeekNum)
      const prevRanking = getRankings(currentWeekNum - 1)

      setTopRankers(curRanking.slice(0, 3))

      // 상승폭 계산 (이번주 점수 - 지난주 점수)
      if (prevRanking.length > 0) {
        const improvements = curRanking.map(curr => {
          const prev = prevRanking.find(p => p.name === curr.name)
          return prev ? { name: curr.name, diff: (curr.score - prev.score).toFixed(2) } : null
        }).filter(Boolean).sort((a, b) => b.diff - a.diff)
        setMostImproved(improvements[0])
      }

      setLoading(false)
    }
    fetchData()
  }, [])

  if (loading) return <div className="p-8 text-center font-bold">인사이트 분석 중... 📊</div>

  return (
    <div className="p-8 bg-slate-50 min-h-screen text-slate-900 font-sans">
      <header className="max-w-2xl mx-auto mb-10 text-center">
        <Link href="/home" className="text-blue-600 text-xs font-bold hover:underline">← 홈으로 가기</Link>
        <h1 className="text-4xl font-black mt-4 text-slate-800 tracking-tight">VOTE RESULTS 🏆</h1>
      </header>

      <div className="max-w-2xl mx-auto">
        {/* --- 1. 결과 홈화면 (HUB) --- */}
        {view === 'hub' && (
          <div className="grid grid-cols-1 gap-6">
            <button onClick={() => setView('my')} className="bg-white p-10 rounded-[2.5rem] shadow-sm border-2 border-transparent hover:border-blue-500 transition-all text-left group">
              <span className="text-4xl mb-4 block group-hover:scale-110 transition-transform">📈</span>
              <h2 className="text-2xl font-black mb-2">내 성적 확인하기</h2>
              <p className="text-slate-400 text-sm">나의 주차별 성장 곡선과 이번 주 점수를 확인하세요.</p>
            </button>
            <button onClick={() => setView('ranking')} className="bg-white p-10 rounded-[2.5rem] shadow-sm border-2 border-transparent hover:border-yellow-400 transition-all text-left group">
              <span className="text-4xl mb-4 block group-hover:scale-110 transition-transform">👑</span>
              <h2 className="text-2xl font-black mb-2">이번 주 랭킹 확인하기</h2>
              <p className="text-slate-400 text-sm">명예의 전당! TOP 3와 이번 주 성장왕을 확인하세요.</p>
            </button>
          </div>
        )}

        {/* --- 2. 내 성적 확인하기 (MY) --- */}
        {view === 'my' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <button onClick={() => setView('hub')} className="text-xs font-bold text-slate-400 hover:text-slate-800">← 뒤로가기</button>
            
            {/* 이번 주 요약 */}
            <div className="bg-blue-600 p-8 rounded-[2.5rem] text-white shadow-xl shadow-blue-100">
              <h3 className="text-lg font-bold mb-4">이번 주 나의 기록 ✨</h3>
              {myCurrentWeek ? (
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div><p className="text-[10px] opacity-70 uppercase font-black">Insight</p><p className="text-2xl font-black">{myCurrentWeek.insight}</p></div>
                  <div><p className="text-[10px] opacity-70 uppercase font-black">Graphic</p><p className="text-2xl font-black">{myCurrentWeek.graphic}</p></div>
                  <div><p className="text-[10px] opacity-70 uppercase font-black">Delivery</p><p className="text-2xl font-black">{myCurrentWeek.delivery}</p></div>
                </div>
              ) : <p className="font-bold">이번 주 발표 기록이 없어요! 😅</p>}
            </div>

            {/* 주차별 트렌드 리스트 */}
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Weekly Performance Trend</h3>
              <div className="space-y-4">
                {myWeeklyTrends.map(t => (
                  <div key={t.week} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                    <span className="font-black text-slate-800">{t.week}주차</span>
                    <div className="flex gap-4 text-xs font-bold">
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

        {/* --- 3. 랭킹 확인하기 (RANKING) --- */}
        {view === 'ranking' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <button onClick={() => setView('hub')} className="text-xs font-bold text-slate-400 hover:text-slate-800">← 뒤로가기</button>

            {/* TOP 3 리더보드 */}
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
              <h3 className="text-center text-sm font-black text-slate-400 uppercase tracking-widest mb-8">This Week's Best Presenters</h3>
              <div className="space-y-6">
                {topRankers.map((r, idx) => (
                  <div key={r.name} className={`flex items-center justify-between p-6 rounded-3xl ${idx === 0 ? 'bg-yellow-50 border-2 border-yellow-200' : 'bg-slate-50'}`}>
                    <div className="flex items-center gap-4">
                      <span className="text-2xl">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</span>
                      <div>
                        <p className="font-black text-lg text-slate-800">{r.name}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Rank {idx + 1}</p>
                      </div>
                    </div>
                    <span className="text-xl font-black text-slate-800">{r.score}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 폭풍 성장상 */}
            <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl">
              <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest mb-4">Most Improved Player 🚀</h3>
              {mostImproved && Number(mostImproved.diff) > 0 ? (
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-2xl font-black mb-1">{mostImproved.name} 님!</p>
                    <p className="text-xs text-slate-400">지난주보다 무려 점수가 올랐어요.</p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-black text-green-400">+{mostImproved.diff}</p>
                    <p className="text-[10px] font-bold uppercase text-slate-500">Score Growth</p>
                  </div>
                </div>
              ) : <p className="font-bold text-slate-500 text-center py-4">아직 성장 기록을 비교할 수 없어요! 🐢</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}