'use client'
import Link from 'next/link'
import Image from 'next/image'

// 상단 네비게이션 (기존 서식 유지)
function PublicNav() {
  return (
    <nav className="fixed top-0 w-full px-12 py-4 flex justify-between items-center bg-[#1a1a1a] text-white z-50 border-b border-white/5">
      <Link href="/" className="flex items-center gap-3 group">
        <div className="relative w-8 h-8">
          <Image src="/logo.png" alt="IG Logo" fill className="object-contain" />
        </div>
        <span className="text-xl font-black uppercase tracking-tighter group-hover:text-[#a8d0cd] transition-colors">InsightGraphy</span>
      </Link>
      <div className="flex items-center gap-x-10 text-[11px] font-black uppercase tracking-widest text-white/70">
        <Link href="/about" className="hover:text-[#32a4a1] transition-colors">About</Link>
        <Link href="/activities" className="text-[#32a4a1]">Activities</Link>
        <Link href="/members" className="hover:text-[#32a4a1] transition-colors">Members</Link>
        <Link href="/showcase" className="hover:text-[#32a4a1] transition-colors">Showcase</Link>
        <Link href="/join" className="hover:text-[#32a4a1] transition-colors">Join Us</Link>
        <Link href="/login" className="bg-[#32a4a1] px-6 h-[36px] rounded-lg hover:bg-[#0d6b69] transition-all flex items-center justify-center text-white">Login</Link>
      </div>
    </nav>
  )
}

