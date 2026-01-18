'use client'
import Link from 'next/link'
import Image from 'next/image'

// 상단 네비게이션 바 컴포넌트 (주소 수정 완료)
function PublicNav() {
  return (
    <nav className="fixed top-0 w-full bg-[#1a1a1a]/95 backdrop-blur-md text-white z-50 border-b border-white/5">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        {/* 레이아웃 컨테이너: PC에서는 한 줄, 모바일에서는 상단 바 역할 */}
        <div className="flex justify-between items-center h-[64px] md:h-[80px]">
          
          {/* 1. 로고 영역 */}
          <Link href="/" className="flex items-center gap-3 group shrink-0">
            <div className="relative w-8 h-8 md:w-9 md:h-9">
              <Image src="/logo.png" alt="IG Logo" fill className="object-contain" />
            </div>
            <span className="text-lg md:text-xl font-black uppercase tracking-tighter group-hover:text-[#a8d0cd] transition-colors">
              InsightGraphy
            </span>
          </Link>

          {/* 2. PC 전용 메뉴 (중간 정렬) */}
          <div className="hidden md:flex items-center gap-x-10 text-[11px] font-black uppercase tracking-widest text-white/60">
            <Link href="/about" className="hover:text-[#32a4a1] transition-colors">About</Link>
            <Link href="/activities" className="hover:text-[#32a4a1] transition-colors">Activities</Link>
            <Link href="/members" className="hover:text-[#32a4a1] transition-colors">Members</Link>
            <Link href="/showcase" className="hover:text-[#32a4a1] transition-colors">Showcase</Link>
            <Link href="/join" className="hover:text-[#32a4a1] transition-colors">Join Us</Link>
          </div>

          {/* 3. 우측 버튼 (PC/모바일 공용) */}
          <div className="flex items-center">
            <Link href="/login" className="bg-[#32a4a1] px-4 md:px-6 h-[32px] md:h-[38px] rounded-lg hover:bg-[#0d6b69] transition-all flex items-center justify-center text-white text-[10px] md:text-[11px] font-black uppercase shadow-lg shadow-brand-primary/20">
              Login
            </Link>
          </div>
        </div>

        {/* 4. 모바일 전용 메뉴 바 (가로 스크롤, PC에서는 숨김) */}
        <div className="md:hidden border-t border-white/5 overflow-x-auto no-scrollbar whitespace-nowrap py-3">
          <div className="flex items-center gap-x-8 px-2 text-[10px] font-black uppercase tracking-widest text-white/50">
            <Link href="/about" className="hover:text-[#32a4a1] active:text-[#32a4a1]">About</Link>
            <Link href="/activities" className="hover:text-[#32a4a1] active:text-[#32a4a1]">Activities</Link>
            <Link href="/members" className="hover:text-[#32a4a1] active:text-[#32a4a1]">Members</Link>
            <Link href="/showcase" className="hover:text-[#32a4a1] active:text-[#32a4a1]">Showcase</Link>
            <Link href="/join" className="hover:text-[#32a4a1] active:text-[#32a4a1]">Join Us</Link>
          </div>
        </div>
      </div>
      
      <style jsx>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </nav>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] font-sans">
      <PublicNav />
      
      {/* 히어로 섹션 */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#0d6b69] via-[#32a4a1] to-[#a8d0cd]">
        <div className="absolute inset-0 opacity-30 bg-black" />
        
        <div className="relative z-10 text-center text-white px-6">
          <p className="text-sm font-bold tracking-[0.5em] mb-4 opacity-80 uppercase text-[#a8d0cd]">Since 2012</p>
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter uppercase mb-6 leading-none drop-shadow-lg">
            Insight<br/>Graphy
          </h1>
          <p className="text-lg md:text-xl font-medium max-w-2xl mx-auto leading-relaxed break-keep opacity-95 drop-shadow-md">
            InsightGraphy는 서울대, 연세대, 고려대 연합 프레젠테이션 학회로 <br/>
            다양한 전공과 역량을 가진 학회원들이 모여 <br/>
            최고의 프레젠터가 되기 위한 훈련을 진행하고 있습니다.
          </p>
          
          {/* 메인 버튼 영역 (높이 및 수직 정렬 수정) */}
          <div className="mt-12 flex flex-col sm:flex-row justify-center items-center gap-4">
            <Link 
              href="/about" 
              className="px-10 h-[56px] bg-white text-[#1a1a1a] font-black uppercase text-[13px] tracking-widest rounded-full hover:bg-[#a8d0cd] transition-all shadow-lg flex items-center justify-center min-w-[180px]"
            >
              Learn More
            </Link>
            <Link 
              href="/join" 
              className="px-10 h-[56px] border-2 border-white text-white font-black uppercase text-[13px] tracking-widest rounded-full hover:bg-white hover:text-[#1a1a1a] transition-all shadow-lg flex items-center justify-center min-w-[180px]"
            >
              Apply Now
            </Link>
          </div>
        </div>
      </section>

      {/* 학회 가치 섹션 */}
      <section className="py-24 px-8 bg-white max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
        <div className="space-y-4 p-8 rounded-3xl hover:shadow-xl transition-all hover:bg-slate-50 flex flex-col items-center">
          <span className="text-5xl mb-2 text-[#32a4a1]">💡</span>
          <h3 className="text-2xl font-black uppercase">Insight</h3>
          <p className="text-sm leading-relaxed text-slate-600 break-keep">데이터 이면에 숨겨진 본질을 파악하고 비즈니스 문제를 해결하는 논리적 사고를 기릅니다.</p>
        </div>
        <div className="space-y-4 p-8 rounded-3xl hover:shadow-xl transition-all hover:bg-slate-50 flex flex-col items-center">
          <span className="text-5xl mb-2 text-[#32a4a1]">🎨</span>
          <h3 className="text-2xl font-black uppercase">Graphic</h3>
          <p className="text-sm leading-relaxed text-slate-600 break-keep">복잡한 정보를 한눈에 이해할 수 있도록 시각적 언어로 재구성하는 디자인 역량을 강화합니다.</p>
        </div>
        <div className="space-y-4 p-8 rounded-3xl hover:shadow-xl transition-all hover:bg-slate-50 flex flex-col items-center">
          <span className="text-5xl mb-2 text-[#32a4a1]">🎤</span>
          <h3 className="text-2xl font-black uppercase">Delivery</h3>
          <p className="text-sm leading-relaxed text-slate-600 break-keep">상대방의 마음을 움직이는 설득력 있는 스토리텔링과 완벽한 발표 기술을 연마합니다.</p>
        </div>
      </section>
      
      {/* 푸터 */}
      <footer className="py-12 border-t border-slate-100 text-center bg-[#1a1a1a] text-white">
        <div className="relative w-10 h-10 mx-auto mb-6 opacity-60">
          <Image src="/logo.png" alt="InsightGraphy Logo" fill className="object-contain grayscale hover:grayscale-0 transition-all" />
        </div>
        <p className="text-[10px] font-black text-[#a8d0cd] uppercase tracking-[0.5em]">© 2012 InsightGraphy. All Rights Reserved.</p>
      </footer>
    </div>
  )
}