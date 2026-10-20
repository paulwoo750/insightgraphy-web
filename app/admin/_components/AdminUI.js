'use client'
// 관리자 화면 공통 틀. 버튼·입력·상태 표현은 app/components/ui.js를 그대로 쓴다.
import { usePathname } from 'next/navigation'
import { Eye } from 'lucide-react'
import { READ_ONLY_NOTICE } from '@/lib/permissions'
import { ADMIN_GROUP_TONES, adminEmojiFor, toneOf } from '@/lib/theme'
import { HeroDecoration } from '@/app/components/Decor'
import { Button } from '@/app/components/ui'

export {
  Button,
  buttonClass,
  EmptyState,
  ErrorState,
  Field,
  HelpTip,
  IconButton,
  inputClass,
  LoadingState,
  Modal,
  Notice,
  SaveStatus,
  SegmentedControl,
  StatusBadge,
  Tabs,
  textareaClass,
  useAsyncAction,
  useToast,
  useUnsavedChanges,
} from '@/app/components/ui'

export function AdminPage({ children, className = '' }) {
  return (
    <div className={`mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8 ${className}`}>
      {children}
    </div>
  )
}

// 모든 관리자 화면의 제목 영역. eyebrow는 상위 메뉴 이름(한국어)이고, 그 묶음의 색을 쓴다.
export function PageHeader({ eyebrow, title, description, actions, meta, emoji }) {
  const pathname = usePathname() || ''
  const theme = toneOf(ADMIN_GROUP_TONES[eyebrow])
  return (
    <header className={`relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br px-5 py-5 sm:px-6 ${theme.hero}`}>
      <HeroDecoration theme={theme} />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 gap-4">
          <span className={`hidden h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-2xl shadow-sm sm:grid`} aria-hidden="true">{emoji || adminEmojiFor(pathname)}</span>
          <div className="min-w-0">
            {eyebrow && <p className={`mb-1 text-xs font-bold ${theme.accent}`}>{eyebrow}</p>}
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-[28px]">{title}</h1>
            {description && <p className="mt-1.5 max-w-3xl break-keep text-sm leading-6 text-slate-600">{description}</p>}
            {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

export function Panel({ title, description, action, children, className = '', bodyClassName = '', id, tour }) {
  return (
    <section id={id} data-tour={tour} className={`min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50 ${className}`}>
      {(title || action) && (
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-base font-bold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 break-keep text-sm text-slate-500">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

// 지표 카드: 색 띠 + 색 아이콘 타일
const METRIC_STYLES = {
  gray: { box: 'border-slate-200 from-slate-50', tile: 'bg-slate-100 text-slate-600', value: 'text-slate-950' },
  teal: { box: 'border-teal-100 from-teal-50', tile: 'bg-teal-100 text-teal-700', value: 'text-teal-900' },
  blue: { box: 'border-blue-100 from-blue-50', tile: 'bg-blue-100 text-blue-700', value: 'text-blue-900' },
  green: { box: 'border-emerald-100 from-emerald-50', tile: 'bg-emerald-100 text-emerald-700', value: 'text-emerald-900' },
  amber: { box: 'border-amber-100 from-amber-50', tile: 'bg-amber-100 text-amber-700', value: 'text-amber-900' },
  red: { box: 'border-red-100 from-red-50', tile: 'bg-red-100 text-red-700', value: 'text-red-900' },
  violet: { box: 'border-violet-100 from-violet-50', tile: 'bg-violet-100 text-violet-700', value: 'text-violet-900' },
  rose: { box: 'border-rose-100 from-rose-50', tile: 'bg-rose-100 text-rose-700', value: 'text-rose-900' },
  sky: { box: 'border-sky-100 from-sky-50', tile: 'bg-sky-100 text-sky-700', value: 'text-sky-900' },
}

export function Metric({ label, value, note, tone = 'gray', icon: Icon, href }) {
  const style = METRIC_STYLES[tone] || METRIC_STYLES.gray
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-600">{label}</p>
        {Icon && <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${style.tile}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>}
      </div>
      <p className={`mt-2 text-2xl font-extrabold ${style.value}`}>{value}</p>
      {note && <p className="mt-1 break-keep text-xs leading-5 text-slate-500">{note}</p>}
    </>
  )
  const className = `block min-h-[112px] rounded-xl border bg-gradient-to-br to-white p-4 shadow-sm shadow-slate-200/50 ${style.box}`
  if (href) return <a href={href} className={`${className} transition hover:-translate-y-0.5 hover:shadow-md`}>{body}</a>
  return <div className={className}>{body}</div>
}

// 개발자 전용 화면 안내 (데이터 점검 도구·기존 기록 연결 검토)
export function DeveloperOnly({ title }) {
  return (
    <AdminPage>
      <Panel>
        <div className="px-6 py-16 text-center">
          <span className="text-4xl" aria-hidden="true">🛠️</span>
          <h1 className="mt-4 text-lg font-bold text-slate-900">개발자 전용 화면입니다 · {title}</h1>
          <p className="mx-auto mt-2 max-w-md break-keep text-sm leading-6 text-slate-600">데이터 점검과 기존 기록 연결은 개발자 계정만 사용합니다. 필요한 작업이 있으면 개발자에게 요청해 주세요.</p>
          <Button className="mt-6" variant="primary" href="/admin/hub">운영 현황으로</Button>
        </div>
      </Panel>
    </AdminPage>
  )
}

// 열람자 계정 안내
export function ReadOnlyBanner({ role }) {
  if (role !== 'viewer') return null
  return (
    <div className="mb-5 flex items-start gap-3 rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700">
      <Eye className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
      <p className="break-keep leading-6">{READ_ONLY_NOTICE}</p>
    </div>
  )
}

// 표 공통 클래스
export const tableClass = 'w-full border-collapse text-left text-sm'
export const theadClass = 'bg-gradient-to-r from-slate-50 to-teal-50/40 text-xs font-bold text-slate-600'
export const thClass = 'px-4 py-3 font-bold'
export const tdClass = 'px-4 py-3 align-middle text-slate-700'
