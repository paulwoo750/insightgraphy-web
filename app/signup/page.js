'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function Signup() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [studentId, setStudentId] = useState('')
  const [secretCode, setSecretCode] = useState('')
  const [loading, setLoading] = useState(false) 
  const router = useRouter()

  const handleSignup = async (e) => {
    e.preventDefault()
    setLoading(true) 

    // 1. 학회원 전용 비밀 코드 확인
    if (secretCode !== "IG2024") {
      alert("비밀 코드가 틀렸습니다! 운영진에게 문의하세요. 🤫")
      setLoading(false)
      return
    }

    // 2. Supabase 회원가입 실행 (계정 생성)
    const { data, error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name,
          student_id: studentId,
        },
      },
    })

    if (signupError) {
      alert("가입 실패: " + signupError.message)
      setLoading(false)
      return
    }

    // 3. profiles 테이블에 정보 자동 기록 (명단 등록)
    const { error: profileError } = await supabase
      .from('profiles')
      .insert([
        { 
          id: data.user.id, 
          name: name, 
          student_id: studentId 
        }
      ])

    if (profileError) {
      console.error("명단 등록 실패:", profileError.message)
      alert("가입은 됐지만 명단 등록에 실패했어. 운영진에게 알려줘!")
    } else {
      // ★ 변경된 부분: 가입 성공 후 로그인 페이지로 이동 ★
      alert("인사이트그라피의 식구가 된 걸 환영해! 🎉 생성한 계정으로 다시 로그인해줘.")
      router.push('/login') 
    }
    
    setLoading(false) 
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-50 text-slate-900 font-sans">
      <div className="w-full max-w-md bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black mb-3 text-blue-800 tracking-tight">IG 가입하기 🚀</h1>
          <p className="text-slate-400 font-medium text-sm">인사이트그라피의 새로운 가족이 되어주세요.</p>
        </div>
        
        <form onSubmit={handleSignup} className="flex flex-col gap-5">
          <div className="space-y-3">
            <label className="text-xs font-black text-slate-400 uppercase ml-1 tracking-widest">Account</label>
            <input type="email" placeholder="이메일 주소" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-4 border-2 border-slate-50 bg-slate-50 rounded-2xl focus:bg-white focus:border-blue-500 outline-none transition-all" required />
            <input type="password" placeholder="비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-4 border-2 border-slate-50 bg-slate-50 rounded-2xl focus:bg-white focus:border-blue-500 outline-none transition-all" required />
          </div>

          <div className="space-y-3">
            <label className="text-xs font-black text-slate-400 uppercase ml-1 tracking-widest">Member Info</label>
            <input type="text" placeholder="성함 (실명)" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-4 border-2 border-slate-50 bg-slate-50 rounded-2xl focus:bg-white focus:border-blue-500 outline-none transition-all" required />
            <input type="text" placeholder="기수 (예: 28기)" value={studentId} onChange={(e) => setStudentId(e.target.value)} className="w-full p-4 border-2 border-slate-50 bg-slate-50 rounded-2xl focus:bg-white focus:border-blue-500 outline-none transition-all" required />
          </div>

          <div className="space-y-3">
            <label className="text-xs font-black text-red-400 uppercase ml-1 tracking-widest">Security Code</label>
            <input type="text" placeholder="비밀 코드 입력" value={secretCode} onChange={(e) => setSecretCode(e.target.value)} className="w-full p-4 border-2 border-red-50 bg-red-50 rounded-2xl focus:bg-white focus:border-red-500 outline-none transition-all text-red-600 font-bold" required />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="mt-4 p-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 font-black shadow-lg shadow-blue-100 transition-all active:scale-95 disabled:bg-slate-300"
          >
            {loading ? "가족이 되는 중..." : "인사이트그라피 시작하기"}
          </button>
        </form>

        <div className="mt-10 pt-8 border-t border-slate-50 text-center text-sm text-slate-400">
          이미 식구이신가요?{' '}
          <Link href="/login" className="text-blue-600 font-black hover:underline">
            로그인 하러가기
          </Link>
        </div>
      </div>
    </div>
  )
}