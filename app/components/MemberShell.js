'use client'
// 학회원 공간 공통 틀: 홈·자료실·아카이브·사유서·출석·투표·결과·마이페이지
// - 메뉴는 눌러서 열고(터치·키보드), 바깥 클릭이나 Esc로 닫는다. hover만으로 열리지 않는다.
// - 오른쪽에 외부 홈페이지(공개 루트) 버튼과 별도의 로그아웃 버튼을 둔다.
// - 자료실 메뉴는 마지막으로 본 주차·세션을 이어서 연다.
// - 화면 안내(투어)는 계정·릴리스별로 한 번 자동으로 열리고, 도움말 버튼으로 다시 본다.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronDown, CircleHelp, Globe2, LogOut, Menu, Settings2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSiteUrls } from '@/lib/siteUrls'
import { MEMBER_TOUR } from '@/lib/tours'
import { ToastProvider } from '@/app/components/ui'
import GuidedTour, { useTourState } from '@/app/components/GuidedTour'

const MemberContext = createContext(null)
const WEEK_CONTEXT_KEY = 'ig-member-week-context'
const IDENTITY_TTL = 60 * 1000
let identityCache = null

// 로그인 계정 → 학회원 행 → 관리자 여부를 한 번에 읽는다 (화면 이동 때 깜빡이지 않게 잠시 기억)
async function loadIdentity() {
  if (identityCache && Date.now() - identityCache.at < IDENTITY_TTL) return identityCache.value
  const { data } = await supabase.auth.getSession()
  const session = data?.session || null
  if (!session) {
    identityCache = null
    return { session: null, member: null, admin: null }
  }
  const [memberResult, adminResult] = await Promise.all([
    supabase.from('members').select('id, name, generation, university, department, status, auth_user_id').eq('auth_user_id', session.user.id).maybeSingle(),
    supabase.from('admin_users').select('role, is_active').eq('user_id', session.user.id).maybeSingle(),
  ])
  const value = { session, member: memberResult.data || null, admin: adminResult.data?.is_active ? adminResult.data : null }
  identityCache = { at: Date.now(), value }
  return value
}

export function useMember() {
  return useContext(MemberContext) || { status: 'loading', session: null, member: null, admin: null }
}

// 자료실 화면이 지금 보고 있는 주차·세션을 기억해 다른 자료실 메뉴로 이어 간다
export function rememberWeekContext(week, session) {
  try {
    window.sessionStorage.setItem(WEEK_CONTEXT_KEY, JSON.stringify({ week, session }))
  } catch {
    // 기억하지 못해도 기본 주차로 열린다
  }
}

function readWeekContext() {
  try {
    return JSON.parse(window.sessionStorage.getItem(WEEK_CONTEXT_KEY) || 'null')
  } catch {
    return null
  }
}

const NAV = [
  { label: '홈', href: '/home', match: (path) => path === '/home' },
  {
    label: '주차별 자료실',
    match: (path) => path.startsWith('/dashboard'),
    weekAware: true,
    items: [
      { label: '기획서 제출', href: '/dashboard/proposal', description: '이번 주 기획서와 조원 피드백' },
      { label: '슬라이드 제출', href: '/dashboard/slide', description: '발표 슬라이드 링크 제출' },
      { label: '발표영상', href: '/dashboard/video', description: '영상 등록과 정성·셀프 피드백' },
    ],
  },
  { label: '출석', href: '/attendance', match: (path) => path.startsWith('/attendance') },
  { label: '사유서', href: '/archive/absence', match: (path) => path.startsWith('/archive/absence') },
  {
    label: '아카이브',
    match: (path) => path.startsWith('/archive') && !path.startsWith('/archive/absence'),
    items: [
      { label: '과거 자료실', href: '/archive?tab=past', description: '지난 학기 주차별 제출 자료' },
      { label: '교육자료실', href: '/archive?tab=edu', description: '교육 세션 자료' },
      { label: '특별세션 자료실', href: '/archive?tab=special', description: '연합·기업 세션 자료' },
      { label: '양식 자료실', href: '/archive?tab=template', description: '기획서·사유서 양식' },
      { label: '회칙 열람실', href: '/archive?tab=rules', description: '학회 회칙' },
    ],
  },
  {
    label: '투표·결과',
    match: (path) => path.startsWith('/vote'),
    items: [
      { label: '발표 채점', href: '/vote/score', description: '오늘 세션 발표 평가' },
      { label: '임시저장 피드백', href: '/vote/feedback', description: '채점 중 남긴 정성 피드백' },
      { label: '내 결과', href: '/vote/results/my', description: '주차별 점수와 분석' },
      { label: '받은 피드백', href: '/vote/results/arxiv', description: '받은 정성·셀프 피드백 모아보기' },
      { label: '베스트 프레젠터', href: '/vote/results/ranking', description: '주차별 랭킹' },
    ],
  },
  { label: '마이페이지', href: '/mypage', match: (path) => path.startsWith('/mypage') },
]

