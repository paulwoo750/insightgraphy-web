'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function RootPage() {
  const router = useRouter()

  useEffect(() => {
    // 들어가자마자 바로 로그인 페이지로 슝!
    router.push('/login')
  }, [])

  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <p className="font-bold text-slate-400">로그인 페이지로 이동 중... 🚀</p>
    </div>
  )
}