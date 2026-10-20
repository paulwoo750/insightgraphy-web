'use client'
// 학회원 공간 공통 틀: 홈·자료실·아카이브·사유서·출석·투표·결과·마이페이지
// - 메뉴는 눌러서 열고(터치·키보드), 바깥 클릭이나 Esc로 닫는다. hover만으로 열리지 않는다.
// - 오른쪽에 외부 홈페이지(공개 루트) 버튼과 별도의 로그아웃 버튼을 둔다.
// - 자료실 메뉴는 마지막으로 본 주차·세션을 이어서 연다.
// - 화면 안내(투어)는 계정·릴리스별로 한 번 자동으로 열리고, 도움말 버튼으로 다시 본다.
// - 드롭다운 메뉴에 묶인 화면(자료실·아카이브·투표·결과)은 위쪽 섹션 탭으로 바로 오간다.
// - 승인 전 계정(학회원 행이 pending이거나 없고 관리자도 아님)에게는 메뉴·투어 대신 승인 대기 안내를 보여 준다.
import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  BookOpen, ChartLine, ChevronDown, CircleHelp, Clapperboard, FileStack, FileText, FolderOpen, Globe2, History, Home, Hourglass, Library, LogOut, Mail,
  MapPin, Menu, MessageSquareText, Presentation, RefreshCw, Scale, Settings2, Smartphone, Sparkles, Sprout, Trophy, UserRound, UserX, Vote, X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSiteUrls } from '@/lib/siteUrls'
import { MEMBER_TOUR, TOUR_AUTO_START } from '@/lib/tours'
import { memberThemeFor, toneOf } from '@/lib/theme'
import { HeroDecoration } from '@/app/components/Decor'
import { Button, StatusBadge, ToastProvider, useAsyncAction, useToast } from '@/app/components/ui'
import GuidedTour, { useTourState } from '@/app/components/GuidedTour'

// 휴대폰 앱(/app)도 같은 학회원 문맥을 쓴다
export const MemberContext = createContext(null)
const WEEK_CONTEXT_KEY = 'ig-member-week-context'
const IDENTITY_TTL = 60 * 1000
// 개인 기록(출결·벌금·사유서·점수·댓글)을 읽고 쓸 수 있는 학회원 상태 (STEP 20의 is_approved_member와 같은 기준)
const APPROVED_STATUSES = new Set(['active', 'leave', 'inactive', 'alumni'])
const REQUEST_LABELS = { active: '활동 회원', alumni: '졸업 회원' }
let identityCache = null

export function resetIdentityCache() {
  identityCache = null
}

// 로그인 계정 → 학회원 행 → 관리자 여부를 한 번에 읽는다 (화면 이동 때 깜빡이지 않게 잠시 기억)
// 조회가 실패하면 승인 여부를 모르는 것이므로 lookupError로 표시하고 기억하지 않는다.
export async function loadIdentity() {
  if (identityCache && Date.now() - identityCache.at < IDENTITY_TTL) return identityCache.value
  const { data } = await supabase.auth.getSession()
  const session = data?.session || null
  if (!session) {
    identityCache = null
    return { session: null, member: null, admin: null, lookupError: false }
  }
  const [memberResult, adminResult] = await Promise.all([
    supabase.from('members').select('id, name, generation, university, department, status, requested_status, auth_user_id').eq('auth_user_id', session.user.id).maybeSingle(),
    supabase.from('admin_users').select('role, is_active').eq('user_id', session.user.id).maybeSingle(),
  ])
  const lookupError = Boolean(memberResult.error || adminResult.error)
  const value = { session, member: memberResult.data || null, admin: adminResult.data?.is_active ? adminResult.data : null, lookupError }
  identityCache = lookupError ? null : { at: Date.now(), value }
  return value
}