const PAGE_LABELS = { '/home': '홈' }

export default function MemberShell({ children }) {
  const pathname = usePathname() || ''
  const router = useRouter()
  const site = useSiteUrls()
  const [identity, setIdentity] = useState({ status: 'loading', session: null, member: null, admin: null })
  const [openMenu, setOpenMenu] = useState(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [weekContext, setWeekContext] = useState(null)
  const navRef = useRef(null)
  const userId = identity.session?.user?.id || null
  const tour = useTourState(MEMBER_TOUR, userId, { autoStart: pathname === '/home', ready: identity.status === 'ready' })

  useEffect(() => {
    let active = true
    loadIdentity().then((value) => {
      if (active) setIdentity({ status: 'ready', ...value })
    })
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      identityCache = null
    })
    return () => {
      active = false
      listener?.subscription?.unsubscribe()
    }
  }, [])

  // 메뉴를 열 때 마지막 주차 문맥을 읽는다
  useEffect(() => {
    if (!openMenu && !mobileOpen) return undefined
    // 지금 주소의 주차가 있으면 그것을, 없으면 마지막으로 본 자료실 주차를 쓴다
    const timer = setTimeout(() => {
      const params = new URLSearchParams(window.location.search)
      const remembered = readWeekContext()
      setWeekContext({ week: params.get('week') ?? remembered?.week, session: params.get('session') ?? remembered?.session })
    }, 0)
    function close(event) {
      if (event.type === 'keydown') {
        if (event.key === 'Escape') {
          setOpenMenu(null)
          setMobileOpen(false)
        }
        return
      }
      if (!navRef.current?.contains(event.target)) setOpenMenu(null)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [openMenu, mobileOpen])

  const closeAll = useCallback(() => {
    setOpenMenu(null)
    setMobileOpen(false)
  }, [])

  async function signOut() {
    identityCache = null
    await supabase.auth.signOut()
    router.replace('/login')
  }

  // 자료실 링크에 지금 보고 있는(또는 마지막으로 본) 주차를 붙인다
  function itemHref(group, item) {
    if (!group.weekAware) return item.href
    const week = weekContext?.week
    const session = weekContext?.session
    const params = new URLSearchParams()
    if (week !== null && week !== undefined && week !== '') params.set('week', String(week))
    if (session === 'weekday') params.set('session', 'weekday')
    const query = params.toString()
    return query ? `${item.href}?${query}` : item.href
  }

  const contextValue = useMemo(() => ({ ...identity, startTour: tour.start }), [identity, tour.start])
  const displayName = identity.member?.name || identity.session?.user?.user_metadata?.name || '학회원'
  const externalTarget = site.crossHost ? '_blank' : undefined

  return (
    <MemberContext.Provider value={contextValue}>
      <ToastProvider>
        <div className="min-h-screen bg-white text-slate-900">
          <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div ref={navRef} className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
              <Link href="/home" onClick={closeAll} className="flex shrink-0 items-center gap-2">
                <Image src="/logo.png" alt="" width={28} height={28} className="object-contain" />
                <span className="text-base font-black tracking-tight text-teal-800">InsightGraphy</span>
              </Link>

              <nav data-tour="member-nav" aria-label="학회원 메뉴" className="ml-2 hidden min-w-0 flex-1 items-center gap-0.5 xl:flex">
                {NAV.map((group) => {
                  const active = group.match(pathname)
                  if (!group.items) {
                    return (
                      <Link key={group.label} href={group.href} aria-current={active ? 'page' : undefined} onClick={closeAll} className={`relative flex h-10 items-center whitespace-nowrap rounded-md px-3 text-sm font-bold transition-colors ${active ? 'text-teal-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}>
                        {group.label}
                        {active && <span className="absolute inset-x-3 -bottom-[13px] h-[3px] bg-teal-700" aria-hidden="true" />}
                      </Link>
                    )
                  }
                  const open = openMenu === group.label
                  return (
                    <div key={group.label} className="relative">
                      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpenMenu(open ? null : group.label)} className={`flex h-10 items-center gap-1 whitespace-nowrap rounded-md px-3 text-sm font-bold transition-colors ${open ? 'bg-slate-100 text-slate-950' : active ? 'text-teal-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}>
                        {group.label}
                        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                      </button>
                      {active && <span className="pointer-events-none absolute inset-x-3 -bottom-[13px] h-[3px] bg-teal-700" aria-hidden="true" />}
                      {open && (
                        <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-md border border-slate-200 bg-white p-1.5 shadow-lg">
                          {group.items.map((item) => (
                            <Link key={item.href} href={itemHref(group, item)} onClick={closeAll} className="block rounded-md px-3 py-2.5 hover:bg-slate-50 focus-visible:bg-slate-50">
                              <span className="block text-sm font-bold text-slate-900">{item.label}</span>
                              <span className="block text-xs text-slate-500">{item.description}</span>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </nav>

              <div className="ml-auto flex items-center gap-2">
                <a data-tour="member-external" href={site.publicUrl('/')} target={externalTarget} rel={externalTarget ? 'noopener noreferrer' : undefined} className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50">
                  <Globe2 className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">외부 홈페이지</span>
                </a>
                <button type="button" data-tour="member-help" onClick={tour.start} className="inline-grid h-9 w-9 place-items-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50" aria-label="화면 안내 다시 보기" title="화면 안내 다시 보기">
                  <CircleHelp className="h-4 w-4" aria-hidden="true" />
                </button>
                {identity.admin && (
                  <Link href="/admin/hub" className="hidden h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 xl:inline-flex">
                    <Settings2 className="h-4 w-4" aria-hidden="true" />관리자
                  </Link>
                )}
                <div className="hidden items-center gap-2 border-l border-slate-200 pl-3 xl:flex">
                  <span className="max-w-[120px] truncate text-sm font-bold text-slate-800">{displayName}</span>
                  <button type="button" onClick={signOut} className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-900">
                    <LogOut className="h-4 w-4" aria-hidden="true" />로그아웃
                  </button>
                </div>
                <button type="button" onClick={() => setMobileOpen((open) => !open)} aria-expanded={mobileOpen} aria-label={mobileOpen ? '메뉴 닫기' : '메뉴 열기'} className="inline-grid h-9 w-9 place-items-center rounded-md border border-slate-300 bg-white text-slate-700 xl:hidden">
                  {mobileOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
                </button>
              </div>
            </div>

            {mobileOpen && (
              <nav data-tour="member-nav" aria-label="학회원 메뉴" className="max-h-[calc(100vh-64px)] overflow-y-auto border-t border-slate-200 bg-white px-4 pb-6 pt-2 sm:px-6 xl:hidden">
                {NAV.map((group) => group.items ? (
                  <div key={group.label} className="pt-3">
                    <p className="px-2 pb-1 text-xs font-bold text-slate-500">{group.label}</p>
                    <div className="grid gap-0.5 sm:grid-cols-2">
                      {group.items.map((item) => (
                        <Link key={item.href} href={itemHref(group, item)} onClick={closeAll} className="rounded-md px-2 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50">{item.label}</Link>
                      ))}
                    </div>
                  </div>
                ) : (
                  <Link key={group.label} href={group.href} onClick={closeAll} aria-current={group.match(pathname) ? 'page' : undefined} className={`mt-1 block rounded-md px-2 py-2.5 text-sm font-bold ${group.match(pathname) ? 'bg-teal-50 text-teal-900' : 'text-slate-800 hover:bg-slate-50'}`}>{group.label}</Link>
                ))}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
                  <span className="text-sm font-bold text-slate-800">{displayName}</span>
                  <div className="flex gap-2">
                    {identity.admin && <Link href="/admin/hub" onClick={closeAll} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 px-3 text-sm font-bold text-slate-700"><Settings2 className="h-4 w-4" aria-hidden="true" />관리자</Link>}
                    <button type="button" onClick={signOut} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 px-3 text-sm font-bold text-slate-700"><LogOut className="h-4 w-4" aria-hidden="true" />로그아웃</button>
                  </div>
                </div>
              </nav>
            )}
          </header>

          <main className="min-w-0">{children}</main>
        </div>
        {tour.open && <GuidedTour key={tour.key} tour={MEMBER_TOUR} role="member" userId={userId} startIndex={tour.startIndex} onClose={tour.close} pageLabels={PAGE_LABELS} />}
      </ToastProvider>
    </MemberContext.Provider>
  )
}

// 학회원 화면 본문 틀 (폭·여백 통일)
export function MemberPage({ children, className = '' }) {
  return <div className={`mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 lg:py-10 ${className}`}>{children}</div>
}

// 학회원 화면 제목 줄
export function MemberHeader({ eyebrow, title, description, actions, children }) {
  return (
    <header className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-bold text-teal-700">{eyebrow}</p>}
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl break-keep text-sm leading-6 text-slate-600">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
