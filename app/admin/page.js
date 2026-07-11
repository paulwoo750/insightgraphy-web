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

  if (!user) return <div className="min-h-screen bg-white flex items-center justify-center font-bold text-slate-400">보안 연결 중... 🔒</div>

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans flex items-center justify-center px-6">
      <div className="w-full max-w-sm">

        {/* 브랜드 */}
        <div className="mb-12">
          <Link href="/home" className="text-2xl font-black text-teal-800 tracking-tighter">InsightGraphy</Link>
          <div className="w-10 h-[3px] bg-teal-800 mt-3"></div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-8">Admin Access</p>
          <h1 className="text-xl font-extrabold text-slate-900 mt-2">관리자 인증</h1>
          <p className="text-sm font-medium text-slate-400 mt-1">관리자 전용 구역입니다. 보안 코드를 입력해주세요.</p>
        </div>

        <form onSubmit={handleVerify} className="flex flex-col gap-7">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Secret Code</label>
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="보안 코드 입력"
              className="w-full border-b border-slate-300 py-2.5 text-sm font-bold tracking-widest outline-none focus:border-teal-700 bg-transparent transition-colors placeholder:font-medium placeholder:tracking-normal placeholder:text-slate-300"
              autoFocus
            />
            {errorMsg && <p className="text-red-500 text-xs font-bold mt-3">{errorMsg}</p>}
          </div>
          <button
            type="submit"
            className="mt-3 py-3.5 bg-teal-800 text-white font-bold text-sm tracking-wide hover:bg-teal-900 transition-colors active:scale-[0.99]"
          >
            인증하고 입장하기
          </button>
        </form>

        <div className="mt-10 pt-6 border-t border-slate-200 text-sm text-slate-400 font-medium">
          <Link href="/home" className="text-teal-800 font-bold hover:underline underline-offset-4">← 일반 홈으로 돌아가기</Link>
        </div>
      </div>
    </div>
  )
}
