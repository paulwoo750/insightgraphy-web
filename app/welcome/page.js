'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function WelcomePage() {
  const router = useRouter()
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    // 🌟 이 페이지가 열리는 동안 Supabase가 백그라운드에서
    // URL에 묻어온 토큰을 읽고 자동 로그인을 처리해 줘!
    // (살짝 여유를 주기 위해 1초 뒤에 버튼을 활성화)
    const timer = setTimeout(() => {
      setIsReady(true)
    }, 1000)
    
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-50 text-slate-900 font-sans relative overflow-hidden">
      
      {/* 배경 장식 (로고 컬러 활용) */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-teal-400/20 rounded-full blur-3xl"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-blue-600/10 rounded-full blur-3xl"></div>

      <div className="w-full max-w-lg bg-white p-12 rounded-[3rem] shadow-2xl border border-slate-100 text-center relative z-10 flex flex-col items-center">
        
        <div className="w-24 h-24 bg-gradient-to-tr from-teal-500 to-blue-600 rounded-full flex items-center justify-center shadow-lg mb-8 animate-bounce">
          <span className="text-4xl">🎉</span>
        </div>

        <h1 className="text-3xl md:text-4xl font-black mb-4 text-slate-800 tracking-tight">
          이메일 인증 완료!
        </h1>
        
        <p className="text-slate-500 font-bold text-sm leading-relaxed mb-10">
          성공적으로 인사이트그라피의 식구가 되신 것을 환영합니다.<br/>
          이제 학회의 모든 자료와 시스템을 이용할 수 있습니다.
        </p>

        {isReady ? (
          <Link 
            href="/home" 
            className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-lg hover:bg-teal-600 hover:shadow-lg hover:shadow-teal-600/30 transition-all active:scale-95 flex items-center justify-center gap-2 group"
          >
            InsightGraphy Hub 입장하기 
            <span className="group-hover:translate-x-1 transition-transform">🚀</span>
          </Link>
        ) : (
          <button disabled className="w-full py-5 bg-slate-200 text-slate-400 rounded-2xl font-black text-lg flex items-center justify-center gap-2 cursor-wait">
            <span className="animate-spin">🔄</span> 로그인 처리 중...
          </button>
        )}
        
      </div>
      
      {/* 워터마크 로고 */}
      <img src="/logo.png" alt="IG Logo" className="absolute bottom-10 opacity-10 w-32 object-contain grayscale" />
    </div>
  )
}