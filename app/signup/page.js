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
    if (secretCode !== "IG2012") {
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
        // 🌟 핵심 파트: 이메일 인증 후 돌아올 주소를 /welcome 페이지로 지정!
        emailRedirectTo: `${window.location.origin}/welcome`,
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
      // 가입 성공 후 알림 및 로그인 페이지로 이동
      alert("인사이트그라피의 식구가 된 걸 환영해! 🎉 이메일함에서 인증 버튼을 누른 뒤 다시 로그인해줘.")
      router.push('/login')
    }

    setLoading(false)
  }

  const lineInput = "w-full border-b border-slate-300 py-2.5 text-sm font-bold outline-none focus:border-teal-700 bg-transparent transition-colors placeholder:font-medium placeholder:text-slate-300"

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">

        {/* 브랜드 */}
        <div className="mb-12">
          <Link href="/" className="text-2xl font-black text-teal-800 tracking-tighter">InsightGraphy</Link>
          <div className="w-10 h-[3px] bg-teal-800 mt-3"></div>
          <h1 className="text-xl font-extrabold text-slate-900 mt-8">회원가입</h1>
          <p className="text-sm font-medium text-slate-400 mt-1">인사이트그라피의 새로운 가족이 되어주세요.</p>
        </div>

        <form onSubmit={handleSignup} className="flex flex-col gap-9">
          <div className="flex flex-col gap-6">
            <p className="text-[10px] font-black text-teal-700 uppercase tracking-widest border-b border-teal-800 pb-2">Account</p>
            <input type="email" placeholder="이메일 주소" value={email} onChange={(e) => setEmail(e.target.value)} className={lineInput} required />
            <input type="password" placeholder="비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} className={lineInput} required />
          </div>

          <div className="flex flex-col gap-6">
            <p className="text-[10px] font-black text-teal-700 uppercase tracking-widest border-b border-teal-800 pb-2">Member Info</p>
            <input type="text" placeholder="성함 (실명)" value={name} onChange={(e) => setName(e.target.value)} className={lineInput} required />
            <input type="text" placeholder="기수 (예: 28기)" value={studentId} onChange={(e) => setStudentId(e.target.value)} className={lineInput} required />
          </div>

          <div className="flex flex-col gap-6">
            <p className="text-[10px] font-black text-red-500 uppercase tracking-widest border-b border-red-400 pb-2">Security Code</p>
            <input type="text" placeholder="학회원 전용 비밀 코드" value={secretCode} onChange={(e) => setSecretCode(e.target.value)} className="w-full border-b border-red-300 py-2.5 text-sm font-bold text-red-600 outline-none focus:border-red-500 bg-transparent transition-colors placeholder:font-medium placeholder:text-red-200" required />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 py-3.5 bg-teal-800 text-white font-bold text-sm tracking-wide hover:bg-teal-900 transition-colors disabled:bg-slate-300 active:scale-[0.99]"
          >
            {loading ? "가족이 되는 중..." : "인사이트그라피 시작하기"}
          </button>
        </form>

        <div className="mt-10 pt-6 border-t border-slate-200 text-center text-sm text-slate-400 font-medium">
          이미 식구이신가요?{' '}
          <Link href="/login" className="text-teal-800 font-bold hover:underline underline-offset-4">
            로그인 하러가기
          </Link>
        </div>
      </div>
    </div>
  )
}
