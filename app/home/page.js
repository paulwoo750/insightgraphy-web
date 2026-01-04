'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function HomeHub() {
  const router = useRouter()
  const [user, setUser] = useState(null)

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/signup')
      } else {
        setUser(session.user)
      }
    }
    checkUser()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/signup')
  }

  if (!user) return <div className="p-8 text-center font-bold">로딩 중... 🔄</div>

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-slate-900 font-sans">
      <div className="max-w-6xl w-full text-center">
        
        {/* 상단 메시지 구역 */}
        <div className="mb-16">
          <span className="bg-blue-100 text-blue-600 px-5 py-1.5 rounded-full text-xs font-black uppercase tracking-[0.2em]">
            InsightGraphy Hub
          </span>
          <h1 className="text-5xl font-black text-slate-800 mt-8 mb-3">
            반가워요, <span className="text-blue-600">{user.user_metadata.name}</span>님! 👋
          </h1>
          <p className="text-slate-400 font-bold text-lg">오늘도 인사이트 넘치는 하루 되세요.</p>
        </div>

        {/* 메인 메뉴 카드 그리드 (3칸으로 확장) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          
          {/* 1. 주차별 자료실 */}
          <button 
            onClick={() => router.push('/dashboard')}
            className="group bg-white p-10 rounded-[3rem] shadow-sm border-2 border-transparent hover:border-blue-500 hover:shadow-2xl transition-all text-left"
          >
            <div className="text-5xl mb-6 group-hover:scale-125 transition-transform duration-300">📂</div>
            <h2 className="text-2xl font-black text-slate-800 mb-2">주차별 자료실</h2>
            <p className="text-sm text-slate-400 font-medium leading-relaxed">매주 올라오는 학회 자료를 확인하고 업로드하세요.</p>
          </button>

          {/* 2. IG Archive */}
          <button 
            onClick={() => router.push('/archive')}
            className="group bg-white p-10 rounded-[3rem] shadow-sm border-2 border-transparent hover:border-blue-600 hover:shadow-2xl transition-all text-left"
          >
            <div className="text-5xl mb-6 group-hover:scale-125 transition-transform duration-300">🏛️</div>
            <h2 className="text-2xl font-black text-slate-800 mb-2">IG Archive</h2>
            <p className="text-sm text-slate-400 font-medium leading-relaxed">기획서, 양식 등 학회의 소중한 자산을 관리하세요.</p>
          </button>

          {/* 3. 실시간 발표 채점 (새로 추가됨!) 🗳️ */}
          <button 
            onClick={() => router.push('/vote')}
            className="group bg-white p-10 rounded-[3rem] shadow-sm border-2 border-transparent hover:border-yellow-500 hover:shadow-2xl transition-all text-left"
          >
            <div className="text-5xl mb-6 group-hover:scale-125 transition-transform duration-300">🗳️</div>
            <h2 className="text-2xl font-black text-slate-800 mb-2">실시간 발표 채점</h2>
            <p className="text-sm text-slate-400 font-medium leading-relaxed">오늘의 발표를 실시간으로 채점하고 투표하세요.</p>
          </button>

        </div>

        {/* 하단 제어 구역 */}
        <div className="flex flex-col items-center gap-6">
          <button 
            onClick={handleLogout}
            className="text-slate-300 hover:text-red-500 font-bold text-sm transition-colors underline underline-offset-8"
          >
            안전하게 로그아웃하기 🚪
          </button>
          <p className="text-[10px] text-slate-200 font-black tracking-[0.3em] uppercase">
            Designed for InsightGraphy
          </p>
        </div>
      </div>
    </div>
  )
}