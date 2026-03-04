'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function RankingPage() {
  const [rankingWeek, setRankingWeek] = useState(1)
  const [clusterRankings, setClusterRankings] = useState([]) 
  const [weekTopic, setWeekTopic] = useState('') 
  const [mostImproved, setMostImproved] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      const { data: latestPresentation } = await supabase
        .from('presentations')
        .select('week')
        .order('created_at', { ascending: false })
        .limit(1);

      if (latestPresentation && latestPresentation.length > 0) {
        setRankingWeek(latestPresentation[0].week);
      } else {
        fetchRankingData(1);
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (rankingWeek) fetchRankingData(rankingWeek);
  }, [rankingWeek])

  const fetchRankingData = async (targetWeek = rankingWeek) => {
    setLoading(true)
    const { data: presentations } = await supabase.from('presentations').select('*')
    const { data: scores } = await supabase.from('scores').select('*')

    if (presentations && scores) {
      const currentWeekPs = presentations.filter(p => p.week === targetWeek)
      setWeekTopic(currentWeekPs[0]?.topic || '등록된 주제 없음')

      // ★ 클러스터별 TOP 3만 추출하는 로직
      const getRankingsByCluster = (weekPs) => {
        const clusters = [...new Set(weekPs.map(p => p.cluster_id))].sort((a, b) => a - b);
        
        return clusters.map(cId => {
          const members = weekPs.filter(p => p.cluster_id === cId);
          const rankedMembers = members.map(m => {
            const pScores = scores.filter(s => s.presentation_id === m.id);
            const avg = pScores.length > 0 
              ? (pScores.reduce((a, b) => a + (b.total_score || 0), 0) / pScores.length).toFixed(2)
              : 0;
            return { name: m.presenter_name, score: Number(avg) };
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, 3); // ★ 여기서 상위 3명만 딱 자름!
          
          return { clusterId: cId, ranks: rankedMembers };
        });
      }

      setClusterRankings(getRankingsByCluster(currentWeekPs));

      const getAllAvg = (ps) => ps.map(p => {
        const pScores = scores.filter(s => s.presentation_id === p.id);
        const avg = pScores.length > 0 ? (pScores.reduce((a,b)=>a+(b.total_score||0), 0)/pScores.length).toFixed(2) : 0;
        return { name: p.presenter_name, score: Number(avg) };
      });

      const curAvgs = getAllAvg(currentWeekPs);
      const prevWeekPs = presentations.filter(p => p.week === targetWeek - 1);
      if (prevWeekPs.length > 0) {
        const prevAvgs = getAllAvg(prevWeekPs);
        const improvements = curAvgs.map(curr => {
          const prev = prevAvgs.find(p => p.name === curr.name);
          return prev && prev.score > 0 ? { name: curr.name, diff: (curr.score - prev.score).toFixed(2) } : null;
        }).filter(Boolean).sort((a, b) => b.diff - a.diff);
        setMostImproved(improvements[0]);
      } else { setMostImproved(null); }
    }
    setLoading(false)
  }

  return (
    <div className="p-8 bg-slate-50 min-h-screen text-black font-sans flex flex-col items-center">
      <header className="max-w-4xl w-full mb-8 text-center">
        <Link href="/vote/results" className="text-blue-600 text-[10px] font-black hover:underline uppercase tracking-widest block mb-4">← Back to Hub</Link>
        <h1 className="text-5xl font-black text-slate-800 tracking-tighter uppercase mb-10">Best Presenters</h1>
        
        <div className="flex flex-col gap-4 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 max-w-2xl mx-auto">
          <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest text-center">Select Week</span>
          <div className="grid grid-cols-6 md:grid-cols-12 gap-2">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(w => (
              <button key={w} onClick={() => setRankingWeek(w)} className={`h-10 rounded-xl font-black text-xs transition-all ${rankingWeek === w ? 'bg-blue-600 text-white shadow-md scale-110' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>{w}</button>
            ))}
          </div>
        </div>
      </header>

      {/* 중앙 정렬 Flex 레이아웃 */}
      <div className="w-full max-w-6xl flex flex-wrap justify-center gap-8 items-start">
        {loading ? (
          <div className="w-full py-20 text-center text-slate-400 font-bold italic">랭킹 데이터 분석 중... 🔄</div>
        ) : clusterRankings.length > 0 ? (
          clusterRankings.map((cluster) => (
            <div key={cluster.clusterId} className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-50 space-y-8 animate-in slide-in-from-bottom-4 duration-500 w-full md:w-[450px]">
              <div className="text-center border-b border-slate-50 pb-6">
                <h3 className="text-[11px] font-black text-purple-500 uppercase tracking-[0.3em] mb-2">Score Cluster #{cluster.clusterId}</h3>
                <p className="text-sm font-black text-slate-400 truncate tracking-tight">{weekTopic}</p>
              </div>
              
              <div className="space-y-4">
                {cluster.ranks.map((r, idx) => (
                  <div key={r.name} className={`flex items-center justify-between p-5 rounded-2xl transition-all ${idx === 0 ? 'bg-yellow-50 border border-yellow-100 shadow-sm' : 'bg-slate-50 border border-transparent'}`}>
                    <div className="flex items-center gap-4">
                      <span className="text-2xl">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</span>
                      <div>
                        <p className="font-black text-lg text-black">{r.name} {idx === 0 && '👑'}</p>
                        <p className="text-[9px] text-slate-400 font-black uppercase">{idx === 0 ? 'Best Presenter' : `Top ${idx + 1}`}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-black text-black">{r.score}</p>
                      <p className="text-[8px] font-black text-slate-300 uppercase">Avg Score</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="w-full py-20 text-center text-slate-300 font-bold">표시할 랭킹 데이터가 없습니다. 🧐</div>
        )}

        {/* Most Improved Player (하단 전체 너비) */}
        <div className="w-full mt-4 max-w-6xl">
            <div className="bg-slate-900 p-10 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden">
                <div className="absolute top-[-10px] right-[-10px] text-8xl opacity-10">🚀</div>
                <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-8 flex items-center gap-2">● Most Improved Player</h3>
                {!loading && mostImproved && Number(mostImproved.diff) > 0 ? (
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-4xl font-black mb-2 text-white">{mostImproved.name} 님!</p>
                      <p className="text-sm text-slate-400 font-bold">노력의 결실! 점수가 지난번보다 껑충 뛰었어요.</p>
                    </div>
                    <div className="text-right">
                      <p className="text-5xl font-black text-green-400">+{mostImproved.diff}</p>
                      <p className="text-[11px] font-black uppercase text-slate-500 mt-2">Growth</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-center py-6 text-slate-500 font-bold text-sm italic">비교 데이터가 충분하지 않습니다. 🐢</p>
                )}
            </div>
        </div>
      </div>
      
      <footer className="my-16 text-center opacity-10 font-black text-[10px] tracking-[1.5em] uppercase">InsightGraphy</footer>
    </div>
  )
}