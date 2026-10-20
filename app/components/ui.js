'use client'
// 관리자·학회원 화면 공통 UI. 버튼·입력·탭·모달·알림·상태 표현과 저장 보호 훅을 한곳에 둔다.
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, AlertTriangle, CheckCircle2, CircleHelp, Info, Loader2, RefreshCw, X } from 'lucide-react'
import { EmptyIllustration } from '@/app/components/Decor'

// ---------------------------------------------------------------- 버튼
const BUTTON_VARIANTS = {
  primary: 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-sm shadow-teal-700/20 hover:from-teal-700 hover:to-emerald-700 disabled:opacity-50',
  dark: 'bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-400',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-950 disabled:text-slate-400',
  danger: 'border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:text-red-300',
  dangerSolid: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:text-slate-300',
}
const BUTTON_SIZES = {
  sm: 'min-h-8 gap-1.5 px-2.5 text-xs',
  md: 'min-h-10 gap-2 px-4 text-sm',
  lg: 'min-h-12 gap-2 px-5 text-base',
}

export function buttonClass({ variant = 'secondary', size = 'md', className = '' } = {}) {
  return `inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed ${BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.secondary} ${BUTTON_SIZES[size] || BUTTON_SIZES.md} ${className}`
}

export function Button({ variant = 'secondary', size = 'md', icon: Icon, loading = false, children, className = '', href, target, disabled, type = 'button', ...props }) {
  const content = (
    <>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
      {children}
    </>
  )
  const classes = buttonClass({ variant, size, className })
  if (href && !disabled) {
    const external = /^https?:\/\//.test(href)
    if (external || target) {
      return <a href={href} target={target} rel={target === '_blank' ? 'noopener noreferrer' : undefined} className={classes} {...props}>{content}</a>
    }
    return <Link href={href} className={classes} {...props}>{content}</Link>
  }
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={classes} {...props}>
      {content}
    </button>
  )
}

export function IconButton({ icon: Icon, label, variant = 'ghost', size = 'md', className = '', ...props }) {
  const box = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'
  return (
    <button type="button" aria-label={label} title={label} className={`inline-grid ${box} shrink-0 place-items-center rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed ${BUTTON_VARIANTS[variant]} ${className}`} {...props}>
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  )
}

// ---------------------------------------------------------------- 입력
export const inputClass = 'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 aria-[invalid=true]:border-red-400'
export const textareaClass = 'min-h-24 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15 disabled:bg-slate-100'

export function Field({ label, hint, error, required, children, className = '', htmlFor }) {
  return (
    <div className={`block min-w-0 ${className}`}>
      {label && (
        <label htmlFor={htmlFor} className="mb-1.5 flex items-center gap-1 text-xs font-bold text-slate-700">
          {label}
          {required && <span className="text-red-600" aria-hidden="true">*</span>}
        </label>
      )}
      {children}
      {error ? <p className="mt-1 text-xs font-semibold text-red-600">{error}</p> : hint ? <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p> : null}
    </div>
  )
}

// ---------------------------------------------------------------- 상태 표시
const BADGE_TONES = {
  teal: 'bg-teal-50 text-teal-800 ring-teal-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  gray: 'bg-slate-100 text-slate-600 ring-slate-200',
  dark: 'bg-slate-900 text-white ring-slate-900',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  fuchsia: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200',
  gold: 'bg-gradient-to-r from-amber-300 to-yellow-200 text-amber-900 ring-amber-300',
}

export function StatusBadge({ tone = 'gray', children, className = '' }) {
  return (
    <span className={`inline-flex min-h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-bold ring-1 ring-inset ${BADGE_TONES[tone] || BADGE_TONES.gray} ${className}`}>
      {children}
    </span>
  )
}

