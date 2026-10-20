'use client'
// 출석 카드 (웹 출석 화면·휴대폰 앱 공통): 이번 세션 시간·상태와 큰 출석 버튼.
// 판단은 서버(STEP 24)가 한다. 화면은 남은 시간만 1초마다 다시 계산한다.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Loader2, MapPin, RefreshCw } from 'lucide-react'
import { AttendanceError, SESSION_LABELS, checkIn, fetchAttendanceContext, liveState, messageFor, remaining } from '@/lib/attendance'

const TIME_FORMAT = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' })
const DAY_FORMAT = new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' })
const hhmm = (iso) => (iso ? TIME_FORMAT.format(new Date(iso)) : '?')
const day = (iso) => (iso ? DAY_FORMAT.format(new Date(iso)) : '')

const TONE_BOX = {
  success: 'bg-emerald-50 text-emerald-900',
  warning: 'bg-amber-50 text-amber-900',
  info: 'bg-sky-50 text-sky-900',
  danger: 'bg-red-50 text-red-900',
}

export default function AttendanceCard({ installHref = '/app/install', compact = false }) {
  const [context, setContext] = useState({ status: 'loading', data: null, error: null })
  const [mode, setMode] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await fetchAttendanceContext()
      setContext({ status: 'ready', data, error: null })
      setNow(Date.now())
      // 기본 세션: 지금 출석 중인 것 → 첫 번째
      setMode((current) => {
        const sessions = data?.sessions || []
        if (current && sessions.some((item) => item.session_type === current)) return current
        const live = sessions.find((item) => ['open', 'late'].includes(item.state) && !item.record)
        return (live || sessions[0])?.session_type || null
      })
    } catch (error) {
      setContext({ status: 'error', data: null, error })
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(load, 0)
    // 앱을 다시 열면 새로 읽는다 (마감·기록이 바뀌었을 수 있음)
    function onVisible() {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  const sessions = context.data?.sessions || []
  const session = sessions.find((item) => item.session_type === mode) || sessions[0] || null
  const state = session ? liveState(session, now) : 'no_setting'
  const done = Boolean(session?.record)

  // 남은 시간 표시 (기록이 없고 시간이 정해져 있을 때만)
  useEffect(() => {
    if (!session || done || state === 'closed' || state === 'no_setting') return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [session, done, state])

  async function onCheckIn() {
    if (!session || checking) return
    setChecking(true)
    setResult(null)
    try {
      const response = await checkIn(session.session_type)
      setResult(response)
      if (response.ok && typeof navigator !== 'undefined') navigator.vibrate?.(60)
      if (response.ok || ['CLOSED', 'NOT_OPEN'].includes(response.code)) await load()
    } catch (error) {
      setResult({ ok: false, code: error instanceof AttendanceError ? error.code : 'ERROR', detail: error.message })
    } finally {
      setChecking(false)
    }
  }

  if (context.status === 'loading') {
    return <div className="grid h-72 place-items-center rounded-3xl bg-teal-50/60 text-sm font-semibold text-teal-700"><Loader2 className="h-5 w-5 animate-spin" aria-label="출석 정보를 불러오는 중" /></div>
  }
  if (context.status === 'error' || !context.data?.ok) {
    const code = context.error?.code && context.error instanceof AttendanceError ? context.error.code : context.data?.code
    const message = code ? messageFor(code) : { tone: 'danger', title: '출석 정보를 불러오지 못했어요', body: context.error?.message }
    return (
      <div className={`rounded-3xl px-5 py-6 ${TONE_BOX[message.tone] || TONE_BOX.danger}`}>
        <p className="font-bold">{message.title}</p>
        {message.body && <p className="mt-1 break-keep text-sm leading-6 opacity-90">{message.body}</p>}
        <button type="button" onClick={load} className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold underline-offset-2 hover:underline"><RefreshCw className="h-4 w-4" aria-hidden="true" />다시 불러오기</button>
      </div>
    )
  }
  if (!session) {
    return (
      <div className="rounded-3xl bg-teal-50/70 px-5 py-8 text-center">
        <p className="text-3xl" aria-hidden="true">🗓️</p>
        <p className="mt-2 font-bold text-teal-900">이번 학기 출석 일정이 아직 없어요</p>
        <p className="mt-1 text-sm text-teal-800/80">운영진이 출석 시간을 정하면 여기에서 출석할 수 있어요.</p>
      </div>
    )
  }

  const startMs = session.start ? new Date(session.start).getTime() : null
  const lateMs = session.late ? new Date(session.late).getTime() : null
  const endMs = session.end ? new Date(session.end).getTime() : null
  const message = result ? messageFor(result.code) : null
  const circle = done
    ? { bg: 'bg-white text-emerald-700', icon: CheckCircle2, label: session.record.status, sub: `${hhmm(session.record.created_at)} 기록` }
    : state === 'before'
      ? { bg: 'bg-white/90 text-slate-500', icon: MapPin, label: '출석 전', sub: startMs ? `${remaining(startMs - now)} 뒤 열림` : '' }
      : state === 'open'
        ? { bg: 'bg-white text-teal-800', icon: MapPin, label: '출석하기', sub: lateMs ? `지각까지 ${remaining(lateMs - now)}` : '지금 출석할 수 있어요', action: true }
        : state === 'late'
          ? { bg: 'bg-amber-300 text-amber-950', icon: MapPin, label: '지각 출석', sub: endMs ? `마감까지 ${remaining(endMs - now)}` : '', action: true }
          : state === 'closed'
            ? { bg: 'bg-white/70 text-slate-500', icon: MapPin, label: '출석 마감', sub: '사유서를 낼 수 있어요' }
            : { bg: 'bg-white/70 text-slate-500', icon: MapPin, label: '시간 미정', sub: '운영진이 정하면 열려요' }
  const CircleIcon = circle.icon

  return (
    <section aria-label="출석 체크" className={`relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-600 via-teal-700 to-emerald-700 text-white shadow-lg shadow-teal-900/20 ${compact ? 'px-5 pb-5 pt-4' : 'px-5 pb-6 pt-5 sm:px-6'}`}>
      <svg className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 opacity-20" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48" fill="none" stroke="white" strokeWidth="2" strokeDasharray="4 6" /><circle cx="50" cy="50" r="30" fill="none" stroke="white" strokeWidth="2" /></svg>
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-teal-50">
          <span className="mr-1.5 rounded-lg bg-white/20 px-2 py-0.5 text-base font-black text-white">W{session.week}</span>
          {SESSION_LABELS[session.session_type]}{session.group ? ` · ${session.group}조` : ''}
        </p>
        {sessions.length > 1 && (
          <div role="radiogroup" aria-label="세션 고르기" className="flex rounded-full bg-white/15 p-0.5">
            {sessions.map((item) => (
              <button key={item.session_type} type="button" role="radio" aria-checked={item.session_type === session.session_type} onClick={() => { setMode(item.session_type); setResult(null) }} className={`rounded-full px-3 py-1 text-xs font-bold transition ${item.session_type === session.session_type ? 'bg-white text-teal-800' : 'text-white/80'}`}>
                {item.session_type === 'weekday' ? '평일' : '정규'}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="relative mt-2 text-sm text-teal-50/90">
        {session.start ? <>{day(session.start)} · 출석 {hhmm(session.start)} ~ {hhmm(session.end)}{session.late ? ` · ${hhmm(session.late)}부터 지각` : ''}</> : '출석 시간 미정'}
      </p>

      <div className={`relative flex flex-col items-center ${compact ? 'mt-4' : 'mt-6'}`}>
        <button
          type="button"
          onClick={onCheckIn}
          disabled={!circle.action || checking || done}
          className={`grid place-items-center rounded-full shadow-xl shadow-teal-950/30 transition active:scale-95 disabled:active:scale-100 ${compact ? 'h-32 w-32' : 'h-40 w-40'} ${circle.bg} ${circle.action && !checking ? 'ring-8 ring-white/20 hover:ring-white/30' : ''}`}
        >
          <span className="flex flex-col items-center gap-1">
            {checking ? <Loader2 className="h-9 w-9 animate-spin" aria-hidden="true" /> : <CircleIcon className="h-9 w-9" aria-hidden="true" />}
            <span className="text-lg font-black">{checking ? '위치 확인 중' : circle.label}</span>
          </span>
        </button>
        {circle.sub && <p className="mt-3 text-sm font-semibold text-teal-50" aria-live="polite">{circle.sub}</p>}
      </div>

      {message && (
        <div role="status" className={`relative mt-4 rounded-2xl px-4 py-3 text-sm ${TONE_BOX[message.tone]}`}>
          <p className="font-bold">{message.title}</p>
          {result?.code === 'TOO_FAR' && <p className="mt-0.5 font-semibold">지금 거리 {Number(result.distance_m).toLocaleString()}m · 허용 {Math.round(result.radius_m)}m{result.accuracy_m ? ` (오차 ±${result.accuracy_m}m)` : ''}</p>}
          {result?.code === 'LOW_ACCURACY' && result.accuracy_m ? <p className="mt-0.5 font-semibold">지금 위치 오차 ±{Number(result.accuracy_m).toLocaleString()}m</p> : null}
          {message.body && <p className="mt-0.5 break-keep leading-6 opacity-90">{message.body}</p>}
          {['PERMISSION', 'LOW_ACCURACY', 'POSITION_UNAVAILABLE'].includes(result?.code) && <Link href={`${installHref}#location`} className="mt-1 inline-block font-bold underline underline-offset-2">위치 권한 켜는 법 보기</Link>}
          {result?.code === 'CLOSED' && <Link href="/archive/absence" className="mt-1 inline-block font-bold underline underline-offset-2">사유서 쓰러 가기</Link>}
        </div>
      )}
    </section>
  )
}
