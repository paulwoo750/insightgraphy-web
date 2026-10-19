'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Archive,
  BookOpenText,
  CalendarDays,
  CalendarCheck2,
  CalendarRange,
  ChevronRight,
  CircleGauge,
  ClipboardCheck,
  FileText,
  FolderKanban,
  Globe2,
  Home,
  Images,
  Info,
  LogOut,
  Menu,
  Presentation,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UserPlus,
  UsersRound,
  Vote,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getAdminAccess } from '@/lib/adminAuth'
import AdminChangelogDialog, { hasUnseenRelease, markReleaseSeen } from '@/app/admin/_components/AdminChangelog'

const AdminContext = createContext(null)

const navGroups = [
  {
    label: '운영 기준',
    items: [
      { href: '/admin/hub', label: '운영 현황', icon: CircleGauge, exact: true },
      { href: '/admin/hub/semesters', label: '학기 및 주차', icon: CalendarRange },
      { href: '/admin/hub/members', label: '학회원', icon: UsersRound },
      { href: '/admin/hub/schedule', label: '전체 일정', icon: CalendarDays },
    ],
  },
  {
    label: '학회원 시스템',
    items: [
      { href: '/admin/hub/dashboard', label: '세션 및 제출', icon: FolderKanban },
      { href: '/admin/hub/archive', label: '아카이브', icon: Archive },
      { href: '/admin/hub/vote', label: '투표 및 평가', icon: Vote },
      { href: '/admin/hub/absence', label: '사유서', icon: ClipboardCheck },
      { href: '/admin/hub/attendance', label: '출결 대시보드', icon: CalendarCheck2 },
      { href: '/admin/hub/fine', label: '벌금 상세 관리', icon: ReceiptText },
    ],
  },
  {
    label: '외부 사이트',
    items: [
      { href: '/admin/hub/landing', label: '메인', icon: Home },
      { href: '/admin/hub/about', label: '학회 소개', icon: Info },
      { href: '/admin/hub/activities', label: '활동 소개', icon: Presentation },
      { href: '/admin/hub/showcase', label: '쇼케이스', icon: Images },
      { href: '/admin/hub/join', label: '지원 안내', icon: UserPlus },
    ],
  },
  {
    label: '정책 및 시스템',
    items: [
      { href: '/admin/hub/rules', label: '운영 규정', icon: BookOpenText },
      { href: '/admin/hub/rules-doc', label: '회칙 문서', icon: FileText },
      { href: '/admin/hub/access', label: '관리자 권한', icon: ShieldCheck, roles: ['super_admin'] },
      { href: '/admin/hub/reset', label: '학기 마감 도구', icon: RotateCcw },
    ],
  },
]

export function useAdminContext() {
  return useContext(AdminContext)
}

