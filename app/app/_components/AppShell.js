'use client'
// 휴대폰 앱(/app) 틀: 위쪽 제목 줄 + 아래쪽 탭 5개. 로그인·승인 확인은 학회원 공간과 같은 기준이다.
// 설치 안내(/app/install)는 로그인 없이 볼 수 있다.
import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Bell, CalendarClock, Home, LogOut, MapPin, Trophy, UserRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { isAwaitingApproval, loadIdentity, MemberContext, resetIdentityCache } from '@/app/components/MemberShell'
import { ToastProvider } from '@/app/components/ui'
import { registerServiceWorker } from '@/lib/push'

const TABS = [
  { href: '/app', label: '오늘', icon: Home, exact: true },
  { href: '/app/attendance', label: '출석', icon: MapPin },
  { href: '/app/deadlines', label: '마감', icon: CalendarClock },
  { href: '/app/best', label: '베스트', icon: Trophy },
  { href: '/app/me', label: '내 정보', icon: UserRound },
]

const PUBLIC_PATHS = ['/app/install']

export default function AppShell({ children }) {
  const pathname = usePathname() || '/app'
  const router = useRouter()
  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path))
  const [identity, setIdentity] = useState({ status: 'loading', session: null, member: null, admin: null })

  useEffect(() => {
    let active = true
    loadIdentity().then((value) => {
      if (active) setIdentity({ status: 'ready', ...value })
    })
    const { data: listener } = supabase.auth.onAuthStateChange(() => resetIdentityCache())
    // 알림을 받으려면 서비스 워커가 있어야 한다 (페이지는 캐시하지 않는다)
    registerServiceWorker()
    return () => {
      active = false
      listener?.subscription?.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (identity.status === 'ready' && !identity.session && !isPublic) router.replace(`/login?next=${encodeURIComponent(pathname)}`)
  }, [identity.status, identity.session, isPublic, pathname, router])

  const contextValue = useMemo(() => ({ ...identity, startTour: () => {} }), [identity])
  const awaiting = isAwaitingApproval(identity)
  const signedIn = identity.status === 'ready' && identity.session

  async function signOut() {
    resetIdentityCache()
    await supabase.auth.signOut()
    router.replace('/login?next=%2Fapp')
  }

  let body = children
  if (!isPublic) {
    if (identity.status !== 'ready' || !identity.session) body = <AppLoading />
    else if (awaiting) body = <AwaitingApproval onSignOut={signOut} />
  }

  return (
    <MemberContext.Provider value={contextValue}>
      <ToastProvider>
        <div className="min-h-dvh bg-white text-slate-900">
          <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
            <header className="sticky top-0 z-40 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur">
              <div className="flex h-14 items-center gap-2.5 px-4">
                <Link href="/app" className="flex items-center gap-2" aria-label="앱 첫 화면">
                  <Image src="/logo.png" alt="" width={28} height={28} className="h-7 w-7" priority />
                  <span className="text-[15px] font-black tracking-tight text-teal-900">인사이트그래피</span>
                </Link>
                <div className="ml-auto flex items-center gap-1">
                  {signedIn && !awaiting && !isPublic && (
                    <Link href="/app/me#notifications" className="grid h-9 w-9 place-items-center rounded-full text-slate-500 hover:bg-teal-50 hover:text-teal-800" aria-label="알림 설정"><Bell className="h-5 w-5" aria-hidden="true" /></Link>
                  )}
                  {isPublic && !signedIn && <Link href="/login?next=%2Fapp" className="rounded-full bg-teal-700 px-3 py-1.5 text-xs font-bold text-white">로그인</Link>}
                  {isPublic && signedIn && <Link href="/app" className="rounded-full bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-800">앱으로</Link>}
                </div>
              </div>
            </header>

            <main className={`flex-1 px-4 pt-2 ${isPublic ? 'pb-10' : 'pb-28'}`}>{body}</main>

            {!isPublic && signedIn && !awaiting && (
              <nav aria-label="앱 메뉴" className="fixed inset-x-0 bottom-0 z-40 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.18)] backdrop-blur">
                <ul className="mx-auto grid max-w-md grid-cols-5">
                  {TABS.map((tab) => {
                    const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
                    const Icon = tab.icon
                    return (
                      <li key={tab.href}>
                        <Link href={tab.href} aria-current={active ? 'page' : undefined} className={`flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition ${active ? 'text-teal-700' : 'text-slate-400 hover:text-slate-700'}`}>
                          <span className={`grid h-8 w-12 place-items-center rounded-full transition ${active ? 'bg-teal-50' : ''}`}><Icon className="h-5 w-5" aria-hidden="true" strokeWidth={active ? 2.5 : 2} /></span>
                          {tab.label}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </nav>
            )}
          </div>
        </div>
      </ToastProvider>
    </MemberContext.Provider>
  )
}

function AppLoading() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="flex flex-col items-center gap-3 text-sm font-semibold text-teal-700">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-teal-100 border-t-teal-600" aria-hidden="true" />
        불러오는 중
      </div>
    </div>
  )
}

function AwaitingApproval({ onSignOut }) {
  return (
    <div className="mt-10 rounded-3xl bg-gradient-to-br from-teal-50 to-violet-50 px-6 py-10 text-center">
      <p className="text-4xl" aria-hidden="true">⏳</p>
      <h1 className="mt-3 text-lg font-black text-slate-900">가입 승인 대기 중이에요</h1>
      <p className="mt-2 break-keep text-sm leading-6 text-slate-600">운영진이 승인하면 출석·마감·벌금을 앱에서 볼 수 있어요.</p>
      <button type="button" onClick={onSignOut} className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-800"><LogOut className="h-4 w-4" aria-hidden="true" />로그아웃</button>
    </div>
  )
}

// 앱 화면 공통 제목
export function AppTitle({ title, description, children }) {
  return (
    <div className="mb-4 mt-1">
      <h1 className="text-2xl font-black tracking-tight text-slate-950">{title}</h1>
      {description && <p className="mt-1 break-keep text-sm text-slate-500">{description}</p>}
      {children}
    </div>
  )
}

// 앱 화면 구역: 위쪽 색 선
export function AppSection({ title, action, children, className = '' }) {
  return (
    <section className={`mt-7 border-t-2 border-teal-600 pt-3 ${className}`}>
      {(title || action) && (
        <div className="mb-2 flex items-center justify-between gap-2">
          {title && <h2 className="text-base font-black text-slate-900">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
