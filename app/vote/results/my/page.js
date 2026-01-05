'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar 
} from 'recharts'

export default function MyAnalytics() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [myWeeklyTrends, setMyWeeklyTrends] = useState([])
  const [myCurrentWeek, setMyCurrentWeek] = useState(null)

  useEffect(() => {
    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      setUser(session.user)
      const userName = session.user.user_metadata.name

      const { data: presentations } = await supabase.from('presentations').select('*')
      const { data: scores } = await supabase.from('scores').select('*')

      if (presentations && scores) {
        // 1주부터 12주까지 데이터 계산
        const trends = Array.from({ length: 12 }, (_, i) => i + 1).map(w => {
          const pInWeek = presentations.find(p => p.presenter_name === userName && p.week === w)
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
        setMyCurrentWeek(trends.filter(t => t.total > 0).pop())
      }
      setLoading(false)
    }
    fetchData()
  }, [])

  if (loading) return <div className="p-8 text-center font-black text-black italic">분석 리포트 생성 중... 📈</div>

  return (
    <div className="p-6 bg-slate-50 min-h-screen text-black font-sans flex flex-col items-center">
      <header className="max-w-[95%] w-full mb-8 flex justify-between items-center border-b-2 border-slate-200 pb-6">
        <Link href="/vote/results" className="font-black text-xs uppercase tracking-widest hover:underline text-black">← Back to Hub</Link>
        <h1 className="text-4xl font-black italic uppercase tracking-tighter text-black">My Analytics</h1>
      </header>

      <main className="max-w-[95%] w-full space-y-10">
        <div className="flex flex-col xl:flex-row gap-8">
          {/* 요약 카드 */}
          <div className="xl:w-1/3 bg-slate-900 p-10 rounded-[3rem] text-white shadow-2xl flex flex-col justify-center">
            <h3 className="text-xl font-black mb-8 opacity-40 uppercase tracking-[0.4em]">Overall Summary</h3>
            {myCurrentWeek ? (
              <div className="space-y-10 text-center">
                <p className="text-[7rem] font-black leading-none text-white">{myCurrentWeek.total}<span className="text-4xl opacity-20 ml-4">/ 105</span></p>
                <div className="grid grid-cols-4 gap-2 pt-10 border-t border-white/10">
                  <div><p className="text-[16px] opacity-50 font-black mb-2 uppercase">INSIGHT</p><p className="text-3xl font-black text-blue-400">{myCurrentWeek.insight}</p></div>
                  <div><p className="text-[16px] opacity-50 font-black mb-2 uppercase">GRAPHIC</p><p className="text-3xl font-black text-purple-400">{myCurrentWeek.graphic}</p></div>
                  <div><p className="text-[16px] opacity-50 font-black mb-2 uppercase">DELIVERY</p><p className="text-3xl font-black text-pink-400">{myCurrentWeek.delivery}</p></div>
                  <div><p className="text-[16px] opacity-50 font-black mb-2 uppercase">COMP.</p><p className="text-3xl font-black text-emerald-400">{myCurrentWeek.complementarity}</p></div>
                </div>
              </div>
            ) : <p className="text-2xl font-black opacity-20 text-center">기록이 없습니다.</p>}
          </div>

          {/* 메인 추이 & 밸런스 차트 */}
          <div className="xl:w-2/3 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 h-[450px]">
              <h3 className="text-xl font-black text-black uppercase tracking-tight mb-8">Growth Trend (Total)</h3>
              <ResponsiveContainer width="100%" height="80%">
                <LineChart data={myWeeklyTrends.filter(t => t.total > 0)} margin={{ right: 50, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{fontSize: 14, fontWeight: 'bold', fill: '#000'}} axisLine={false} />
                  <YAxis domain={[0, 105]} tick={{fontSize: 12, fontWeight: 'bold', fill: '#000'}} axisLine={false} />
                  <Tooltip contentStyle={{borderRadius: '20px', border: 'none', fontWeight: 'bold'}} />
                  <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={6} dot={{r: 8, fill: '#3b82f6'}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 h-[450px]">
              <h3 className="text-xl font-black text-black uppercase tracking-tight mb-8">Category Balance</h3>
              <ResponsiveContainer width="100%" height="80%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={[
                  { subject: 'Insight', A: myCurrentWeek?.insight, full: 40 },
                  { subject: 'Graphic', A: myCurrentWeek?.graphic, full: 30 },
                  { subject: 'Delivery', A: myCurrentWeek?.delivery, full: 30 },
                ]}>
                  <PolarGrid stroke="#f1f5f9" />
                  <PolarAngleAxis dataKey="subject" tick={{fontSize: 14, fontWeight: 'black', fill: '#000'}} />
                  <Radar name="Score" dataKey="A" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.5} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* 상세 분석 그래프 */}
        <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100">
          <h3 className="text-xl font-black text-black uppercase tracking-tight mb-10">Area Trend Analysis</h3>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={myWeeklyTrends.filter(t => t.total > 0)} margin={{ right: 50 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{fontWeight: 'bold', fontSize: 14, fill: '#000'}} axisLine={false} />
                <YAxis domain={[0, 40]} tick={{fontWeight: 'bold', fontSize: 12, fill: '#000'}} axisLine={false} />
                <Tooltip />
                <Legend iconType="circle" wrapperStyle={{paddingTop: '20px', fontWeight: 'bold', color: '#000'}} />
                <Line name="Insight" type="monotone" dataKey="insight" stroke="#3b82f6" strokeWidth={4} dot={{r: 5}} />
                <Line name="Graphic" type="monotone" dataKey="graphic" stroke="#a855f7" strokeWidth={4} dot={{r: 5}} />
                <Line name="Delivery" type="monotone" dataKey="delivery" stroke="#ec4899" strokeWidth={4} dot={{r: 5}} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ★ 주차별 기록 그리드 (하이라이트 기능 추가) ★ */}
        <div className="bg-white p-10 rounded-[3.5rem] shadow-sm border border-slate-100">
          <h3 className="text-xl font-black text-black uppercase tracking-widest mb-10 italic border-b border-slate-100 pb-4">Weekly History (W1-W12)</h3>
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
                  <div className="flex justify-between px-2"><span>Insight:</span> <span>{t.insight}</span></div>
                  <div className="flex justify-between px-2"><span>Graphic:</span> <span>{t.graphic}</span></div>
                  <div className="flex justify-between px-2"><span>Delivery:</span> <span>{t.delivery}</span></div>
                  <div className="flex justify-between px-2"><span>Comp:</span> <span>{t.complementarity}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}