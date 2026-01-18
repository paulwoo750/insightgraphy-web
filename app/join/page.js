'use client'
import Link from 'next/link'
import Image from 'next/image'

// 상단 네비게이션
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

export default function JoinUsPage() {
  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] font-sans pt-32 pb-24 selection:bg-[#32a4a1] selection:text-white">
      <PublicNav />

      {/* 1. 모집 헤더 */}
      <section className="max-w-4xl mx-auto px-8 mb-20 text-center">
        <div className="inline-block bg-[#32a4a1]/10 text-[#32a4a1] px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-6">Recruiting</div>
        <h2 className="text-5xl font-black uppercase tracking-tighter mb-8 text-black">IGers' 29th RECRUITING</h2>
        <p className="text-lg text-slate-500 leading-relaxed break-keep font-medium">
          논리의 날을 세우고, 시각의 벽을 허물며, 청중의 마음을 움직일 <br/>
          InsightGraphy 29기 신입 학회원을 모집합니다.
        </p>
      </section>

      {/* 2. 지원서 다운로드 섹션 */}
      <section className="max-w-3xl mx-auto px-8 mb-20">
        <div className="bg-slate-50 p-10 rounded-[3rem] border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-8 shadow-sm">
          <div className="space-y-2 text-center md:text-left">
            <h3 className="text-xl font-black">29기 지원서 양식</h3>
            <p className="text-sm text-slate-400 font-bold italic">InsightGraphy_29기_지원서_양식.docx (67.3 KB)</p>
          </div>
          <a 
            href="/files/InsightGraphy_29기_지원서_양식.docx" 
            download 
            className="flex items-center gap-3 bg-[#1a1a1a] text-white px-8 py-4 rounded-2xl font-black text-sm hover:bg-[#32a4a1] transition-all shadow-xl hover:scale-105"
          >
            <span>양식 다운로드</span>
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          </a>
        </div>
      </section>

      {/* 3. 모집 요강 */}
      <section className="max-w-4xl mx-auto px-8 space-y-8 mb-32">
        <div className="bg-[#1a1a1a] text-white p-12 rounded-[3rem] shadow-2xl relative overflow-hidden">
          <span className="absolute top-8 right-10 text-6xl opacity-10">📌</span>
          <h4 className="text-[#a8d0cd] font-black text-xs uppercase tracking-[0.3em] mb-6">01. Eligibility</h4>
          <p className="text-2xl font-black mb-8 leading-tight break-keep">
            프레젠테이션 기획과 전달에 관심을 가진 <span className="text-[#32a4a1]">2학기 연속(방학 포함)</span> 활동 가능한 SKY 학생
          </p>
          <p className="text-sm opacity-50 font-bold">* 학부 및 대학원생, 재학/휴학/졸업 여부 무관</p>
        </div>

        <div className="bg-slate-50 p-12 rounded-[3rem] border border-slate-100 relative overflow-hidden">
          <span className="absolute top-8 right-10 text-6xl opacity-10 text-[#32a4a1]">✉️</span>
          <h4 className="text-[#32a4a1] font-black text-xs uppercase tracking-[0.3em] mb-6">02. How to Apply</h4>
          <div className="space-y-8">
            <p className="font-bold text-lg leading-relaxed break-keep">
              지원서 양식 작성 후, 지원서 4번 문항 발표 자료(PPT, PDF 모두 포함)와 함께 이메일 제출
            </p>
            
            <div className="space-y-4">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">File Naming Convention</p>
              <div className="grid grid-cols-1 gap-3">
                <code className="bg-white p-4 rounded-xl border border-slate-200 text-xs font-bold text-blue-600 shadow-sm block">
                  [InsightGraphy_29기_지원서_학교명_이름]
                </code>
                <code className="bg-white p-4 rounded-xl border border-slate-200 text-xs font-bold text-blue-600 shadow-sm block">
                  [InsightGraphy_29기_발표자료_학교명_이름]
                </code>
              </div>
              <p className="text-xs text-slate-500 font-bold">* 지원서, 발표자료 PPT, 발표자료 PDF 총 3개 파일 제출 필수</p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. 연락처 및 소셜 섹션 */}
      <section className="max-w-5xl mx-auto px-8 py-20 bg-slate-50 rounded-[4rem] border border-slate-100">
        <h3 className="text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.5em] mb-16">Contact & Channels</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* E-mail */}
          <a href="mailto:insightgraphy.pt@gmail.com" className="group bg-white p-8 rounded-[2.5rem] shadow-sm hover:shadow-xl transition-all text-center">
            <div className="text-2xl mb-4 group-hover:scale-110 transition-transform">📧</div>
            <p className="text-[10px] font-black text-slate-400 uppercase mb-2">E-mail</p>
            <p className="text-xs font-bold break-all text-[#32a4a1]">insightgraphy.pt@gmail.com</p>
          </a>
          {/* Web */}
          <a href="https://insightgraphy-web.vercel.app" target="_blank" className="group bg-white p-8 rounded-[2.5rem] shadow-sm hover:shadow-xl transition-all text-center">
            <div className="text-2xl mb-4 group-hover:scale-110 transition-transform">💻</div>
            <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Web</p>
            <p className="text-xs font-bold text-[#32a4a1]">Official Website</p>
          </a>
          {/* Cafe */}
          <a href="https://cafe.naver.com/insightgraphy" target="_blank" className="group bg-white p-8 rounded-[2.5rem] shadow-sm hover:shadow-xl transition-all text-center">
            <div className="text-2xl mb-4 group-hover:scale-110 transition-transform">☕</div>
            <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Naver Cafe</p>
            <p className="text-xs font-bold text-[#32a4a1]">Official Cafe</p>
          </a>
          {/* Instagram */}
          <a href="https://www.instagram.com/insightgraphy_pt" target="_blank" className="group bg-white p-8 rounded-[2.5rem] shadow-sm hover:shadow-xl transition-all text-center">
            <div className="text-2xl mb-4 group-hover:scale-110 transition-transform">📸</div>
            <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Instagram</p>
            <p className="text-xs font-bold text-[#32a4a1]">@insightgraphy_pt</p>
          </a>
        </div>
      </section>

      <footer className="py-12 mt-24 text-center bg-[#1a1a1a] text-white">
        <p className="text-[10px] font-black text-[#a8d0cd] uppercase tracking-[0.5em]">© 2026 InsightGraphy. All Rights Reserved.</p>
      </footer>
    </div>
  )
}