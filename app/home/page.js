'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function HomeHub() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  
  const [schedules, setSchedules] = useState([])
  const [currentDate, setCurrentDate] = useState(new Date()) 
  const [deadlines, setDeadlines] = useState([])
  const [currentWeek, setCurrentWeek] = useState(1)

  useEffect(() => {
    const initHub = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      setUser(session.user)

      const { data: schData } = await supabase.from('pr_schedules').select('*').order('full_date', { ascending: true })
      if (schData) setSchedules(schData)

      const { data: configData } = await supabase.from('pr_config').select('*').eq('key', 'current_week').single()
      const week = configData ? Number(configData.value) : 1
      setCurrentWeek(week)

      // 🌟 주차 상관없이 전체 마감일을 불러옴
      const { data: dlData } = await supabase.from('pr_deadlines').select('*')
      if (dlData) {
        const now = new Date()
        
        // 1. 현재 시간보다 미래인 마감일만 필터링
        const upcomingDl = dlData.filter(d => d.deadline_time && new Date(d.deadline_time) > now)
        
        // 2. 가장 임박한 시간 순으로 오름차순 정렬
        upcomingDl.sort((a, b) => new Date(a.deadline_time) - new Date(b.deadline_time))
        
        // 3. 앞에서부터 딱 6개만 자르기
        setDeadlines(upcomingDl.slice(0, 6))
      }
    }
    
    initHub()
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // 🌟 시간을 '오전/오후' 형식으로 예쁘게 변경
  const formatTime = (dateStr) => {
    if(!dateStr) return ''
    const d = new Date(dateStr)
    const month = d.getMonth() + 1
    const date = d.getDate()
    let hours = d.getHours()
    const minutes = String(d.getMinutes()).padStart(2, '0')
    const ampm = hours >= 12 ? '오후' : '오전'
    
    hours = hours % 12
    hours = hours ? hours : 12 // 0시는 12시로 표기

    return `${month}/${date} ${ampm} ${hours}:${minutes}`
  }

  const getCategoryLabel = (category) => {
    switch(category) {
      case 'proposal': return '📄 기획서 제출';
      case 'slide': return '🖼️ 슬라이드 제출';
      case 'video': return '🎬 발표영상 등록';
      case 'proposal_comment': return '💬 기획서 피드백';
      case 'vote_feedback': return '✅ 정성 피드백';
      case 'video_comment': return '🎬 셀프 피드백';
      case 'absence': return '📝 사유서 제출';
      default: return `📌 ${category} 마감`;
    }
  }

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const eventsThisMonth = schedules.filter(s => {
    if (!s.full_date) return false;
    const [sy, sm] = s.full_date.split('-');
    return parseInt(sy) === year && parseInt(sm) === month + 1;
  });

  if (!user) return <div className="min-h-screen bg-white flex items-center justify-center font-bold text-slate-400">로딩 중... 🔄</div>

  return (
    <div className="min-h-screen bg-white flex flex-col p-6 lg:p-10 text-slate-900 font-sans relative">
      
      <header className="max-w-[1500px] w-full mx-auto bg-white rounded-[2rem] shadow-md border border-slate-100 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 mb-10 z-10 relative">
        
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-slate-400 hover:text-slate-800 font-black text-xs uppercase tracking-widest transition-colors group">
            <span className="bg-slate-50 text-slate-500 w-8 h-8 flex items-center justify-center rounded-full group-hover:bg-slate-200 transition-colors shadow-inner">🏠</span>
            <span className="hidden sm:inline">Back to Landing</span>
          </Link>
          <div className="w-px h-6 bg-slate-200 hidden md:block"></div>
          <span className="text-sm font-black text-slate-800 hidden md:block tracking-tight">InsightGraphy Hub</span>
        </div>

        <nav className="flex gap-1 overflow-x-auto no-scrollbar w-full md:w-auto">
          <Link href="/dashboard" className="whitespace-nowrap px-5 py-2.5 rounded-xl text-xs font-black text-slate-500 hover:bg-teal-50 hover:text-teal-700 transition-all flex items-center gap-2">
            <span className="text-base">📂</span> 주차별 자료실
          </Link>
          <Link href="/archive" className="whitespace-nowrap px-5 py-2.5 rounded-xl text-xs font-black text-slate-500 hover:bg-teal-50 hover:text-teal-700 transition-all flex items-center gap-2">
            <span className="text-base">📚</span> 아카이브
          </Link>
          <Link href="/vote" className="whitespace-nowrap px-5 py-2.5 rounded-xl text-xs font-black text-slate-500 hover:bg-teal-50 hover:text-teal-700 transition-all flex items-center gap-2">
            <span className="text-base">🗳️</span> 실시간 투표
          </Link>
        </nav>
      </header>

      <Link href="/admin" className="fixed bottom-8 right-8 md:bottom-10 md:right-10 w-12 h-12 flex items-center justify-center bg-slate-800 text-white rounded-full hover:scale-110 transition-all opacity-30 hover:opacity-100 shadow-2xl z-[100] border-2 border-white/20">
        <span className="text-xl">⚙️</span>
      </Link>

      <div className="max-w-[1500px] w-full mx-auto grid grid-cols-1 xl:grid-cols-[1fr_350px] gap-8">
        
        {/* ======================================================== */}
        {/* 🌟 좌측: 메인 워크스페이스 (프로필 + 퀵 메뉴 그리드) */}
        {/* ======================================================== */}
        <div className="space-y-8">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div className="bg-gradient-to-br from-teal-600 via-blue-700 to-slate-900 p-8 rounded-[2rem] text-white shadow-xl relative overflow-hidden flex flex-col justify-center border border-teal-800/50">
              <img src="/logo.png" alt="IG Logo" className="absolute -right-10 -bottom-10 w-64 h-64 object-contain opacity-20 transform -rotate-12" />
              
              <div className="relative z-10">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-1 opacity-80 text-teal-100">Welcome back,</p>
                <h1 className="text-4xl font-black mb-1 drop-shadow-md">{user.user_metadata?.name || '학회원'} 님!</h1>
                <p className="text-xs font-bold opacity-80 mb-6 text-teal-50">InsightGraphy 멤버십</p>
                <button onClick={handleLogout} className="bg-white/10 hover:bg-white/20 w-fit px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest backdrop-blur-sm transition-colors border border-white/20 shadow-sm">
                  로그아웃 🚪
                </button>
              </div>
            </div>

            {/* 🌟 마감일 알림 카드 - 최신 로직 반영 */}
            <div className="bg-white p-8 rounded-[2rem] shadow-lg border border-slate-100 flex flex-col justify-center">
              <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
                <h2 className="text-sm font-black text-slate-800 flex items-center gap-2"><span>🚨</span> 다가오는 마감 일정</h2>
                <span className="bg-red-50 text-red-600 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">Upcoming</span>
              </div>
              
              <div className="space-y-3">
                {deadlines.length === 0 ? <p className="text-xs font-bold text-slate-400 py-4 text-center">예정된 마감일이 없습니다. 🙌</p> : deadlines.map((d, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100 hover:border-red-200 transition-colors shadow-sm">
                    <span className="text-xs font-black text-slate-600 flex items-center gap-2">
                      {/* 🌟 주차 뱃지 추가! */}
                      <span className="text-[9px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-md">{d.week}주차</span>
                      {getCategoryLabel(d.category)}
                    </span>
                    <span className="text-[10px] font-black text-red-500 bg-red-50 px-2 py-1 rounded-md">{formatTime(d.deadline_time)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 🌟 퀵 메뉴 타일 (회칙 열람 -> 발표영상 확인으로 변경!) */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-lg border border-slate-100">
            <h2 className="text-lg font-black text-slate-800 mb-6 border-b border-slate-100 pb-4">📌 Quick Services</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Tile href="/dashboard/proposal" icon="📄" title="기획서 제출함" desc="주차별 기획서 양식 다운 및 과제 제출" color="bg-blue-50" text="text-blue-700" />
              <Tile href="/dashboard/slide" icon="🖼️" title="발표 슬라이드" desc="완성된 발표 ppt를 드라이브로 제출" color="bg-indigo-50" text="text-indigo-700" />
              <Tile href="/dashboard/video" icon="🎬" title="발표영상 확인" desc="기록된 발표 영상을 감상 및 피드백" color="bg-red-50" text="text-red-700" />
              <Tile href="/vote" icon="🗳️" title="실시간 채점 투표" desc="오늘 진행되는 세션 발표자 평가하기" color="bg-teal-50" text="text-teal-700" />
              
              <Tile href="/vote/results" icon="🏆" title="채점 결과 & 랭킹" desc="나의 평가 점수와 명예의 전당 확인" color="bg-amber-50" text="text-amber-700" />
              <Tile href="/archive" icon="📚" title="통합 아카이브" desc="교육/특별세션 및 과거 학기 자료 열람" color="bg-purple-50" text="text-purple-700" />
              <Tile href="/archive/absence" icon="📝" title="사유서 제출" desc="결석, 지각, 조퇴 사전 보고서 제출" color="bg-rose-50" text="text-rose-700" />
              <Tile href="#" icon="⚙️" title="마이페이지" desc="(준비 중) 내 정보 및 누적 벌금 내역 확인" color="bg-slate-50" text="text-slate-400" />
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 🌟 우측: 미니 캘린더 및 일정 리스트 패널 */}
        {/* ======================================================== */}
        <aside className="w-full xl:w-[350px] bg-white rounded-[2.5rem] shadow-lg border border-slate-100 overflow-hidden flex flex-col min-h-[600px]">
          <div className="bg-slate-900 text-white p-6 pb-4">
            <div className="flex justify-between items-center mb-6">
              <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="text-slate-400 hover:text-white font-black text-lg">←</button>
              <h3 className="text-lg font-black tracking-widest uppercase text-teal-400">{year}. {String(month + 1).padStart(2, '0')}</h3>
              <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="text-slate-400 hover:text-white font-black text-lg">→</button>
            </div>
            <div className="grid grid-cols-7 text-center text-[9px] font-black text-slate-500 uppercase mb-2">
              <div className="text-red-400">Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div className="text-teal-400">Sa</div>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {blanks.map(b => <div key={`blank-${b}`} className="aspect-square" />)}
              {days.map(d => {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const hasEvent = schedules.some(s => s.full_date === dateStr);
                const isToday = new Date().toISOString().split('T')[0] === dateStr;
                return (
                  <div key={d} className={`aspect-square rounded-lg flex items-center justify-center text-xs font-black ${isToday ? 'bg-teal-500 text-white shadow-md' : hasEvent ? 'bg-slate-800 text-teal-300' : 'text-slate-300 hover:bg-slate-800/50'}`}>
                    {d}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="p-6 flex-1 overflow-y-auto no-scrollbar bg-white">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-4">이달의 상세 일정</h4>
            <div className="space-y-4">
              {eventsThisMonth.length > 0 ? eventsThisMonth.sort((a,b) => new Date(a.full_date) - new Date(b.full_date)).map((ev, idx) => (
                <div key={idx} className="flex gap-3 items-start bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${ev.is_public ? 'bg-teal-500' : 'bg-amber-400 shadow-sm'}`} />
                  <div>
                    <p className="text-[10px] font-black text-slate-400 mb-0.5">{ev.date_display} {ev.is_allday ? '(종일)' : `(${ev.start_time})`}</p>
                    <p className={`text-xs font-black text-slate-800 ${ev.is_break ? 'line-through opacity-50' : ''}`}>{ev.title}</p>
                    {ev.description && <p className="text-[10px] text-slate-500 font-bold mt-1 line-clamp-2 leading-tight">{ev.description}</p>}
                  </div>
                </div>
              )) : <p className="text-xs font-bold text-slate-400 text-center py-4">일정이 없습니다.</p>}
            </div>
          </div>
        </aside>

      </div>
    </div>
  )
}

function Tile({ href, icon, title, desc, color, text }) {
  return (
    <Link href={href} className={`${color} p-5 rounded-3xl border border-white/50 hover:border-black/5 shadow-sm hover:shadow-lg transition-all group flex flex-col gap-2`}>
      <span className="text-2xl group-hover:scale-110 transition-transform origin-left">{icon}</span>
      <div>
        <h3 className={`text-sm font-black ${text} tracking-tight`}>{title}</h3>
        <p className="text-[9px] font-bold text-slate-500 mt-1 leading-snug line-clamp-2">{desc}</p>
      </div>
    </Link>
  )
}