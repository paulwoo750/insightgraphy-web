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
  ChevronDown,
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
      { href: '/admin/hub', label: '운영 현황', description: '학기·학회원·일정을 한눈에', icon: CircleGauge, exact: true },
      { href: '/admin/hub/semesters', label: '학기 및 주차', description: '학기 생성, 주차 주제, 학기 전환', icon: CalendarRange },
      { href: '/admin/hub/members', label: '학회원', description: '명단, 가입 승인, 학기별 참여', icon: UsersRound },
      { href: '/admin/hub/schedule', label: '전체 일정', description: '공개 타임라인 일정 편집', icon: CalendarDays },
    ],
  },
  {
    label: '학회원 시스템',
    items: [
      { href: '/admin/hub/dashboard', label: '세션 및 제출', description: '주차별 조 편성, 마감, 제출물', icon: FolderKanban },
      { href: '/admin/hub/archive', label: '아카이브', description: '지난 학기 자료와 공용 자료실', icon: Archive },
      { href: '/admin/hub/vote', label: '투표 및 평가', description: '발표 평가와 투표 운영', icon: Vote },
      { href: '/admin/hub/absence', label: '사유서', description: '사유서 결재와 제출 마감', icon: ClipboardCheck },
      { href: '/admin/hub/attendance', label: '출결 대시보드', description: '출결 기록과 결석 위험도', icon: CalendarCheck2 },
      { href: '/admin/hub/fine', label: '벌금 상세 관리', description: '벌금 계산과 납부 현황', icon: ReceiptText },
    ],
  },
  {
    label: '외부 사이트',
    items: [
      { href: '/admin/hub/landing', label: '메인', description: '대문 문구와 노출 콘텐츠', icon: Home },
      { href: '/admin/hub/about', label: '학회 소개', description: '학회 소개 페이지 편집', icon: Info },
      { href: '/admin/hub/activities', label: '활동 소개', description: '활동 소개 페이지 편집', icon: Presentation },
      { href: '/admin/hub/showcase', label: '쇼케이스', description: '쇼케이스 작품 관리', icon: Images },
      { href: '/admin/hub/join', label: '지원 안내', description: '모집·지원 안내 페이지 편집', icon: UserPlus },
    ],
  },
  {
    label: '정책 및 시스템',
    items: [
      { href: '/admin/hub/rules', label: '운영 규정', description: '벌금 기준 등 운영 규정', icon: BookOpenText },
      { href: '/admin/hub/rules-doc', label: '회칙 문서', description: '회칙 원문 편집', icon: FileText },
      { href: '/admin/hub/access', label: '관리자 권한', description: '관리자 계정과 역할', icon: ShieldCheck, roles: ['super_admin'] },
      { href: '/admin/hub/reset', label: '학기 마감 도구', description: '학기 기록 보존 점검', icon: RotateCcw },
    ],
  },
]

const isItemActive = (item, pathname) => (item.exact ? pathname === item.href : pathname.startsWith(item.href))

export function useAdminContext() {
  return useContext(AdminContext)
}