export function LoadingState({ label = '불러오는 중입니다.', className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-2 px-5 py-12 text-sm font-semibold text-slate-500 ${className}`} role="status">
      <Loader2 className="h-4 w-4 animate-spin text-teal-700" aria-hidden="true" />
      {label}
    </div>
  )
}

export function EmptyState({ title, description, action, icon: Icon }) {
  return (
    <div className="px-5 py-10 text-center">
      {Icon ? (
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-teal-50 to-violet-50 ring-1 ring-inset ring-slate-200">
          <Icon className="h-6 w-6 text-teal-600" aria-hidden="true" />
        </span>
      ) : <EmptyIllustration className="mx-auto mb-2 h-20 w-28" />}
      <p className="text-sm font-bold text-slate-700">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

export function ErrorState({ title = '불러오지 못했습니다.', description, onRetry }) {
  return (
    <div className="px-5 py-10 text-center" role="alert">
      <AlertCircle className="mx-auto mb-3 h-7 w-7 text-red-500" aria-hidden="true" />
      <p className="text-sm font-bold text-slate-800">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-lg break-keep text-sm leading-6 text-slate-500">{description}</p>}
      {onRetry && <div className="mt-4 flex justify-center"><Button size="sm" icon={RefreshCw} onClick={onRetry}>다시 시도</Button></div>}
    </div>
  )
}

const NOTICE_TONES = {
  info: { box: 'border-blue-200 bg-blue-50 text-blue-900', icon: Info, iconClass: 'text-blue-600' },
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: CheckCircle2, iconClass: 'text-emerald-600' },
  warning: { box: 'border-amber-200 bg-amber-50 text-amber-900', icon: AlertTriangle, iconClass: 'text-amber-600' },
  danger: { box: 'border-red-200 bg-red-50 text-red-900', icon: AlertCircle, iconClass: 'text-red-600' },
  neutral: { box: 'border-slate-200 bg-slate-50 text-slate-800', icon: Info, iconClass: 'text-slate-500' },
}

export function Notice({ tone = 'info', title, children, action, className = '', onClose }) {
  const style = NOTICE_TONES[tone] || NOTICE_TONES.info
  const Icon = style.icon
  return (
    <div className={`flex gap-3 rounded-md border px-4 py-3 text-sm ${style.box} ${className}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.iconClass}`} aria-hidden="true" />
      <div className="min-w-0 flex-1 break-keep leading-6">
        {title && <p className="font-bold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
      {onClose && <IconButton icon={X} label="알림 닫기" size="sm" onClick={onClose} className="-mr-1 -mt-1" />}
    </div>
  )
}

// 클릭·포커스로 여는 짧은 도움말 (hover 전용이 아님)
export function HelpTip({ children, label = '도움말' }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const close = (event) => {
      if (event.type === 'keydown' ? event.key === 'Escape' : !ref.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button type="button" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)} className="inline-grid h-6 w-6 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600">
        <CircleHelp className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <span id={id} role="tooltip" className="absolute left-1/2 top-full z-50 mt-2 w-72 max-w-[80vw] -translate-x-1/2 rounded-md border border-slate-200 bg-white p-3 text-left text-xs font-medium leading-5 text-slate-700 shadow-lg">
          {children}
        </span>
      )}
    </span>
  )
}

// ---------------------------------------------------------------- 탭
export function Tabs({ tabs, value, onChange, label = '보기 선택', className = '' }) {
  const refs = useRef({})
  function onKeyDown(event, index) {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const last = tabs.length - 1
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? last : event.key === 'ArrowRight' ? (index === last ? 0 : index + 1) : (index === 0 ? last : index - 1)
    onChange(tabs[next].key)
    refs.current[tabs[next].key]?.focus()
  }
  return (
    <div role="tablist" aria-label={label} className={`flex gap-1 overflow-x-auto border-b border-slate-200 ${className}`}>
      {tabs.map((tab, index) => {
        const active = tab.key === value
        return (
          <button
            key={tab.key}
            ref={(node) => { refs.current[tab.key] = node }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={(event) => onKeyDown(event, index)}
            data-tour={tab.tour}
            className={`relative flex min-h-11 shrink-0 items-center gap-2 px-3 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-600 ${active ? 'text-teal-800' : 'text-slate-500 hover:text-slate-900'}`}
          >
            {tab.label}
            {tab.badge != null && tab.badge !== '' && <span className={`rounded-full px-1.5 text-xs ${tab.badgeTone === 'amber' ? 'bg-amber-100 text-amber-800' : tab.badgeTone === 'red' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{tab.badge}</span>}
            {active && <span className="absolute inset-x-2 bottom-0 h-[3px] rounded-t bg-teal-700" aria-hidden="true" />}
          </button>
        )
      })}
    </div>
  )
}

export function SegmentedControl({ options, value, onChange, label, size = 'md', disabled = false }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-slate-300 bg-slate-100 p-0.5">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled || option.disabled}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`rounded-[5px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${size === 'sm' ? 'min-h-8 px-2.5 text-xs' : 'min-h-9 px-3.5 text-sm'} ${active ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-600 hover:text-slate-950'}`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- 모달
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({ title, description, onClose, children, footer, size = 'md', labelledBy }) {
  const dialogRef = useRef(null)
  const generatedId = useId()
  const titleId = labelledBy || generatedId
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previous = document.activeElement
    const node = dialogRef.current
    const focusables = node?.querySelectorAll(FOCUSABLE)
    ;(focusables?.[0] || node)?.focus()
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current?.()
      }
      if (event.key !== 'Tab' || !node) return
      const items = [...node.querySelectorAll(FOCUSABLE)]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = originalOverflow
      previous?.focus?.()
    }
  }, [])

  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/50 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.() }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`flex max-h-[calc(100vh-24px)] w-full ${widths[size] || widths.md} flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl outline-none sm:max-h-[calc(100vh-48px)]`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold text-slate-950">{title}</h2>
            {description && <p className="mt-1 break-keep text-sm leading-6 text-slate-500">{description}</p>}
          </div>
          {onClose && <IconButton icon={X} label="닫기" onClick={onClose} className="-mr-2 -mt-1" />}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 알림(토스트)
