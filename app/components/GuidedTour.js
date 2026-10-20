'use client'
// 실제 화면 요소를 강조하는 단계형 안내.
// - 요소는 data-tour 속성으로 찾는다. 로딩 중이면 잠시 기다리고, 끝내 없으면 이유를 적고 넘어간다.
// - 다른 화면의 단계는 이동을 제안하고, 이동 후 이어서 진행한다 (sessionStorage).
// - 강조 중에는 화면 클릭을 막는다. 저장·삭제·출석·결재 같은 동작은 대신 실행하지 않는다.
// - Esc·닫기·건너뛰기로 언제든 멈춘다. resize·scroll·고정 헤더·모바일 폭을 고려해 위치를 다시 잡는다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Loader2, X } from 'lucide-react'
import { markTourSeen, readTourProgress, visibleSteps, writeTourProgress } from '@/lib/tours'

const PADDING = 6
const WAIT_MS = 4000

function pathMatches(stepPath, pathname) {
  if (!stepPath) return true
  return pathname === stepPath || pathname.startsWith(`${stepPath}/`)
}

function findTarget(target) {
  if (!target || typeof document === 'undefined') return null
  const nodes = [...document.querySelectorAll(`[data-tour="${target}"]`)]
  // 모바일·데스크톱용 요소가 둘 다 있을 수 있어 실제로 보이는 것을 고른다
  return nodes.find((node) => {
    const box = node.getBoundingClientRect()
    return box.width > 0 && box.height > 0
  }) || null
}

function measureTarget(target) {
  const node = findTarget(target)
  if (!node) return null
  const box = node.getBoundingClientRect()
  return { top: box.top - PADDING, left: box.left - PADDING, width: box.width + PADDING * 2, height: box.height + PADDING * 2 }
}

