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
  const [myWeeklyTrends, setMyWeeklyTrends] = useState([])
  const [myCurrentWeek, setMyCurrentWeek] = useState(null)
  
  // 추가 데이터 상태
  const [clubAverages, setClubAverages] = useState([])
  const [awards, setAwards] = useState([])
  const [varianceData, setVarianceData] = useState([])

  useEffect(() => {
    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setUser(session.user)
      const userName = session.user.user_metadata.name

      const { data: presentations } = await supabase.from('presentations').select('*')
      const { data: scores } = await supabase.from('scores').select('*')

      if (presentations && scores) {
        const clubTrends = []
        const winList = []
        const vData = []

        const trends = Array.from({ length: 12 }, (_, i) => i + 1).map(w => {
          const weekPs = presentations.filter(p => p.week === w)
          const weekScores = scores.filter(s => weekPs.map(p => p.id).includes(s.presentation_id))
          
          const clubAvgTotal = weekScores.length > 0 
            ? parseFloat((weekScores.reduce((a, b) => a + (b.total_score || 0), 0) / weekScores.length).toFixed(1))
            : 0
          clubTrends.push({ name: `${w}주`, clubTotal: clubAvgTotal })

          if (weekScores.length > 0) {
            const allTotals = weekScores.map(s => s.total_score || 0)
            vData.push({ name: `${w}주`, range: [Math.min(...allTotals), Math.max(...allTotals)], avg: clubAvgTotal })
          }

          const rankings = weekPs.map(p => {
            const pS = scores.filter(s => s.presentation_id === p.id)
            const avg = pS.length > 0 ? (pS.reduce((a, b) => a + (b.total_score || 0), 0) / pS.length) : 0
            return { name: p.presenter_name, score: avg, topic: p.topic }
          }).sort((a, b) => b.score - a.score)

          if (rankings.length > 0 && rankings[0].name === userName && rankings[0].score > 0) {
            winList.push({ week: w, topic: rankings[0].topic })
          }

          const pInWeek = weekPs.find(p => p.presenter_name === userName)
          if (!pInWeek) return { name: `${w}주`, week: w, insight: 0, graphic: 0, delivery: 0, complementarity: 0, total: 0 }
          const pScores = scores.filter(s => s.presentation_id === pInWeek.id)
          if (pScores.length === 0) return { name: `${w}주`, week: w, insight: 0, graphic: 0, delivery: 0, complementarity: 0, total: 0 }
          const count = pScores.length
          return {
            name: `${w}주`, week: w,
            insight: parseFloat((pScores.reduce((a, b) => a + b.insight, 0) / count).toFixed(1)),
            graphic: parseFloat((pScores.reduce((a, b) => a + b.graphic, 0) / count).toFixed(1)),
            delivery: parseFloat((pScores.reduce((a, b) => a + b.delivery, 0) / count).toFixed(1)),
            complementarity: parseFloat((pScores.reduce((a, b) => a + (b.complementarity || 0), 0) / count).toFixed(1)),
            total: parseFloat((pScores.reduce((a, b) => a + (b.total_score || (b.insight + b.graphic + b.delivery + (b.complementarity || 0))), 0) / count).toFixed(1))
          }
        })

        setMyWeeklyTrends(trends)
        setClubAverages(clubTrends)
        setAwards(winList)
        setVarianceData(vData)
        setMyCurrentWeek(trends.filter(t => t.total > 0).pop())
      }
      setLoading(false)
    }
    fetchData()
  }, [])

  if (loading) return <div className="p-8 text-center font-black text-black">분석 리포트 생성 중... 📈</div>

  return (
    <div className="p-6 bg-slate-50 min-h-screen text-black font-sans flex flex-col items-center">
      <header className="max-w-[98%] w-full mb-8 flex justify-between items-center border-b-2 border-slate-200 pb-6">
        <Link href="/vote/results" className="font-black text-xs uppercase tracking-widest hover:underline text-black">← Back to Hub</Link>
        <h1 className="text-4xl font-black uppercase tracking-tighter text-black">My Analytics</h1>
      </header>

      <main className="max-w-[98%] w-full space-y-6">
        
        {/* 첫 번째 줄: Overall summary / Award / 총점 trend */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-slate-900 p-10 rounded-[3rem] text-white shadow-2xl flex flex-col justify-center h-[350px]">
            <h3 className="text-l font-black mb-8 opacity-40 uppercase tracking-[0.4em]">Overall Summary</h3>
            {myCurrentWeek ? (
              <div className="space-y-10 text-center">
                <p className="text-[80px] font-black leading-none text-white">{myCurrentWeek.total}<span className="text-4xl opacity-20 ml-4">/ 105</span></p>
                <div className="grid grid-cols-4 gap-2 pt-10 border-t border-white/10">
                  <div><p className="text-[16px] opacity-50 font-black mb-2 uppercase">INSIGHT</p><p className="text-3xl font-black text-blue-400">{myCurrentWeek.insight}</p></div>
                  <div><p className="text-[16px] opacity-50 font-black mb-2 uppercase">GRAPHIC</p><p className="text-3xl font-black text-purple-400">{myCurrentWeek.graphic}</p></div>
                  <div><p className="text-[16px] opacity-50 font-black mb-2 uppercase">DELIVERY</p><p className="text-3xl font-black text-pink-400">{myCurrentWeek.delivery}</p></div>
                  <div><p className="text-[16px] opacity-50 font-black mb-2 uppercase">COMP.</p><p className="text-3xl font-black text-emerald-400">{myCurrentWeek.complementarity}</p></div>
                </div>
              </div>
            ) : <p className="text-2xl font-black opacity-20 text-center">기록이 없습니다.</p>}
          </div>

          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col h-[350px]">
            <h3 className="text-xl font-black text-black uppercase tracking-tight mb-6">Awards 👑</h3>
            <div className="flex-1 overflow-y-auto pr-2 space-y-3">
              {awards.map(a => (
                <div key={a.week} className="bg-slate-50 p-4 rounded-2xl border-l-8 border-yellow-400">
                  <p className="text-[12px] font-black text-yellow-600 mb-1">{a.week}주차 BEST PRESENTER</p>
                  <p className="text-sm font-bold text-black truncate">{a.topic}</p>
                </div>
              ))}
              {awards.length === 0 && <p className="text-slate-300 font-bold py-10 text-center uppercase">No awards yet</p>}
            </div>
            <p className="mt-4 font-black text-slate-300 text-xs text-right uppercase">Total: {awards.length}</p>
          </div>

          <ChartCard title="Total Growth Trend">
            <LineChart data={myWeeklyTrends.filter(t => t.total > 0)} margin={{ right: 30, left: -10, top: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{fontSize: 12, fontWeight: 'bold'}} axisLine={false} />
              <YAxis domain={[0, 105]} tick={{fontSize: 12}} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              <Line type="monotone" dataKey="total" name="Me" stroke="#3b82f6" strokeWidth={5} dot={{r: 6, fill: '#3b82f6'}} />
              <Line data={clubAverages.filter(c => c.clubTotal > 0)} type="monotone" dataKey="clubTotal" name="Club" stroke="#cbd5e1" strokeWidth={2} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ChartCard>
        </div>

        {/* 두 번째 줄: 밸런스 차트 / 박스플롯 / 항목별 트렌드 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <ChartCard title="Skill Balance Comparison">
            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={[
              { subject: 'Insight', me: myCurrentWeek?.insight, club: 25 },
              { subject: 'Graphic', me: myCurrentWeek?.graphic, club: 20 },
              { subject: 'Delivery', me: myCurrentWeek?.delivery, club: 20 },
            ]}>
              <PolarGrid stroke="#f1f5f9" />
              <PolarAngleAxis dataKey="subject" tick={{fontSize: 12, fontWeight: 'black'}} />
              {/* 밸런스 차트 툴팁 추가 */}
              <Tooltip contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              <Radar name="Me" dataKey="me" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
              <Radar name="Club" dataKey="club" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.2} />
            </RadarChart>
          </ChartCard>

          <ChartCard title="Score Variance (Boxplot)">
            <ComposedChart data={varianceData} margin={{ right: 30, left: -10, top: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{fontSize: 12, fontWeight: 'bold'}} axisLine={false} />
              <YAxis domain={[0, 105]} tick={{fontSize: 12}} axisLine={false} />
              {/* 박스플롯 툴팁 추가 */}
              <Tooltip contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              <Bar dataKey="range" fill="#e2e8f0" radius={[6, 6, 6, 6]} barSize={30} name="Range" />
              <Line dataKey="avg" stroke="#334155" strokeWidth={2} dot={{r: 3}} name="Club Avg" />
            </ComposedChart>
          </ChartCard>

          <ChartCard title="Area Trend Analysis">
            <LineChart data={myWeeklyTrends.filter(t => t.total > 0)} margin={{ right: 30, left: -10, top: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{fontSize: 12}} axisLine={false} />
              <YAxis domain={[0, 40]} tick={{fontSize: 12}} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              <Legend iconType="circle" wrapperStyle={{fontSize: '11px', fontWeight: 'bold'}} />
              <Line name="I" type="monotone" dataKey="insight" stroke="#3b82f6" strokeWidth={3} dot={{r: 3}} />
              <Line name="G" type="monotone" dataKey="graphic" stroke="#a855f7" strokeWidth={3} dot={{r: 3}} />
              <Line name="D" type="monotone" dataKey="delivery" stroke="#ec4899" strokeWidth={3} dot={{r: 3}} />
            </LineChart>
          </ChartCard>
        </div>

        <hr className="my-10 border-slate-200" />

        {/* 주차별 기록 그리드 (기존 서식 그대로) */}
        <div className="bg-white p-10 rounded-[3.5rem] shadow-sm border border-slate-100">
          <h3 className="text-xl font-black text-black uppercase tracking-widest mb-10 border-b border-slate-100 pb-4">Weekly History (W1-W12)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {myWeeklyTrends.map(t => (
              <div 
                key={t.week} 
                className={`flex flex-col p-8 rounded-[2.5rem] gap-4 transition-all duration-500 border-2 ${
                  t.total > 0 
                  ? 'bg-white border-blue-500 shadow-xl opacity-100 scale-100' 
                  : 'bg-slate-50 border-transparent opacity-30 scale-95 grayscale'
                }`}
              >
                <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                  <span className="font-black text-black text-2xl">{t.week}주차</span>
                  <span className="text-2xl font-black text-blue-600">{t.total > 0 ? `${t.total} 점` : '미진행'}</span>
                </div>
                <div className="grid grid-cols-2 gap-y-2 text-[14px] font-grey text-black uppercase tracking-tighter">
                  <div className="flex justify-between px-2 font-bold"><span>Insight:</span> <span>{t.insight}</span></div>
                  <div className="flex justify-between px-2 font-bold"><span>Graphic:</span> <span>{t.graphic}</span></div>
                  <div className="flex justify-between px-2 font-bold"><span>Delivery:</span> <span>{t.delivery}</span></div>
                  <div className="flex justify-between px-2 font-bold"><span>Comp:</span> <span>{t.complementarity}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}

// 개별 차트 카드 컴포넌트
function ChartCard({ title, children }) {
  return (
    <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 h-[350px] flex flex-col">
      <h3 className="text-sm font-black text-black uppercase tracking-tight mb-6">{title}</h3>
      <div className="flex-1 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  )
}