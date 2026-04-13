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

      const { data: dlData } = await supabase.from('pr_deadlines').select('*')
      if (dlData) {
        const now = new Date()
        const excludeCategories = ['attendance_start', 'session_start', 'attendance_end']
        const upcomingDl = dlData.filter(d => 
          d.deadline_time && 
          new Date(d.deadline_time) > now && 
          !excludeCategories.includes(d.category)
        )
        
        upcomingDl.sort((a, b) => new Date(a.deadline_time) - new Date(b.deadline_time))
        setDeadlines(upcomingDl.slice(0, 6))
      }
    }
    
    initHub()
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const formatTime = (dateStr) => {
    if(!dateStr) return ''
    const d = new Date(dateStr)
    const month = d.getMonth() + 1
    const date = d.getDate()
    let hours = d.getHours()
    const minutes = String(d.getMinutes()).padStart(2, '0')
    const ampm = hours >= 12 ? '오후' : '오전'
    hours = hours % 12
    hours = hours ? hours : 12
    return `${month}/${date} ${ampm} ${hours}:${minutes}`
  }

  const getCategoryLabel = (category) => {
    switch(category) {
      case 'proposal': return '기획서 제출';
      case 'slide': return '슬라이드 제출';
      case 'video': return '발표영상 등록';
      case 'proposal_comment': return '기획서 피드백';
      case 'vote_feedback': return '정성 피드백';
      case 'video_comment': return '셀프 피드백';
      case 'absence': return '사유서 제출';
      default: return `${category} 마감`;
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

  if (!user) return <div className="min-h-screen bg-white flex items-center justify-center font-bold text-slate-400">로딩 중...</div>

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans relative pb-20">
      
      {/* 🌟 GNB (진한 청록색 포인트 적용) */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-50">
        <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row items-center justify-between px-6 h-auto md:h-[72px]">
          
          <div className="flex items-center gap-3 py-4 md:py-0 w-full md:w-auto justify-between md:justify-start">
            <span className="text-xl font-black text-teal-800 tracking-tighter cursor-default">InsightGraphy</span>
          </div>

          <nav className="flex items-center gap-8 w-full md:w-auto h-full overflow-visible">
            <Link href="/home" className="text-sm font-extrabold text-teal-800 border-b-[3px] border-teal-800 h-full flex items-center shrink-0">
              소개 / 홈
            </Link>

            {/* 주차별 자료실 드롭다운 */}
            <div className="relative group h-full flex items-center shrink-0">
              <div className="text-sm font-bold text-slate-600 group-hover:text-teal-800 transition-colors cursor-default h-full flex items-center gap-1 border-b-[3px] border-transparent group-hover:border-teal-800">
                주차별 자료실 <span className="text-[9px] mt-0.5">▼</span>
              </div>
              
              <div className="absolute top-full left-0 w-44 bg-[#0a1526] flex-col hidden group-hover:flex z-50 shadow-2xl border-t-2 border-teal-600">
                <Link href="/dashboard/proposal" className="px-5 py-3.5 text-xs font-bold text-slate-200 hover:bg-teal-700 hover:text-white border-b border-white/5 transition-colors">
                  기획서 제출
                </Link>
                <Link href="/dashboard/slide" className="px-5 py-3.5 text-xs font-bold text-slate-200 hover:bg-teal-700 hover:text-white border-b border-white/5 transition-colors">
                  슬라이드 제출
                </Link>
                <Link href="/dashboard/video" className="px-5 py-3.5 text-xs font-bold text-slate-200 hover:bg-teal-700 hover:text-white transition-colors">
                  발표영상 확인
                </Link>
              </div>
            </div>

            <Link href="/archive" className="text-sm font-bold text-slate-600 hover:text-teal-800 transition-colors h-full flex items-center border-b-[3px] border-transparent hover:border-teal-800 shrink-0">
              아카이브
            </Link>

            {/* 🌟 실시간 투표 드롭다운 추가 */}
            <div className="relative group h-full flex items-center shrink-0">
              <div className="text-sm font-bold text-slate-600 group-hover:text-teal-800 transition-colors cursor-default h-full flex items-center gap-1 border-b-[3px] border-transparent group-hover:border-teal-800">
                실시간 투표 <span className="text-[9px] mt-0.5">▼</span>
              </div>
              
              <div className="absolute top-full left-0 w-[180px] bg-[#0a1526] flex-col hidden group-hover:flex z-50 shadow-2xl border-t-2 border-teal-600">
                <Link href="/vote/score" className="px-5 py-3.5 text-xs font-bold text-slate-200 hover:bg-teal-700 hover:text-white border-b border-white/5 transition-colors">
                  발표 채점
                </Link>
                <Link href="/vote/feedback" className="px-5 py-3.5 text-xs font-bold text-slate-200 hover:bg-teal-700 hover:text-white border-b border-white/5 transition-colors">
                  임시저장 피드백
                </Link>
                <Link href="/vote/results/my" className="px-5 py-3.5 text-xs font-bold text-slate-200 hover:bg-teal-700 hover:text-white border-b border-white/5 transition-colors">
                  결과 확인
                </Link>
                <Link href="/vote/results/arxiv" className="px-5 py-3.5 text-xs font-bold text-slate-200 hover:bg-teal-700 hover:text-white border-b border-white/5 transition-colors">
                  피드백 확인
                </Link>
                <Link href="/vote/results/ranking" className="px-5 py-3.5 text-xs font-bold text-slate-200 hover:bg-teal-700 hover:text-white transition-colors">
                  베스트 프레젠터 확인
                </Link>
              </div>
            </div>

          </nav>
        </div>
      </header>

      <Link href="/admin" className="fixed bottom-8 right-8 md:bottom-10 md:right-10 w-12 h-12 flex items-center justify-center bg-slate-900 text-white rounded-none hover:bg-teal-800 transition-all opacity-30 hover:opacity-100 shadow-xl z-[100] border border-slate-800">
        <span className="text-xl">⚙️</span>
      </Link>

      <div className="max-w-[1200px] w-full mx-auto grid grid-cols-1 xl:grid-cols-[1fr_350px] gap-12 mt-12 px-6">
        
        {/* ======================================================== */}
        {/* 🌟 좌측: 메인 워크스페이스 */}
        {/* ======================================================== */}
        <div className="space-y-12">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            
            {/* 🌟 1. 출석 섹션 (높이 360px 고정) */}
            <div 
              onClick={() => router.push('/attendance')}
              className="bg-gradient-to-br from-teal-700 via-teal-800 to-slate-900 p-8 text-white relative overflow-hidden flex flex-col justify-between cursor-pointer group h-[360px] shadow-sm rounded-none"
            >
              <img src="/logo.png" alt="IG Logo" className="absolute -right-10 -bottom-10 w-80 h-80 object-contain opacity-20 transform -rotate-12 group-hover:scale-110 transition-transform duration-500" />
              
              <div className="relative z-10 flex flex-col justify-center h-full">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-2 opacity-80 text-teal-100 mt-4">Welcome back,</p>
                <h1 className="text-4xl md:text-5xl font-extrabold mb-1 drop-shadow-sm">{user.user_metadata?.name || '학회원'} 님</h1>
                <p className="text-xs font-medium opacity-80 text-teal-50 mt-1">InsightGraphy 멤버십</p>
              </div>

              <div className="relative z-10 flex justify-between items-end pt-4 border-t border-white/20">
                <div className="bg-white/10 px-4 py-2.5 text-xs font-bold flex items-center gap-2 backdrop-blur-md border border-white/20 hover:bg-white text-white hover:text-teal-900 transition-all">
                  세션 출석체크 →
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleLogout(); }} className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest transition-colors text-white/60 hover:text-white">로그아웃</button>
              </div>
            </div>

            {/* 🌟 2. 마감일 알림 (높이 360px 고정) */}
            <div className="border-t-[3px] border-teal-800 pt-5 flex flex-col h-[360px]">
              <div className="flex justify-between items-end mb-4">
                <h2 className="text-lg font-extrabold text-slate-900">다가오는 마감 일정</h2>
                <span className="text-[10px] font-black text-teal-600 uppercase tracking-widest">Upcoming</span>
              </div>
              <div className="border-t border-slate-200 flex-1 overflow-y-auto no-scrollbar">
                {deadlines.length === 0 ? (
                  <p className="text-xs font-medium text-slate-400 py-10 text-center border-b border-slate-100">예정된 마감일이 없습니다.</p>
                ) : deadlines.map((d, idx) => (
                  <div key={idx} className="flex justify-between items-center py-4 border-b border-slate-100 group hover:bg-slate-50 transition-colors px-1">
                    <span className="text-[13px] font-bold text-slate-800 flex items-center gap-3">
                      <span className="text-[9px] font-black bg-teal-800 text-white px-2 py-0.5 rounded-none w-10 text-center">{d.week}W</span>
                      {getCategoryLabel(d.category)}
                    </span>
                    <span className="text-[11px] font-extrabold text-teal-700">{formatTime(d.deadline_time)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 🌟 퀵 메뉴 */}
          <div className="border-t-[3px] border-teal-800 pt-5">
            <h2 className="text-lg font-extrabold text-slate-900 mb-6">Quick Services</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-10 border-t border-slate-100 pt-8">
              <Tile href="/dashboard/proposal" icon="📄" title="기획서 제출" desc="과제 양식 및 제출" iconColor="text-blue-600" hoverText="group-hover:text-teal-800" />
              <Tile href="/dashboard/slide" icon="🖼️" title="발표 슬라이드" desc="발표용 ppt 드라이브" iconColor="text-purple-600" hoverText="group-hover:text-teal-800" />
              <Tile href="/dashboard/video" icon="🎬" title="발표영상" desc="발표 영상 및 피드백" iconColor="text-red-600" hoverText="group-hover:text-teal-800" />
              <Tile href="/vote/score" icon="🗳️" title="실시간 투표" desc="오늘의 세션 평가" iconColor="text-teal-600" hoverText="group-hover:text-teal-800" />
              
              <Tile href="/vote/results/ranking" icon="🏆" title="결과 & 랭킹" desc="내 점수와 랭킹 확인" iconColor="text-amber-500" hoverText="group-hover:text-teal-800" />
              <Tile href="/archive" icon="📚" title="아카이브" desc="과거 자료 열람" iconColor="text-slate-700" hoverText="group-hover:text-teal-800" />
              <Tile href="/archive/absence" icon="📝" title="사유서" desc="결석/지각/조퇴 제출" iconColor="text-rose-600" hoverText="group-hover:text-teal-800" />
              <Tile href="#" icon="⚙️" title="마이페이지" desc="내 정보 (준비 중)" iconColor="text-slate-400" hoverText="group-hover:text-teal-800" />
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 🌟 우측: 사이드바 (달력 + 일정) */}
        {/* ======================================================== */}
        <aside className="w-full xl:w-[350px] flex flex-col space-y-12">
          
          {/* 🌟 3. 달력 섹션 (높이 360px 고정) */}
          <div className="border-t-[3px] border-teal-800 pt-5 flex flex-col h-[360px]">
            <div className="flex justify-between items-end mb-4">
              <h3 className="text-lg font-extrabold text-slate-900">Calendar</h3>
            </div>
            
            <div className="border-t border-slate-200 flex-1 flex flex-col pt-5">
              <div className="flex justify-between items-center mb-5 px-2">
                <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="text-slate-400 hover:text-teal-800 font-black text-sm transition-colors">◀</button>
                <h4 className="text-sm font-extrabold text-slate-800 tracking-widest">{year}. {String(month + 1).padStart(2, '0')}</h4>
                <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="text-slate-400 hover:text-teal-800 font-black text-sm transition-colors">▶</button>
              </div>
              
              <div className="grid grid-cols-7 text-center text-[10px] font-bold text-slate-400 mb-2">
                <div className="text-red-500">SU</div><div>MO</div><div>TU</div><div>WE</div><div>TH</div><div>FR</div><div className="text-teal-600">SA</div>
              </div>
              
              <div className="grid grid-cols-7 gap-y-1 gap-x-1 flex-1 content-start">
                {blanks.map(b => <div key={`blank-${b}`} className="h-8" />)}
                {days.map(d => {
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                  const hasEvent = schedules.some(s => s.full_date === dateStr);
                  const isToday = new Date().toISOString().split('T')[0] === dateStr;
                  return (
                    <div key={d} className={`h-8 flex items-center justify-center text-[11px] font-bold transition-all ${isToday ? 'border-b-2 border-teal-800 text-teal-800' : hasEvent ? 'text-teal-900 bg-teal-50 rounded-none border border-teal-100' : 'text-slate-500 hover:text-teal-800'}`}>
                      {d}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* 🌟 스케줄 섹션 */}
          <div className="border-t-[3px] border-teal-800 pt-5">
            <h4 className="text-lg font-extrabold text-slate-900 mb-4">Schedule</h4>
            <div className="border-t border-slate-200 pt-2 max-h-[400px] overflow-y-auto no-scrollbar">
              {eventsThisMonth.length > 0 ? eventsThisMonth.sort((a,b) => new Date(a.full_date) - new Date(b.full_date)).map((ev, idx) => (
                <div key={idx} className="flex gap-4 items-start py-4 border-b border-slate-100 last:border-0 group transition-all px-1">
                  <div className={`w-[3px] h-full min-h-[36px] shrink-0 ${ev.is_public ? 'bg-teal-700' : 'bg-slate-300'}`} />
                  <div className="flex-1">
                    <p className="text-[10px] font-bold text-slate-400 mb-1">{ev.date_display} {ev.is_allday ? '(종일)' : `(${ev.start_time})`}</p>
                    <p className={`text-[14px] font-bold text-slate-800 ${ev.is_break ? 'line-through text-slate-400' : 'group-hover:text-teal-800 transition-colors'}`}>{ev.title}</p>
                    {ev.description && <p className="text-[11px] text-slate-500 font-medium mt-1.5 leading-snug">{ev.description}</p>}
                  </div>
                </div>
              )) : <p className="text-sm font-medium text-slate-400 text-center py-10">이달의 일정이 없습니다.</p>}
            </div>
          </div>

        </aside>

      </div>
    </div>
  )
}

function Tile({ href, icon, title, desc, iconColor, hoverText }) {
  return (
    <Link href={href} className="group flex flex-col gap-1.5 border-b border-transparent hover:border-teal-200 pb-5 transition-all">
      <div className="flex items-center gap-3 mb-1">
        <span className={`text-2xl shrink-0 ${iconColor}`}>{icon}</span>
        <h3 className={`text-[15px] font-extrabold text-slate-800 tracking-tight transition-colors ${hoverText}`}>{title}</h3>
      </div>
      <p className="text-[11px] font-medium text-slate-500 leading-relaxed border-l-2 border-slate-100 pl-4 ml-1 group-hover:border-teal-400 transition-colors">{desc}</p>
    </Link>
  )
}