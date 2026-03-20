'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function VoteHub() {
  const router = useRouter()
  const [user, setUser] = useState(null)

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
      } else {
        setUser(session.user)
      }
    }
    checkUser()
  }, [])

  if (!user) return <div className="p-8 text-center font-bold italic">투표소 입장 중... 🗳️</div>

  return (
    <div className="min-h-screen bg-slate-50 p-8 pb-32 flex flex-col items-center font-sans text-slate-900">
      <div className="max-w-2xl w-full">
        
        {/* 헤더 */}
        <header className="mb-12 text-center">
          <Link href="/home" className="inline-block px-4 py-2 bg-slate-200 text-slate-600 rounded-xl text-[10px] font-black hover:bg-slate-300 transition-all uppercase tracking-widest mb-6 block w-fit mx-auto">
            ← Back to Home
          </Link>
          <h1 className="text-5xl font-black text-slate-800 tracking-tighter mb-4">IG Vote Hub 🗳️</h1>
          <p className="text-slate-400 font-bold text-sm">인사이트그라피 발표 평가 및 결과 시스템</p>
        </header>

        {/* 🌟 1 Depth 메뉴 리스트 (수직 배치) */}
        <div className="space-y-4 mb-16">
          
          {/* 1. 점수 매기기 (가장 강조) */}
          <button 
            onClick={() => router.push('/vote/score')}
            className="w-full bg-blue-600 text-white p-8 rounded-[2.5rem] shadow-lg border border-blue-500 hover:bg-blue-700 hover:shadow-2xl transition-all text-left flex items-center gap-6 group active:scale-[0.98]"
          >
            <span className="text-5xl group-hover:scale-110 transition-transform">✍️</span>
            <div>
              <h2 className="text-2xl font-black mb-1">발표 점수 매기기</h2>
              <p className="font-bold uppercase tracking-widest text-[10px] text-blue-200">Submit Your Score</p>
            </div>
          </button>

          {/* 2. 피드백 수정하기 (임시저장 메모장) */}
          <button 
            onClick={() => router.push('/vote/feedback')}
            className="w-full bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 hover:border-emerald-500 transition-all text-left flex items-center gap-6 group active:scale-[0.98]"
          >
            <span className="text-4xl group-hover:scale-110 transition-transform">📝</span>
            <div>
              <h2 className="text-xl font-black text-slate-800 mb-1">임시저장 피드백 쓰기</h2>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Draft Feedback Memo</p>
            </div>
          </button>

          {/* 구분선 */}
          <div className="py-4">
            <div className="h-px bg-slate-200 w-full relative">
              <span className="absolute left-1/2 -translate-x-1/2 -top-2 bg-slate-50 px-4 text-[10px] font-black text-slate-300 uppercase tracking-widest">Reports</span>
            </div>
          </div>

          {/* 3. 내 성적 확인 */}
          <button 
            onClick={() => router.push('/vote/results/my')} 
            className="w-full bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 hover:border-blue-500 transition-all text-left flex items-center gap-6 group active:scale-[0.98]"
          >
            <span className="text-4xl group-hover:scale-110 transition-transform">📈</span>
            <div>
              <h2 className="text-xl font-black text-slate-800 mb-1">내 성적 확인하기</h2>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Individual Analytics</p>
            </div>
          </button>

          {/* 4. 내 피드백 확인 */}
          <button 
            onClick={() => router.push('/vote/results/arxiv')} 
            className="w-full bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 hover:border-emerald-500 transition-all text-left flex items-center gap-6 group active:scale-[0.98]"
          >
            <span className="text-4xl group-hover:scale-110 transition-transform">📂</span>
            <div>
              <h2 className="text-xl font-black text-slate-800 mb-1">받은 피드백 모아보기</h2>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">My Feedback Arxiv</p>
            </div>
          </button>

          {/* 5. 베스트 프레젠터 */}
          <button 
            onClick={() => router.push('/vote/results/ranking')} 
            className="w-full bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 hover:border-yellow-400 transition-all text-left flex items-center gap-6 group active:scale-[0.98]"
          >
            <span className="text-4xl group-hover:scale-110 transition-transform">👑</span>
            <div>
              <h2 className="text-xl font-black text-slate-800 mb-1">베스트 프레젠터 랭킹</h2>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Weekly Rankings</p>
            </div>
          </button>

        </div>

        <div className="text-center opacity-20 font-black text-[10px] tracking-[0.5em] uppercase">
          InsightGraphy Evaluation Hub
        </div>
      </div>
    </div>
  )
}