const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback((id) => {
    setToasts((items) => items.filter((item) => item.id !== id))
    clearTimeout(timers.current[id])
    delete timers.current[id]
  }, [])

  const push = useCallback((tone, message, options = {}) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    setToasts((items) => [...items.slice(-3), { id, tone, message, title: options.title }])
    const duration = options.duration ?? (tone === 'error' ? 9000 : 4500)
    if (duration > 0) timers.current[id] = setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  useEffect(() => {
    const pending = timers.current
    return () => Object.values(pending).forEach(clearTimeout)
  }, [])

  const api = useMemo(() => ({
    success: (message, options) => push('success', message, options),
    error: (message, options) => push('error', message, options),
    info: (message, options) => push('info', message, options),
    warning: (message, options) => push('warning', message, options),
    dismiss,
  }), [push, dismiss])

  const tones = {
    success: { box: 'border-emerald-200', icon: CheckCircle2, iconClass: 'text-emerald-600' },
    error: { box: 'border-red-200', icon: AlertCircle, iconClass: 'text-red-600' },
    warning: { box: 'border-amber-200', icon: AlertTriangle, iconClass: 'text-amber-600' },
    info: { box: 'border-slate-200', icon: Info, iconClass: 'text-teal-700' },
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-3 bottom-3 z-[95] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[380px]" aria-live="polite">
        {toasts.map((toast) => {
          const tone = tones[toast.tone] || tones.info
          const Icon = tone.icon
          return (
            <div key={toast.id} role={toast.tone === 'error' ? 'alert' : 'status'} className={`pointer-events-auto flex w-full gap-3 rounded-md border bg-white px-4 py-3 text-sm shadow-lg ${tone.box}`}>
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone.iconClass}`} aria-hidden="true" />
              <div className="min-w-0 flex-1 break-keep leading-6 text-slate-800">
                {toast.title && <p className="font-bold text-slate-950">{toast.title}</p>}
                <p>{toast.message}</p>
              </div>
              <IconButton icon={X} label="알림 닫기" size="sm" onClick={() => dismiss(toast.id)} className="-mr-2 -mt-1" />
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

// 알림 공급자가 없는 화면에서도 쓸 수 있게 alert로 대신한다
const fallbackToast = {
  success: (message) => typeof window !== 'undefined' && window.alert(message),
  error: (message) => typeof window !== 'undefined' && window.alert(message),
  info: (message) => typeof window !== 'undefined' && window.alert(message),
  warning: (message) => typeof window !== 'undefined' && window.alert(message),
  dismiss: () => {},
}

export function useToast() {
  return useContext(ToastContext) || fallbackToast
}

// ---------------------------------------------------------------- 저장 보호
// 저장 중 중복 실행을 막는다. run(fn)은 이전 실행이 끝나기 전에는 무시된다.
export function useAsyncAction() {
  const running = useRef(false)
  const [pending, setPending] = useState(false)
  const run = useCallback(async (task) => {
    if (running.current) return undefined
    running.current = true
    setPending(true)
    try {
      return await task()
    } finally {
      running.current = false
      setPending(false)
    }
  }, [])
  return [run, pending]
}

// 저장하지 않은 변경이 있을 때 새로고침·탭 닫기·화면 내 링크 이동을 확인한다
export function useUnsavedChanges(dirty, message = '저장하지 않은 변경이 있습니다. 이 화면을 떠날까요?') {
  useEffect(() => {
    if (!dirty) return undefined
    function onBeforeUnload(event) {
      event.preventDefault()
      event.returnValue = message
      return message
    }
    function onClick(event) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = event.target.closest?.('a[href]')
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download') || anchor.dataset.allowDirty === 'true') return
      const url = new URL(anchor.href, window.location.href)
      if (url.origin === window.location.origin && url.pathname === window.location.pathname) return
      if (!window.confirm(message)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [dirty, message])
}

// 저장 상태 표시: 변경 없음 / 미저장 n건 / 저장 중 / 저장됨 시각 / 실패
export function SaveStatus({ state, dirtyCount = 0, savedAt, className = '' }) {
  const labels = {
    clean: { text: savedAt ? `저장됨 ${savedAt}` : '변경 없음', dot: 'bg-emerald-500', textClass: 'text-slate-600' },
    dirty: { text: `저장 안 된 변경 ${dirtyCount}건`, dot: 'bg-amber-500', textClass: 'text-amber-800' },
    saving: { text: '저장 중…', dot: 'bg-teal-500 animate-pulse', textClass: 'text-teal-800' },
    error: { text: '저장 실패 — 변경 내용은 화면에 남아 있습니다', dot: 'bg-red-500', textClass: 'text-red-700' },
  }
  const current = labels[state] || labels.clean
  return (
    <span className={`inline-flex items-center gap-2 text-xs font-bold ${current.textClass} ${className}`} role="status" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${current.dot}`} aria-hidden="true" />
      {current.text}
    </span>
  )
}
