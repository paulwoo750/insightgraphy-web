'use client'
import Link from 'next/link'
import Image from 'next/image'

// 상단 네비게이션 (통일된 서식 유지)
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

export default function EducationSessionPage() {
  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] font-sans pt-32 pb-20 selection:bg-[#32a4a1] selection:text-white">
      <PublicNav />

      {/* 1. 세션 헤더 */}
      <section className="max-w-4xl mx-auto px-8 mb-20 text-center">
        <div className="inline-block bg-[#32a4a1]/10 text-[#32a4a1] px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-6">Activity 02</div>
        <h2 className="text-5xl font-black uppercase tracking-tighter mb-8">Education Session</h2>
        <p className="text-lg text-slate-600 leading-relaxed break-keep font-medium">
          학회원들의 실질적인 역량 강화를 위해 알럼나이 및 전문가와 함께하는 교육 세션입니다. <br/>
          Insight, Graphic, Delivery의 단계별 커리큘럼과 1:1 맞춤형 멘토링을 제공합니다.
        </p>
      </section>

      {/* 2. 3대 핵심 커리큘럼 */}
      <section className="max-w-6xl mx-auto px-8 mb-32">
        <div className="grid grid-cols-1 gap-12">
          
          {/* Insight 커리큘럼 */}
          <div className="bg-slate-50 rounded-[3rem] p-12 border border-slate-100 group hover:shadow-2xl transition-all">
            <div className="flex items-center gap-4 mb-10">
              <span className="text-4xl">💡</span>
              <h3 className="text-3xl font-black uppercase tracking-tight">Insight Curriculum</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-3xl shadow-sm">
                <p className="text-[#32a4a1] font-black text-xs uppercase mb-4">Basic Course</p>
                <h4 className="text-xl font-black mb-4">기획의 원칙과 구조</h4>
                <ul className="text-sm text-slate-500 space-y-2 font-medium">
                  <li>• 프리젠테이션의 구성요소 및 기획의 정의</li>
                  <li>• 타깃과 목적에 맞는 기획서의 원칙</li>
                  <li>• 문제 발견 - 분석 - 해결 - 결론의 구조화</li>
                </ul>
              </div>
              <div className="bg-white p-8 rounded-3xl shadow-sm border-t-4 border-[#32a4a1]">
                <p className="text-[#32a4a1] font-black text-xs uppercase mb-4">Advanced Course</p>
                <h4 className="text-xl font-black mb-4">기획 심화 스킬</h4>
                <p className="text-sm text-slate-500 font-medium">실전 비즈니스 케이스 분석 및 고도화된 전략 도출 기법 실습</p>
              </div>
            </div>
          </div>

          {/* Graphic 커리큘럼 */}
          <div className="bg-slate-50 rounded-[3rem] p-12 border border-slate-100 group hover:shadow-2xl transition-all">
            <div className="flex items-center gap-4 mb-10">
              <span className="text-4xl">🎨</span>
              <h3 className="text-3xl font-black uppercase tracking-tight">Graphic Curriculum</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-3xl shadow-sm">
                <p className="text-[#32a4a1] font-black text-xs uppercase mb-4">Basic Course</p>
                <h4 className="text-xl font-black mb-4">디자인의 원칙과 방법</h4>
                <ul className="text-sm text-slate-500 space-y-2 font-medium">
                  <li>• 색상, 폰트, 레이아웃 선정의 정석</li>
                  <li>• 사진, 타이포, 아이콘의 효과적 미디어 활용</li>
                  <li>• 실무 생산성을 높이는 핵심 단축키 교육</li>
                </ul>
              </div>
              <div className="bg-white p-8 rounded-3xl shadow-sm border-t-4 border-[#32a4a1]">
                <p className="text-[#32a4a1] font-black text-xs uppercase mb-4">Advanced Course</p>
                <h4 className="text-xl font-black mb-4">비주얼 브랜딩 실전</h4>
                <p className="text-sm text-slate-500 font-medium">인포그래픽 제작 및 툴을 활용한 고퀄리티 디자인 실습</p>
              </div>
            </div>
          </div>

          {/* Delivery 커리큘럼 */}
          <div className="bg-slate-50 rounded-[3rem] p-12 border border-slate-100 group hover:shadow-2xl transition-all">
            <div className="flex items-center gap-4 mb-10">
              <span className="text-4xl">🎤</span>
              <h3 className="text-3xl font-black uppercase tracking-tight">Delivery Curriculum</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white p-8 rounded-3xl shadow-sm">
                <p className="text-[#32a4a1] font-black text-xs uppercase mb-4">Basic Course</p>
                <h4 className="text-xl font-black mb-4">좋은 Delivery의 공통점</h4>
                <ul className="text-sm text-slate-500 space-y-2 font-medium">
                  <li>• 언어적 요소: 목소리 톤, 발음, 말투 조절</li>
                  <li>• 비언어적 요소: 시선 처리, 제스처, 동선 이동</li>
                  <li>• 청중의 시선을 사로잡는 오프닝 기법</li>
                </ul>
              </div>
              <div className="bg-white p-8 rounded-3xl shadow-sm border-t-4 border-[#32a4a1]">
                <p className="text-[#32a4a1] font-black text-xs uppercase mb-4">Advanced Course</p>
                <h4 className="text-xl font-black mb-4">딜리버리 실전 스킬</h4>
                <p className="text-sm text-slate-500 font-medium">무대 공포증 극복 및 Q&A 대응 등 실전 발표 현장 대응력 강화</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. 전문가 특강 섹션 */}
      <section className="py-24 px-8 bg-[#1a1a1a] text-white">
        <div className="max-w-4xl mx-auto">
          <h3 className="text-center text-[20px] font-black text-[#a8d0cd] uppercase tracking-[0.5em] mb-16">Guest Speaker Sessions</h3>
          <div className="space-y-6">
            <div className="bg-white/5 border border-white/10 p-8 rounded-3xl hover:bg-white/10 transition-all">
              <p className="text-[#32a4a1] font-black text-xs mb-2">Speaker 01</p>
              <h4 className="text-2xl font-black mb-4">피피티프로 (@pptpro_official)</h4>
              <p className="opacity-70 text-sm font-medium">실전에 바로 쓰는 압도적인 디자인 스킬 교육</p>
            </div>
            <div className="bg-white/5 border border-white/10 p-8 rounded-3xl hover:bg-white/10 transition-all">
              <p className="text-[#32a4a1] font-black text-xs mb-2">Speaker 02</p>
              <h4 className="text-2xl font-black mb-4">피피티헌터 (@ppt_hunter)</h4>
              <p className="opacity-70 text-sm font-medium">청중의 마음을 저격하는 논리적 스토리텔링 특강</p>
            </div>
          </div>
          <p className="text-center mt-12 text-sm font-bold opacity-50 italic">현업 전문가들의 생생한 노하우를 직접 전수받습니다.</p>
        </div>
      </section>

      {/* 4. 시스템 안내 */}
      <section className="py-32 px-8 max-w-5xl mx-auto text-center">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div className="p-10 rounded-[3rem] bg-slate-50">
            <h4 className="text-2xl font-black mb-6">1:1 맞춤형 멘토링</h4>
            <p className="text-sm text-slate-500 leading-relaxed font-medium break-keep">
              선배 학회원(알럼나이)과의 매칭을 통해 개인별 강점과 보완점을 분석하고 밀착 성장을 지원합니다.
            </p>
          </div>
          <div className="p-10 rounded-[3rem] bg-slate-50">
            <h4 className="text-2xl font-black mb-6">알럼나이 피드백</h4>
            <p className="text-sm text-slate-500 leading-relaxed font-medium break-keep">
              다양한 산업군에서 활약 중인 선배들의 현직 시선으로 실전과 가장 유사한 피드백을 제공합니다.
            </p>
          </div>
        </div>
        <Link href="/activities" className="inline-block mt-20 text-xs font-black text-slate-400 hover:text-black uppercase tracking-widest border-b border-slate-200 pb-1">← Back to Activities</Link>
      </section>

      <footer className="py-12 text-center bg-[#1a1a1a] text-white">
        <p className="text-[10px] font-black text-[#a8d0cd] uppercase tracking-[0.5em]">© 2026 InsightGraphy. All Rights Reserved.</p>
      </footer>
    </div>
  )
}