'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

// 상단 네비게이션
function PublicNav() {
  return (
    <nav className="fixed top-0 w-full bg-[#1a1a1a]/95 backdrop-blur-md text-white z-50 border-b border-white/5">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="flex justify-between items-center h-[64px] md:h-[80px]">
          <Link href="/" className="flex items-center gap-3 group shrink-0">
            <div className="relative w-8 h-8 md:w-9 md:h-9">
              <Image src="/logo.png" alt="IG Logo" fill className="object-contain" />
            </div>
            <span className="text-lg md:text-xl font-black uppercase tracking-tighter group-hover:text-[#a8d0cd] transition-colors">
              InsightGraphy
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-x-10 text-[11px] font-black uppercase tracking-widest text-white/60">
            <Link href="/about" className="hover:text-[#32a4a1] transition-colors">About</Link>
            <Link href="/activities" className="hover:text-[#32a4a1] transition-colors">Activities</Link>
            <Link href="/schedule" className="hover:text-[#32a4a1] transition-colors">Schedule</Link>
            <Link href="/members" className="hover:text-[#32a4a1] transition-colors">Members</Link>
            <Link href="/showcase" className="hover:text-[#32a4a1] transition-colors">Showcase</Link>
            <Link href="/join" className="hover:text-[#32a4a1] transition-colors">Join Us</Link>
          </div>
          <div className="flex items-center">
            <Link href="/login" className="bg-[#32a4a1] px-4 md:px-6 h-[32px] md:h-[38px] rounded-lg hover:bg-[#0d6b69] transition-all flex items-center justify-center text-white text-[10px] md:text-[11px] font-black uppercase shadow-lg shadow-brand-primary/20">
              Login
            </Link>
          </div>
        </div>
        <div className="md:hidden border-t border-white/5 overflow-x-auto no-scrollbar whitespace-nowrap py-3">
          <div className="flex items-center gap-x-8 px-2 text-[10px] font-black uppercase tracking-widest text-white/50">
            <Link href="/about" className="hover:text-[#32a4a1] active:text-[#32a4a1]">About</Link>
            <Link href="/activities" className="hover:text-[#32a4a1] active:text-[#32a4a1]">Activities</Link>
            <Link href="/schedule" className="hover:text-[#32a4a1] active:text-[#32a4a1]">Schedule</Link>
            <Link href="/members" className="hover:text-[#32a4a1] active:text-[#32a4a1]">Members</Link>
            <Link href="/showcase" className="hover:text-[#32a4a1] active:text-[#32a4a1]">Showcase</Link>
            <Link href="/join" className="hover:text-[#32a4a1] active:text-[#32a4a1]">Join Us</Link>
          </div>
        </div>
      </div>
      <style jsx>{`.no-scrollbar::-webkit-scrollbar { display: none; }.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
    </nav>
  )
}

export default function LandingPage() {
  const [loading, setLoading] = useState(true)
  const [upcomingSchedules, setUpcomingSchedules] = useState([])
  const [bestPractices, setBestPractices] = useState([])

  useEffect(() => {
    fetchLandingData()
  }, [])

  const fetchLandingData = async () => {
    setLoading(true)

    // 1. 관리자가 선택한 ID 목록 가져오기
    const { data: config } = await supabase.from('pr_landing_config').select('*').eq('id', 'main').single()
    
    if (config) {
      // 2. 선택된 스케줄 데이터 쏙쏙 빼오기
      if (config.selected_schedules && config.selected_schedules.length > 0) {
        const { data: schData } = await supabase
          .from('pr_schedules')
          .select('*')
          .in('id', config.selected_schedules)
          .order('full_date', { ascending: true })
        if (schData) setUpcomingSchedules(schData)
      }

      // 3. 선택된 쇼케이스 데이터 쏙쏙 빼오기
      if (config.selected_showcases && config.selected_showcases.length > 0) {
        const { data: showData } = await supabase
          .from('pr_showcase')
          .select('*')
          .in('id', config.selected_showcases)
        if (showData) setBestPractices(showData)
      }
    }
    
    setLoading(false)
  }

  // 스케줄 타입에 따른 예쁜 색상 매칭 마법 🎨
  const getTypeColor = (type) => {
    if (type === 'regular') return 'bg-[#0d6b69]';
    if (type === 'special') return 'bg-[#38a7a3]';
    return 'bg-[#187a77]';
  }

  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] font-sans">
      <PublicNav />
      
      {/* 1. 히어로 섹션 (수정 없음) */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#0d6b69] via-[#32a4a1] to-[#a8d0cd]">
        <div className="absolute inset-0 opacity-30 bg-black" />
        <div className="relative z-10 text-center text-white px-6">
          <p className="text-sm font-bold tracking-[0.5em] mb-4 opacity-80 uppercase text-[#a8d0cd]">Since 2012</p>
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter uppercase mb-6 leading-none drop-shadow-lg">Insight<br/>Graphy</h1>
          <p className="text-lg md:text-xl font-medium max-w-2xl mx-auto leading-relaxed break-keep opacity-95 drop-shadow-md">
            InsightGraphy는 서울대, 연세대, 고려대 연합 프레젠테이션 학회로 <br/>
            다양한 전공과 역량을 가진 학회원들이 모여 <br/>
            최고의 프레젠터가 되기 위한 훈련을 진행하고 있습니다.
          </p>
          <div className="mt-12 flex flex-col sm:flex-row justify-center items-center gap-4">
            <Link href="/about" className="px-10 h-[56px] bg-white text-[#1a1a1a] font-black uppercase text-[13px] tracking-widest rounded-full hover:bg-[#a8d0cd] transition-all shadow-lg flex items-center justify-center min-w-[180px]">Learn More</Link>
            <Link href="/join" className="px-10 h-[56px] border-2 border-white text-white font-black uppercase text-[13px] tracking-widest rounded-full hover:bg-white hover:text-[#1a1a1a] transition-all shadow-lg flex items-center justify-center min-w-[180px]">Apply Now</Link>
          </div>
        </div>
      </section>

      {/* 2. Core Activities 4개 박스 (수정 없음) */}
      <section className="py-24 px-8 bg-white max-w-7xl mx-auto border-b border-slate-50">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-black uppercase tracking-tighter text-slate-800">Core Activities</h2>
          <div className="w-12 h-1 bg-[#32a4a1] mx-auto mt-4 rounded-full" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 text-center">
          <Link href="/activities/regular" className="space-y-4 p-8 rounded-3xl hover:shadow-xl transition-all hover:bg-slate-50 flex flex-col items-center group cursor-pointer border border-transparent hover:border-slate-100">
            <span className="text-5xl mb-2 text-[#32a4a1] group-hover:scale-110 transition-transform">💡</span>
            <h3 className="text-xl font-black uppercase">정규 세션</h3>
            <p className="text-sm leading-relaxed text-slate-600 break-keep">매주 다양한 주제에 대해 문제 해결 방안을 발표하는 정기적인 세션</p>
            <span className="text-[10px] font-black uppercase text-[#32a4a1] opacity-0 group-hover:opacity-100 transition-opacity mt-2">View Detail →</span>
          </Link>
          <Link href="/activities/education" className="space-y-4 p-8 rounded-3xl hover:shadow-xl transition-all hover:bg-slate-50 flex flex-col items-center group cursor-pointer border border-transparent hover:border-slate-100">
            <span className="text-5xl mb-2 text-[#32a4a1] group-hover:scale-110 transition-transform">🎨</span>
            <h3 className="text-xl font-black uppercase">교육 세션</h3>
            <p className="text-sm leading-relaxed text-slate-600 break-keep">인사이트, 그래픽, 딜리버리 역량 향상을 위한 내, 외부적 교육 및 실습 세션</p>
            <span className="text-[10px] font-black uppercase text-[#32a4a1] opacity-0 group-hover:opacity-100 transition-opacity mt-2">View Detail →</span>
          </Link>
          <Link href="/activities/special" className="space-y-4 p-8 rounded-3xl hover:shadow-xl transition-all hover:bg-slate-50 flex flex-col items-center group cursor-pointer border border-transparent hover:border-slate-100">
            <span className="text-5xl mb-2 text-[#32a4a1] group-hover:scale-110 transition-transform">🎤</span>
            <h3 className="text-xl font-black uppercase">특별 세션</h3>
            <p className="text-sm leading-relaxed text-slate-600 break-keep">연합세션, 공모전 기획 등 정규세션 이외의 비정기적 세션</p>
            <span className="text-[10px] font-black uppercase text-[#32a4a1] opacity-0 group-hover:opacity-100 transition-opacity mt-2">View Detail →</span>
          </Link>
          <Link href="/activities/corporate" className="space-y-4 p-8 rounded-3xl hover:shadow-xl transition-all hover:bg-slate-50 flex flex-col items-center group cursor-pointer border border-transparent hover:border-slate-100">
            <span className="text-5xl mb-2 text-[#32a4a1] group-hover:scale-110 transition-transform">🤝</span>
            <h3 className="text-xl font-black uppercase">기업 세션</h3>
            <p className="text-sm leading-relaxed text-slate-600 break-keep">기업과의 연계를 통해 IG만의 통찰력을 공유하고 함께 성장하는 프로젝트 세션</p>
            <span className="text-[10px] font-black uppercase text-[#32a4a1] opacity-0 group-hover:opacity-100 transition-opacity mt-2">View Detail →</span>
          </Link>
        </div>
      </section>

      {/* 3. ★ Showcase 실시간 DB 연동 섹션 */}
      <section className="py-24 px-6 bg-[#1a1a1a] text-white">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
            <div>
              <h2 className="text-4xl font-black uppercase tracking-tighter text-white">Best Practices</h2>
              <div className="w-12 h-1 bg-[#a8d0cd] mt-4 rounded-full" />
              <p className="text-white/60 font-medium mt-4">학회원들이 만들어낸 압도적인 결과물을 확인하세요.</p>
            </div>
            <Link href="/showcase" className="px-8 py-3 bg-white/10 hover:bg-white/20 rounded-full text-xs font-black uppercase tracking-widest transition-all">
              View Gallery
            </Link>
          </div>

          {loading ? (
            <div className="text-center text-white/50 py-10 font-bold">로딩 중... 🔄</div>
          ) : bestPractices.length === 0 ? (
            <div className="text-center text-white/30 py-10 font-bold border border-white/10 rounded-3xl">선택된 쇼케이스 작품이 없습니다.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {bestPractices.map((ppt, idx) => (
                <Link key={idx} href="/showcase" className="aspect-[16/9] bg-slate-900 rounded-[2rem] p-6 flex flex-col justify-between relative overflow-hidden group cursor-pointer border border-white/10 hover:border-white/30 hover:-translate-y-2 transition-all shadow-xl">
                  
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ppt.thumb_url || '/showcase/thumb1.png'} alt={ppt.title} className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-70 transition-opacity duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-0" />
                  
                  <div className="z-10 flex justify-between items-start">
                    <span className="bg-black/50 text-white/80 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest backdrop-blur-sm border border-white/10">
                      {ppt.topic}
                    </span>
                    <span className="bg-white/20 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 -translate-y-2 group-hover:translate-x-0 group-hover:translate-y-0">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    </span>
                  </div>
                  
                  <div className="z-10">
                    <h3 className="text-xl font-black leading-snug text-white group-hover:text-[#a8d0cd] transition-colors">{ppt.title}</h3>
                    <p className="text-xs text-white/60 font-bold mt-1">{ppt.author} IGer</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 4. ★ 스케줄 타임라인 실시간 DB 연동 섹션 */}
      <section className="py-28 px-6 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tighter text-[#0d6b69]">Upcoming Sessions</h2>
            <div className="flex items-center justify-center gap-2 text-[#32a4a1] opacity-70">
              <span className="text-xl">“</span>
              <p className="text-xs md:text-sm font-bold italic tracking-wide">다가오는 우리의 성장을 준비하세요</p>
              <span className="text-xl">”</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {loading ? (
              <div className="text-center text-slate-400 py-10 font-bold">로딩 중... 🔄</div>
            ) : upcomingSchedules.length > 0 ? (
              upcomingSchedules.map((item, idx) => (
                <div key={idx} className="flex flex-col md:flex-row items-center gap-4 bg-white p-5 rounded-[2.5rem] shadow-sm border border-slate-100 hover:shadow-md transition-all group">
                  <div className="flex items-center justify-center gap-4 w-full md:w-auto md:min-w-[150px]">
                    {item.type === 'regular' ? (
                       <span className="text-[10px] font-black text-slate-400 uppercase">Week {item.week}</span>
                    ) : (
                       <span className="text-[10px] font-black text-slate-400 uppercase">Special</span>
                    )}
                    <div className={`${getTypeColor(item.type)} text-white px-5 py-2.5 rounded-2xl font-black text-xs text-center shadow-sm`}>
                      {item.date_display}
                    </div>
                  </div>
                  
                  <div className="flex-1 text-center md:text-left border-y md:border-y-0 md:border-x border-slate-50 py-3 md:py-0 md:px-8">
                    <h4 className="text-lg font-black text-slate-800 group-hover:text-[#32a4a1] transition-colors">{item.title}</h4>
                    {item.description && <p className="text-xs font-bold text-slate-400 mt-1">{item.description}</p>}
                  </div>
                  
                  <div className="w-full md:w-32 text-center md:text-right">
                    <span className="text-[9px] font-black uppercase tracking-widest text-[#32a4a1] bg-[#32a4a1]/5 px-3 py-1 rounded-full">
                      {item.type === 'regular' ? 'Session' : item.type === 'special' ? 'Event' : 'Other'}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-10 text-center text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-[2rem]">
                예정된 세션이 없습니다. 🏁
              </div>
            )}
          </div>

          <div className="mt-16 text-center">
            <Link 
              href="/schedule" 
              className="inline-flex items-center gap-3 px-10 py-5 bg-[#0d6b69] text-white font-black uppercase text-[12px] tracking-[0.2em] rounded-full hover:bg-black transition-all shadow-xl shadow-[#0d6b69]/20 active:scale-95"
            >
              View Full Timeline
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>
      
      {/* 푸터 */}
      <footer className="py-12 border-t border-slate-100 text-center bg-[#1a1a1a] text-white">
        <div className="relative w-10 h-10 mx-auto mb-6 opacity-60">
          <Image src="/logo.png" alt="InsightGraphy Logo" fill className="object-contain grayscale hover:grayscale-0 transition-all" />
        </div>
        <p className="text-[10px] font-black text-[#a8d0cd] uppercase tracking-[0.5em]">© 2026 InsightGraphy. All Rights Reserved.</p>
      </footer>
    </div>
  )
}