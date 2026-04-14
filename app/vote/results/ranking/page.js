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
  
  const [hallOfFame, setHallOfFame] = useState([]) 
  
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      setLoading(true)
      
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
    
    const { data: presentations } = await supabase.from('presentations').select('*').eq('semester', targetSemester)
    const { data: scores } = await supabase.from('scores').select('*').eq('semester', targetSemester)

    if (presentations && scores) {
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

      const winCounts = {}; 
      
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

          if (bestMember && highestScore > 0) {
            winCounts[bestMember] = (winCounts[bestMember] || 0) + 1;
          }
        });
      }

      const topWinners = Object.keys(winCounts)
        .map(name => ({ name, count: winCounts[name] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 2);

      setHallOfFame(topWinners);
    }
    setLoading(false)
  }

  return (
    <div className="bg-slate-50 min-h-screen text-slate-900 font-sans pb-32">
      
      {/* 🌟 투표 전용 가로형 탭 네비게이션 */}
      <header className="border-b border-slate-300 bg-slate-50 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto flex items-end px-6 pt-4 overflow-x-auto no-scrollbar">
          <Link href="/home" className="pb-4 pr-6 text-sm font-extrabold text-slate-400 hover:text-teal-800 transition-colors flex items-center shrink-0">
            HOME
          </Link>
          <div className="w-px h-4 bg-slate-300 mx-2 mb-4 shrink-0"></div>
          <Link href="/vote/score" className="pb-4 px-6 text-sm font-semibold text-slate-400 hover:text-slate-800 transition-colors shrink-0">
            발표 채점 📝
          </Link>
          <Link href="/vote/feedback" className="pb-4 px-6 text-sm font-semibold text-slate-400 hover:text-slate-800 transition-colors shrink-0">
            임시저장 피드백 ✍️
          </Link>
          <Link href="/vote/results/my" className="pb-4 px-6 text-sm font-semibold text-slate-400 hover:text-slate-800 transition-colors shrink-0">
            결과 확인 📊
          </Link>
          <Link href="/vote/results/arxiv" className="pb-4 px-6 text-sm font-semibold text-slate-400 hover:text-slate-800 transition-colors shrink-0">
            피드백 확인 💬
          </Link>
          <Link href="/vote/results/ranking" className="pb-4 px-6 text-sm font-extrabold text-teal-800 border-b-[3px] border-teal-800 transition-colors shrink-0">
            베스트 프레젠터 🏆
          </Link>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-6 mt-12">
        
        {/* 🌟 헤더 (중앙 정렬 타이틀 + 박스 완전 제거) */}
        <header className="w-full flex flex-col items-center mb-16">
          <div className="w-full flex justify-end items-center mb-6">
            <div className="flex items-center gap-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Target Semester:</label>
              <select 
                value={selectedSemester} 
                onChange={(e) => setSelectedSemester(e.target.value)}
                className="bg-transparent font-black text-sm outline-none cursor-pointer text-teal-800 border-b-2 border-teal-800 pb-1"
              >
                {semesters.map(s => <option key={s} value={s}>{s} 학기</option>)}
              </select>
            </div>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-extrabold uppercase tracking-tight text-teal-900 mb-12 text-center">BEST PRESENTERS</h1>
          
          <div className="w-full border-y-2 border-teal-800 py-10 flex flex-col items-center">
            <span className="text-xs font-extrabold text-teal-700 uppercase tracking-widest mb-6">Select Week</span>
            
            <div className="flex flex-wrap justify-center gap-4 md:gap-6 mb-2 w-full max-w-4xl">
              {Array.from({ length: 12 }, (_, i) => i + 1).map(w => (
                <button 
                  key={w} 
                  onClick={() => setRankingWeek(w)} 
                  className={`pb-1 text-base md:text-lg font-black transition-all ${rankingWeek === w ? 'text-teal-800 border-b-[3px] border-teal-800 scale-110' : 'text-slate-400 border-b-[3px] border-transparent hover:text-slate-700 hover:scale-105'}`}
                >
                  W{w}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* 🌟 동적 정렬 랭킹 리스트 (클러스터 개수에 맞춰 스마트하게 꽉 채우기) */}
        <div className={`w-full grid gap-12 items-start mb-20 ${
          clusterRankings.length === 1 ? 'grid-cols-1 max-w-3xl mx-auto' : 
          clusterRankings.length === 2 ? 'grid-cols-1 md:grid-cols-2 max-w-6xl mx-auto' : 
          'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 w-full'
        }`}>
          {loading ? (
            <div className="col-span-full py-20 text-center text-slate-400 font-bold uppercase tracking-widest">랭킹 데이터 분석 중... 🔄</div>
          ) : clusterRankings.length > 0 ? (
            clusterRankings.map((cluster) => (
              <div key={cluster.clusterId} className="border-t-[3px] border-teal-800 pt-6">
                <div className="text-center border-b border-slate-300 pb-4 mb-4">
                  <h3 className="text-xs font-black text-teal-700 uppercase tracking-[0.2em] mb-2">Score Cluster #{cluster.clusterId}</h3>
                  <p className="text-sm font-extrabold text-slate-800 truncate tracking-tight">{weekTopic}</p>
                </div>
                
                <div className="space-y-0">
                  {cluster.ranks.map((r, idx) => (
                    <div key={r.name} className={`flex items-center justify-between py-4 border-b border-slate-200 last:border-0 ${idx === 0 ? 'bg-teal-50/50' : ''}`}>
                      <div className="flex items-center gap-4 px-2">
                        <span className="text-xl">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</span>
                        <div>
                          <p className={`font-extrabold text-base ${idx === 0 ? 'text-teal-900' : 'text-slate-800'}`}>{r.name} {idx === 0 && '👑'}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{idx === 0 ? 'Best Presenter' : `Top ${idx + 1}`}</p>
                        </div>
                      </div>
                      <div className="text-right px-2">
                        <p className={`text-xl font-black ${idx === 0 ? 'text-teal-700' : 'text-slate-700'}`}>{r.score}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Avg Score</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full py-20 text-center text-slate-400 font-bold uppercase tracking-widest border-y border-slate-200">표시할 랭킹 데이터가 없습니다. 🧐</div>
          )}
        </div>

        {/* 🌟 하단 어워드 섹션 (박스/그라데이션 제거, 심플한 선 기반) */}
        <div className="w-full pt-12 border-t-[3px] border-slate-900 grid grid-cols-1 lg:grid-cols-2 gap-12">
          
          {/* 1. Most Improved Player (개선상) */}
          <div className="flex flex-col border-b lg:border-b-0 lg:border-r border-slate-300 pb-12 lg:pb-0 pr-0 lg:pr-12">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-10 flex items-center gap-2">● Most Improved Player</h3>
            
            {!loading && mostImproved && Number(mostImproved.diff) > 0 ? (
              <div className="flex justify-between items-end border-b border-slate-200 pb-6">
                <div>
                  <p className="text-4xl font-extrabold mb-2 text-teal-800">{mostImproved.name} <span className="text-lg opacity-60 text-slate-500">님</span></p>
                  <p className="text-xs text-slate-500 font-bold">전주 대비 점수가 가장 크게 상승했습니다.</p>
                </div>
                <div className="text-right">
                  <p className="text-5xl font-black text-teal-600">+{mostImproved.diff}</p>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mt-2">Growth</p>
                </div>
              </div>
            ) : (
              <p className="py-10 text-slate-400 font-bold text-sm text-center border-y border-slate-200">비교할 과거 데이터가 충분하지 않습니다.</p>
            )}
          </div>

          {/* 2. Hall of Fame (명예의 전당) */}
          <div className="flex flex-col pl-0 lg:pl-4">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-10 flex items-center gap-2">● Hall of Fame ({selectedSemester} 학기)</h3>
            
            {!loading && hallOfFame.length > 0 ? (
              <div className="space-y-0 border-t border-slate-200">
                {hallOfFame.map((hero, idx) => (
                  <div key={hero.name} className="flex justify-between items-center py-5 border-b border-slate-200">
                    <div>
                      <p className={`text-2xl font-extrabold ${idx === 0 ? 'text-teal-800' : 'text-slate-700'}`}>{hero.name} <span className="text-lg opacity-80 ml-1">{idx === 0 ? '🏆' : '⭐'}</span></p>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1.5">{idx === 0 ? '학기 최다 1등' : '2위'}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-4xl font-black ${idx === 0 ? 'text-teal-700' : 'text-slate-600'}`}>{hero.count}<span className="text-sm text-slate-400 ml-1">회</span></p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-10 text-slate-400 font-bold text-sm text-center border-y border-slate-200">아직 1등 기록이 없습니다.</p>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}