// 승인 전 계정인가: 로그인했고, 관리자가 아니고, 승인된 학회원 행에 연결되지 않았다.
// 조회 실패는 승인 전으로 단정하지 않는다 (승인 학회원이 일시 오류로 막히지 않게).
export function isAwaitingApproval(identity) {
  if (identity.status !== 'ready' || !identity.session || identity.lookupError || identity.admin) return false
  return !APPROVED_STATUSES.has(identity.member?.status)
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
  { label: '홈', href: '/home', icon: Home, tone: 'teal', match: (path) => path === '/home' },
  {
    label: '주차별 자료실',
    icon: FolderOpen,
    tone: 'violet',
    match: (path) => path.startsWith('/dashboard'),
    weekAware: true,
    items: [
      { label: '기획서 제출', href: '/dashboard/proposal', icon: FileText, description: '이번 주 기획서와 조원 피드백' },
      { label: '슬라이드 제출', href: '/dashboard/slide', icon: Presentation, description: '발표 슬라이드 링크 제출' },
      { label: '발표영상', href: '/dashboard/video', icon: Clapperboard, description: '영상 등록과 정성·셀프 피드백' },
    ],
  },
  { label: '출석', href: '/attendance', icon: MapPin, tone: 'emerald', match: (path) => path.startsWith('/attendance') },
  { label: '사유서', href: '/archive/absence', icon: Mail, tone: 'amber', match: (path) => path.startsWith('/archive/absence') },
  {
    label: '아카이브',
    icon: Library,
    tone: 'indigo',
    match: (path) => path.startsWith('/archive') && !path.startsWith('/archive/absence'),
    items: [
      { label: '과거 자료실', href: '/archive?tab=past', icon: History, description: '지난 학기 주차별 제출 자료' },
      { label: '교육자료실', href: '/archive?tab=edu', icon: BookOpen, description: '교육 세션 자료' },
      { label: '특별세션 자료실', href: '/archive?tab=special', icon: Sparkles, description: '연합·기업 세션 자료' },
      { label: '양식 자료실', href: '/archive?tab=template', icon: FileStack, description: '기획서·사유서 양식' },
      { label: '회칙 열람실', href: '/archive?tab=rules', icon: Scale, description: '학회 회칙' },
    ],
  },
  {
    label: '투표·결과',
    icon: Vote,
    tone: 'teal',
    match: (path) => path.startsWith('/vote'),
    items: [
      { label: '발표 채점', href: '/vote/score', icon: Vote, description: '오늘 세션 발표 평가' },
      { label: '임시저장 피드백', href: '/vote/feedback', icon: MessageSquareText, description: '채점 중 남긴 정성 피드백' },
      { label: '내 결과', href: '/vote/results/my', icon: ChartLine, description: '주차별 점수와 분석' },
      { label: '받은 피드백', href: '/vote/results/arxiv', icon: Sprout, description: '받은 정성·셀프 피드백 모아보기' },
      { label: '베스트 프레젠터', href: '/vote/results/ranking', icon: Trophy, description: '주차별 시상식' },
    ],
  },
  { label: '마이페이지', href: '/mypage', icon: UserRound, tone: 'sky', match: (path) => path.startsWith('/mypage') },
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
  const awaitingApproval = isAwaitingApproval(identity)
  const tour = useTourState(MEMBER_TOUR, userId, { autoStart: TOUR_AUTO_START, ready: identity.status === 'ready' && !awaitingApproval })

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

  // 운영진이 승인했는지 다시 읽는다. 승인됐으면 본문이 바로 열린다.
  async function recheckIdentity() {
    identityCache = null
    const value = await loadIdentity()
    const next = { status: 'ready', ...value }
    setIdentity(next)
    return !isAwaitingApproval(next)
  }

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

  const theme = memberThemeFor(pathname)

  return (
    <MemberContext.Provider value={contextValue}>
      <ToastProvider>
        <div className="min-h-screen bg-gradient-to-b from-slate-50/60 via-white to-white text-slate-900">
          <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className={`h-1 bg-gradient-to-r ${theme.bar}`} aria-hidden="true" />
            <div ref={navRef} className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
              <Link href="/home" onClick={closeAll} className="flex shrink-0 items-center gap-2">
                <Image src="/logo.png" alt="" width={28} height={28} className="object-contain" />
                <span className="text-base font-black tracking-tight text-teal-800">InsightGraphy</span>
              </Link>

              {!awaitingApproval && <nav data-tour="member-nav" aria-label="학회원 메뉴" className="ml-2 hidden min-w-0 flex-1 items-center gap-0.5 xl:flex">
                {NAV.map((group) => {
                  const active = group.match(pathname)
                  const groupTone = toneOf(group.tone)
                  if (!group.items) {
                    return (
                      <Link key={group.label} href={group.href} aria-current={active ? 'page' : undefined} onClick={closeAll} className={`relative flex h-10 items-center whitespace-nowrap rounded-md px-3 text-sm font-bold transition-colors ${active ? groupTone.accent : `text-slate-600 ${groupTone.hover}`}`}>
                        {group.label}
                        {active && <span className={`absolute inset-x-3 -bottom-[13px] h-[3px] rounded-full ${groupTone.dot}`} aria-hidden="true" />}
                      </Link>
                    )
                  }
                  const open = openMenu === group.label
                  return (
                    <div key={group.label} className="relative">
                      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpenMenu(open ? null : group.label)} className={`flex h-10 items-center gap-1 whitespace-nowrap rounded-md px-3 text-sm font-bold transition-colors ${open ? 'bg-slate-100 text-slate-950' : active ? groupTone.accent : `text-slate-600 ${groupTone.hover}`}`}>
                        {group.label}
                        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                      </button>
                      {active && <span className={`pointer-events-none absolute inset-x-3 -bottom-[13px] h-[3px] rounded-full ${groupTone.dot}`} aria-hidden="true" />}
                      {open && (
                        <div className="absolute left-0 top-full z-50 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                          {group.items.map((item) => {
                            const ItemIcon = item.icon
                            return (
                              <Link key={item.href} href={itemHref(group, item)} onClick={closeAll} className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50 focus-visible:bg-slate-50">
                                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${groupTone.iconTile}`}><ItemIcon className="h-[18px] w-[18px]" aria-hidden="true" /></span>
                                <span className="min-w-0">
                                  <span className="block text-sm font-bold text-slate-900">{item.label}</span>
                                  <span className="block text-xs text-slate-500">{item.description}</span>
                                </span>
                              </Link>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </nav>}

              <div className="ml-auto flex items-center gap-2">
                <a data-tour="member-external" href={site.publicUrl('/')} target={externalTarget} rel={externalTarget ? 'noopener noreferrer' : undefined} className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-sky-200 bg-sky-50 px-3 text-sm font-bold text-sky-800 hover:bg-sky-100">
                  <Globe2 className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">외부 홈페이지</span>
                </a>
                {!awaitingApproval && (
                  <Link href="/app/install" className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md bg-teal-700 px-2.5 text-sm font-bold text-white hover:bg-teal-800" aria-label="휴대폰 앱 설치 안내">
                    <Smartphone className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden sm:inline">앱</span>
                  </Link>
                )}
                {!awaitingApproval && (
                  <button type="button" data-tour="member-help" onClick={tour.start} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-teal-200 bg-teal-50 px-2.5 text-sm font-bold text-teal-800 hover:bg-teal-100" aria-label="화면에서 도움말 보기" title="화면에서 도움말 보기">
                    <CircleHelp className="h-4 w-4" aria-hidden="true" />
                    <span className="hidden 2xl:inline">도움말</span>
                  </button>
                )}
                {identity.admin && (
                  <Link href="/admin/hub" className="hidden h-9 items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-3 text-sm font-bold text-violet-800 hover:bg-violet-100 xl:inline-flex">
                    <Settings2 className="h-4 w-4" aria-hidden="true" />관리자
                  </Link>
                )}
                {/* 승인 전 계정은 모바일 메뉴가 없으므로 이름·로그아웃을 sm부터 보인다 (휴대폰 폭에서는 안내 패널의 로그아웃을 쓴다) */}
                <div className={`${awaitingApproval ? 'hidden sm:flex' : 'hidden xl:flex'} items-center gap-2 border-l border-slate-200 pl-3`}>
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-teal-500 to-violet-500 text-xs font-bold text-white" aria-hidden="true">{String(displayName).slice(0, 1)}</span>
                  <span className="max-w-[110px] truncate text-sm font-bold text-slate-800">{displayName}</span>
                  <button type="button" onClick={signOut} className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-900">
                    <LogOut className="h-4 w-4" aria-hidden="true" />로그아웃
                  </button>
                </div>
                {!awaitingApproval && (
                  <button type="button" onClick={() => setMobileOpen((open) => !open)} aria-expanded={mobileOpen} aria-label={mobileOpen ? '메뉴 닫기' : '메뉴 열기'} className="inline-grid h-9 w-9 place-items-center rounded-md border border-slate-300 bg-white text-slate-700 xl:hidden">
                    {mobileOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
                  </button>
                )}
              </div>
            </div>

            {mobileOpen && !awaitingApproval && (
              <nav data-tour="member-nav" aria-label="학회원 메뉴" className="max-h-[calc(100vh-68px)] overflow-y-auto border-t border-slate-200 bg-white px-4 pb-6 pt-2 sm:px-6 xl:hidden">
                {NAV.map((group) => {
                  const groupTone = toneOf(group.tone)
                  const GroupIcon = group.icon
                  return group.items ? (
                    <div key={group.label} className="pt-3">
                      <p className={`flex items-center gap-1.5 px-2 pb-1 text-xs font-bold ${groupTone.accent}`}><GroupIcon className="h-3.5 w-3.5" aria-hidden="true" />{group.label}</p>
                      <div className="grid gap-0.5 sm:grid-cols-2">
                        {group.items.map((item) => {
                          const ItemIcon = item.icon
                          return (
                            <Link key={item.href} href={itemHref(group, item)} onClick={closeAll} className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50">
                              <span className={`grid h-7 w-7 place-items-center rounded-md ${groupTone.iconTile}`}><ItemIcon className="h-4 w-4" aria-hidden="true" /></span>{item.label}
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <Link key={group.label} href={group.href} onClick={closeAll} aria-current={group.match(pathname) ? 'page' : undefined} className={`mt-1 flex items-center gap-2.5 rounded-md px-2 py-2 text-sm font-bold ${group.match(pathname) ? groupTone.soft : 'text-slate-800 hover:bg-slate-50'}`}>
                      <span className={`grid h-7 w-7 place-items-center rounded-md ${groupTone.iconTile}`}><GroupIcon className="h-4 w-4" aria-hidden="true" /></span>{group.label}
                    </Link>
                  )
                })}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
                  <span className="text-sm font-bold text-slate-800">{displayName}</span>
                  <div className="flex gap-2">
                    {identity.admin && <Link href="/admin/hub" onClick={closeAll} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-3 text-sm font-bold text-violet-800"><Settings2 className="h-4 w-4" aria-hidden="true" />관리자</Link>}
                    <button type="button" onClick={signOut} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 px-3 text-sm font-bold text-slate-700"><LogOut className="h-4 w-4" aria-hidden="true" />로그아웃</button>
                  </div>
                </div>
              </nav>
            )}
          </header>

          {!awaitingApproval && (
            <Suspense fallback={null}>
              <SectionTabs pathname={pathname} />
            </Suspense>
          )}

          <main className="min-w-0">
            {awaitingApproval ? (
              <ApprovalPendingPanel
                member={identity.member}
                email={identity.session?.user?.email || ''}
                externalHref={site.publicUrl('/')}
                externalTarget={externalTarget}
                onSignOut={signOut}
                onRecheck={recheckIdentity}
              />
            ) : children}
          </main>
        </div>
        {tour.open && !awaitingApproval && <GuidedTour key={tour.key} tour={MEMBER_TOUR} role="member" userId={userId} startIndex={tour.startIndex} onClose={tour.close} pageLabels={PAGE_LABELS} />}
      </ToastProvider>
    </MemberContext.Provider>
  )
}

// 같은 메뉴(드롭다운)에 묶인 화면을 위쪽에 가로로 보여 준다. 자료실은 보고 있는 주차를 그대로 넘긴다.
function SectionTabs({ pathname }) {
  const searchParams = useSearchParams()
  const group = NAV.find((item) => item.items && item.match(pathname))
  if (!group) return null
  const groupTone = toneOf(group.tone)
  const GroupIcon = group.icon
  const currentTab = searchParams.get('tab') || 'past'
  const carry = new URLSearchParams()
  if (group.weekAware) {
    if (searchParams.get('week') != null) carry.set('week', searchParams.get('week'))
    if (searchParams.get('session') === 'weekday') carry.set('session', 'weekday')
  }
  return (
    <div className={`border-b border-slate-200/70 bg-gradient-to-r ${groupTone.hero}`}>
      <nav data-tour="member-section-tabs" aria-label={`${group.label} 화면`} className="mx-auto flex w-full max-w-[1280px] items-center gap-2 overflow-x-auto px-4 py-2.5 sm:px-6 lg:px-8">
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset ${groupTone.soft}`}>
          <GroupIcon className="h-3.5 w-3.5" aria-hidden="true" />{group.label}
        </span>
        {group.items.map((item) => {
          const [path, query] = item.href.split('?')
          const active = path === pathname && (!query || new URLSearchParams(query).get('tab') === currentTab)
          const ItemIcon = item.icon
          const href = carry.toString() ? `${path}?${carry.toString()}` : item.href
          return (
            <Link key={item.href} href={href} aria-current={active ? 'page' : undefined} className={`inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-bold transition ${active ? groupTone.pill : 'bg-white/80 text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-white hover:text-slate-900'}`}>
              <ItemIcon className="h-4 w-4" aria-hidden="true" />{item.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

// 승인 전 계정 안내. 개인 기록은 승인된 학회원·관리자만 읽고 쓰므로(STEP 20) 본문 대신 보여 준다.
// 학회원 행이 pending이면 승인 대기, 행이 아예 없으면 명단 미연결로 구분한다.
function ApprovalPendingPanel({ member, email, externalHref, externalTarget, onSignOut, onRecheck }) {
  const toast = useToast()
  const [run, rechecking] = useAsyncAction()
  const unlinked = !member
  const Icon = unlinked ? UserX : Hourglass
  const requested = REQUEST_LABELS[member?.requested_status]

  function recheck() {
    run(async () => {
      const approved = await onRecheck()
      if (!approved) toast.info(unlinked ? '아직 학회원 명단과 연결되지 않았습니다.' : '아직 승인되지 않았습니다.')
    })
  }

  return (
    <MemberPage className="grid place-items-center">
      <section className="relative w-full max-w-md overflow-hidden rounded-2xl bg-gradient-to-br from-teal-50 via-white to-violet-50 p-7 sm:p-9">
        <span className={`grid h-12 w-12 place-items-center rounded-2xl ${unlinked ? 'bg-amber-100 text-amber-700' : 'bg-teal-100 text-teal-700'}`}><Icon className="h-6 w-6" aria-hidden="true" /></span>
        <p className="mt-5 text-xs font-bold text-teal-700">학회원 승인</p>
        <h1 className="mt-1 text-xl font-bold text-slate-950">{unlinked ? '학회원 명단과 연결되지 않은 계정입니다.' : '가입 승인 대기 중입니다. ⏳'}</h1>
        <p className="mt-3 break-keep text-sm leading-6 text-slate-600">{unlinked ? '운영진에게 문의해 주세요. 기존 학회원은 운영진이 명단에 연결해 드립니다.' : '운영진이 승인하면 이용할 수 있습니다. 기존 학회원이라면 운영진이 명단에 연결해 드립니다.'}</p>
        <dl className="mt-5 divide-y divide-slate-100 border-y border-slate-200 text-sm">
          {email && (
            <div className="flex items-center justify-between gap-3 py-2.5">
              <dt className="shrink-0 font-bold text-slate-500">로그인 계정</dt>
              <dd className="min-w-0 truncate font-semibold text-slate-900">{email}</dd>
            </div>
          )}
          {member && (
            <div className="flex items-center justify-between gap-3 py-2.5">
              <dt className="shrink-0 font-bold text-slate-500">신청자</dt>
              <dd className="min-w-0 truncate font-semibold text-slate-900">{[member.name, member.generation].filter(Boolean).join(' · ')}</dd>
            </div>
          )}
          {requested && (
            <div className="flex items-center justify-between gap-3 py-2.5">
              <dt className="shrink-0 font-bold text-slate-500">요청 구분</dt>
              <dd><StatusBadge tone={member.requested_status === 'alumni' ? 'violet' : 'teal'}>{requested}</StatusBadge></dd>
            </div>
          )}
        </dl>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="primary" icon={RefreshCw} loading={rechecking} onClick={recheck}>다시 확인</Button>
          <Button icon={LogOut} onClick={onSignOut}>로그아웃</Button>
          <Button icon={Globe2} href={externalHref} target={externalTarget}>외부 홈페이지</Button>
        </div>
      </section>
    </MemberPage>
  )
}

// 학회원 화면 본문 틀 (폭·여백 통일)
export function MemberPage({ children, className = '' }) {
  return <div className={`mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8 ${className}`}>{children}</div>
}

// 학회원 화면 제목 영역: 메뉴별 색·이모지와 장식 그림
export function MemberHeader({ eyebrow, title, description, actions, children, emoji }) {
  const pathname = usePathname() || ''
  const theme = memberThemeFor(pathname)
  return (
    <header className={`relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br px-5 py-5 sm:px-6 sm:py-6 ${theme.hero}`}>
      <HeroDecoration theme={theme} />
      <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex min-w-0 gap-3 sm:gap-4">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-2xl shadow-sm sm:h-14 sm:w-14 sm:text-3xl`} aria-hidden="true">{emoji || theme.emoji}</span>
          <div className="min-w-0">
            {eyebrow && <p className={`mb-1 text-xs font-bold ${theme.accent}`}>{eyebrow}</p>}
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
            {description && <p className="mt-1.5 max-w-3xl break-keep text-sm leading-6 text-slate-600">{description}</p>}
            {children}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}
