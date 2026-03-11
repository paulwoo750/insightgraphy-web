'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function VoteManagerHub() {
  const router = useRouter()
  const [isAuthorized, setIsAuthorized] = useState(false)

  useEffect(() => {
    // 보안 패스 확인
    if (!sessionStorage.getItem('isIGAdmin')) {
      alert('비정상적인 접근입니다.')
      router.push('/admin')
    } else {
      setIsAuthorized(true)
    }
  }, [router])

  if (!isAuthorized) return null

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-12 pb-32">
      <div className="max-w-5xl mx-auto space-y-12">
        
        {/* 상단 헤더 */}
        <header className="flex justify-between items-end mb-12 border-b border-slate-200 pb-6">
          <div>
            <Link href="/admin/hub" className="text-xs font-black text-slate-400 hover:text-yellow-500 uppercase tracking-widest mb-2 block transition-colors">
              ← Back to Admin Hub
            </Link>
            <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-800 flex items-center gap-3">
              <span className="text-4xl">🗳️</span> Vote & Score System
            </h1>
            <p className="text-xs font-bold text-slate-500 mt-2">실시간 채점 시스템의 안내 문구와 발표 세션을 관리하세요.</p>
          </div>
        </header>

        {/* 2가지 선택 메뉴 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* 1. 내용 수정 (Content Edit) */}
          <Link 
            href="/admin/hub/vote/content"
            className="bg-white p-10 rounded-[3rem] shadow-sm border-2 border-transparent hover:border-yellow-400 hover:shadow-2xl transition-all group flex flex-col justify-between min-h-[300px]"
          >
            <div>
              <div className="text-6xl mb-6 group-hover:scale-110 transition-transform origin-left">📝</div>
              <h2 className="text-2xl font-black uppercase tracking-tight mb-4 text-slate-800 group-hover:text-yellow-600 transition-colors">
                투표 화면 내용 수정
              </h2>
              <p className="text-sm text-slate-500 font-medium break-keep leading-relaxed">
                유저들이 보는 투표 페이지의 상단 안내 문구, 채점 기준(Insight, Graphic, Delivery) 세부 설명 등을 텍스트 에디터로 편집합니다.
              </p>
            </div>
            <div className="text-right mt-8 opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-[11px] font-black uppercase tracking-widest text-yellow-600 bg-yellow-50 px-4 py-2 rounded-xl border border-yellow-200">
                Edit Content ⚙️
              </span>
            </div>
          </Link>

          {/* 2. 발표 셋업 (Session Setup) */}
          <Link 
            href="/admin/hub/vote/setup"
            className="bg-white p-10 rounded-[3rem] shadow-sm border-2 border-transparent hover:border-yellow-500 hover:shadow-2xl transition-all group flex flex-col justify-between min-h-[300px]"
          >
            <div>
              <div className="text-6xl mb-6 group-hover:scale-110 transition-transform origin-left">📊</div>
              <h2 className="text-2xl font-black uppercase tracking-tight mb-4 text-slate-800 group-hover:text-yellow-600 transition-colors">
                발표 세션 셋업
              </h2>
              <p className="text-sm text-slate-500 font-medium break-keep leading-relaxed">
                이번 주차의 발표자 명단 등록, 조 편성, 투표 활성화(ON/OFF) 제어 및 제출된 피드백 확인 등 실시간 세션을 관리합니다.
              </p>
            </div>
            <div className="text-right mt-8 opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-[11px] font-black uppercase tracking-widest text-yellow-600 bg-yellow-50 px-4 py-2 rounded-xl border border-yellow-200">
                Session Setup ⚙️
              </span>
            </div>
          </Link>

        </div>

      </div>
    </div>
  )
}