'use client'
// 관리자 화면 공통 틀. 버튼·입력·상태 표현은 app/components/ui.js를 그대로 쓴다.
import { Eye } from 'lucide-react'
import { READ_ONLY_NOTICE } from '@/lib/permissions'

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

// 모든 관리자 화면의 제목 줄. eyebrow는 상위 메뉴 이름(한국어)을 쓴다.
export function PageHeader({ eyebrow, title, description, actions, meta }) {
  return (
    <header className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-bold text-teal-700">{eyebrow}</p>}
        <h1 className="text-2xl font-bold text-slate-950 sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl break-keep text-sm leading-6 text-slate-600">{description}</p>}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function Panel({ title, description, action, children, className = '', bodyClassName = '', id, tour }) {
  return (
    <section id={id} data-tour={tour} className={`min-w-0 overflow-hidden rounded-md border border-slate-200 bg-white ${className}`}>
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

const METRIC_BORDERS = {
  gray: 'border-t-slate-300',
  teal: 'border-t-teal-600',
  blue: 'border-t-blue-600',
  green: 'border-t-emerald-600',
  amber: 'border-t-amber-500',
  red: 'border-t-red-600',
}

export function Metric({ label, value, note, tone = 'gray', icon: Icon, href }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-600">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-slate-400" aria-hidden="true" />}
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
      {note && <p className="mt-1 break-keep text-xs leading-5 text-slate-500">{note}</p>}
    </>
  )
  const className = `block min-h-[112px] rounded-md border border-slate-200 border-t-[3px] bg-white p-4 ${METRIC_BORDERS[tone] || METRIC_BORDERS.gray}`
  if (href) return <a href={href} className={`${className} hover:bg-slate-50`}>{body}</a>
  return <div className={className}>{body}</div>
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
export const theadClass = 'bg-slate-50 text-xs font-bold text-slate-600'
export const thClass = 'px-4 py-3 font-bold'
export const tdClass = 'px-4 py-3 align-middle text-slate-700'