export default function RegularSessionPage() {
  const weeklyRoutine = [
    { day: "월요일", action: "발표 주제 업데이트", detail: "매주 새로운 비즈니스/트렌드 주제 공지", icon: "📌" },
    { day: "화요일", action: "이전 주차 셀프 피드백", detail: "지난 발표 영상 복기 및 개선점 도출", icon: "📝" },
    { day: "수요일", action: "기획서 업로드 (마감 23:59)", detail: "논리적 구조가 담긴 기획서 제출", icon: "📤" },
    { day: "목요일", action: "학회원 간 기획서 피드백", detail: "조원들의 기획서를 읽고 댓글 피드백", icon: "💬" },
    { day: "금요일", action: "최종 프레젠테이션 준비", detail: "피드백 반영 및 슬라이드 제작 마무리", icon: "🔥" },
    { day: "토요일", action: "[정규세션] 실전 PT", detail: "매주 토요일 13:00 - 17:00 실전 발표", icon: "🎤" },
    { day: "일요일", action: "학회원 간 PT 피드백", detail: "발표 내용 및 전달력 상호 평가", icon: "🙌" },
  ]

  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] font-sans pt-32 pb-20 selection:bg-[#32a4a1] selection:text-white">
      <PublicNav />

      {/* 1. 세션 헤더 (기존 유지) */}
      <section className="max-w-4xl mx-auto px-8 mb-20 text-center">
        <div className="inline-block bg-[#32a4a1]/10 text-[#32a4a1] px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-6">Activity 01</div>
        <h2 className="text-5xl font-black uppercase tracking-tighter mb-8">Regular Session</h2>
        <p className="text-lg text-slate-600 leading-relaxed break-keep font-medium">
          정규 세션은 InsightGraphy 활동의 꽃으로, 매주 토요일 오후 1시부터 5시까지 진행됩니다.
          학회원들은 다양한 분야의 역량을 시험할 수 있는 주제에 대해 일주일간 준비한 결과물을 발표하고 자유롭게 소통합니다.
        </p>
      </section>

      {/* 2. IGer의 일주일 (Timeline) (기존 유지) */}
      <section className="bg-slate-50 py-24 px-8 border-y border-slate-100">
        <div className="max-w-5xl mx-auto">
          <h3 className="text-2xl font-black text-center mb-16 uppercase tracking-tight">The Week of an IGer</h3>
          <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
            {weeklyRoutine.map((item, idx) => (
              <div key={idx} className={`bg-white p-6 rounded-[2rem] border-2 transition-all hover:scale-105 ${item.day === "토요일" ? "border-[#32a4a1] shadow-lg shadow-brand-primary/10" : "border-transparent shadow-sm"}`}>
                <div className="text-2xl mb-4">{item.icon}</div>
                <p className={`text-xs font-black mb-2 ${item.day === "토요일" ? "text-[#32a4a1]" : "text-slate-400"}`}>{item.day}</p>
                <p className="text-sm font-black leading-tight mb-2 break-keep">{item.action}</p>
                <p className="text-[10px] text-slate-500 leading-normal font-medium break-keep">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. 기획서 제출 및 피드백 상세 규정 (기존 유지) */}
      <section className="py-24 px-8 max-w-5xl mx-auto border-b border-slate-100">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* 기획서 업로드 가이드 */}
          <div className="space-y-8">
            <h3 className="text-2xl font-black border-l-8 border-[#32a4a1] pl-4 uppercase">Planning Document</h3>
            <div className="space-y-6">
              <div>
                <p className="text-xs font-black text-slate-400 uppercase mb-2">Deadline</p>
                <p className="font-bold text-lg">매주 수요일 오후 23:59</p>
                <p className="text-xs text-slate-400 font-medium">* 해당 주의 공지에 따라 변동 가능</p>
              </div>
              <div>
                <p className="text-xs font-black text-slate-400 uppercase mb-2">Required Files</p>
                <p className="font-bold">기획서 파일 (.docx) 및 캡처본 (.jpg / .png)</p>
              </div>
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                <p className="text-xs font-black text-slate-400 uppercase mb-3">Naming Convention</p>
                <code className="text-sm font-black text-blue-600 block bg-white p-3 rounded-xl border border-slate-200">
                  [연도_학기_주차_주제명_이름]
                </code>
                <p className="text-[10px] mt-2 text-slate-500 font-medium">ex. 2026_1학기_0주차_Hello IG_홍길동</p>
              </div>
            </div>
          </div>

          {/* 피드백 가이드 */}
          <div className="space-y-8">
            <h3 className="text-2xl font-black border-l-8 border-[#1a1a1a] pl-4 uppercase">Active Feedback</h3>
            <div className="space-y-6">
              <div>
                <p className="text-xs font-black text-slate-400 uppercase mb-2">Feedback Policy</p>
                <p className="font-bold text-lg leading-snug break-keep">매주 배정되는 조원의 기획서에 대해 자유롭게 댓글 피드백</p>
              </div>
              <div className="bg-[#1a1a1a] text-white p-8 rounded-[2.5rem] shadow-xl">
                <p className="text-xs font-black text-[#a8d0cd] uppercase mb-4">Feedback Deadline</p>
                <p className="text-3xl font-black mb-2">매주 목요일</p>
                <p className="text-4xl font-black text-[#32a4a1]">23:59 PM</p>
              </div>
              <p className="text-sm text-slate-500 font-medium leading-relaxed break-keep">
                동료들의 날카로운 피드백을 통해 기획의 허점을 보완하고, 더 성숙한 프레젠터로 함께 성장하는 것을 지향합니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. 3가지 피드백 시스템 (신규 추가) */}
      <section className="py-24 px-8 max-w-5xl mx-auto">
        <h3 className="text-2xl font-black text-center mb-16 uppercase tracking-tight">3-Way Feedback System</h3>
        
        <div className="space-y-24">
          {/* 4-1. 정량 피드백 (Quantitative) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="order-2 md:order-1">
              <span className="text-[#32a4a1] font-black tracking-[0.3em] uppercase text-xs mb-4 block">01. Quantitative</span>
              <h4 className="text-3xl font-black mb-6">정량 피드백</h4>
              <p className="text-slate-600 font-medium leading-relaxed break-keep mb-6">
                발표 직후 청중들이 실시간으로 IGD(Insight, Graphic, Delivery) 각 항목에 대해 점수를 매기는 시스템입니다. 객관적인 데이터를 통해 자신의 강점과 약점을 한눈에 파악할 수 있습니다.
              </p>
              <ul className="space-y-3 text-sm font-bold text-slate-700">
                <li className="flex items-center gap-2"><span className="text-[#32a4a1]">✓</span> 실시간 모바일 투표 진행</li>
                <li className="flex items-center gap-2"><span className="text-[#32a4a1]">✓</span> IGD 항목별 5점 척도 평가</li>
                <li className="flex items-center gap-2"><span className="text-[#32a4a1]">✓</span> 세션 종료 후 결과 데이터 제공</li>
              </ul>
            </div>
            <div className="order-1 md:order-2 relative h-[400px] rounded-[2.5rem] overflow-hidden shadow-xl border border-slate-100 bg-slate-50">
              {/* public 폴더에 quantitative-feedback.png 이미지를 넣어주세요 */}
              <Image src="/capture2.png" alt="정량 피드백 시스템 스크린샷" fill className="object-cover" />
            </div>
          </div>

          {/* 4-2. 정성 피드백 (Qualitative) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="relative h-[400px] rounded-[2.5rem] overflow-hidden shadow-xl border border-slate-100 bg-[#f8f9fa] p-8 flex flex-col justify-center">
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border-l-4 border-[#32a4a1]">
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Insight (Good/Bad)</p>
                  <p className="text-sm font-bold">"논리적인 흐름이 매우 인상적이었습니다. 다만, 후반부 근거 데이터가 조금 더 보강되면 좋겠습니다."</p>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border-l-4 border-[#1a1a1a]">
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Graphic (Good/Bad)</p>
                  <p className="text-sm font-bold">"장표의 가독성이 뛰어납니다. 강조하고 싶은 키워드에 컬러 포인트를 더 활용해보는 건 어떨까요?"</p>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border-l-4 border-[#a8d0cd]">
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Delivery (Good/Bad)</p>
                  <p className="text-sm font-bold">"자신감 있는 목소리가 좋았습니다. 제스처를 조금 더 자연스럽게 사용하면 전달력이 배가될 것 같습니다."</p>
                </div>
              </div>
            </div>
            <div>
              <span className="text-[#32a4a1] font-black tracking-[0.3em] uppercase text-xs mb-4 block">02. Qualitative</span>
              <h4 className="text-3xl font-black mb-6">정성 피드백</h4>
              <p className="text-slate-600 font-medium leading-relaxed break-keep mb-6">
                동료 학회원들이 발표자의 IGD 각 요소에 대해 구체적인 장점(Good)과 개선점(Bad)을 코멘트로 남겨줍니다. 점수로는 알 수 없는 깊이 있는 조언을 얻을 수 있습니다.
              </p>
              <ul className="space-y-3 text-sm font-bold text-slate-700">
                <li className="flex items-center gap-2"><span className="text-[#32a4a1]">✓</span> IGD 기준별 구체적 코멘트 작성</li>
                <li className="flex items-center gap-2"><span className="text-[#32a4a1]">✓</span> 동료들의 다각적인 시선 공유</li>
                <li className="flex items-center gap-2"><span className="text-[#32a4a1]">✓</span> 실질적인 개선 방향성 도출</li>
              </ul>
            </div>
          </div>

          {/* 4-3. 셀프 피드백 (Self) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div className="order-2 md:order-1">
              <span className="text-[#32a4a1] font-black tracking-[0.3em] uppercase text-xs mb-4 block">03. Self Feedback</span>
              <h4 className="text-3xl font-black mb-6">셀프 피드백</h4>
              <p className="text-slate-600 font-medium leading-relaxed break-keep mb-6">
                자신의 발표 영상을 직접 모니터링하며 스스로의 모습을 객관적으로 회고합니다. 타인의 피드백과 자신의 분석을 종합하여 다음 발표를 위한 구체적인 실행 계획을 수립합니다.
              </p>
              <ul className="space-y-3 text-sm font-bold text-slate-700">
                <li className="flex items-center gap-2"><span className="text-[#32a4a1]">✓</span> 발표 영상 모니터링 및 회고</li>
                <li className="flex items-center gap-2"><span className="text-[#32a4a1]">✓</span> 타인 피드백과의 비교 분석</li>
                <li className="flex items-center gap-2"><span className="text-[#32a4a1]">✓</span> 차주 발표 개선 계획 수립</li>
              </ul>
            </div>
            <div className="order-1 md:order-2 relative h-[400px] rounded-[2.5rem] overflow-hidden shadow-xl border border-slate-100 bg-[#f8f9fa] p-8 flex flex-col justify-center">
              <div className="bg-white p-8 rounded-[2rem] shadow-sm space-y-6 border border-slate-100">
                <div className="flex items-center gap-4 mb-2">
                  <span className="text-4xl">📹</span>
                  <h5 className="text-xl font-black uppercase">발표 영상 복기</h5>
                </div>
                <div className="space-y-4">
                  <div className="bg-slate-50 p-4 rounded-xl border-l-4 border-blue-400">
                    <p className="text-xs font-black text-slate-500 mb-1">잘한 점 (Keep)</p>
                    <p className="text-sm font-bold">청중과의 아이컨택을 꾸준히 유지하려고 노력한 점</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border-l-4 border-red-400">
                    <p className="text-xs font-black text-slate-500 mb-1">아쉬운 점 (Problem)</p>
                    <p className="text-sm font-bold">긴장해서 말이 빨라지고, 특정 단어를 반복적으로 사용한 점</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border-l-4 border-green-400">
                    <p className="text-xs font-black text-slate-500 mb-1">개선 계획 (Try)</p>
                    <p className="text-sm font-bold">다음 발표 때는 문장 사이 호흡을 의식적으로 신경 쓰고, 속도 조절 연습하기</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. 하단 안내 및 하이퍼링크 (기존 유지) */}
      <section className="pt-10 pb-20 text-center">
        <div className="flex flex-col items-center gap-6">
          <p className="text-slate-400 font-bold text-sm">발표 주제 예시 및 주간 진행 내용은 인스타그램에서 확인하세요.</p>
          <a 
            href="https://www.instagram.com/insightgraphy_pt" 
            target="_blank" 
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-tr from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] text-white font-black rounded-xl hover:scale-105 transition-transform shadow-lg"
          >
            <span>Instagram 바로가기</span>
            <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
          </a>
          <Link href="/activities" className="mt-8 text-xs font-black text-slate-400 hover:text-black uppercase tracking-widest border-b border-slate-200 pb-1">← Back to Activities</Link>
        </div>
      </section>

      <footer className="py-12 border-t border-slate-100 text-center bg-[#1a1a1a] text-white mt-20">
        <p className="text-[10px] font-black text-[#a8d0cd] uppercase tracking-[0.5em]">© 2026 InsightGraphy. All Rights Reserved.</p>
      </footer>
    </div>
  )
}