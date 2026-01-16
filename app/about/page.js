'use client'
import Link from 'next/link'
import Image from 'next/image'

// 상단 네비게이션
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
        <Link href="/about" className="text-[#32a4a1]">About</Link>
        <Link href="/activities" className="hover:text-[#32a4a1] transition-colors">Activities</Link>
        <Link href="/members" className="hover:text-[#32a4a1] transition-colors">Members</Link>
        <Link href="/showcase" className="hover:text-[#32a4a1] transition-colors">Showcase</Link>
        <Link href="/join" className="hover:text-[#32a4a1] transition-colors">Join Us</Link>
        <Link href="/login" className="bg-[#32a4a1] px-6 h-[36px] rounded-lg hover:bg-[#0d6b69] transition-all flex items-center justify-center text-white">Login</Link>
      </div>
    </nav>
  )
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] font-sans pt-32 selection:bg-[#32a4a1] selection:text-white">
      <PublicNav />
      
      {/* 1. 비전 및 소개 섹션 */}
      <section className="max-w-4xl mx-auto px-8 mb-24">
        <div className="text-center mb-16">
          <p className="text-[#32a4a1] font-black tracking-[0.3em] uppercase text-s mb-6">Our Vision</p>
          <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter mb-10 leading-tight">
            Precision in Vision,<br/>Value in Insight.
          </h2>
        </div>
        
        <div className="space-y-8 text-lg text-slate-700 leading-relaxed break-keep font-medium bg-slate-50 p-10 rounded-[3rem] border border-slate-100">
          <p>
            InsightGraphy는 2012년 설립된 서울대, 연세대, 고려대 연합 프레젠테이션 학회로 다양한 전공과 역량을 가진 학회원들이 모여 최고의 프레젠터가 되기 위한 훈련을 진행하고 있습니다.
          </p>
          <p>
            현대 사회에서는 발표 기술과 소통 능력이 더 중요해졌습니다. 전공이나 진로와 상관없이 자신을 효과적으로 어필하고 원활하게 소통하는 능력은 필수적입니다.
          </p>
          <p className="text-[#32a4a1] font-black">
            노력의 결실도, 세상을 바꿀 귀한 생각도, 스스로 다져온 실력도 많은 사람들 앞에 표현할 수 있을 때 비로소 그 의미를 꽃피울 수 있습니다.
          </p>
        </div>
      </section>

      {/* 2. 3대 핵심 가치 (Core Values) - 이미지 상단 스타일 적용 */}
      <section className="py-24 px-8 bg-[#111111] text-white">
        <div className="max-w-5xl mx-auto">
          <h3 className="text-center text-[25px] font-black text-slate-500 uppercase tracking-[0.5em] mb-16">3 Core Values</h3>
          <div className="flex flex-col gap-5">
            <div className="bg-[#2d3e50] p-8 rounded-2xl flex items-center gap-6 border-l-8 border-[#3b82f6]">
              <span className="text-3xl">📄</span>
              <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-6">
                <h4 className="text-xl font-black min-w-[60px]">기획</h4>
                <p className="opacity-80 font-medium text-sm md:text-base">매주 다양하고 시의적인 주제에 대해 창의적으로 문제 정의 및 해결</p>
              </div>
            </div>
            <div className="bg-[#2d3d33] p-8 rounded-2xl flex items-center gap-6 border-l-8 border-[#22c55e]">
              <span className="text-3xl">📢</span>
              <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-6">
                <h4 className="text-xl font-black min-w-[60px]">발표</h4>
                <p className="opacity-80 font-medium text-sm md:text-base">도출한 해결책 및 시사점을 자신만의 컨텐츠로 공유</p>
              </div>
            </div>
            <div className="bg-[#4d452e] p-8 rounded-2xl flex items-center gap-6 border-l-8 border-[#eab308]">
              <span className="text-3xl">👯</span>
              <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-6">
                <h4 className="text-xl font-black min-w-[60px]">소통</h4>
                <p className="opacity-80 font-medium text-sm md:text-base">피드백을 통해 성숙한 기획자 및 프레젠터로 성장</p>
              </div>
            </div>
          </div>
          <p className="text-center mt-12 font-bold opacity-50 text-sm italic">위의 3가지 핵심 가치를 추구하고 완성도 있는 활동을 진행 중입니다.</p>
        </div>
      </section>

      {/* 3. IGD 핵심 역량 (Framework) - 이미지 중단 스타일 적용 */}
      <section className="bg-white py-32 px-8">
        <div className="max-w-5xl mx-auto text-center">
          <h3 className="text-[20px] font-black text-slate-400 uppercase tracking-[0.5em] mb-20">IGD Core Competency</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-[#2d3e50] p-10 rounded-[2.5rem] text-white shadow-xl flex flex-col items-center">
              <span className="text-4xl mb-6">💡</span>
              <h4 className="text-2xl font-black uppercase mb-4 text-[#a8d0cd]">Insight</h4>
              <p className="text-sm font-bold opacity-90 break-keep">깊은 생각으로 끌어내는 통찰력</p>
              <span className="mt-2 text-[10px] opacity-40 uppercase">(Insight)</span>
            </div>
            
            <div className="bg-[#2d3d33] p-10 rounded-[2.5rem] text-white shadow-xl flex flex-col items-center">
              <span className="text-4xl mb-6">🪜</span>
              <h4 className="text-2xl font-black uppercase mb-4 text-[#a8d0cd]">Graphic</h4>
              <p className="text-sm font-bold opacity-90 break-keep">효과적인 표현을 위한 시각화 능력</p>
              <span className="mt-2 text-[10px] opacity-40 uppercase">(Graphic)</span>
            </div>

            <div className="bg-[#4d452e] p-10 rounded-[2.5rem] text-white shadow-xl flex flex-col items-center">
              <span className="text-4xl mb-6">🗣️</span>
              <h4 className="text-2xl font-black uppercase mb-4 text-[#a8d0cd]">Delivery</h4>
              <p className="text-sm font-bold opacity-90 break-keep">명확하고 자신 있는 전달력</p>
              <span className="mt-2 text-[10px] opacity-40 uppercase">(Delivery)</span>
            </div>
          </div>
          <p className="mt-16 font-black text-xl text-slate-400">위 3가지 핵심 역량에서의 유의미한 성장을 목표로 합니다.</p>
        </div>
      </section>

      {/* 4. 환영 문구 섹션 - 이미지 하단 텍스트 적용 */}
      <section className="py-24 px-8 bg-slate-50 text-center border-y border-slate-100">
        <div className="max-w-4xl mx-auto">
          <p className="text-xl md:text-2xl font-black leading-relaxed text-slate-800 break-keep">
            발표에 대한 자신의 한계에 도전하는,<br/>
            더 이상 무대와 많은 청중 앞에서 떨지 않을,<br/>
            자신의 창의적인 아이디어를 당당하게 말하며 성장할<br/>
            스스로를 마주하게 될 <span className="text-[#32a4a1]">IGer들을 환영합니다 🖐️</span>
          </p>
          <div className="mt-12">
             <Link href="/join" className="px-12 py-5 bg-[#32a4a1] text-white font-black uppercase tracking-widest rounded-full hover:bg-[#0d6b69] transition-all shadow-xl hover:scale-110 active:scale-95">
                Join InsightGraphy
             </Link>
          </div>
        </div>
      </section>

      <footer className="py-12 text-center bg-[#1a1a1a] text-white">
        <p className="text-[10px] font-black text-[#a8d0cd] uppercase tracking-[0.5em]">© 2026 InsightGraphy. All Rights Reserved.</p>
      </footer>
    </div>
  )
}