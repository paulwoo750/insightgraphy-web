'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function DashboardHub() {
  const router = useRouter()
  const [user, setUser] = useState(null)

  // 1. 로그인 여부 체크
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

  if (!user) return <div className="p-8 text-center font-bold italic">인사이트 로딩 중... 🔄</div>

  return (
    <div className="min-h-screen bg-slate-50 p-8 flex flex-col items-center font-sans text-slate-900">
      <div className="max-w-5xl w-full">
        {/* 상단 헤더 */}
        <header className="mb-16 text-center">
          <Link href="/home" className="text-blue-600 text-xs font-black hover:underline mb-4 block uppercase tracking-[0.2em]">
            ← Back to Home
          </Link>
          <h1 className="text-5xl font-black text-slate-800 tracking-tight mb-4">Dashboard Hub 📂</h1>
          <p className="text-slate-400 font-bold">원하는 작업을 선택해서 파일을 관리해줘.</p>
        </header>

        {/* 3가지 메인 메뉴 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          
          {/* 1. 기획서 제출 */}
          <button 
            onClick={() => router.push('/dashboard/proposal')}
            className="group bg-white p-12 rounded-[3rem] shadow-sm border-2 border-transparent hover:border-blue-500 hover:shadow-2xl transition-all text-left"
          >
            <div className="text-5xl mb-8 group-hover:scale-125 transition-transform duration-300">📝</div>
            <h2 className="text-2xl font-black text-slate-800 mb-3">기획서 제출</h2>
            <p className="text-sm text-slate-400 font-medium leading-relaxed">매주 작성한 기획서 파일을 업로드하고 확인해.</p>
          </button>

          {/* 2. 슬라이드 제출 */}
          <button 
            onClick={() => router.push('/dashboard/slide')}
            className="group bg-white p-12 rounded-[3rem] shadow-sm border-2 border-transparent hover:border-purple-500 hover:shadow-2xl transition-all text-left"
          >
            <div className="text-5xl mb-8 group-hover:scale-125 transition-transform duration-300">📊</div>
            <h2 className="text-2xl font-black text-slate-800 mb-3">슬라이드 제출</h2>
            <p className="text-sm text-slate-400 font-medium leading-relaxed">발표용 PPT 및 슬라이드 자료를 여기에 업로드해.</p>
          </button>

          {/* 3. 발표영상 확인 */}
          <button 
            onClick={() => router.push('/dashboard/video')}
            className="group bg-white p-12 rounded-[3rem] shadow-sm border-2 border-transparent hover:border-red-500 hover:shadow-2xl transition-all text-left"
          >
            <div className="text-5xl mb-8 group-hover:scale-125 transition-transform duration-300">🎬</div>
            <h2 className="text-2xl font-black text-slate-800 mb-3">발표영상 확인</h2>
            <p className="text-sm text-slate-400 font-medium leading-relaxed">기록된 발표 영상을 주차별로 모아서 감상해.</p>
          </button>

        </div>

        {/* 하단 장식 */}
        <div className="text-center opacity-20 font-black text-[10px] tracking-[0.5em] uppercase">
          InsightGraphy Management System
        </div>
      </div>
    </div>
  )
}