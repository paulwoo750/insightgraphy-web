'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      alert("로그인 실패: " + error.message)
    } else {
      alert("반가워요! 로그인 성공 🎊")
      // ★ 이 부분을 /dashboard에서 /home으로 변경함!
      router.push('/home')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans flex items-center justify-center px-6">
      <div className="w-full max-w-sm">

        {/* 브랜드 */}
        <div className="mb-12">
          <Link href="/" className="text-2xl font-black text-teal-800 tracking-tighter">InsightGraphy</Link>
          <div className="w-10 h-[3px] bg-teal-800 mt-3"></div>
          <h1 className="text-xl font-extrabold text-slate-900 mt-8">로그인</h1>
          <p className="text-sm font-medium text-slate-400 mt-1">인사이트그라피 회원 공간에 입장합니다.</p>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-7">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Email</label>
            <input
              type="email"
              placeholder="이메일 주소"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border-b border-slate-300 py-2.5 text-sm font-bold outline-none focus:border-teal-700 bg-transparent transition-colors placeholder:font-medium placeholder:text-slate-300"
              required
            />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Password</label>
            <input
              type="password"
              placeholder="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border-b border-slate-300 py-2.5 text-sm font-bold outline-none focus:border-teal-700 bg-transparent transition-colors placeholder:font-medium placeholder:text-slate-300"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="mt-3 py-3.5 bg-teal-800 text-white font-bold text-sm tracking-wide hover:bg-teal-900 transition-colors disabled:bg-slate-300 active:scale-[0.99]"
          >
            {loading ? "로그인 중..." : "로그인하기"}
          </button>
        </form>

        <div className="mt-10 pt-6 border-t border-slate-200 text-sm text-slate-400 font-medium">
          계정이 없으신가요? <Link href="/signup" className="text-teal-800 font-bold hover:underline underline-offset-4">회원가입 하러가기</Link>
        </div>
      </div>
    </div>
  )
}