export default function AdminShell({ children }) {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [access, setAccess] = useState({ status: 'checking', session: null, admin: null })
  const [semester, setSemester] = useState(null)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [unseenRelease, setUnseenRelease] = useState(false)
  // 권한 확인은 화면을 옮길 때마다 다시 돌므로, 업데이트 안내는 페이지를 연 뒤 한 번만 자동으로 띄운다
  const changelogPrompted = useRef(false)

  useEffect(() => {
    let active = true

    async function checkAccess() {
      const result = await getAdminAccess()
      if (!active) return

      if (result.status === 'signed_out') {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`)
        return
      }

      if (result.status === 'forbidden') {
        router.replace('/admin')
        return
      }

      setAccess(result)
      if (!changelogPrompted.current) {
        changelogPrompted.current = true
        const unseen = hasUnseenRelease()
        setUnseenRelease(unseen)
        setChangelogOpen(unseen)
      }
      const { data } = await supabase
        .from('semesters')
        .select('id, code, name, current_week_no, total_weeks, semester_type')
        .eq('status', 'active')
        .maybeSingle()
      if (active) setSemester(data || null)
    }

    checkAccess()
    return () => {
      active = false
    }
  }, [pathname, router])

  const contextValue = useMemo(() => ({ ...access, semester, setSemester }), [access, semester])

  function closeChangelog() {
    markReleaseSeen()
    setUnseenRelease(false)
    setChangelogOpen(false)
  }

  if (access.status === 'checking') {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-6 text-center">
        <div>
          <ShieldCheck className="mx-auto h-7 w-7 text-teal-700" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-slate-600">관리자 권한을 확인하고 있습니다.</p>
        </div>
      </div>
    )
  }

  const displayName = access.session?.user?.user_metadata?.name || access.session?.user?.email || '관리자'

  return (
    <AdminContext.Provider value={contextValue}>
      <div className="min-h-screen bg-[#f4f6f5] text-slate-950">
        {menuOpen && (
          <button
            type="button"
            aria-label="메뉴 닫기"
            className="fixed inset-0 z-40 bg-slate-950/35 lg:hidden"
            onClick={() => setMenuOpen(false)}
          />
        )}

        <aside className={`fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex h-[68px] items-center justify-between border-b border-slate-200 px-5">
            <Link href="/admin/hub" className="flex min-w-0 items-center gap-3">
              <Image src="/logo.png" alt="InsightGraphy" width={30} height={30} className="shrink-0 object-contain" />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-950">InsightGraphy</p>
                <p className="text-[10px] font-bold uppercase text-slate-400">Administration</p>
              </div>
            </Link>
            <button type="button" className="grid h-9 w-9 place-items-center text-slate-500 lg:hidden" onClick={() => setMenuOpen(false)} aria-label="메뉴 닫기">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="관리자 메뉴">
            {navGroups.map((group) => {
              const visibleItems = group.items.filter((item) => !item.roles || item.roles.includes(access.admin?.role))
              if (visibleItems.length === 0) return null
              return (
                <div key={group.label} className="mb-5">
                  <p className="px-3 pb-1.5 text-[10px] font-bold uppercase text-slate-400">{group.label}</p>
                  <div className="space-y-0.5">
                    {visibleItems.map((item) => {
                    const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMenuOpen(false)}
                        className={`flex min-h-10 items-center gap-3 border-l-[3px] px-3 text-[13px] font-semibold transition-colors ${isActive ? 'border-teal-700 bg-teal-50 text-teal-900' : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}
                      >
                        <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.9} aria-hidden="true" />
                        <span>{item.label}</span>
                      </Link>
                    )
                    })}
                  </div>
                </div>
              )
            })}
          </nav>

          <div className="border-t border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center bg-slate-900 text-xs font-bold text-white">
                {String(displayName).slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-800">{displayName}</p>
                <p className="truncate text-[10px] text-slate-500">{access.admin?.role}</p>
              </div>
              <button type="button" onClick={() => router.push('/home')} className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900" title="관리자 화면 나가기" aria-label="관리자 화면 나가기">
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </aside>

        <div className="min-h-screen lg:pl-[248px]">
          <header className="sticky top-0 z-30 flex h-[68px] items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button type="button" className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 lg:hidden" onClick={() => setMenuOpen(true)} aria-label="관리자 메뉴 열기">
                <Menu className="h-5 w-5" aria-hidden="true" />
              </button>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase text-slate-400">현재 운영 학기</p>
                <p className="truncate text-sm font-bold text-slate-900">
                  {semester ? `${semester.name} · ${semester.current_week_no || 1}/${semester.total_weeks}주차` : '활성 학기 없음'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setChangelogOpen(true)} className="relative flex min-h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50" aria-label="업데이트 내역 보기">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">업데이트</span>
                {unseenRelease && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-teal-600 ring-2 ring-white" aria-hidden="true" />}
              </button>
              <Link href="/home" className="hidden min-h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 sm:flex">
                <Globe2 className="h-4 w-4" aria-hidden="true" />
                사이트 보기
              </Link>
              <Link href="/admin/hub/semesters" className="flex min-h-9 items-center gap-1 rounded-md bg-teal-700 px-3 text-xs font-bold text-white hover:bg-teal-800">
                운영 설정
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </header>
          <main className="min-w-0">{children}</main>
        </div>
      </div>
      {changelogOpen && <AdminChangelogDialog role={access.admin?.role} onClose={closeChangelog} />}
    </AdminContext.Provider>
  )
}
