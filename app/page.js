'use client'
import Link from 'next/link'
import Image from 'next/image'

// 상단 네비게이션 바 컴포넌트 (주소 수정 완료)
function PublicNav() {
  return (
    <nav className="fixed top-0 w-full px-12 py-4 flex justify-between items-center bg-[#1a1a1a] text-white z-50 border-b border-white/5">
      {/* 왼쪽: 로고 영역 */}
      <Link href="/" className="flex items-center gap-3 group">
        <div className="relative w-8 h-8">
          <Image src="/logo.png" alt="IG Logo" fill className="object-contain" />
        </div>
        <span className="text-xl font-black uppercase tracking-tighter group-hover:text-[#a8d0cd] transition-colors">
          InsightGraphy
        </span>
      </Link>
      
      {/* 오른쪽: 메뉴 및 버튼 영역 (주소에서 /public 삭제) */}
      <div className="flex items-center gap-x-10 text-[13px] font-black uppercase tracking-widest">
        <Link href="/about" className="hover:text-[#32a4a1] transition-colors">About</Link>
        <Link href="/activities" className="hover:text-[#32a4a1] transition-colors">Activities</Link>
        <Link href="/members" className="hover:text-[#32a4a1] transition-colors">Members</Link>
        <Link href="/showcase" className="hover:text-[#32a4a1] transition-colors">Showcase</Link>
        <Link href="/join" className="hover:text-[#32a4a1] transition-colors">Join Us</Link>
        
        {/* 로그인 버튼 */}
        <Link 
          href="/login" 
          className="bg-[#32a4a1] px-6 h-[36px] rounded-lg hover:bg-[#0d6b69] transition-all text-white flex items-center justify-center"
        >
          Login
        </Link>
      </div>
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