export default function AdminShell({ children }) {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [openGroup, setOpenGroup] = useState(null)
  const [access, setAccess] = useState({ status: 'checking', session: null, admin: null })
  const [semester, setSemester] = useState(null)
  const [changelogOpen, setChangelogOpen] = useState(false)
  const [unseenRelease, setUnseenRelease] = useState(false)
  // 권한 확인은 화면을 옮길 때마다 다시 돌므로, 업데이트 안내는 페이지를 연 뒤 한 번만 자동으로 띄운다
  const changelogPrompted = useRef(false)
  const navRef = useRef(null)

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

  // 열린 드롭다운은 바깥 클릭이나 Esc로 닫는다
  useEffect(() => {
    if (!openGroup) return undefined
    const closeOnOutside = (event) => {
      if (!navRef.current?.contains(event.target)) setOpenGroup(null)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpenGroup(null)
    }
    document.addEventListener('mousedown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [openGroup])

  const contextValue = useMemo(() => ({ ...access, semester, setSemester }), [access, semester])

  function closeChangelog() {
    markReleaseSeen()
    setUnseenRelease(false)
    setChangelogOpen(false)
  }

  function closeMenus() {
    setOpenGroup(null)
    setMenuOpen(false)
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
  const groups = navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.roles || item.roles.includes(access.admin?.role)) }))
    .filter((group) => group.items.length > 0)
  const currentGroup = groups.find((group) => group.items.some((item) => isItemActive(item, pathname)))
  const currentItem = currentGroup?.items.find((item) => isItemActive(item, pathname))
  const semesterLabel = semester ? `${semester.name} · ${semester.current_week_no || 1}/${semester.total_weeks}주차` : '활성 학기 없음'

  return (
    <AdminContext.Provider value={contextValue}>
      <div className="min-h-screen bg-[#f4f6f5] text-slate-950">
        {/* 메뉴 줄(64px)만 상단에 고정한다. 페이지 안의 sticky 요소는 top-16 이상을 기준으로 둔다 */}
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
          <div ref={navRef} className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <Link href="/admin/hub" onClick={closeMenus} className="flex shrink-0 items-center gap-2.5">
              <Image src="/logo.png" alt="InsightGraphy" width={28} height={28} className="object-contain" />
              <span className="leading-tight">
                <span className="block text-sm font-bold text-slate-950">InsightGraphy</span>
                <span className="block text-[10px] font-bold uppercase text-slate-400">Admin</span>
              </span>
            </Link>

            <nav className="ml-4 hidden flex-1 items-center gap-1 lg:flex" aria-label="관리자 메뉴">
              {groups.map((group) => {
                const isOpen = openGroup === group.label
                const isCurrent = group === currentGroup
                return (
                  <div key={group.label} className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenGroup(isOpen ? null : group.label)}
                      aria-expanded={isOpen}
                      className={`flex h-10 items-center gap-1 rounded-md px-3 text-sm font-bold transition-colors ${isOpen ? 'bg-slate-100 text-slate-950' : isCurrent ? 'text-teal-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}
                    >
                      {group.label}
                      <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    {isCurrent && <span className="pointer-events-none absolute inset-x-3 -bottom-[13px] h-[3px] bg-teal-700" aria-hidden="true" />}
                    {isOpen && (
                      <div className="absolute left-0 top-full z-50 mt-2 w-[320px] rounded-md border border-slate-200 bg-white p-1.5 shadow-lg">
                        {group.items.map((item) => <NavItem key={item.href} item={item} active={isItemActive(item, pathname)} onNavigate={closeMenus} />)}
                      </div>
                    )}
                  </div>
                )
              })}
            </nav>

            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={() => setChangelogOpen(true)} className="relative flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50" aria-label="업데이트 내역 보기">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">업데이트</span>
                {unseenRelease && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-teal-600 ring-2 ring-white" aria-hidden="true" />}
              </button>
              <Link href="/home" className="hidden h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 xl:flex">
                <Globe2 className="h-4 w-4" aria-hidden="true" />
                사이트 보기
              </Link>
              <div className="hidden items-center gap-2 border-l border-slate-200 pl-3 lg:flex">
                <div className="grid h-8 w-8 shrink-0 place-items-center bg-slate-900 text-xs font-bold text-white">{String(displayName).slice(0, 1).toUpperCase()}</div>
                <div className="max-w-[120px] leading-tight">
                  <p className="truncate text-xs font-bold text-slate-800">{displayName}</p>
                  <p className="truncate text-[10px] text-slate-500">{access.admin?.role}</p>
                </div>
                <button type="button" onClick={() => router.push('/home')} className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900" title="관리자 화면 나가기" aria-label="관리자 화면 나가기">
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <button type="button" onClick={() => setMenuOpen((open) => !open)} className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-600 lg:hidden" aria-expanded={menuOpen} aria-label={menuOpen ? '관리자 메뉴 닫기' : '관리자 메뉴 열기'}>
                {menuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
              </button>
            </div>
          </div>

          {menuOpen && (
            <div className="max-h-[calc(100vh-64px)] overflow-y-auto border-t border-slate-200 bg-white px-4 pb-6 pt-2 sm:px-6 lg:hidden">
              {groups.map((group) => (
                <div key={group.label} className="pt-3">
                  <p className="px-3 pb-1 text-[11px] font-bold uppercase text-slate-400">{group.label}</p>
                  <div className="grid gap-0.5 sm:grid-cols-2">
                    {group.items.map((item) => <NavItem key={item.href} item={item} active={isItemActive(item, pathname)} onNavigate={closeMenus} />)}
                  </div>
                </div>
              ))}
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-800">{displayName}</p>
                  <p className="truncate text-xs text-slate-500">{access.admin?.role}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Link href="/home" onClick={closeMenus} className="flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-600"><Globe2 className="h-4 w-4" aria-hidden="true" />사이트 보기</Link>
                  <button type="button" onClick={() => router.push('/home')} className="flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-bold text-slate-600"><LogOut className="h-4 w-4" aria-hidden="true" />나가기</button>
                </div>
              </div>
            </div>
          )}
        </header>

        <div className="border-b border-slate-200 bg-white/70">
          <div className="mx-auto flex min-h-10 max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-slate-500">
              {currentGroup ? (
                <>
                  <span className="truncate">{currentGroup.label}</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden="true" />
                  <span className="truncate font-bold text-slate-900">{currentItem?.label}</span>
                </>
              ) : <span className="font-bold text-slate-900">관리자</span>}
            </p>
            <Link href="/admin/hub/semesters" className="flex shrink-0 items-center gap-2 text-xs font-semibold text-slate-500 hover:text-teal-800">
              <span className="hidden sm:inline">현재 운영 학기</span>
              <span className="rounded-full bg-teal-50 px-2.5 py-1 font-bold text-teal-800 ring-1 ring-inset ring-teal-200">{semesterLabel}</span>
            </Link>
          </div>
        </div>

        <main className="min-w-0">{children}</main>
      </div>
      {changelogOpen && <AdminChangelogDialog role={access.admin?.role} onClose={closeChangelog} />}
    </AdminContext.Provider>
  )
}

function NavItem({ item, active, onNavigate }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors ${active ? 'bg-teal-50' : 'hover:bg-slate-50'}`}
    >
      <Icon className={`mt-0.5 h-[18px] w-[18px] shrink-0 ${active ? 'text-teal-700' : 'text-slate-400'}`} strokeWidth={1.9} aria-hidden="true" />
      <span className="min-w-0">
        <span className={`block text-sm font-bold ${active ? 'text-teal-900' : 'text-slate-800'}`}>{item.label}</span>
        <span className="block truncate text-xs text-slate-500">{item.description}</span>
      </span>
    </Link>
  )
}
