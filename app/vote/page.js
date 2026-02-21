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
    <div className="min-h-screen bg-slate-50 p-8 flex flex-col items-center font-sans text-slate-900">
      <div className="max-w-4xl w-full">
        {/* 헤더 */}
        <header className="mb-16 text-center">
          <Link href="/home" className="text-blue-600 text-xs font-black hover:underline mb-4 block uppercase tracking-[0.2em]">
            ← Back to Home
          </Link>
          <h1 className="text-5xl font-black text-slate-800 tracking-tight mb-4">IG Vote Hub 🗳️</h1>
          <p className="text-slate-400 font-bold">인사이트그라피 발표 평가 시스템</p>
        </header>

        {/* 4대 핵심 메뉴 (2x2 그리드) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
          
          {/* 1. 점수 매기기 */}
          <button 
            onClick={() => router.push('/vote/score')}
            className="group bg-white p-10 rounded-[3rem] shadow-sm border-2 border-transparent hover:border-blue-500 hover:shadow-2xl transition-all text-center"
          >
            <div className="text-5xl mb-6 group-hover:scale-110 transition-transform duration-300">✍️</div>
            <h2 className="text-xl font-black text-slate-800 mb-2">점수 매기기</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Score</p>
          </button>

          {/* 2. 피드백 수정하기 (신규 추가) */}
          <button 
            onClick={() => router.push('/vote/feedback')}
            className="group bg-white p-10 rounded-[3rem] shadow-sm border-2 border-transparent hover:border-emerald-500 hover:shadow-2xl transition-all text-center"
          >
            <div className="text-5xl mb-6 group-hover:scale-110 transition-transform duration-300">📝</div>
            <h2 className="text-xl font-black text-slate-800 mb-2">피드백 수정하기</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Edit Feedback</p>
          </button>

          {/* 3. 결과 확인하기 */}
          <button 
            onClick={() => router.push('/vote/results')}
            className="group bg-white p-10 rounded-[3rem] shadow-sm border-2 border-transparent hover:border-yellow-500 hover:shadow-2xl transition-all text-center"
          >
            <div className="text-5xl mb-6 group-hover:scale-110 transition-transform duration-300">🏆</div>
            <h2 className="text-xl font-black text-slate-800 mb-2">결과 확인하기</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Results</p>
          </button>

          {/* 4. 관리자 모드 */}
          <button 
            onClick={() => router.push('/vote/setup')}
            className="group bg-white p-10 rounded-[3rem] shadow-sm border-2 border-transparent hover:border-slate-800 hover:shadow-2xl transition-all text-center"
          >
            <div className="text-5xl mb-6 group-hover:scale-110 transition-transform duration-300">⚙️</div>
            <h2 className="text-xl font-black text-slate-800 mb-2">관리자 모드</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Setup</p>
          </button>

        </div>

        <div className="text-center opacity-20 font-black text-[10px] tracking-[0.5em] uppercase">
          InsightGraphy Evaluation Hub
        </div>
      </div>
    </div>
  )
}