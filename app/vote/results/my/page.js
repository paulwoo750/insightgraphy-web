'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar,
  ComposedChart, Bar
} from 'recharts'

export default function MyAnalytics() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  
  const [allPresentations, setAllPresentations] = useState([])
  const [allScores, setAllScores] = useState([])
  const [allFiles, setAllFiles] = useState([])
  
  const [semesters, setSemesters] = useState([])
  const [selectedSemester, setSelectedSemester] = useState('all') 
  const [configSem, setConfigSem] = useState('') 

  const [categoryInfo, setCategoryInfo] = useState({ names: [], colorMap: {}, criteriaMap: {} })

  const [myWeeklyTrends, setMyWeeklyTrends] = useState([])
  const [myOverallAvg, setMyOverallAvg] = useState(null)
  const [clubOverallAvg, setClubOverallAvg] = useState({}) 
  const [clubAverages, setClubAverages] = useState([])
  const [awards, setAwards] = useState([])
  const [varianceData, setVarianceData] = useState([])
  const [submissionStats, setSubmissionStats] = useState({ total: 0, late: 0, miss: 0 })

  useEffect(() => {
    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setUser(session.user)
      const userName = session.user.user_metadata.name

      const [pRes, sRes, fRes, configRes, critRes] = await Promise.all([
        supabase.from('presentations').select('*'),
        supabase.from('scores').select('*'),
        supabase.from('files_metadata').select('*').eq('uploader', userName),
        supabase.from('pr_config').select('*').eq('key', 'current_semester').single(),
        supabase.from('pr_vote_criteria').select('*')
      ])

      const pData = pRes.data || []
      const sData = sRes.data || []
      const fData = fRes.data || []
      const adminCurrentSemester = configRes.data?.value 

      setAllPresentations(pData)
      setAllScores(sData)
      setAllFiles(fData)
      setConfigSem(adminCurrentSemester)

      // 🌟 동적 카테고리 정보 매핑 ('4. 종합' 카테고리만 정확히 필터링)
      const criteriaMap = {};
      const catNamesSet = new Set();
      (critRes.data || []).forEach(row => {
        criteriaMap[row.version] = row.criteria_data;
        row.criteria_data.forEach(cat => {
          // 🚨 오직 '4. 종합'이라는 이름을 가진 카테고리만 분석에서 제외!
          if (cat.title !== '4. 종합') {
            catNamesSet.add(cat.title);
          }
        });
      });
      const names = [...catNamesSet];
      
      // 차트용 딥 틸(Teal) 어울리는 색상 팔레트
      const catColors = ['#0f766e', '#0369a1', '#be185d', '#b45309', '#4338ca'];
      const colorMap = {};
      names.forEach((n, i) => colorMap[n] = catColors[i % catColors.length]);
      
      setCategoryInfo({ names, colorMap, criteriaMap });

      const sSems = sData.map(s => s.semester).filter(Boolean)
      const fSems = fData.map(f => f.semester).filter(Boolean)
      let uniqueSemesters = [...new Set([...sSems, ...fSems])]

      if (adminCurrentSemester && !uniqueSemesters.includes(adminCurrentSemester)) {
        uniqueSemesters.push(adminCurrentSemester)
      }
      uniqueSemesters = uniqueSemesters.sort().reverse()
      setSemesters(uniqueSemesters)

      if (adminCurrentSemester && uniqueSemesters.includes(adminCurrentSemester)) {
        setSelectedSemester(adminCurrentSemester) 
      } else if (uniqueSemesters.length > 0) {
        setSelectedSemester(uniqueSemesters[0])
      } else {
        setSelectedSemester('all') 
      }

      setLoading(false)
    }
    fetchData()
  }, [])

  useEffect(() => {
    const { names, criteriaMap } = categoryInfo;
    if (!user || allPresentations.length === 0 || names.length === 0) return
    const userName = user.user_metadata.name

    const currentScores = selectedSemester === 'all' 
      ? allScores 
      : allScores.filter(s => s.semester === selectedSemester)
      
    const currentFiles = selectedSemester === 'all'
      ? allFiles
      : allFiles.filter(f => f.semester === selectedSemester)

    const filteredPs = selectedSemester === 'all' 
      ? allPresentations 
      : allPresentations.filter(p => {
          const hasScoreInSem = currentScores.some(s => s.presentation_id === p.id)
          const isNewAndUnscored = !allScores.some(s => s.presentation_id === p.id)
          return hasScoreInSem || (isNewAndUnscored && selectedSemester === configSem)
        })

    const getCatScores = (scoreRecord) => {
      const v = scoreRecord.details?.version || 'v1';
      const rubric = criteriaMap[v] || [];
      const itemScores = scoreRecord.details?.scores || {};
      const res = {};
      names.forEach(n => res[n] = 0);
      
      rubric.forEach(cat => {
        // 필터링된 이름 배열(names)에 존재하는 항목만 합산
        if (names.includes(cat.title)) {
          let sum = 0;
          cat.items.forEach(item => sum += (itemScores[item.id] || 0));
          res[cat.title] = sum;
        }
      });
      return res;
    };

    const clubAvgs = {};
    names.forEach(n => clubAvgs[n] = 0);
    currentScores.forEach(s => {
        const cs = getCatScores(s);
        names.forEach(n => clubAvgs[n] += cs[n]);
    });
    if (currentScores.length > 0) {
        names.forEach(n => clubAvgs[n] = parseFloat((clubAvgs[n] / currentScores.length).toFixed(1)));
    }
    setClubOverallAvg(clubAvgs);

    const myPs = filteredPs.filter(p => p.presenter_name === userName)
    const winList = []
    const clubTrends = []
    const vData = []

    const trends = Array.from({ length: 12 }, (_, i) => i + 1).map(w => {
      const weekPs = filteredPs.filter(p => p.week === w)
      const weekScores = currentScores.filter(s => weekPs.some(p => p.id === s.presentation_id))
      
      const clubAvgTotal = weekScores.length > 0 
        ? parseFloat((weekScores.reduce((a, b) => a + (b.total_score || 0), 0) / weekScores.length).toFixed(1)) : 0
      clubTrends.push({ name: `${w}주`, clubTotal: clubAvgTotal })

      if (weekScores.length > 0) {
        const allTotals = weekScores.map(s => s.total_score || 0)
        vData.push({ name: `${w}주`, range: [Math.min(...allTotals), Math.max(...allTotals)], avg: clubAvgTotal })
      }

      const myWeekP = weekPs.find(p => p.presenter_name === userName)
      if (myWeekP) {
        const clusterPs = weekPs.filter(p => p.cluster_id === myWeekP.cluster_id)
        const clusterRankings = clusterPs.map(p => {
          const pS = currentScores.filter(s => s.presentation_id === p.id)
          const avg = pS.length > 0 ? (pS.reduce((a, b) => a + (b.total_score || 0), 0) / pS.length) : 0
          return { name: p.presenter_name, score: avg, topic: p.topic }
        }).sort((a, b) => b.score - a.score)

        if (clusterRankings.length > 0 && clusterRankings[0].name === userName && clusterRankings[0].score > 0) {
          winList.push({ week: w, semester: myWeekP.semester || selectedSemester, topic: myWeekP.topic })
        }

        const myWeekScores = currentScores.filter(s => s.presentation_id === myWeekP.id)
        const count = myWeekScores.length
        
        const weekCatScores = {};
        names.forEach(n => weekCatScores[n] = 0);
        
        if (count > 0) {
            myWeekScores.forEach(s => {
                const cs = getCatScores(s);
                names.forEach(n => weekCatScores[n] += cs[n]);
            });
            names.forEach(n => weekCatScores[n] = parseFloat((weekCatScores[n] / count).toFixed(1)));
        }

        return {
          name: `${w}주`, week: w,
          total: count > 0 ? parseFloat((myWeekScores.reduce((a, b) => a + (b.total_score || 0), 0) / count).toFixed(1)) : 0,
          ...weekCatScores
        }
      }
      return { name: `${w}주`, week: w, total: 0 }
    })

    setMyWeeklyTrends(trends)
    setClubAverages(clubTrends)
    setVarianceData(vData)
    setAwards(winList)

    const myAllScores = currentScores.filter(s => myPs.some(p => p.id === s.presentation_id))
    if (myAllScores.length > 0) {
      const c = myAllScores.length
      const myAvgs = { total: parseFloat((myAllScores.reduce((a,b)=>a+(b.total_score||0),0)/c).toFixed(1)), categories: {} };
      names.forEach(n => myAvgs.categories[n] = 0);
      
      myAllScores.forEach(s => {
          const cs = getCatScores(s);
          names.forEach(n => myAvgs.categories[n] += cs[n]);
      });
      names.forEach(n => myAvgs.categories[n] = parseFloat((myAvgs.categories[n]/c).toFixed(1)));
      
      setMyOverallAvg(myAvgs)
    } else { setMyOverallAvg(null) }

    setSubmissionStats({
      total: currentFiles.length,
      late: currentFiles.filter(f => f.is_late).length,
      miss: (myPs.length * 3) - currentFiles.length 
    })

  }, [allPresentations, allScores, allFiles, selectedSemester, configSem, user, categoryInfo])

  if (loading) return <div className="p-8 text-center font-black text-slate-400">분석 리포트 생성 중... 📈</div>

  const radarData = categoryInfo.names.map(name => ({
    subject: name,
    me: myOverallAvg?.categories[name] || 0,
    base: clubOverallAvg[name] || 0
  }));

  return (
    <div className="bg-slate-50 min-h-screen text-slate-900 font-sans pb-32">
      
      {/* 투표 전용 가로형 탭 네비게이션 */}
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
          <Link href="/vote/results/my" className="pb-4 px-6 text-sm font-extrabold text-teal-800 border-b-[3px] border-teal-800 transition-colors shrink-0">
            결과 확인 📊
          </Link>
          <Link href="/vote/results/arxiv" className="pb-4 px-6 text-sm font-semibold text-slate-400 hover:text-slate-800 transition-colors shrink-0">
            피드백 확인 💬
          </Link>
          <Link href="/vote/results/ranking" className="pb-4 px-6 text-sm font-semibold text-slate-400 hover:text-slate-800 transition-colors shrink-0">
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
                <option value="all">전체 누적 결과</option>
                {semesters.map(s => <option key={s} value={s}>{s} 학기</option>)}
              </select>
            </div>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-extrabold uppercase tracking-tight text-teal-900 mb-2">INDIVIDUAL REPORT</h1>
          {selectedSemester !== 'all' && <p className="text-[11px] font-black text-teal-600 mt-4 tracking-widest uppercase">● {selectedSemester} 학기 리포트 조회 중</p>}
        </header>

        <main className="w-full space-y-12">
          
          {/* 상단 3대장 (박스 제거, 굵은 선 기반) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            
            {/* Overall Summary */}
            <div className="border-t-[3px] border-teal-800 pt-6 flex flex-col h-[350px]">
              <h3 className="text-xs font-black mb-8 text-slate-500 uppercase tracking-widest">Overall Summary</h3>
              {myOverallAvg ? (
                <div className="flex-1 flex flex-col">
                  <div className="text-center mb-8 border-b border-slate-300 pb-8">
                    <p className="text-7xl font-black leading-none text-teal-800">{myOverallAvg.total}<span className="text-2xl text-slate-400 ml-2 font-bold">/ 105</span></p>
                  </div>
                  
                  <div className={`grid grid-cols-2 sm:grid-cols-${Math.min(categoryInfo.names.length, 4)} gap-4 pt-2`}>
                    {categoryInfo.names.map(catName => (
                      <div key={catName} className="text-center">
                        <p className="text-[10px] text-slate-500 font-bold mb-1 uppercase truncate tracking-wider">{catName}</p>
                        <p className="text-xl font-black" style={{ color: categoryInfo.colorMap[catName] }}>
                          {myOverallAvg.categories[catName]}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <p className="text-sm font-bold text-slate-400 text-center mt-20">평가 기록이 없습니다.</p>}
            </div>

            {/* Submission Status */}
            <div className="border-t-[3px] border-teal-800 pt-6 flex flex-col h-[350px]">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-10">Submission Status 📂</h3>
              <div className="space-y-6 flex-1 flex flex-col justify-center">
                <div className="flex justify-between items-end border-b border-slate-200 pb-4">
                  <p className="text-slate-600 font-bold text-xs uppercase tracking-wider">총 제출 과제</p>
                  <p className="text-3xl font-black text-teal-800">{submissionStats.total}<span className="text-sm text-slate-400 ml-1">건</span></p>
                </div>
                <div className="flex justify-between items-end border-b border-slate-200 pb-4">
                  <p className="text-slate-600 font-bold text-xs uppercase tracking-wider">지각 제출 (LATE)</p>
                  <p className="text-3xl font-black text-red-500">{submissionStats.late}<span className="text-sm text-slate-400 ml-1">건</span></p>
                </div>
                <div className="flex justify-between items-end border-b border-slate-200 pb-4">
                  <p className="text-slate-600 font-bold text-xs uppercase tracking-wider">누락 / 미제출</p>
                  <p className="text-3xl font-black text-slate-400">{submissionStats.miss > 0 ? submissionStats.miss : 0}<span className="text-sm text-slate-400 ml-1">건</span></p>
                </div>
              </div>
            </div>

            {/* Hall of Fame */}
            <div className="border-t-[3px] border-teal-800 pt-6 flex flex-col h-[350px]">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6">Hall of Fame 👑</h3>
              <div className="flex-1 overflow-y-auto pr-2 space-y-4 no-scrollbar">
                {awards.map((a, idx) => (
                  <div key={idx} className="border-b border-slate-200 pb-3">
                    <p className="text-[10px] font-black text-amber-600 mb-1 tracking-widest uppercase">{selectedSemester === 'all' && `[${a.semester}] `}{a.week}주차 CLUSTER BEST</p>
                    <p className="text-sm font-bold text-slate-800 truncate">{a.topic}</p>
                  </div>
                ))}
                {awards.length === 0 && <p className="text-slate-400 font-bold py-20 text-center text-xs uppercase tracking-widest">No awards yet</p>}
              </div>
              <p className="mt-4 font-black text-slate-400 text-[10px] text-right uppercase tracking-widest border-t border-slate-300 pt-4">Total: {awards.length}</p>
            </div>
          </div>

          {/* 차트 영역 (상자 제거, 선 위주) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 pt-8">
            <ChartCard title="Total Growth Trend">
              <LineChart data={myWeeklyTrends.filter(t => t.total > 0)} margin={{ right: 30, left: -10, top: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
                <XAxis dataKey="name" tick={{fontSize: 11, fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 105]} tick={{fontSize: 11}} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '4px', border: '1px solid #cbd5e1', boxShadow: 'none' }} />
                <Line type="monotone" dataKey="total" name="My Score" stroke="#0f766e" strokeWidth={4} dot={{r: 5, fill: '#0f766e'}} />
                <Line data={clubAverages.filter(c => c.clubTotal > 0)} type="monotone" dataKey="clubTotal" name="Club Avg" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ChartCard>

            <ChartCard title="Skill Balance Comparison">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke="#cbd5e1" />
                <PolarAngleAxis dataKey="subject" tick={{fontSize: 11, fontWeight: 'bold', fill: '#334155'}} />
                <Radar name="My Avg" dataKey="me" stroke="#0f766e" fill="#ccfbf1" fillOpacity={0.6} strokeWidth={2} />
                <Radar name="Club Base" dataKey="base" stroke="#94a3b8" fill="#f1f5f9" fillOpacity={0.4} />
                <Tooltip contentStyle={{ borderRadius: '4px', border: '1px solid #cbd5e1', boxShadow: 'none' }} />
              </RadarChart>
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <ChartCard title="Score Variance (Boxplot)">
              <ComposedChart data={varianceData} margin={{ right: 30, left: -10, top: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
                <XAxis dataKey="name" tick={{fontSize: 11, fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 105]} tick={{fontSize: 11}} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '4px', border: '1px solid #cbd5e1', boxShadow: 'none' }} />
                <Bar dataKey="range" fill="#e2e8f0" radius={[2, 2, 2, 2]} barSize={24} name="Weekly Range" />
                <Line dataKey="avg" stroke="#0f766e" strokeWidth={3} dot={{r: 4, fill: '#0f766e'}} name="Club Avg" />
              </ComposedChart>
            </ChartCard>

            <ChartCard title="Area Trend Analysis">
              <LineChart data={myWeeklyTrends.filter(t => t.total > 0)} margin={{ right: 30, left: -10, top: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
                <XAxis dataKey="name" tick={{fontSize: 11}} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 40]} tick={{fontSize: 11}} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '4px', border: '1px solid #cbd5e1', boxShadow: 'none' }} />
                <Legend iconType="circle" wrapperStyle={{fontSize: '11px', fontWeight: 'bold', paddingTop: '10px'}} />
                {categoryInfo.names.map((name) => (
                  <Line key={name} name={name} type="monotone" dataKey={name} stroke={categoryInfo.colorMap[name]} strokeWidth={3} dot={{r: 4}} />
                ))}
              </LineChart>
            </ChartCard>
          </div>

          {/* 주차별 상세 내역 (맨 아래에 있는 예외 박스 스타일) */}
          <div className="border-t-[3px] border-slate-900 pt-8 bg-white p-8 shadow-sm">
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-widest mb-8 border-b border-slate-200 pb-4">Weekly Detail History</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {myWeeklyTrends.map(t => (
                <div key={t.week} className={`flex flex-col p-6 transition-all border-t-[3px] bg-white shadow-sm border border-slate-100 ${t.total > 0 ? 'border-t-teal-700 hover:shadow-md' : 'border-t-slate-300 opacity-50 grayscale'}`}>
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-4">
                    <span className="font-extrabold text-slate-900 text-lg">{t.week}W</span>
                    <span className="text-lg font-black text-teal-800">{t.total > 0 ? `${t.total} pt` : '미발표'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    {categoryInfo.names.map(name => (
                      <div key={name} className="flex justify-between">
                        <span className="truncate pr-1">{name}</span> 
                        <span className="text-slate-800">{t[name] || 0}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          
        </main>
      </div>
    </div>
  )
}

// 🌟 차트 컨테이너 (박스 제거, 상단 선으로 구분)
function ChartCard({ title, children }) {
  return (
    <div className="border-t-[3px] border-teal-800 pt-6 pb-8 h-[450px] flex flex-col">
      <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-6">{title}</h3>
      <div className="flex-1 w-full">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  )
}