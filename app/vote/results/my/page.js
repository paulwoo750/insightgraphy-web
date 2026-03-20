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

  // 🌟 동적 카테고리 정보 저장용 상태
  const [categoryInfo, setCategoryInfo] = useState({ names: [], colorMap: {}, criteriaMap: {} })

  const [myWeeklyTrends, setMyWeeklyTrends] = useState([])
  const [myOverallAvg, setMyOverallAvg] = useState(null)
  const [clubOverallAvg, setClubOverallAvg] = useState({}) // 레이더 차트 Base용 클럽 전체 평균
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

      // 🌟 pr_vote_criteria(채점 기준표) 추가 로드
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

      // 🌟 동적 카테고리 정보 매핑
      const criteriaMap = {};
      const catNamesSet = new Set();
      (critRes.data || []).forEach(row => {
        criteriaMap[row.version] = row.criteria_data;
        row.criteria_data.forEach(cat => catNamesSet.add(cat.title)); // 카테고리 이름(title) 수집
      });
      const names = [...catNamesSet];
      
      // 차트에 쓰일 색상 팔레트 자동 할당
      const catColors = ['#3b82f6', '#a855f7', '#ec4899', '#10b981', '#f59e0b', '#6366f1'];
      const colorMap = {};
      names.forEach((n, i) => colorMap[n] = catColors[i % catColors.length]);
      
      setCategoryInfo({ names, colorMap, criteriaMap });

      // 학기 목록 추출 및 기본값 셋업
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

    // 🌟 동적 점수 역추산 헬퍼 함수
    const getCatScores = (scoreRecord) => {
      const v = scoreRecord.details?.version || 'v1';
      const rubric = criteriaMap[v] || [];
      const itemScores = scoreRecord.details?.scores || {};
      const res = {};
      names.forEach(n => res[n] = 0);
      
      rubric.forEach(cat => {
        let sum = 0;
        cat.items.forEach(item => sum += (itemScores[item.id] || 0));
        res[cat.title] = sum;
      });
      return res;
    };

    // 🌟 1. 레이더 차트 Base용 클럽 전체 평균 계산
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

    // 🌟 2. 주차별 트렌드 및 데이터 계산
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
          ...weekCatScores // 동적 카테고리 데이터 병합
        }
      }
      return { name: `${w}주`, week: w, total: 0 }
    })

    setMyWeeklyTrends(trends)
    setClubAverages(clubTrends)
    setVarianceData(vData)
    setAwards(winList)

    // 🌟 3. 내 전체 평균 요약 (동적 카테고리)
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

  if (loading) return <div className="p-8 text-center font-black text-black">분석 리포트 생성 중... 📈</div>

  // 🌟 레이더 차트 동적 데이터 생성
  const radarData = categoryInfo.names.map(name => ({
    subject: name,
    me: myOverallAvg?.categories[name] || 0,
    base: clubOverallAvg[name] || 0
  }));

  return (
    <div className="p-6 bg-slate-50 min-h-screen text-black font-sans flex flex-col items-center pb-32">
      
      <header className="max-w-[1400px] w-full mb-8 flex flex-col md:flex-row md:justify-between md:items-end border-b-2 border-slate-200 pb-6 gap-6">
        <div>
          <Link href="/vote" className="font-black text-xs uppercase tracking-widest hover:underline text-blue-600 mb-2 block">← Back to Vote Hub</Link>
          <h1 className="text-5xl font-black uppercase tracking-tighter text-black">Individual Analytics</h1>
          {selectedSemester !== 'all' && <p className="text-xs font-black text-emerald-500 mt-2">● 현재 {selectedSemester} 학기 리포트를 보고 있습니다.</p>}
        </div>
        
        <div className="flex items-center gap-3 bg-white p-2 px-4 rounded-2xl shadow-sm border border-slate-200">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Target Semester:</label>
          <select 
            value={selectedSemester} 
            onChange={(e) => setSelectedSemester(e.target.value)}
            className="bg-transparent font-black text-sm outline-none cursor-pointer text-blue-600"
          >
            <option value="all">전체 누적 결과</option>
            {semesters.map(s => <option key={s} value={s}>{s} 학기</option>)}
          </select>
        </div>
      </header>

      <main className="max-w-[1400px] w-full space-y-6">
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Summary Box */}
          <div className="bg-slate-900 p-10 rounded-[3rem] text-white shadow-2xl flex flex-col justify-center h-[380px]">
            <h3 className="text-sm font-black mb-8 opacity-40 uppercase tracking-[0.4em]">Overall Summary</h3>
            {myOverallAvg ? (
              <div className="space-y-10 text-center">
                <p className="text-[80px] font-black leading-none text-white">{myOverallAvg.total}<span className="text-4xl opacity-20 ml-4">/ 105</span></p>
                
                {/* 🌟 동적 카테고리 요약 렌더링 */}
                <div className={`grid grid-cols-2 sm:grid-cols-${Math.min(categoryInfo.names.length, 4)} gap-4 pt-10 border-t border-white/10`}>
                  {categoryInfo.names.map(catName => (
                    <div key={catName}>
                      <p className="text-[10px] opacity-50 font-black mb-2 uppercase truncate">{catName}</p>
                      <p className="text-2xl font-black" style={{ color: categoryInfo.colorMap[catName] }}>
                        {myOverallAvg.categories[catName]}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="text-2xl font-black opacity-20 text-center">기록이 없습니다.</p>}
          </div>

          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col h-[380px]">
            <h3 className="text-xl font-black text-black uppercase tracking-tight mb-8">Submission Status 📂</h3>
            <div className="space-y-6">
              <div className="flex justify-between items-end border-b border-slate-50 pb-4">
                <p className="text-slate-400 font-bold text-xs uppercase">총 제출 과제</p>
                <p className="text-4xl font-black text-blue-600">{submissionStats.total}<span className="text-lg text-slate-300 ml-1">건</span></p>
              </div>
              <div className="flex justify-between items-end border-b border-slate-50 pb-4">
                <p className="text-slate-400 font-bold text-xs uppercase">지각 제출 (LATE)</p>
                <p className="text-4xl font-black text-red-500">{submissionStats.late}<span className="text-lg text-slate-300 ml-1">건</span></p>
              </div>
              <div className="flex justify-between items-end">
                <p className="text-slate-400 font-bold text-xs uppercase">누락/미제출</p>
                <p className="text-4xl font-black text-slate-100">{submissionStats.miss > 0 ? submissionStats.miss : 0}<span className="text-lg text-slate-50 ml-1">건</span></p>
              </div>
            </div>
          </div>

          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col h-[380px]">
            <h3 className="text-xl font-black text-black uppercase tracking-tight mb-6">Hall of Fame 👑</h3>
            <div className="flex-1 overflow-y-auto pr-2 space-y-3 no-scrollbar">
              {awards.map((a, idx) => (
                <div key={idx} className="bg-slate-50 p-4 rounded-2xl border-l-8 border-yellow-400">
                  <p className="text-[10px] font-black text-yellow-600 mb-1">{selectedSemester === 'all' && `[${a.semester}] `}{a.week}주차 CLUSTER BEST</p>
                  <p className="text-sm font-bold text-black truncate">{a.topic}</p>
                </div>
              ))}
              {awards.length === 0 && <p className="text-slate-300 font-bold py-10 text-center uppercase">No awards yet</p>}
            </div>
            <p className="mt-4 font-black text-slate-300 text-xs text-right uppercase">Total: {awards.length}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="Total Growth Trend">
            <LineChart data={myWeeklyTrends.filter(t => t.total > 0)} margin={{ right: 30, left: -10, top: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{fontSize: 12, fontWeight: 'bold'}} axisLine={false} />
              <YAxis domain={[0, 105]} tick={{fontSize: 12}} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              <Line type="monotone" dataKey="total" name="My Score" stroke="#3b82f6" strokeWidth={5} dot={{r: 6, fill: '#3b82f6'}} />
              <Line data={clubAverages.filter(c => c.clubTotal > 0)} type="monotone" dataKey="clubTotal" name="Club Avg" stroke="#cbd5e1" strokeWidth={2} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ChartCard>

          <ChartCard title="Skill Balance Comparison">
            {/* 🌟 동적 레이더 차트 연동 */}
            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
              <PolarGrid stroke="#f1f5f9" />
              <PolarAngleAxis dataKey="subject" tick={{fontSize: 12, fontWeight: 'black'}} />
              <Radar name="My Avg" dataKey="me" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
              <Radar name="Club Base" dataKey="base" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.2} />
              <Tooltip />
            </RadarChart>
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title="Score Variance (Boxplot)">
            <ComposedChart data={varianceData} margin={{ right: 30, left: -10, top: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{fontSize: 12, fontWeight: 'bold'}} axisLine={false} />
              <YAxis domain={[0, 105]} tick={{fontSize: 12}} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: '15px', border: 'none' }} />
              <Bar dataKey="range" fill="#e2e8f0" radius={[6, 6, 6, 6]} barSize={30} name="Weekly Range" />
              <Line dataKey="avg" stroke="#334155" strokeWidth={2} dot={{r: 3}} name="Club Avg" />
            </ComposedChart>
          </ChartCard>

          <ChartCard title="Area Trend Analysis">
            <LineChart data={myWeeklyTrends.filter(t => t.total > 0)} margin={{ right: 30, left: -10, top: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{fontSize: 12}} axisLine={false} />
              <YAxis domain={[0, 40]} tick={{fontSize: 12}} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: '15px', border: 'none' }} />
              <Legend iconType="circle" wrapperStyle={{fontSize: '11px', fontWeight: 'bold'}} />
              {/* 🌟 동적 Line 컴포넌트 렌더링 */}
              {categoryInfo.names.map((name) => (
                <Line key={name} name={name} type="monotone" dataKey={name} stroke={categoryInfo.colorMap[name]} strokeWidth={3} dot={{r: 3}} />
              ))}
            </LineChart>
          </ChartCard>
        </div>

        <div className="bg-white p-10 rounded-[3.5rem] shadow-sm border border-slate-100">
          <h3 className="text-xl font-black text-black uppercase tracking-widest mb-10 border-b border-slate-100 pb-4">Weekly Detail History</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {myWeeklyTrends.map(t => (
              <div key={t.week} className={`flex flex-col p-8 rounded-[2.5rem] gap-4 transition-all border-2 ${t.total > 0 ? 'bg-white border-blue-500 shadow-xl scale-100' : 'bg-slate-50 border-transparent opacity-30 scale-95 grayscale'}`}>
                <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                  <span className="font-black text-black text-2xl">{t.week}주차</span>
                  <span className="text-2xl font-black text-blue-600">{t.total > 0 ? `${t.total} 점` : '미발표'}</span>
                </div>
                <div className="grid grid-cols-2 gap-y-2 text-[12px] font-bold text-slate-500 uppercase">
                  {/* 🌟 동적 카테고리 상세 점수 표기 */}
                  {categoryInfo.names.map(name => (
                    <div key={name} className="flex justify-between px-2">
                      <span className="truncate pr-2">{name}:</span> 
                      <span className="text-black">{t[name] || 0}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 h-[450px] flex flex-col">
      <h3 className="text-sm font-black text-black uppercase tracking-tight mb-6">{title}</h3>
      <div className="flex-1 w-full">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  )
}