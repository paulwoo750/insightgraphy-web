'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// 🌟 내부(회원) 파트 공통 GNB
// /home 의 헤더를 단일 소스로 추출한 것. 모든 내부 페이지가 이 컴포넌트를 사용한다.
export default function InternalNav() {
  const pathname = usePathname() || ''

  const isHome = pathname === '/home'
  const isDocs = pathname.startsWith('/dashboard')
  const isArchive = pathname.startsWith('/archive')
  const isVote = pathname.startsWith('/vote')
  const isMypage = pathname.startsWith('/mypage')

  const topLink = 'text-sm font-bold text-slate-600 hover:text-teal-800 transition-colors h-full flex items-center border-b-[3px] border-transparent hover:border-teal-800 shrink-0'
  const topLinkActive = 'text-sm font-extrabold text-teal-800 border-b-[3px] border-teal-800 h-full flex items-center shrink-0'
  const dropTrigger = (active) => `text-sm font-bold ${active ? 'text-teal-800' : 'text-slate-600'} group-hover:text-teal-800 transition-colors cursor-default h-full flex items-center gap-1 border-b-[3px] ${active ? 'border-teal-800' : 'border-transparent'} group-hover:border-teal-800`
  const dropItem = 'px-5 py-3.5 text-xs font-bold text-slate-200 hover:bg-teal-700 hover:text-white border-b border-white/5 transition-colors'
  const dropItemLast = 'px-5 py-3.5 text-xs font-bold text-slate-200 hover:bg-teal-700 hover:text-white transition-colors'

  return (
    <>
      <header className="border-b border-slate-200 bg-white sticky top-0 z-50">
        <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row items-center justify-between px-6 h-auto md:h-[72px]">

          <div className="flex items-center gap-3 py-4 md:py-0 w-full md:w-auto justify-between md:justify-start">
            <Link href="/home" className="text-xl font-black text-teal-800 tracking-tighter">InsightGraphy</Link>
          </div>

          <nav className="flex items-center gap-8 w-full md:w-auto h-full overflow-visible">
            <Link href="/home" className={isHome ? topLinkActive : topLink}>
              소개 / 홈
            </Link>

            <div className="relative group h-full flex items-center shrink-0">
              <div className={dropTrigger(isDocs)}>
                주차별 자료실 <span className="text-[9px] mt-0.5">▼</span>
              </div>
              <div className="absolute top-full left-0 w-44 bg-[#0a1526] flex-col hidden group-hover:flex z-50 shadow-2xl border-t-2 border-teal-600">
                <Link href="/dashboard/proposal" className={dropItem}>기획서 제출</Link>
                <Link href="/dashboard/slide" className={dropItem}>슬라이드 제출</Link>
                <Link href="/dashboard/video" className={dropItemLast}>발표영상 확인</Link>
              </div>
            </div>

            <div className="relative group h-full flex items-center shrink-0">
              <div className={dropTrigger(isArchive)}>
                아카이브 <span className="text-[9px] mt-0.5">▼</span>
              </div>
              <div className="absolute top-full left-0 w-44 bg-[#0a1526] flex-col hidden group-hover:flex z-50 shadow-2xl border-t-2 border-teal-600">
                <Link href="/archive?tab=past" className={dropItem}>과거 자료실</Link>
                <Link href="/archive?tab=edu" className={dropItem}>교육자료실</Link>
                <Link href="/archive?tab=special" className={dropItem}>특별세션 자료실</Link>
                <Link href="/archive?tab=template" className={dropItem}>양식 자료실</Link>
                <Link href="/archive?tab=rules" className={dropItemLast}>회칙 열람실</Link>
              </div>
            </div>

            <div className="relative group h-full flex items-center shrink-0">
              <div className={dropTrigger(isVote)}>
                실시간 투표 <span className="text-[9px] mt-0.5">▼</span>
              </div>
              <div className="absolute top-full left-0 w-[180px] bg-[#0a1526] flex-col hidden group-hover:flex z-50 shadow-2xl border-t-2 border-teal-600">
                <Link href="/vote/score" className={dropItem}>발표 채점</Link>
                <Link href="/vote/feedback" className={dropItem}>임시저장 피드백</Link>
                <Link href="/vote/results/my" className={dropItem}>결과 확인</Link>
                <Link href="/vote/results/arxiv" className={dropItem}>피드백 확인</Link>
                <Link href="/vote/results/ranking" className={dropItemLast}>베스트 프레젠터 확인</Link>
              </div>
            </div>

            <Link href="/mypage" className={isMypage ? topLinkActive : topLink}>
              마이페이지
            </Link>
          </nav>
        </div>
      </header>

      <Link href="/admin" className="fixed bottom-8 right-8 md:bottom-10 md:right-10 w-12 h-12 flex items-center justify-center bg-slate-900 text-white rounded-none hover:bg-teal-800 transition-all opacity-30 hover:opacity-100 shadow-xl z-[100] border border-slate-800">
        <span className="text-xl">⚙️</span>
      </Link>
    </>
  )
}
