'use client'
import { useParams } from 'next/navigation'
import { alumniData } from '../../alumni-data'
import Image from 'next/image'
import Link from 'next/link'

// 상단 네비게이션 (About 페이지와 통일감 유지)
function PublicNav() {
  return (
    <nav className="fixed top-0 w-full px-12 py-4 flex justify-between items-center bg-white/80 backdrop-blur-md text-[#1a1a1a] z-50 border-b border-slate-100">
      <Link href="/" className="flex items-center gap-3 group">
        <div className="relative w-8 h-8">
          <Image src="/logo.png" alt="IG Logo" width={32} height={32} className="object-contain" />
        </div>
        <span className="text-xl font-black uppercase tracking-tighter group-hover:text-[#32a4a1] transition-colors">InsightGraphy</span>
      </Link>
      <div className="flex items-center gap-x-10 text-[11px] font-black uppercase tracking-widest">
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

export default function InterviewDetailPage() {
  const params = useParams();
  const data = alumniData.find(item => item.id === params.id);

  if (!data) return <div className="pt-40 text-center font-bold">정보를 찾을 수 없습니다.</div>;

  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] font-sans pt-32 pb-24 selection:bg-[#32a4a1] selection:text-white">
      <PublicNav />
      
      <div className="max-w-3xl mx-auto px-6">
        {/* 1. 헤더: 이름 및 소속 */}
        <div className="mb-20 border-b border-slate-100 pb-12">
          <Link href="/about" className="text-[#32a4a1] text-xs font-black uppercase tracking-[0.2em] mb-8 inline-flex items-center gap-2 hover:-translate-x-1 transition-transform">
            <span>←</span> Back to Alumni List
          </Link>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight leading-tight mt-6 break-keep">
            {data.name} <span className="text-[#32a4a1]">Alumni님</span>
            <span className="block text-xl md:text-2xl text-slate-400 mt-4 font-bold uppercase tracking-tight">
               {data.dept} / IG {data.generation}기
            </span>
          </h1>
        </div>

        {/* 2. 인터뷰 Q&A 리스트 */}
        <div className="space-y-14">
          {data.qna.map((item, index) => (
            <div key={index} className="group">
              {/* 질문 박스: 연한 청록색 배경 + 진한 왼쪽 테두리 */}
              <div className="bg-[#32a4a1]/5 p-6 rounded-tr-3xl rounded-br-3xl border-l-8 border-[#32a4a1] flex gap-5 items-start mb-6 shadow-sm">
                <span className="text-2xl font-black text-[#32a4a1] opacity-50">Q.</span>
                <p className="font-black text-lg md:text-xl text-slate-800 break-keep leading-snug">
                  {item.question}
                </p>
              </div>
              
              {/* 답변 영역: 깨끗한 흰색 + 여백 강조 */}
              <div className="pl-12 pr-6 py-2 flex gap-5 items-start">
                <span className="text-2xl font-black text-slate-200 mt-1">A.</span>
                <p className="text-slate-600 leading-loose font-medium text-lg break-keep whitespace-pre-wrap">
                  {item.answer}
                </p>
              </div>
            </div>
          ))}
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