export default function GuidedTour({ tour, role, userId, startIndex = 0, onClose, pageLabels = {} }) {
  const router = useRouter()
  const pathname = usePathname() || ''
  const steps = useMemo(() => visibleSteps(tour, role), [tour, role])
  const [index, setIndex] = useState(Math.min(startIndex, Math.max(steps.length - 1, 0)))
  const [found, setFound] = useState({ key: '', status: 'waiting', rect: null })
  const [viewport, setViewport] = useState({ width: 1024, height: 768 })
  const cardRef = useRef(null)
  const step = steps[index]
  const stepKey = step ? `${step.id}@${pathname}` : ''
  const elsewhere = Boolean(step?.target) && !pathMatches(step.path, pathname)
  const status = !step?.target ? 'idle' : elsewhere ? 'elsewhere' : found.key === stepKey ? found.status : 'waiting'
  const rect = status === 'found' ? found.rect : null

  // 이전 포커스를 기억했다가 닫을 때 돌려준다
  useEffect(() => {
    const previous = document.activeElement
    return () => previous?.focus?.()
  }, [])

  useEffect(() => {
    writeTourProgress({ tourId: tour.id, index })
  }, [tour.id, index])

  const finish = useCallback((reason) => {
    writeTourProgress(null)
    markTourSeen(tour, userId)
    onClose?.(reason)
  }, [tour, userId, onClose])

  // 단계 대상 찾기 (로딩 중이면 기다린다)
  useEffect(() => {
    if (!step?.target || elsewhere) return undefined
    let cancelled = false
    let timer = 0
    const started = Date.now()
    function poll() {
      if (cancelled) return
      const node = findTarget(step.target)
      if (node) {
        node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
        setFound({ key: stepKey, status: 'found', rect: measureTarget(step.target) })
        return
      }
      if (Date.now() - started > WAIT_MS) {
        setFound({ key: stepKey, status: 'missing', rect: null })
        return
      }
      timer = setTimeout(poll, 150)
    }
    timer = setTimeout(poll, 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [step, stepKey, elsewhere])

  // 강조 위치를 스크롤·리사이즈·요소 크기 변화에 맞춰 갱신
  useEffect(() => {
    if (status !== 'found' || !step?.target) return undefined
    let frame = 0
    function measure() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const next = measureTarget(step.target)
        setFound((current) => current.key === stepKey ? { ...current, status: next ? 'found' : 'missing', rect: next } : current)
        setViewport({ width: window.innerWidth, height: window.innerHeight })
      })
    }
    measure()
    const node = findTarget(step.target)
    const observer = typeof ResizeObserver !== 'undefined' && node ? new ResizeObserver(measure) : null
    if (observer && node) observer.observe(node)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [status, step, stepKey])

  useEffect(() => {
    function onResize() {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    }
    const timer = setTimeout(onResize, 0)
    window.addEventListener('resize', onResize)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // 단계가 바뀌면 카드 제목으로 포커스를 옮긴다
  useEffect(() => {
    cardRef.current?.querySelector('[data-tour-heading]')?.focus()
  }, [index, status])

  // Esc로 닫고, 좌우 화살표로 이동하고, Tab은 카드 안에서만 돈다
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        finish('escape')
        return
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        setIndex((current) => Math.min(current + 1, steps.length - 1))
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setIndex((current) => Math.max(current - 1, 0))
        return
      }
      if (event.key !== 'Tab' || !cardRef.current) return
      const items = [...cardRef.current.querySelectorAll('button:not([disabled])')]
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (!cardRef.current.contains(document.activeElement)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [finish, steps.length])

  if (!step) return null

  const isLast = index >= steps.length - 1
  const mobile = viewport.width < 640
  const cardWidth = Math.min(380, viewport.width - 24)
  let cardStyle = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: cardWidth }
  if (mobile) {
    cardStyle = { left: 12, right: 12, bottom: 12 }
  } else if (rect) {
    const below = rect.top + rect.height + 12
    const top = below + 230 < viewport.height ? below : Math.max(12, rect.top - 12 - 230)
    const left = Math.min(Math.max(12, rect.left), viewport.width - cardWidth - 12)
    cardStyle = { left, top, width: cardWidth }
  }

  function goNext() {
    if (isLast) finish('done')
    else setIndex(index + 1)
  }

  return (
    <div className="fixed inset-0 z-[90]">
      {/* 화면 클릭을 막는 층. 강조 영역 바깥을 어둡게 한다 */}
      <div className="absolute inset-0" onMouseDown={(event) => event.preventDefault()} onClick={(event) => event.preventDefault()} aria-hidden="true">
        {rect ? (
          <div
            className="pointer-events-none fixed rounded-md ring-2 ring-teal-400 transition-all duration-200"
            style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height, boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55)' }}
          />
        ) : (
          <div className="absolute inset-0 bg-slate-950/55" />
        )}
      </div>

      <div ref={cardRef} role="dialog" aria-modal="true" aria-labelledby="guided-tour-title" aria-describedby="guided-tour-body" className="fixed rounded-xl bg-white p-4 text-slate-900 shadow-2xl sm:p-5" style={cardStyle}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-bold text-teal-700">{tour.title} · {index + 1} / {steps.length}</p>
          <button type="button" onClick={() => finish('close')} className="-mr-2 -mt-2 grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100" aria-label="안내 닫기">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <h2 id="guided-tour-title" data-tour-heading tabIndex={-1} className="mt-1 break-keep text-base font-bold leading-6 outline-none">{step.title}</h2>
        <p id="guided-tour-body" className="mt-2 break-keep text-sm leading-6 text-slate-600">{step.body}</p>

        {status === 'waiting' && (
          <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />화면을 불러오는 중입니다.</p>
        )}
        {status === 'missing' && (
          <p className="mt-3 break-keep rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">지금 화면에서는 이 영역이 보이지 않습니다. 권한이나 데이터 상태에 따라 숨겨질 수 있어요. 다음으로 넘어가도 됩니다.</p>
        )}
        {status === 'elsewhere' && (
          <div className="mt-3 break-keep rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
            이 단계는 <strong>{pageLabels[step.path] || '다른'}</strong> 화면에 있습니다.{' '}
            <button type="button" onClick={() => router.push(step.path)} className="font-bold text-teal-700 underline underline-offset-2">이동해서 계속</button>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1" aria-hidden="true">
            {steps.map((item, dotIndex) => <span key={item.id} className={`h-1.5 rounded-full ${dotIndex === index ? 'w-4 bg-teal-600' : 'w-1.5 bg-slate-300'}`} />)}
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => finish('skip')} className="min-h-9 rounded-md px-2.5 text-xs font-bold text-slate-500 hover:bg-slate-100">건너뛰기</button>
            <button type="button" onClick={() => setIndex(index - 1)} disabled={index === 0} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-slate-300 px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />이전
            </button>
            <button type="button" onClick={goNext} className="inline-flex min-h-9 items-center gap-1 rounded-md bg-teal-700 px-3 text-xs font-bold text-white hover:bg-teal-800">
              {isLast ? '마치기' : '다음'}{!isLast && <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// 셸에서 쓰는 상태 훅: 미확인 릴리스 자동 시작(계정당 한 번), 다시 열기, 화면 이동 후 이어보기
export function useTourState(tour, userId, { autoStart = true, ready = true } = {}) {
  const [state, setState] = useState({ open: false, startIndex: 0, key: 0 })
  const checked = useRef(false)

  useEffect(() => {
    if (!ready || !userId || checked.current) return undefined
    const timer = setTimeout(() => {
      checked.current = true
      const progress = readTourProgress()
      if (progress?.tourId === tour.id) {
        setState((current) => ({ open: true, startIndex: progress.index || 0, key: current.key + 1 }))
        return
      }
      if (!autoStart) return
      let seen = true
      try {
        seen = window.localStorage.getItem(`ig-tour-seen:${tour.area}:${tour.id}:${userId}`) === 'done'
      } catch {
        seen = true
      }
      if (!seen) setState((current) => ({ open: true, startIndex: 0, key: current.key + 1 }))
    }, 0)
    return () => clearTimeout(timer)
  }, [ready, userId, tour, autoStart])

  const start = useCallback(() => setState((current) => ({ open: true, startIndex: 0, key: current.key + 1 })), [])
  const close = useCallback(() => setState((current) => ({ ...current, open: false })), [])
  return { ...state, start, close }
}
