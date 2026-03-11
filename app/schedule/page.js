'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

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
            <Link href="/schedule" className="text-white font-bold transition-colors">Schedule</Link>
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
            <Link href="/about" className="hover:text-[#32a4a1]">About</Link>
            <Link href="/activities" className="hover:text-[#32a4a1]">Activities</Link>
            <Link href="/schedule" className="text-white font-bold">Schedule</Link>
            <Link href="/members" className="hover:text-[#32a4a1]">Members</Link>
            <Link href="/showcase" className="hover:text-[#32a4a1]">Showcase</Link>
            <Link href="/join" className="hover:text-[#32a4a1]">Join Us</Link>
          </div>
        </div>
      </div>
      <style jsx>{`.no-scrollbar::-webkit-scrollbar { display: none; }.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
    </nav>
  )
}

export default function SchedulePage() {
  const [loading, setLoading] = useState(true)
  const [fullSchedule, setFullSchedule] = useState([])
  const [currentDate, setCurrentDate] = useState(new Date(2026, 2, 1))

  useEffect(() => {
    fetchSchedules()
  }, [])

  const fetchSchedules = async () => {
    setLoading(true)
    // 🌟 핵심: is_public이 true(외부 공개용)인 일정만 가져옴!
    const { data, error } = await supabase
      .from('pr_schedules')
      .select('*')
      .eq('is_public', true)
      .order('full_date', { ascending: true })
    
    if (!error && data) setFullSchedule(data)
    setLoading(false)
  }

  // 캘린더 변수 계산
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i)
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const eventsThisMonth = fullSchedule.filter(s => {
    if(!s.full_date) return false;
    const [sy, sm] = s.full_date.split('-')
    return parseInt(sy) === year && parseInt(sm) === month + 1
  })

  // 타임라인용: 휴회가 아닌 실제 진행 세션만 필터링
  const activeSessions = fullSchedule.filter(s => !s.is_break)

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-bold text-slate-400">데이터를 불러오는 중입니다... 🔄</div>

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-[#1a1a1a]">
      <PublicNav />

      {/* 헤더 섹션 */}
      <header className="pt-40 pb-16 bg-white text-center border-b border-slate-100">
        <div className="max-w-4xl mx-auto px-6">
          <p className="text-[#32a4a1] text-xs font-black tracking-[0.4em] uppercase mb-4">InsightGraphy 2026</p>
          <h1 className="text-5xl md:text-6xl font-black tracking-tighter uppercase">Schedule Board</h1>
        </div>
      </header>

      {/* 1. ★ 포스터 복제 표 섹션 (시간 미표시) */}
      <section className="py-20 max-w-4xl mx-auto px-4 md:px-6">
        <div className="bg-white p-8 md:p-12 rounded-[3rem] shadow-xl border border-slate-100 relative overflow-hidden">
          
          <div className="text-center mb-10 border-b border-slate-100 pb-8">
            <div className="inline-block bg-[#e0f2f1] text-[#0d6b69] px-6 py-2 rounded-lg font-black text-sm md:text-base tracking-widest mb-6">
              2026년 1학기 세션 일정
            </div>
            <div className="flex items-center justify-center gap-4 text-[#32a4a1]">
              <span className="text-4xl md:text-5xl opacity-40">“</span>
              <p className="text-lg md:text-2xl font-black italic text-slate-700 tracking-tight">모든 생각은 가치있기에 공유되어야 마땅하다</p>
              <span className="text-4xl md:text-5xl opacity-40">”</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-[40px_70px_1fr] md:grid-cols-[60px_100px_1fr_120px] gap-3 items-center mb-2 px-2">
              <span className="text-[10px] font-black text-slate-400 text-center">유형/주차</span>
              <span className="text-[10px] font-black text-slate-400 text-center">날짜</span>
              <span className="text-[10px] font-black text-slate-400 text-center">세션 내용</span>
              <span className="hidden md:block text-[10px] font-black text-slate-400">비고</span>
            </div>

            {fullSchedule.map((item, idx) => (
              // 🌟 휴회 시 줄 전체를 흐리게(opacity-50 grayscale) 처리
              <div key={idx} className={`grid grid-cols-[40px_70px_1fr] md:grid-cols-[60px_100px_1fr_120px] gap-3 items-center group transition-all ${item.is_break ? 'opacity-50 grayscale' : ''}`}>
                
                {/* 주차/유형 */}
                <div className="text-center text-xs md:text-sm font-black text-slate-400">
                  {item.is_break ? "" : item.type === 'regular' ? `${item.week}주차` : 'Special'}
                </div>
                
                {/* 날짜 (시간은 안 보여줌) */}
                <div className={`text-center py-2 rounded-full font-black text-xs md:text-sm transition-all ${item.is_break ? 'bg-[#32a4a1]/50 text-white' : 'bg-[#32a4a1] text-white shadow-md'}`}>
                  {item.date_display}
                </div>

                {/* 세션명 (취소선 대신 흐림 효과만 남김) */}
                <div className={`py-3 px-6 rounded-full text-center font-black text-sm md:text-base transition-all ${item.is_break ? 'bg-slate-100 text-slate-500' : 'bg-white border-2 border-slate-200 text-slate-800 shadow-sm group-hover:border-[#32a4a1]'}`}>
                  {item.title} {item.is_break && '(휴회)'}
                </div>

                {/* 비고 */}
                <div className="hidden md:flex items-center text-xs font-bold text-slate-500 leading-tight">
                  {item.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 2. ★ 가로 스크롤 타임라인 섹션 (시간 미표시, 휴회 제외) */}
      <section className="py-20 bg-slate-900 text-white overflow-hidden relative">
        <div className="max-w-7xl mx-auto px-6 mb-12">
          <h2 className="text-3xl font-black uppercase tracking-tighter text-white">Journey Line</h2>
          <p className="text-slate-400 text-sm font-bold mt-2">좌우로 스크롤하여 전체 여정을 확인하세요.</p>
        </div>

        <div className="flex overflow-x-auto gap-6 px-6 md:px-12 pb-12 pt-6 no-scrollbar snap-x snap-mandatory relative max-w-7xl mx-auto">
          <div className="absolute top-[28px] left-6 right-6 h-1 bg-slate-700 rounded-full z-0" />

          {activeSessions.map((item, idx) => (
            <div key={idx} className="min-w-[280px] md:min-w-[320px] snap-start relative z-10 flex flex-col gap-6 group">
              <div className="w-5 h-5 rounded-full bg-[#32a4a1] border-4 border-slate-900 mx-auto transition-transform group-hover:scale-125" />
              
              <div className="bg-slate-800 p-8 rounded-[2rem] border border-slate-700 hover:bg-slate-700 transition-colors">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[#32a4a1] font-black text-xs uppercase bg-[#32a4a1]/10 px-3 py-1 rounded-lg">
                    {item.type === 'regular' ? `Week ${item.week}` : 'Special'}
                  </span>
                  <span className="text-slate-400 font-bold text-sm">{item.date_display}</span>
                </div>
                <h3 className="text-xl font-black mb-2 text-white">{item.title}</h3>
                <p className="text-xs text-slate-400 font-medium break-keep">{item.description || "정규 세션 진행"}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. ★ 월별 달력 섹션 (여기만 시간 표시) */}
      <section className="py-24 bg-white border-t border-slate-100">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-black uppercase tracking-tighter text-[#1a1a1a]">Monthly Calendar</h2>
            <div className="w-12 h-1 bg-[#32a4a1] mx-auto mt-4 rounded-full" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-start">
            
            {/* 달력 컨테이너 */}
            <div className="lg:col-span-2 bg-slate-50 p-8 rounded-[3rem] border border-slate-100 shadow-sm">
              <div className="flex justify-between items-center mb-8 px-4">
                <button onClick={prevMonth} className="w-10 h-10 flex items-center justify-center bg-white rounded-full shadow-sm text-[#32a4a1] hover:bg-[#32a4a1] hover:text-white transition-all font-bold">←</button>
                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-widest">
                  {year}. {String(month + 1).padStart(2, '0')}
                </h3>
                <button onClick={nextMonth} className="w-10 h-10 flex items-center justify-center bg-white rounded-full shadow-sm text-[#32a4a1] hover:bg-[#32a4a1] hover:text-white transition-all font-bold">→</button>
              </div>

              <div className="grid grid-cols-7 gap-2 mb-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <div className="text-red-400">Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div className="text-blue-400">Sat</div>
              </div>

              <div className="grid grid-cols-7 gap-2 md:gap-4">
                {blanks.map(b => (
                  <div key={`blank-${b}`} className="aspect-square rounded-2xl bg-transparent" />
                ))}
                {days.map(d => {
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                  const dayEvents = fullSchedule.filter(s => s.full_date === dateStr);
                  const hasEvent = dayEvents.length > 0;

                  return (
                    <div 
                      key={d} 
                      className={`relative aspect-square rounded-2xl flex flex-col items-center justify-center text-sm font-black transition-all ${hasEvent ? 'bg-white border-2 border-[#32a4a1] text-[#0d6b69] shadow-md hover:scale-105 cursor-pointer' : 'bg-white border border-slate-100 text-slate-600'}`}
                    >
                      <span>{d}</span>
                      {hasEvent && (
                        <div className="absolute bottom-2 flex gap-1">
                          {dayEvents.map((_, i) => (
                            <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#32a4a1]" />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 이번 달 일정 리스트 영역 (🌟 시간 표시 및 흐림 효과 🌟) */}
            <div className="lg:col-span-1 bg-[#1a1a1a] p-8 rounded-[3rem] text-white shadow-2xl h-full">
              <h3 className="text-xs font-black text-[#32a4a1] uppercase tracking-[0.3em] mb-8 border-b border-white/10 pb-6">
                Events in {month + 1}월
              </h3>
              
              <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2 no-scrollbar">
                {eventsThisMonth.length > 0 ? (
                  eventsThisMonth.sort((a,b) => new Date(a.full_date) - new Date(b.full_date)).map((ev, idx) => (
                    // 🌟 휴회 시 목록 전체를 흐리게(opacity-40) 처리
                    <div key={idx} className={`relative pl-6 before:absolute before:left-0 before:top-2 before:w-2 before:h-2 before:bg-[#32a4a1] before:rounded-full transition-opacity ${ev.is_break ? 'opacity-40' : ''}`}>
                      
                      {/* 날짜와 시간 표시 */}
                      <p className="text-[10px] font-black text-white/50 mb-1">
                        {ev.date_display} {ev.type === 'regular' && ev.week && `(Week ${ev.week})`}
                        {' · '}
                        {ev.is_allday ? '종일' : `${ev.start_time} - ${ev.end_time}`}
                      </p>
                      
                      {/* 취소선(line-through) 제거, 흐림 효과로만 구분 */}
                      <p className="text-lg font-black leading-tight mb-2 text-white">
                        {ev.title} {ev.is_break && '(휴회)'}
                      </p>
                      
                      <p className="text-xs text-white/70 font-medium break-keep">{ev.description}</p>
                    </div>
                  ))
                ) : (
                  <div className="py-10 text-center opacity-50 font-bold text-sm">예정된 일정이 없습니다.</div>
                )}
              </div>
            </div>

          </div>
        </div>
      </section>
      
      {/* 푸터 */}
      <footer className="py-12 border-t border-slate-200 text-center bg-white text-slate-800">
        <div className="relative w-10 h-10 mx-auto mb-6 opacity-80">
          <Image src="/logo.png" alt="InsightGraphy Logo" fill className="object-contain grayscale hover:grayscale-0 transition-all" />
        </div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.5em]">© 2026 InsightGraphy.</p>
      </footer>
    </div>
  )
}