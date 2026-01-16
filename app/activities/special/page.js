'use client'
import Link from 'next/link'
import Image from 'next/image'

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

export default function SpecialSessionPage() {
  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] font-sans pt-32 pb-20 selection:bg-[#32a4a1] selection:text-white">
      <PublicNav />

      {/* 1. 세션 헤더 */}
      <section className="max-w-4xl mx-auto px-8 mb-20 text-center">
        <div className="inline-block bg-[#32a4a1]/10 text-[#32a4a1] px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-6">Activity 03</div>
        <h2 className="text-5xl font-black uppercase tracking-tighter mb-8">Union Session</h2>
        <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100">
          <p className="text-lg text-slate-600 leading-relaxed break-keep font-medium">
            연합세션은 정규 세션 외의 다양한 경험을 제공하기 위해 마련된 세션입니다.<br/>
            매 학기 <span className="text-[#32a4a1] font-black">서울대학교 프레젠테이션 학회 C!SL</span>과 함께 연합 프레젠테이션 세션을 진행하고 있습니다.
          </p>
        </div>
      </section>

      {/* 2. 25-2 하반기 프로젝트 */}
      <section className="py-20 px-8 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-20">
          <div className="space-y-6">
            <span className="text-[#32a4a1] font-black text-sm tracking-widest uppercase">2025 Autumn Semester</span>
            <h3 className="text-4xl font-black break-keep">‘중용 굿즈’ 기획 프로젝트</h3>
            <p className="text-slate-500 font-medium leading-relaxed break-keep">
              감정의 균형을 회복하는 과정을 물질적이고 감각적인 형태로 구현해 봄으로써 감정과 인간에 대해 이해하고, 중용의 지혜를 현대적으로 재해석하여 상품 판매를 기획합니다.
            </p>
            <div className="grid grid-cols-2 gap-4">
              {['회피와 무모', '무절제와 무감각', '성마름과 화낼 줄 모름', '자기비하와 자만'].map((item, i) => (
                <div key={i} className="bg-slate-50 p-4 rounded-xl border-l-4 border-[#32a4a1] text-sm font-bold">{item}</div>
              ))}
            </div>
          </div>
          <div className="relative h-[400px] rounded-[3rem] overflow-hidden shadow-2xl">
            <Image src="/special-25-2.webp" alt="25-2 Union Session" fill className="object-cover" />
          </div>
        </div>
      </section>

      {/* 3. 25-1 상반기 프로젝트 */}
      <section className="py-20 px-8 bg-slate-900 text-white overflow-hidden">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="relative h-[400px] rounded-[3rem] overflow-hidden shadow-2xl order-2 lg:order-1">
            <Image src="/special-251.webp" alt="25-1 Union Session" fill className="object-cover" />
          </div>
          <div className="space-y-6 order-1 lg:order-2">
            <span className="text-[#a8d0cd] font-black text-sm tracking-widest uppercase">2025 Spring Semester</span>
            <h3 className="text-4xl font-black break-keep text-[#a8d0cd]">갈등을 넘어, 새로운 공존을 모색하다</h3>
            <p className="opacity-70 font-medium leading-relaxed break-keep">
              각종 사회 갈등 현상을 분석하고, 이를 완화하거나 해결할 수 있는 창의적인 솔루션을 제시하는 경쟁 PT를 진행했습니다.
            </p>
            <ul className="space-y-3">
              {[
                {t: '세대 갈등', d: '청년과 기성세대 간 공존 방안'},
                {t: '계층 갈등', d: '경제적 불평등과 사회적 이동성'},
                {t: '문화/가치 갈등', d: '다문화, 젠더, 이주민 충돌 분석'},
                {t: '기술/환경 갈등', d: 'AI 및 기후 변화 이슈'}
              ].map((item, i) => (
                <li key={i} className="flex gap-4 items-start">
                  <span className="text-[#32a4a1] font-black">0{i+1}</span>
                  <div>
                    <p className="font-black text-sm">{item.t}</p>
                    <p className="text-xs opacity-50">{item.d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 4. 활동 스케치 (이미지 갤러리) */}
      <section className="py-32 px-8 max-w-6xl mx-auto">
        <h3 className="text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.5em] mb-16">Activity Sketch</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((num) => (
            <div key={num} className="relative h-64 rounded-2xl overflow-hidden group">
              <Image src={`/sketch-${num}.webp`} alt="Sketch" fill className="object-cover transition-transform group-hover:scale-110" />
              <div className="absolute inset-0 bg-[#32a4a1]/20 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          ))}
        </div>
      </section>

      <footer className="py-12 border-t border-slate-100 text-center bg-[#1a1a1a] text-white">
        <p className="text-[10px] font-black text-[#a8d0cd] uppercase tracking-[0.5em]">© 2026 InsightGraphy. All Rights Reserved.</p>
      </footer>
    </div>
  )
}