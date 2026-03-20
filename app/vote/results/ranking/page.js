'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function RankingPage() {
  const [semesters, setSemesters] = useState([])
  const [selectedSemester, setSelectedSemester] = useState('') 
  const [rankingWeek, setRankingWeek] = useState(1)
  
  const [clusterRankings, setClusterRankings] = useState([]) 
  const [weekTopic, setWeekTopic] = useState('') 
  const [mostImproved, setMostImproved] = useState(null)
  
  // 🌟 명예의 전당 데이터 상태
  const [hallOfFame, setHallOfFame] = useState([]) 
  
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      
      // 1. 현재 학기 설정 및 학기 목록 가져오기
      const [configRes, pRes] = await Promise.all([
        supabase.from('pr_config').select('*').eq('key', 'current_semester').single(),
        supabase.from('presentations').select('semester').neq('semester', null)
      ])

      const adminCurrentSemester = configRes.data?.value
      const pData = pRes.data || []
      
      let uniqueSemesters = [...new Set(pData.map(p => p.semester))]
      if (adminCurrentSemester && !uniqueSemesters.includes(adminCurrentSemester)) {
        uniqueSemesters.push(adminCurrentSemester)
      }
      uniqueSemesters = uniqueSemesters.sort().reverse()
      setSemesters(uniqueSemesters)

      const initialSem = (adminCurrentSemester && uniqueSemesters.includes(adminCurrentSemester)) 
        ? adminCurrentSemester 
        : uniqueSemesters.length > 0 ? uniqueSemesters[0] : ''
      
      setSelectedSemester(initialSem)

      // 2. 가장 최근 주차 가져오기 (초기 렌더링용)
      if (initialSem) {
        const { data: latestPresentation } = await supabase
          .from('presentations')
          .select('week')
          .eq('semester', initialSem)
          .order('created_at', { ascending: false })
          .limit(1);

        if (latestPresentation && latestPresentation.length > 0) {
          setRankingWeek(latestPresentation[0].week);
        }
      }
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (selectedSemester) fetchRankingData(rankingWeek, selectedSemester);
  }, [rankingWeek, selectedSemester])

  const fetchRankingData = async (targetWeek, targetSemester) => {
    setLoading(true)
    
    // 🌟 현재 선택된 '학기'의 전체 데이터만 가져오기
    const { data: presentations } = await supabase.from('presentations').select('*').eq('semester', targetSemester)
    const { data: scores } = await supabase.from('scores').select('*').eq('semester', targetSemester)

    if (presentations && scores) {
      // ----------------------------------------------------
      // [1] 주차별 랭킹 및 Most Improved 로직 (기존 유지)
      // ----------------------------------------------------
      const currentWeekPs = presentations.filter(p => p.week === targetWeek)
      setWeekTopic(currentWeekPs[0]?.topic || '등록된 주제 없음')

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
          .slice(0, 3); 
          
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

      // ----------------------------------------------------
      // [2] 🌟 명예의 전당 (Hall of Fame) 계산 로직 추가
      // ----------------------------------------------------
      const winCounts = {}; // { '우제윤': 3, '홍길동': 1 }
      
      // 1~12주차를 모두 돌면서 각 클러스터의 1등 찾기
      for (let w = 1; w <= 12; w++) {
        const wPs = presentations.filter(p => p.week === w);
        if (wPs.length === 0) continue;
        
        const wClusters = [...new Set(wPs.map(p => p.cluster_id))];
        wClusters.forEach(cId => {
          const cMembers = wPs.filter(p => p.cluster_id === cId);
          let bestMember = null;
          let highestScore = 0;

          cMembers.forEach(m => {
            const mScores = scores.filter(s => s.presentation_id === m.id);
            const mAvg = mScores.length > 0 ? (mScores.reduce((a, b) => a + (b.total_score || 0), 0) / mScores.length) : 0;
            
            if (mAvg > highestScore) {
              highestScore = mAvg;
              bestMember = m.presenter_name;
            }
          });

          // 1등(점수가 0보다 큰 경우) 카운트 증가
          if (bestMember && highestScore > 0) {
            winCounts[bestMember] = (winCounts[bestMember] || 0) + 1;
          }
        });
      }

      // 카운트 객체를 배열로 변환하고 내림차순 정렬 후 상위 2명 추출
      const topWinners = Object.keys(winCounts)
        .map(name => ({ name, count: winCounts[name] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 2);

      setHallOfFame(topWinners);
    }
    setLoading(false)
  }

  return (
    <div className="p-8 bg-slate-50 min-h-screen text-black font-sans flex flex-col items-center pb-32">
      <header className="max-w-6xl w-full mb-8 text-center flex flex-col items-center">
        <Link href="/vote" className="text-blue-600 text-xs font-black hover:underline uppercase tracking-widest block mb-6">← Back to Vote Hub</Link>
        <h1 className="text-5xl font-black text-slate-800 tracking-tighter uppercase mb-8">Best Presenters</h1>
        
        {/* 🌟 학기 필터 드롭다운 */}
        <div className="flex items-center justify-center gap-3 bg-white p-2 px-6 rounded-2xl shadow-sm border border-slate-200 mb-8 w-fit">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Target Semester:</label>
          <select 
            value={selectedSemester} 
            onChange={(e) => setSelectedSemester(e.target.value)}
            className="bg-transparent font-black text-sm outline-none cursor-pointer text-blue-600"
          >
            {semesters.map(s => <option key={s} value={s}>{s} 학기</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-4 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 w-full max-w-3xl mx-auto">
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

        {/* 🌟 1. Most Improved Player (개선상) */}
        <div className="w-full mt-4 max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          <div className="bg-slate-900 p-10 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden flex flex-col justify-center h-full min-h-[220px]">
            <div className="absolute top-[-10px] right-[-10px] text-8xl opacity-10">🚀</div>
            <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-8 flex items-center gap-2 relative z-10">● Most Improved Player</h3>
            {!loading && mostImproved && Number(mostImproved.diff) > 0 ? (
              <div className="flex justify-between items-end relative z-10">
                <div>
                  <p className="text-4xl font-black mb-2 text-white">{mostImproved.name} <span className="text-xl opacity-60">님</span></p>
                  <p className="text-sm text-slate-400 font-bold">노력의 결실! 점수가 크게 올랐어요.</p>
                </div>
                <div className="text-right">
                  <p className="text-5xl font-black text-green-400">+{mostImproved.diff}</p>
                  <p className="text-[11px] font-black uppercase text-slate-500 mt-2">Growth</p>
                </div>
              </div>
            ) : (
              <p className="text-center py-6 text-slate-500 font-bold text-sm italic relative z-10">비교 데이터가 충분하지 않습니다. 🐢</p>
            )}
          </div>

          {/* 🌟 2. Hall of Fame (명예의 전당) */}
          <div className="bg-gradient-to-br from-yellow-400 to-yellow-600 p-10 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden flex flex-col justify-center h-full min-h-[220px]">
            <div className="absolute top-[-10px] right-[-10px] text-8xl opacity-20 mix-blend-overlay">👑</div>
            <h3 className="text-[10px] font-black text-yellow-900 uppercase tracking-[0.2em] mb-8 flex items-center gap-2 relative z-10">● Hall of Fame (이번 학기)</h3>
            
            {!loading && hallOfFame.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 relative z-10 h-full items-end">
                {hallOfFame.map((hero, idx) => (
                  <div key={hero.name} className="bg-white/20 p-5 rounded-3xl backdrop-blur-sm border border-white/30 flex justify-between items-center">
                    <div>
                      <p className="text-2xl font-black text-white">{hero.name} <span className="text-lg opacity-80">{idx === 0 ? '🏆' : '⭐'}</span></p>
                      <p className="text-[10px] font-black text-yellow-900 uppercase mt-1">{idx === 0 ? '최다 1등' : '2위'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-4xl font-black text-white">{hero.count}<span className="text-lg opacity-80 ml-1">회</span></p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center py-6 text-yellow-900/50 font-bold text-sm italic relative z-10">아직 1등 기록이 없습니다. 🏆</p>
            )}
          </div>

        </div>
      </div>
      
      <footer className="my-16 text-center opacity-10 font-black text-[10px] tracking-[1.5em] uppercase">InsightGraphy</footer>
    </div>
  )
}