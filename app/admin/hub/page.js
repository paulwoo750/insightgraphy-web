'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function AdminHubPage() {
  const router = useRouter()
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [userName, setUserName] = useState('')

  useEffect(() => {
    // 1. 브라우저 세션에 VIP 패스가 있는지 확인
    const adminToken = sessionStorage.getItem('isIGAdmin')
    if (!adminToken) {
      alert('비정상적인 접근입니다. 보안 코드를 먼저 입력해주세요.')
      router.push('/admin')
      return
    }

    // 2. 로그인 사용자 이름 가져오기
    const fetchUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) setUserName(session.user.user_metadata.name)
    }
    
    setIsAuthorized(true)
    fetchUser()
  }, [])

  const handleExitAdmin = () => {
    sessionStorage.removeItem('isIGAdmin') // VIP 패스 파기
    router.push('/home')
  }

  if (!isAuthorized) return null

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-12 pb-32">
      <div className="max-w-6xl mx-auto">
        
        {/* 상단 헤더 */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-16 gap-6 border-b border-slate-200 pb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="bg-slate-900 text-white px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">
                Command Center
              </span>
              <span className="text-xs font-bold text-slate-400">
                Logged in as <span className="text-[#32a4a1]">{userName}</span>
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter text-slate-800">
              Admin Hub
            </h1>
          </div>
          
          <button 
            onClick={handleExitAdmin}
            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-500 hover:bg-slate-900 hover:text-white px-6 py-3 rounded-full font-black text-xs uppercase tracking-widest transition-all shadow-sm active:scale-95"
          >
            ← Exit Admin
          </button>
        </header>

        {/* =========================================
            1. 홍보 및 외부 채널 관리 (Public)
        ========================================= */}
        <section className="mb-20">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 bg-[#32a4a1]/10 text-[#32a4a1] rounded-2xl flex items-center justify-center text-2xl">📢</div>
            <div>
              <h2 className="text-2xl font-black uppercase text-slate-800">홍보 채널 관리</h2>
              <p className="text-xs font-bold text-slate-400 mt-1">로그인 없이 접근 가능한 외부 공개 웹페이지들을 수정합니다.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AdminCard href="/admin/hub/landing" icon="🏠" title="Landing Page" desc="대문 메인 문구 및 핵심 활동 구성 관리" />
            <AdminCard href="/admin/hub/about" icon="📖" title="About" desc="학회 소개글, 연혁 및 핵심 가치 관리" />
            <AdminCard href="/admin/hub/activities" icon="🎯" title="Activities" desc="정규, 교육 등 세션별 설명 텍스트 관리" />
            <AdminCard href="/admin/hub/showcase" icon="🖼️" title="Showcase" desc="우수 PPT 작품 갤러리 업로드 및 수정" />
            <AdminCard href="/admin/hub/members" icon="👥" title="Members" desc="기수별 학회원 명단 및 프로필 정보 관리" />
            <AdminCard href="/admin/hub/join" icon="📝" title="Join Us" desc="리크루팅 일정 및 신입 기수 지원 안내 관리" />
          </div>
        </section>

        {/* =========================================
            2. 내부 시스템 관리 (Internal)
        ========================================= */}
        <section className="mb-20">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center text-2xl">🏢</div>
            <div>
              <h2 className="text-2xl font-black uppercase text-slate-800">내부 시스템 관리</h2>
              <p className="text-xs font-bold text-slate-400 mt-1">학회원 전용 데이터 및 핵심 운영 시스템을 제어합니다.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <AdminCard href="/admin/hub/schedule" icon="📅" title="Schedule Master" desc="전체 주차별 일정 및 내부 캘린더 관리" color="blue" />
            <AdminCard href="/admin/hub/dashboard" icon="📂" title="Weekly Drive" desc="주차별 세션 자료실 및 개인 과제 제출함 관리" color="blue" />
            <AdminCard href="/admin/hub/archive" icon="🏛️" title="IG Archive" desc="디자인 소스 등 학회 공용 자산 업로드 관리" color="blue" />
            <AdminCard href="/admin/hub/vote" icon="🗳️" title="Vote & Score" desc="실시간 발표 채점 오픈 및 조 편성 세팅" color="blue" />
          </div>
        </section>

        {/* =========================================
            🌟 3. 운영진 학회 관리 (Executive) 🌟
        ========================================= */}
        <section className="mb-12">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center text-2xl">⚖️</div>
            <div>
              <h2 className="text-2xl font-black uppercase text-slate-800">운영진 학회 관리</h2>
              <p className="text-xs font-bold text-slate-400 mt-1">학회 회칙, 출결 및 벌금 등 운영진 전용 관리 시스템입니다.</p>
            </div>
          </div>

          {/* 카드 크기 통일을 위해 4열 그리드 유지 후 2개 배치 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <AdminCard 
              href="/admin/hub/rules" 
              icon="📜" 
              title="Society Rules" 
              desc="지각·결석 벌금 및 학회원 제명 등 세부 회칙 규정 관리" 
              color="purple" 
            />
            <AdminCard 
              href="/admin/hub/fine" 
              icon="📊" 
              title="Attendance & Fines" 
              desc="학회원 세션 참석률 트래킹 및 회칙 기반 벌금 자동 계산·관리" 
              color="purple" 
            />
          </div>
        </section>

      </div>
    </div>
  )
}

// 재사용 가능한 관리자 카드 컴포넌트 (Purple 테마 추가)
function AdminCard({ href, icon, title, desc, color = "teal" }) {
  let hoverColor = "hover:border-[#32a4a1] hover:shadow-[#32a4a1]/10";
  let titleColor = "group-hover:text-[#32a4a1]";
  let badgeColor = "text-[#32a4a1]";

  if (color === "blue") {
    hoverColor = "hover:border-blue-500 hover:shadow-blue-500/10";
    titleColor = "group-hover:text-blue-600";
    badgeColor = "text-blue-500";
  } else if (color === "purple") {
    hoverColor = "hover:border-purple-500 hover:shadow-purple-500/10";
    titleColor = "group-hover:text-purple-600";
    badgeColor = "text-purple-500";
  }

  return (
    <Link href={href} className={`bg-white p-8 rounded-[2rem] shadow-sm border-2 border-transparent ${hoverColor} hover:shadow-2xl transition-all group flex flex-col justify-between min-h-[220px]`}>
      <div>
        <div className="text-4xl mb-5 group-hover:scale-110 transition-transform origin-left">{icon}</div>
        <h3 className={`text-lg font-black uppercase tracking-tight mb-2 text-slate-800 ${titleColor} transition-colors`}>{title}</h3>
        <p className="text-xs text-slate-500 font-medium break-keep leading-relaxed">{desc}</p>
      </div>
      <div className="text-right mt-6 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className={`text-[10px] font-black uppercase tracking-widest ${badgeColor} bg-slate-50 px-3 py-1.5 rounded-lg`}>
          Configure ⚙️
        </span>
      </div>
    </Link>
  )
}