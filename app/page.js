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
    <div className="flex min-h-screen flex-col items-center justify-center p-24 bg-white text-black">
      <h1 className="text-4xl font-bold mb-2 text-blue-800">IG 로그인 🔑</h1>
      <p className="text-gray-500 mb-8">인사이트그라피의 문이 열립니다.</p>
      
      <form onSubmit={handleLogin} className="flex flex-col gap-4 w-full max-w-md">
        <input 
          type="email" 
          placeholder="이메일 주소" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)} 
          className="p-3 border rounded-lg border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500" 
          required 
        />
        <input 
          type="password" 
          placeholder="비밀번호" 
          value={password} 
          onChange={(e) => setPassword(e.target.value)} 
          className="p-3 border rounded-lg border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500" 
          required 
        />
        <button 
          type="submit" 
          disabled={loading}
          className="p-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors disabled:bg-gray-400"
        >
          {loading ? "로그인 중..." : "로그인하기"}
        </button>
      </form>

      <div className="mt-6 text-sm text-gray-500">
        계정이 없으신가요? <Link href="/signup" className="text-blue-600 font-bold hover:underline">회원가입 하러가기</Link>
      </div>
    </div>
  )
}