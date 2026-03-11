'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

// 상단 네비게이션 (기존과 동일)
function PublicNav() {
  return (
    <nav className="fixed top-0 w-full bg-[#1a1a1a]/95 backdrop-blur-md text-white z-50 border-b border-white/5">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="flex justify-between items-center h-[64px] md:h-[80px]">
          <Link href="/" className="flex items-center gap-3 group shrink-0">
            <div className="relative w-8 h-8 md:w-9 md:h-9">
              <Image src="/logo.png" alt="IG Logo" fill className="object-contain" />
            </div>
            <span className="text-lg md:text-xl font-black uppercase tracking-tighter group-hover:text-[#a8d0cd] transition-colors">
              InsightGraphy
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-x-10 text-[11px] font-black uppercase tracking-widest text-white/60">
            <Link href="/about" className="hover:text-[#32a4a1] transition-colors">About</Link>
            <Link href="/activities" className="hover:text-[#32a4a1] transition-colors">Activities</Link>
            <Link href="/schedule" className="hover:text-[#32a4a1] transition-colors">Schedule</Link>
            <Link href="/members" className="hover:text-[#32a4a1] transition-colors">Members</Link>
            <Link href="/showcase" className="text-white font-bold transition-colors">Showcase</Link>
            <Link href="/join" className="hover:text-[#32a4a1] transition-colors">Join Us</Link>
          </div>

          <div className="flex items-center">
            <Link href="/login" className="bg-[#32a4a1] px-4 md:px-6 h-[32px] md:h-[38px] rounded-lg hover:bg-[#0d6b69] transition-all flex items-center justify-center text-white text-[10px] md:text-[11px] font-black uppercase shadow-lg shadow-brand-primary/20">
              Login
            </Link>
          </div>
        </div>

        <div className="md:hidden border-t border-white/5 overflow-x-auto no-scrollbar whitespace-nowrap py-3">
          <div className="flex items-center gap-x-8 px-2 text-[10px] font-black uppercase tracking-widest text-white/50">
            <Link href="/about" className="hover:text-[#32a4a1]">About</Link>
            <Link href="/activities" className="hover:text-[#32a4a1]">Activities</Link>
            <Link href="/schedule" className="hover:text-[#32a4a1]">Schedule</Link>
            <Link href="/members" className="hover:text-[#32a4a1]">Members</Link>
            <Link href="/showcase" className="text-white font-bold">Showcase</Link>
            <Link href="/join" className="hover:text-[#32a4a1]">Join Us</Link>
          </div>
        </div>
      </div>
      <style jsx>{`.no-scrollbar::-webkit-scrollbar { display: none; }.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
    </nav>
  )
}

export default function ShowcasePage() {
  const [selectedPdf, setSelectedPdf] = useState(null);
  
  // ★ Supabase에서 가져올 데이터 상태 관리
  const [works, setWorks] = useState([]);
  const [loading, setLoading] = useState(true);

  // ★ 페이지 로드 시 DB에서 작품 불러오기
  useEffect(() => {
    const fetchShowcase = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('pr_showcase')
        .select('*')
        .order('created_at', { ascending: false }); // 최신순 정렬
      
      if (!error && data) {
        setWorks(data);
      }
      setLoading(false);
    };

    fetchShowcase();
  }, []);

  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] font-sans pt-32 pb-24 selection:bg-[#32a4a1] selection:text-white">
      <PublicNav />

      {/* 1. 헤더 섹션 */}
      <section className="max-w-4xl mx-auto px-8 mb-20 text-center">
        <div className="inline-block bg-[#32a4a1]/10 text-[#32a4a1] px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-6">Archive</div>
        <h2 className="text-5xl font-black uppercase tracking-tighter mb-8 text-black">IG Showcase</h2>
        <p className="text-lg text-slate-500 leading-relaxed break-keep font-medium">
          InsightGraphy 학회원들의 치열한 고민과 통찰이 담긴 최고의 아카이브입니다. <br/>
          논리적인 구조와 감각적인 디자인이 결합된 IG만의 프레젠테이션을 감상해보세요.
        </p>
      </section>

      {/* 2. 쇼케이스 그리드 (DB 데이터 연동) */}
      <section className="max-w-7xl mx-auto px-8 min-h-[400px]">
        {loading ? (
          <div className="flex justify-center items-center h-40">
            <p className="text-slate-400 font-bold animate-pulse">작품을 불러오는 중입니다... 🔄</p>
          </div>
        ) : works.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-slate-100 rounded-[3rem]">
            <p className="text-slate-400 font-bold">아직 전시된 작품이 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {works.map((work) => (
              <div 
                key={work.id} 
                onClick={() => setSelectedPdf(work.pdf_url)} // DB의 pdf_url 사용
                className="group cursor-pointer"
              >
                {/* 발표 썸네일 */}
                <div className="relative aspect-[16/9] rounded-[2rem] overflow-hidden mb-6 shadow-lg border border-slate-100 transition-all group-hover:-translate-y-2 group-hover:shadow-2xl">
                  {/* Next.js Image 컴포넌트 대신 일반 img 태그 사용 (외부 URL 허용 문제 방지) */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={work.thumb_url} alt={work.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-[#1a1a1a]/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="bg-white text-[#1a1a1a] px-6 py-2 rounded-full font-black text-xs uppercase tracking-widest">View Slides</span>
                  </div>
                </div>
                
                {/* 정보 영역 */}
                <div className="px-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[#32a4a1] font-black text-[10px] uppercase tracking-wider">{work.topic}</span>
                    <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                    <span className="text-slate-400 font-bold text-[10px]">{work.generation}</span>
                  </div>
                  <h4 className="text-xl font-black mb-1 group-hover:text-[#32a4a1] transition-colors">{work.title}</h4>
                  <p className="text-sm text-slate-500 font-bold">{work.author} IGer</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. PDF 뷰어 모달 */}
      {selectedPdf && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-10">
          <div className="relative w-full h-full max-w-6xl bg-white rounded-[2rem] overflow-hidden flex flex-col">
            {/* 모달 헤더 */}
            <div className="px-8 py-4 border-b border-slate-100 flex justify-between items-center bg-white">
              <span className="text-xs font-black text-[#32a4a1] uppercase tracking-widest">Presentation Viewer</span>
              <button 
                onClick={() => setSelectedPdf(null)}
                className="text-slate-400 hover:text-black font-black text-xl transition-colors"
              >✕</button>
            </div>
            
            {/* PDF 임베드 */}
            <div className="flex-grow bg-slate-100">
              <iframe 
                src={`${selectedPdf}#toolbar=0&navpanes=0&scrollbar=0`}
                className="w-full h-full border-none"
                title="PDF Viewer"
              ></iframe>
            </div>
            
            {/* 모달 푸터 안내 */}
            <div className="px-8 py-3 bg-slate-50 text-center">
              <p className="text-[10px] text-slate-400 font-bold">본 자료의 저작권은 작성자 및 InsightGraphy에 있으며, 무단 복제 및 배포를 금합니다.</p>
            </div>
          </div>
        </div>
      )}

      <footer className="py-12 mt-24 text-center bg-[#1a1a1a] text-white">
        <p className="text-[10px] font-black text-[#a8d0cd] uppercase tracking-[0.5em]">© 2026 InsightGraphy. All Rights Reserved.</p>
      </footer>
    </div>
  )
}