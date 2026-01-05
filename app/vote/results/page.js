'use client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ResultsHub() {
  const router = useRouter()

  return (
    <div className="p-8 bg-slate-50 min-h-screen text-black font-sans flex flex-col items-center justify-center">
      {/* 최상단 타이틀 섹션 */}
      <header className="max-w-2xl w-full mb-10 text-center">
        <Link href="/vote" className="text-blue-600 text-[10px] font-black hover:underline tracking-widest uppercase mb-3 block">← Vote Hub</Link>
        <h1 className="text-5xl font-black text-black tracking-tighter italic uppercase">Report Hub</h1>
      </header>

      <div className="max-w-2xl w-full space-y-6">
        {/* 내 성적 확인 버튼 (사이즈 축소 및 블랙 텍스트) */}
        <button 
          onClick={() => router.push('/vote/results/my')} 
          className="w-full bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 hover:border-blue-500 transition-all text-left flex items-center gap-8 group"
        >
          <span className="text-4xl group-hover:scale-110 transition-transform">📈</span>
          <div>
            <h2 className="text-2xl font-black text-black mb-1">내 성적 확인하기</h2>
            <p className="text-black font-bold uppercase tracking-widest text-[10px] opacity-60">Individual Analytics</p>
          </div>
        </button>

        {/* 베스트 프레젠터 버튼 (사이즈 축소 및 블랙 텍스트) */}
        <button 
          onClick={() => router.push('/vote/results/ranking')} 
          className="w-full bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 hover:border-yellow-400 transition-all text-left flex items-center gap-8 group"
        >
          <span className="text-4xl group-hover:scale-110 transition-transform">👑</span>
          <div>
            <h2 className="text-2xl font-black text-black mb-1">베스트 프레젠터 확인하기</h2>
            <p className="text-black font-bold uppercase tracking-widest text-[10px] opacity-60">Weekly Rankings</p>
          </div>
        </button>
      </div>
      
      <p className="mt-12 opacity-10 font-black text-[10px] tracking-[1em] uppercase">InsightGraphy</p>
    </div>
  )
}