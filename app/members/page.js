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

export default function MembersPage() {
  // 운영진 데이터 (6명 고정)
  const executives = [
    { role: "학회장", name: "우제윤", dept: "서울대학교 산업공학과" },
    { role: "부학회장", name: "인예서", dept: "고려대학교 생명공학부" },
    { role: "총무", name: "최보경", dept: "고려대학교 행정학과" },
    { role: "기획부장", name: "김현아", dept: "연세대학교 바이오융합학부" },
    { role: "교육부장", name: "이수현", dept: "고려대학교 노어노문학과" },
    { role: "홍보부장", name: "장은효", dept: "연세대학교 계량위험관리학과" },
  ];

  // 일반 학회원 데이터 (예시)
  const members = [
    { name: "김서영", dept: "고려대학교 통계학과" },
    { name: "김용민", dept: "연세대학교 경영학과" },
    { name: "박수진", dept: "연세대학교 계량위험관리학과" },
    { name: "신혜원", dept: "서울대학교 영어영문학과" },
    { name: "우성재", dept: "고려대학교 국제학부" },
    { name: "이승미", dept: "고려대학교 서어서문학과" },
  ];

  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] font-sans pt-32 pb-24 selection:bg-[#32a4a1] selection:text-white">
      <PublicNav />

      {/* 1. 메인 단체 사진 섹션 */}
      <section className="max-w-6xl mx-auto px-8 mb-24">
        <div className="text-center mb-12">
          <p className="text-[#32a4a1] font-black tracking-[0.3em] uppercase text-xs mb-4">Our People</p>
          <h2 className="text-5xl font-black tracking-tighter">IGers in Action</h2>
        </div>
        
        <div className="relative h-[350px] md:h-[550px] w-full rounded-[3rem] overflow-hidden shadow-2xl border border-slate-100">
          {/* public/group-photo.jpg 이미지 파일을 넣어주세요 */}
          <Image 
            src="/group-photo.jpg" 
            alt="InsightGraphy Group" 
            fill 
            className="object-cover" 
            priority 
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a]/40 to-transparent" />
        </div>
      </section>

      {/* 2. 운영진 섹션 (사진 없이 텍스트 강조형) */}
      <section className="max-w-6xl mx-auto px-8 mb-32">
        <h3 className="text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.5em] mb-16">Executive Board</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {executives.map((exec, idx) => (
            <div key={idx} className="bg-slate-50 p-8 rounded-[2rem] border-l-8 border-[#32a4a1] flex flex-col justify-center hover:shadow-xl transition-all group hover:-translate-y-1">
              <span className="text-[#32a4a1] font-black text-xs uppercase tracking-widest mb-3 opacity-70">
                {exec.role}
              </span>
              <h4 className="text-2xl font-black mb-1 group-hover:text-[#32a4a1] transition-colors">{exec.name}</h4>
              <p className="text-sm text-slate-500 font-bold">{exec.dept}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 3. 활동 회원 섹션 */}
      <section className="py-24 bg-[#1a1a1a] text-white">
        <div className="max-w-6xl mx-auto px-8">
          <h3 className="text-center text-[10px] font-black text-slate-500 uppercase tracking-[0.5em] mb-20">Active Members</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-12 gap-y-16">
            {members.map((member, idx) => (
              <div key={idx} className="text-center md:text-left border-b border-white/10 pb-6 hover:border-[#32a4a1] transition-colors">
                <p className="text-xl font-black mb-2">{member.name}</p>
                <p className="text-[11px] text-[#a8d0cd] font-black uppercase tracking-wider opacity-80">{member.dept}</p>
              </div>
            ))}
          </div>
          <div className="mt-24 text-center">
            <p className="text-slate-500 text-sm font-bold">
              함께 성장하고 소통하는 {executives.length + members.length}명의 IGer들이 현재 활동 중입니다.
            </p>
          </div>
        </div>
      </section>

      {/* 하단 안내 및 푸터 */}
      <footer className="py-12 text-center bg-white border-t border-slate-100">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.5em]">© 2026 InsightGraphy. All Rights Reserved.</p>
      </footer>
    </div>
  )
}