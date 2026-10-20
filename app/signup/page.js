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
  const [requestedMemberStatus, setRequestedMemberStatus] = useState('active')
  const [secretCode, setSecretCode] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSignup = async (e) => {
    e.preventDefault()
    setLoading(true)

    // 1. Supabase 회원가입 실행 (계정 생성)
    // 학회 코드는 브라우저가 아니라 DB가 확인한다 (Supabase STEP 23). 틀리면 계정이 만들어지지 않고,
    // 확인이 끝난 코드는 계정 정보에 남지 않는다.
    const { data, error: signupError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name,
          student_id: studentId,
          requested_member_status: requestedMemberStatus,
          signup_code: secretCode.trim(),
        },
        // 🌟 핵심 파트: 이메일 인증 후 돌아올 주소를 /welcome 페이지로 지정!
        emailRedirectTo: `${window.location.origin}/welcome`,
      },
    })

    if (signupError) {
      // DB 트리거가 가입을 거절하면 Supabase Auth는 이 문구만 돌려준다 (가입 코드 불일치가 대부분)
      if (signupError.message?.includes('Database error saving new user')) {
        alert("학회 코드가 맞지 않아 가입하지 못했어. 운영진에게 받은 코드를 다시 확인해줘! 🤫")
      } else {
        alert("가입 실패: " + signupError.message)
      }
      setLoading(false)
      return
    }

    // 이미 가입된 이메일이면 Supabase는 오류 대신 빈 계정 정보를 돌려준다
    if (!data.user || data.user.identities?.length === 0) {
      alert("이미 가입된 이메일이야. 로그인하거나 비밀번호 찾기를 이용해줘.")
      setLoading(false)
      return
    }

    // 2. profiles 테이블에 정보 기록 (가입 신청 접수: 운영진 승인 대기)
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
      alert("가입 신청이 접수됐어! 🎉 이메일함에서 인증 버튼을 누르고, 운영진 승인이 끝나면 학회원 공간을 쓸 수 있어. 이미 명단에 있는 학회원이면 운영진이 예전 기록과 연결해줄 거야.")
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
            <fieldset>
              <legend className="mb-2 text-xs font-bold text-slate-600">학회원 구분</legend>
              <div className="grid grid-cols-2 border border-slate-200 bg-slate-50 p-1">
                <label className={`cursor-pointer px-3 py-2.5 text-center text-xs font-bold transition-colors ${requestedMemberStatus === 'active' ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500'}`}>
                  <input type="radio" name="member-status" value="active" checked={requestedMemberStatus === 'active'} onChange={(e) => setRequestedMemberStatus(e.target.value)} className="sr-only" />
                  활동 학회원
                </label>
                <label className={`cursor-pointer px-3 py-2.5 text-center text-xs font-bold transition-colors ${requestedMemberStatus === 'alumni' ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-500'}`}>
                  <input type="radio" name="member-status" value="alumni" checked={requestedMemberStatus === 'alumni'} onChange={(e) => setRequestedMemberStatus(e.target.value)} className="sr-only" />
                  졸업 학회원
                </label>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-slate-400">가입 후 운영진 승인 시 선택한 명단에 반영됩니다. 이미 명단에 있는 학회원은 운영진이 확인한 뒤 기존 기록과 연결합니다.</p>
            </fieldset>
          </div>

          <div className="flex flex-col gap-6">
            <p className="text-[10px] font-black text-red-500 uppercase tracking-widest border-b border-red-400 pb-2">Security Code</p>
            <input type="text" placeholder="운영진에게 받은 학회 코드" value={secretCode} onChange={(e) => setSecretCode(e.target.value)} className="w-full border-b border-red-300 py-2.5 text-sm font-bold text-red-600 outline-none focus:border-red-500 bg-transparent transition-colors placeholder:font-medium placeholder:text-red-200" required />
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
