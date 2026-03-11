'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function HomeHub() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  
  // DB에서 불러온 스케줄을 담을 상자
  const [schedules, setSchedules] = useState([])
  
  // 캘린더 상태 관리
  const [currentDate, setCurrentDate] = useState(new Date(2026, 2, 1)); // 기본: 2026년 3월 시작

  useEffect(() => {
    const initHub = async () => {
      // 1. 로그인 유저 확인
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      setUser(session.user)

      // 2. DB에서 전체 일정 불러오기 (내부/외부 모두 가져옴)
      const { data: schData } = await supabase
        .from('pr_schedules')
        .select('*')
        .order('full_date', { ascending: true })
      
      if (schData) setSchedules(schData)
    }
    
    initHub()
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // 캘린더 계산 로직
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // 이번 달 일정만 필터링
  const eventsThisMonth = schedules.filter(s => {
    if (!s.full_date) return false;
    const [sy, sm] = s.full_date.split('-');
    return parseInt(sy) === year && parseInt(sm) === month + 1;
  });

  if (!user) return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-bold text-slate-400">로딩 중... 🔄</div>

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-start p-6 pt-12 pb-24 text-slate-900 font-sans relative">
      
      {/* ★ 메인 랜딩페이지로 돌아가기 버튼 (좌측 상단) */}
      <Link 
        href="/" 
        className="absolute top-6 left-6 flex items-center gap-2 text-slate-400 hover:text-blue-600 font-black text-xs uppercase tracking-widest transition-colors bg-white px-4 py-2 rounded-full shadow-sm border border-slate-100"
      >
        <span>🏠</span> Back to Landing
      </Link>

      {/* ★ 관리자 페이지 버튼 (우측 하단 구석 - 톱니바퀴) */}
      <Link 
        href="/admin" 
        className="fixed bottom-6 right-6 w-12 h-12 flex items-center justify-center bg-slate-200 text-slate-500 rounded-full hover:bg-slate-800 hover:text-white transition-all opacity-30 hover:opacity-100 shadow-md z-50"
        title="Admin Control Panel"
      >
        <span className="text-xl">⚙️</span>
      </Link>

      <div className="max-w-6xl w-full text-center mt-10">
        
        {/* 상단 환영 메시지 */}
        <div className="mb-12">
          <span className="bg-blue-100 text-blue-600 px-5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em]">
            InsightGraphy Member Hub
          </span>
          <h1 className="text-4xl md:text-5xl font-black text-slate-800 mt-6 mb-3">
            반가워요, <span className="text-blue-600">{user.user_metadata?.name || '학회원'}</span>님! 👋
          </h1>
          <p className="text-slate-400 font-bold text-sm md:text-base">내부 일정 확인 및 학회 자산을 관리하세요.</p>
        </div>

        {/* ★ 1. 중앙 캘린더 구역 (내부/외부 일정 자동 연동) */}
        <div className="bg-white p-8 md:p-12 rounded-[3rem] shadow-sm border border-slate-100 mb-12 text-left">
          <div className="flex flex-col md:flex-row gap-12">
            
            {/* 좌측: 달력 컨트롤 및 그리드 */}
            <div className="flex-1">
              <div className="flex justify-between items-center mb-8 px-2">
                <button onClick={prevMonth} className="w-10 h-10 flex items-center justify-center bg-slate-50 rounded-full shadow-sm text-blue-500 hover:bg-blue-500 hover:text-white transition-all font-bold">←</button>
                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-widest">
                  {year}. {String(month + 1).padStart(2, '0')}
                </h3>
                <button onClick={nextMonth} className="w-10 h-10 flex items-center justify-center bg-slate-50 rounded-full shadow-sm text-blue-500 hover:bg-blue-500 hover:text-white transition-all font-bold">→</button>
              </div>

              <div className="grid grid-cols-7 gap-2 mb-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <div className="text-red-400">Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div className="text-blue-400">Sat</div>
              </div>

              <div className="grid grid-cols-7 gap-2 md:gap-3">
                {blanks.map(b => (
                  <div key={`blank-${b}`} className="aspect-square rounded-2xl bg-transparent" />
                ))}
                {days.map(d => {
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                  const dayEvents = schedules.filter(s => s.full_date === dateStr);
                  const hasEvent = dayEvents.length > 0;
                  
                  // 내부 일정(is_public: false)이 하나라도 있으면 주황색 테마 적용
                  const isInternalDay = hasEvent && dayEvents.some(e => !e.is_public);

                  return (
                    <div 
                      key={d} 
                      className={`relative aspect-square rounded-2xl flex flex-col items-center justify-center text-sm font-black transition-all ${
                        hasEvent 
                        ? (isInternalDay ? 'bg-amber-50 border-2 border-amber-400 text-amber-700 shadow-sm' : 'bg-blue-50 border-2 border-blue-500 text-blue-700 shadow-sm') 
                        : 'bg-white border border-slate-100 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      <span>{d}</span>
                      {hasEvent && (
                        <div className="absolute bottom-1.5 flex gap-1">
                          {dayEvents.map((e, i) => (
                            <div key={i} className={`w-1.5 h-1.5 rounded-full ${!e.is_public ? 'bg-amber-500' : 'bg-blue-600'}`} />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 우측: 이달의 일정 리스트 */}
            <div className="w-full md:w-80 bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-xl flex flex-col">
              <h3 className="text-xs font-black text-blue-400 uppercase tracking-[0.2em] mb-6 border-b border-white/10 pb-4">
                {month + 1}월 학회 일정
              </h3>
              <div className="flex-1 overflow-y-auto pr-2 space-y-6 no-scrollbar">
                {eventsThisMonth.length > 0 ? (
                  // 날짜 오름차순 정렬
                  eventsThisMonth.sort((a,b) => new Date(a.full_date) - new Date(b.full_date)).map((ev, idx) => (
                    <div key={idx} className="relative pl-5 before:absolute before:left-0 before:top-2 before:w-2 before:h-2 before:rounded-full" style={{ '--tw-before-bg': !ev.is_public ? '#f59e0b' : '#3b82f6' }}>
                      <style jsx>{`div::before { background-color: var(--tw-before-bg); }`}</style>
                      
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-[10px] font-black text-white/50">
                          {ev.date_display} 
                          {ev.type === 'regular' && ev.week && ` (W${ev.week})`}
                          {' · '}
                          {ev.is_allday ? '종일' : `${ev.start_time} - ${ev.end_time}`}
                        </p>
                        {!ev.is_public && <span className="bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border border-amber-500/30">Internal</span>}
                      </div>
                      
                      <p className={`text-sm font-black leading-tight mb-1 ${ev.is_break ? 'text-slate-500 line-through' : 'text-white'}`}>
                        {ev.title} {ev.is_break && '(휴회)'}
                      </p>
                      
                      {ev.description && <p className="text-[11px] text-white/60 font-medium break-keep">{ev.description}</p>}
                    </div>
                  ))
                ) : (
                  <div className="py-10 text-center opacity-50 font-bold text-sm">예정된 일정이 없습니다.</div>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* ★ 2. 하단 메인 메뉴 카드 그리드 (수정 없음) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          <button onClick={() => router.push('/dashboard')} className="group bg-white p-8 rounded-[2.5rem] shadow-sm border-2 border-transparent hover:border-blue-500 hover:shadow-xl transition-all text-left">
            <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-300">📂</div>
            <h2 className="text-xl font-black text-slate-800 mb-2">주차별 자료실</h2>
            <p className="text-xs text-slate-400 font-medium leading-relaxed">매주 올라오는 학회 자료를 확인하고 개인 과제를 업로드하세요.</p>
          </button>
          <button onClick={() => router.push('/archive')} className="group bg-white p-8 rounded-[2.5rem] shadow-sm border-2 border-transparent hover:border-blue-600 hover:shadow-xl transition-all text-left">
            <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-300">🏛️</div>
            <h2 className="text-xl font-black text-slate-800 mb-2">IG Archive</h2>
            <p className="text-xs text-slate-400 font-medium leading-relaxed">디자인 소스, 기획서 양식 등 학회의 소중한 공용 자산을 관리하세요.</p>
          </button>
          <button onClick={() => router.push('/vote')} className="group bg-white p-8 rounded-[2.5rem] shadow-sm border-2 border-transparent hover:border-yellow-500 hover:shadow-xl transition-all text-left">
            <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-300">🗳️</div>
            <h2 className="text-xl font-black text-slate-800 mb-2">실시간 발표 채점</h2>
            <p className="text-xs text-slate-400 font-medium leading-relaxed">오늘 진행되는 프레젠테이션을 실시간으로 평가하고 투표하세요.</p>
          </button>
        </div>

        {/* 로그아웃 구역 */}
        <div className="flex flex-col items-center gap-4">
          <button onClick={handleLogout} className="text-slate-300 hover:text-red-500 font-bold text-xs transition-colors underline underline-offset-4">
            안전하게 로그아웃하기 🚪
          </button>
          <p className="text-[9px] text-slate-200 font-black tracking-[0.3em] uppercase">InsightGraphy System</p>
        </div>
      </div>
    </div>
  )
}