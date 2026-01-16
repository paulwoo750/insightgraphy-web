'use client'
import Link from 'next/link'
import Image from 'next/image'

// 상단 네비게이션 (공통 서식 및 경로 유지)
function PublicNav() {
  return (
    <nav className="fixed top-0 w-full px-12 py-4 flex justify-between items-center bg-[#1a1a1a] text-white z-50 border-b border-white/5">
      <Link href="/" className="flex items-center gap-3 group">
        <div className="relative w-8 h-8">
          <Image src="/logo.png" alt="IG Logo" fill className="object-contain" />
        </div>
        <span className="text-xl font-black uppercase tracking-tighter group-hover:text-[#a8d0cd] transition-colors">InsightGraphy</span>
      </Link>
      <div className="flex items-center gap-x-10 text-[11px] font-black uppercase tracking-widest text-white/70">
        <Link href="/about" className="hover:text-[#32a4a1] transition-colors">About</Link>
        <Link href="/activities" className="text-[#32a4a1]">Activities</Link>
        <Link href="/members" className="hover:text-[#32a4a1] transition-colors">Members</Link>
        <Link href="/showcase" className="hover:text-[#32a4a1] transition-colors">Showcase</Link>
        <Link href="/join" className="hover:text-[#32a4a1] transition-colors">Join Us</Link>
        <Link href="/login" className="bg-[#32a4a1] px-6 h-[36px] rounded-lg hover:bg-[#0d6b69] transition-all flex items-center justify-center text-white">Login</Link>
      </div>
    </nav>
  )
}

export default function ActivitiesPage() {
  const activities = [
    {
      id: "01",
      title: "정규 세션",
      icon: <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
      desc: "매주 다양한 주제에 대해 문제 해결 방안을 발표하는 정기적인 세션",
      link: "/activities/regular",
      color: "bg-[#2d3e50]" 
    },
    {
      id: "02",
      title: "교육 세션",
      icon: <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>,
      desc: "인사이트, 그래픽, 딜리버리 역량 향상을 위한 내, 외부적 교육 및 실습 세션",
      link: "/activities/education",
      color: "bg-[#1a1a1a]" 
    },
    {
      id: "03",
      title: "특별 세션",
      icon: <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-7.714 2.143L11 21l-2.286-6.857L1 12l7.714-2.143L11 5z" /></svg>,
      desc: "연합세션, 공모전 기획 등 정규세션 이외의 비정기적 세션",
      link: "/activities/special",
      color: "bg-[#32a4a1]" 
    },
    {
      id: "04",
      title: "기업 세션",
      icon: <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
      desc: "기업과의 연계를 통해 IG만의 통찰력을 공유하고 함께 성장하는 프로젝트 세션",
      link: "/activities/corporate",
      color: "bg-[#0d6b69]" 
    }
  ]

  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] font-sans pt-32 pb-20">
      <PublicNav />

      {/* 헤더 섹션 */}
      <section className="max-w-6xl mx-auto px-8 mb-20 text-center">
        <p className="text-[#32a4a1] font-black tracking-[0.3em] uppercase text-xs mb-4">What we do</p>
        <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tighter mb-6">Our Activities</h2>
        <p className="text-slate-500 font-medium max-w-2xl mx-auto break-keep">
          InsightGraphy는 전문적인 프레젠터로 거듭나기 위해 체계적인 4가지 세션 프로그램을 운영합니다. 
          각 세션을 통해 기획력, 시각화, 전달력을 종합적으로 함양합니다.
        </p>
      </section>

      {/* 활동 카드 그리드 섹션 */}
      <section className="max-w-7xl mx-auto px-8 relative">
        {/* 중앙 로고 장식 */}
        <div className="hidden lg:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-white rounded-full shadow-2xl z-10 border-8 border-slate-50 p-6">
            <div className="relative w-full h-full">
                <Image src="/logo.png" alt="Center Logo" fill className="object-contain opacity-100" />
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
          {activities.map((act) => (
            <Link 
              href={act.link} 
              key={act.id}
              className={`${act.color} p-10 rounded-[2.5rem] text-white transition-all duration-500 hover:scale-[1.03] hover:shadow-2xl group flex flex-col justify-between h-[280px]`}
            >
              <div>
                <div className="flex justify-between items-start mb-2">
                  <span className="text-5xl font-black opacity-30 group-hover:opacity-100 transition-opacity">{act.id}</span>
                  <span className="bg-white/20 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-all">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </span>
                </div>
                {/* 글씨 크기 키우고 아이콘 배치 */}
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{act.icon}</span>
                  <h3 className="text-4xl font-black">{act.title}</h3>
                </div>
              </div>
              <p className="text-white/80 font-medium leading-relaxed break-keep text-sm">
                {act.desc}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-20 text-center">
        <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Click each card to see details</p>
      </div>

      <footer className="py-12 border-t border-slate-100 text-center bg-[#1a1a1a] text-white mt-20">
        <p className="text-[10px] font-black text-[#a8d0cd] uppercase tracking-[0.5em]">© 2026 InsightGraphy. All Rights Reserved.</p>
      </footer>
    </div>
  )
}