'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

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
            <Link href="/about" className="text-white font-bold transition-colors">About</Link>
            <Link href="/activities" className="hover:text-[#32a4a1] transition-colors">Activities</Link>
            <Link href="/members" className="hover:text-[#32a4a1] transition-colors">Members</Link>
            <Link href="/showcase" className="hover:text-[#32a4a1] transition-colors">Showcase</Link>
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
            <Link href="/about" className="text-white font-bold">About</Link>
            <Link href="/activities" className="hover:text-[#32a4a1] active:text-[#32a4a1]">Activities</Link>
            <Link href="/members" className="hover:text-[#32a4a1] active:text-[#32a4a1]">Members</Link>
            <Link href="/showcase" className="hover:text-[#32a4a1] active:text-[#32a4a1]">Showcase</Link>
            <Link href="/join" className="hover:text-[#32a4a1] active:text-[#32a4a1]">Join Us</Link>
          </div>
        </div>
      </div>
      <style jsx>{`.no-scrollbar::-webkit-scrollbar { display: none; }.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
    </nav>
  )
}

export default function InterviewDetailPage() {
  const params = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInterview = async () => {
      setLoading(true);
      // URL 주소창의 id 번호(params.id)를 이용해 해당 선배님의 정보만 쏙 빼오기
      const { data: alumnus } = await supabase.from('pr_about_alumni').select('*').eq('id', params.id).single();
      if (alumnus) setData(alumnus);
      setLoading(false);
    };

    if (params.id) {
      fetchInterview();
    }
  }, [params.id]);

  if (loading) return <div className="min-h-screen bg-white pt-40 text-center font-bold text-slate-400">인터뷰를 불러오는 중입니다... 🔄</div>;
  if (!data) return <div className="min-h-screen bg-white pt-40 text-center font-bold text-slate-800">선배님 정보를 찾을 수 없습니다. 😢</div>;

  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] font-sans pt-32 pb-24 selection:bg-[#32a4a1] selection:text-white">
      <PublicNav />
      
      <div className="max-w-3xl mx-auto px-6">
        
        {/* 1. 헤더: 이름 및 소속 (대학 정보 추가됨) */}
        <div className="mb-20 border-b border-slate-100 pb-12">
          <Link href="/about" className="text-[#32a4a1] text-xs font-black uppercase tracking-[0.2em] mb-8 inline-flex items-center gap-2 hover:-translate-x-1 transition-transform">
            <span>←</span> Back to Alumni List
          </Link>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-tight mt-6 break-keep">
            {data.name} <span className="text-[#32a4a1]">Alumni님</span>
            <span className="block text-xl md:text-2xl text-slate-400 mt-4 font-bold uppercase tracking-tight">
               {data.university} {data.dept} / IG {data.generation}기
            </span>
          </h1>
        </div>

        {/* 2. 인터뷰 Q&A 리스트 (DB의 qna_json 순회) */}
        <div className="space-y-14">
          {(!data.qna_json || data.qna_json.length === 0) ? (
            <div className="py-20 text-center border-2 border-dashed border-slate-100 rounded-[3rem]">
              <p className="text-slate-400 font-bold mb-2">등록된 인터뷰 내용이 없습니다.</p>
              <p className="text-xs text-slate-400 font-medium">관리자 페이지에서 인터뷰를 작성해 주세요.</p>
            </div>
          ) : (
            data.qna_json.map((item, index) => (
              <div key={index} className="group">
                
                {/* 질문 박스 */}
                <div className="bg-[#32a4a1]/5 p-6 rounded-tr-3xl rounded-br-3xl border-l-8 border-[#32a4a1] flex gap-5 items-start mb-6 shadow-sm">
                  <span className="text-2xl font-black text-[#32a4a1] opacity-50 mt-1">Q.</span>
                  <p className="font-black text-lg md:text-xl text-slate-800 break-keep leading-snug whitespace-pre-wrap">
                    {item.question}
                  </p>
                </div>
                
                {/* 답변 영역 */}
                <div className="pl-12 pr-6 py-2 flex gap-5 items-start">
                  <span className="text-2xl font-black text-slate-200 mt-1">A.</span>
                  <p className="text-slate-600 leading-loose font-medium text-lg break-keep whitespace-pre-wrap">
                    {item.answer}
                  </p>
                </div>
                
              </div>
            ))
          )}
        </div>

        {/* 3. 푸터 응원 메시지 */}
        <div className="mt-24 pt-16 border-t border-slate-100 text-center">
          <div className="inline-block bg-slate-50 px-8 py-4 rounded-full">
            <p className="text-slate-400 text-sm font-black uppercase tracking-widest">
              InsightGraphy <span className="text-[#32a4a1]">Legacy</span> Series
            </p>
          </div>
          <p className="mt-6 text-slate-400 font-bold">소중한 경험을 나눠주신 {data.name} 선배님께 감사드립니다. 😊</p>
        </div>

      </div>
    </div>
  )
}