'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function AdminAuthPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  
  const [passcode, setPasscode] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // 1차 방호벽: 기본 로그인 세션 확인
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

  // 2차 방호벽: 비밀 코드 검증 후 Hub로 이동
  const handleVerify = (e) => {
    e.preventDefault()
    if (passcode === 'IGAdmin') {
      // 인증 성공 시 브라우저 세션에 관리자 권한 임시 저장
      sessionStorage.setItem('isIGAdmin', 'true')
      router.push('/admin/hub')
    } else {
      setErrorMsg('보안 코드가 일치하지 않습니다. 다시 시도해주세요.')
      setPasscode('')
    }
  }

  if (!user) return <div className="p-8 text-center font-bold text-slate-500">보안 연결 중... 🔒</div>

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-white font-sans selection:bg-[#32a4a1] selection:text-white">
      <div className="max-w-md w-full bg-slate-800 p-10 rounded-[3rem] shadow-2xl border border-slate-700 relative overflow-hidden">
        {/* 배경 장식 */}
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-[#32a4a1]" />
        
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center text-3xl mx-auto mb-4 shadow-inner border border-slate-700">
            🛡️
          </div>
          <h1 className="text-2xl font-black uppercase tracking-widest mb-2">Admin Access</h1>
          <p className="text-xs text-slate-400 font-bold">InsightGraphy 관리자 전용 구역입니다.<br/>비밀 코드를 입력해주세요.</p>
        </div>

        <form onSubmit={handleVerify} className="space-y-6">
          <div>
            <input 
              type="password" 
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter Secret Code"
              className="w-full bg-slate-900 border border-slate-700 p-4 rounded-2xl text-center text-xl font-black tracking-widest text-white outline-none focus:border-[#32a4a1] transition-colors placeholder:text-slate-600 placeholder:text-sm"
              autoFocus
            />
            {errorMsg && <p className="text-red-400 text-xs font-bold text-center mt-3 animate-pulse">{errorMsg}</p>}
          </div>
          <button 
            type="submit"
            className="w-full bg-[#32a4a1] hover:bg-[#258582] text-white py-4 rounded-2xl font-black uppercase tracking-widest text-sm transition-all shadow-lg active:scale-95"
          >
            Verify & Enter
          </button>
        </form>

        <div className="mt-8 text-center">
          <Link href="/home" className="text-slate-500 hover:text-white text-xs font-bold transition-colors underline underline-offset-4">
            일반 홈으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  )
}