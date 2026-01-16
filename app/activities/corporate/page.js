'use client'
import Link from 'next/link'
import Image from 'next/image'

// 상단 네비게이션 (기존 서식 절대 유지)
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

export default function CorporateSessionPage() {
  // 1. 파트너사 데이터를 이름과 이미지 경로 세트로 구성
  const partnerLogos = [
    { name: "법무법인 마중", img: "/partners/majoong.png" },
    { name: "motemote", img: "/partners/motemote.png" },
    { name: "UT", img: "/partners/ut.png" },
    { name: "InBody", img: "/partners/inbody.png" },
    { name: "CELLTRION", img: "/partners/celltrion.svg" },
    { name: "megastudy", img: "/partners/megastudy.png" },
    { name: "배달의민족", img: "/partners/baemin.png" },
    { name: "Bapul", img: "/partners/bapul.png" },
    { name: "BRAND DOCUMENTARY MAGAZINE", img: "/partners/magazine-b.png" },
    { name: "배달특급", img: "/partners/delivery-express.png" }
  ];

  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] font-sans pt-32 pb-20 selection:bg-[#32a4a1] selection:text-white">
      <PublicNav />

      {/* 1. 세션 헤더 및 제휴 기업 */}
      <section className="max-w-5xl mx-auto px-8 mb-24">
        <div className="text-center mb-16">
          <div className="inline-block bg-[#32a4a1]/10 text-[#32a4a1] px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-6">Activity 04</div>
          <h2 className="text-5xl font-black uppercase tracking-tighter mb-8 text-black">Corporate Session</h2>
          <p className="text-lg text-slate-600 leading-relaxed break-keep font-medium bg-slate-50 p-8 rounded-[2rem] border border-slate-100">
            기업세션은 방학기간 중 기업과 연계하여 진행하는 프로젝트형 세션입니다. 매 방학 기업에서 제시한 과제에 대해 IG 학회원들의 창의적인 아이디어를 모으고 솔루션을 기획하여 기업 측에 PT 발표를 진행합니다.
          </p>
        </div>

        {/* 2. Our Partners 로고 그리드: 흑백/투명도 효과 제거 버전 */}
        <div className="space-y-10 text-center">
          <p className="text-s font-black text-slate-400 uppercase tracking-widest">IG와 함께 성장한 기업들</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-x-8 gap-y-10 items-center justify-items-center">
            {partnerLogos.map((partner, idx) => (
              <div key={idx} className="relative w-32 h-12">
                {/* grayscale과 opacity 설정을 제거하여 상시 컬러로 노출 */}
                <Image 
                  src={partner.img} 
                  alt={partner.name} 
                  fill 
                  className="object-contain" 
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 2. 메인 프로젝트: 트리플래닛 X IG */}
      <section className="py-24 bg-[#1a1a1a] text-white">
        <div className="max-w-6xl mx-auto px-8">
          <div className="flex flex-col md:flex-row items-center gap-12 mb-20">
            <div className="flex-1 space-y-4">
              <span className="text-[#32a4a1] font-black tracking-widest uppercase">Special Case Study</span>
              <h3 className="text-4xl font-black">26기 & 27기 기업세션<br/>트리플래닛 X IG</h3>
            </div>
            <div className="relative w-48 h-48 bg-white rounded-3xl p-6">
              <Image src="/logo-treeplanet.png" alt="Tree Planet Logo" fill className="object-contain p-4" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8">
            <div className="bg-[#2d3d33] p-10 rounded-[2.5rem] border border-white/5">
              <h4 className="text-[#a8d0cd] font-black text-xl mb-6 flex items-center gap-3">♻️ 트리플래닛이란 기업은?</h4>
              <p className="text-lg font-bold mb-4">"Plant For All"</p>
              <ul className="text-sm opacity-80 space-y-2 font-medium">
                <li>• 모든 사람이 나무를 심을 수 있는 세상을 조성하는 것을 목표로 하는 소셜 벤처 기업</li>
                <li>• 지구 환경 보전 문제를 해결하는 것을 미션으로 하며, 숲 조성을 위한 B2B 사업 위주</li>
                <li>• 해외 숲 조성, 묘목 개발, 반려나무 판매 등의 사업 진행</li>
              </ul>
            </div>

            <div className="bg-[#4d452e] p-10 rounded-[2.5rem] border border-white/5">
              <h4 className="text-[#a8d0cd] font-black text-xl mb-6 flex items-center gap-3">✅ 세션 내용은?</h4>
              <p className="text-lg font-bold mb-4">산불 피해 복구 인식 캠페인 기획</p>
              <ul className="text-sm opacity-80 space-y-2 font-medium">
                <li>• 젊은 세대의 환경에 대한 경각심을 일깨우고</li>
                <li>• 산불 피해 복구의 필요성에 대한 인식을 실제 행동으로 옮길 수 있게끔 하는 글로벌하고 창의적인 방안을 제안</li>
              </ul>
            </div>

            <div className="bg-[#2d3e50] p-10 rounded-[2.5rem] border border-white/5">
              <h4 className="text-[#a8d0cd] font-black text-xl mb-6 flex items-center gap-3">🗣️ 세션 진행 방식</h4>
              <ul className="text-sm opacity-80 space-y-2 font-medium">
                <li>• 약 4개의 조를 편성하여 조별로 기획 발표 준비 후 최종 발표</li>
                <li>• 최우수 팀의 아이디어를 기반으로 캠페인 집행, 희망 학회원에 한해 해당 과정 전반에 참여</li>
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
            {[1, 2, 3].map((n) => (
              <div key={n} className="relative h-64 rounded-2xl overflow-hidden shadow-2xl">
                <Image src={`/activities/corporate-session-${n}.webp`} alt="Presentation" fill className="object-cover" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. 연계 활동 섹션 */}
      <section className="py-32 px-8 max-w-5xl mx-auto">
        <h3 className="text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.5em] mb-20">Post-Session Activities</h3>
        <div className="space-y-20">
          <div className="space-y-8">
            <div className="bg-[#3e2d35] p-8 rounded-2xl text-white inline-block">
              <h4 className="text-xl font-black flex items-center gap-3">🌲 트리플래닛 안동 현장 답사</h4>
              <p className="mt-4 text-sm opacity-80 leading-relaxed break-keep font-medium">
                트리플래닛과의 기업 세션 이후, 산림청 관계자 분들이 관심을 가져주셔서 만남을 위해 직접 안동 현장에 방문하여 산림청 관계자분들과 이야기 하는 시간을 가졌습니다.
              </p>
            </div>
            <div className="relative h-[500px] rounded-[3rem] overflow-hidden shadow-xl border border-slate-100">
               <Image src="/activities/andong.webp" alt="Andong Field Trip" fill className="object-cover" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
             <div className="bg-[#4d4d2e] p-10 rounded-[2.5rem] text-white">
                <h4 className="text-xl font-black flex items-center gap-3">👉 대한민국 사회적 가치 페스타 참석</h4>
                <p className="mt-6 text-sm opacity-80 leading-relaxed break-keep font-medium">
                  이후에도 IG와 트리플래닛과의 관계를 이어나가며 임팩트 얼라이언스, 녹색기술연구소, 트리플래닛이 함께한 "기후위기 시대, 우리의 숲은 어디로 가고 있나"라는 주제의 컨퍼런스에 참석하고 주제 전반에 관해 산업 전선에 계시는 실무진과 이야기하는 시간을 가졌습니다.
                </p>
             </div>
             <div className="grid grid-cols-2 gap-4 h-full">
                <div className="relative h-[250px] rounded-2xl overflow-hidden shadow-lg">
                  <Image src="/activities/social-festa-1.webp" alt="Name Tags" fill className="object-cover" />
                </div>
                <div className="relative h-[250px] rounded-2xl overflow-hidden shadow-lg">
                  <Image src="/activities/social-festa-2.webp" alt="Conference" fill className="object-cover" />
                </div>
             </div>
          </div>
        </div>
      </section>

      {/* 4. 하단 안내 */}
      <section className="pt-10 pb-20 text-center">
        <Link href="/activities" className="inline-block text-xs font-black text-slate-400 hover:text-black uppercase tracking-widest border-b border-slate-200 pb-1">← Back to Activities</Link>
      </section>

      <footer className="py-12 border-t border-slate-100 text-center bg-[#1a1a1a] text-white">
        <p className="text-[10px] font-black text-[#a8d0cd] uppercase tracking-[0.5em]">© 2026 InsightGraphy. All Rights Reserved.</p>
      </footer>
    </div>
  )
}