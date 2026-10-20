'use client'
// 앱 내 정보 탭: 벌금, 사유서 결재, 알림 설정, 설치 안내·웹 화면·로그아웃
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ExternalLink, LogOut, Smartphone } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchCurrentSemester } from '@/lib/semester'
import { fetchMyRecords } from '@/lib/myRecords'
import { FINE_STATE_LABELS, fineState, inSemester, summarizeFines } from '@/lib/memberRecords'
import { disablePush, enablePush, isStandalone, loadPushState, platformOf, PUSH_ERRORS, PUSH_KINDS, pushConfigured, pushSupported, savePushPrefs, sendTestPush } from '@/lib/push'
import { resetIdentityCache, useMember } from '@/app/components/MemberShell'
import { AppSection, AppTitle } from '../_components/AppShell'

const FINE_TONES = { unpaid: 'bg-red-100 text-red-700', paid: 'bg-emerald-100 text-emerald-800', waived: 'bg-sky-100 text-sky-800', voided: 'bg-slate-100 text-slate-500' }

function absenceTone(status) {
  if (!status || status === '대기') return 'bg-amber-100 text-amber-800'
  if (status.includes('완전인정')) return 'bg-emerald-100 text-emerald-800'
  if (status.includes('부분인정')) return 'bg-teal-100 text-teal-800'
  return 'bg-red-100 text-red-700'
}

export default function AppMe() {
  const router = useRouter()
  const identity = useMember()
  const [data, setData] = useState({ status: 'loading' })
  const [showAllFines, setShowAllFines] = useState(false)

  useEffect(() => {
    if (identity.status !== 'ready' || !identity.session) return undefined
    let active = true
    Promise.all([fetchCurrentSemester(), fetchMyRecords({ member: identity.member, session: identity.session })])
      .then(([semester, records]) => {
        if (!active) return
        const ref = { id: semester.id, code: semester.code, status: 'active' }
        const fines = records.fines.filter((row) => inSemester(row, ref))
        setData({ status: 'ready', semester, fines, fineSummary: summarizeFines(fines), absences: records.absences.filter((row) => inSemester(row, ref)).slice(0, 6) })
      })
      .catch((error) => active && setData({ status: 'error', error: error.message }))
    return () => { active = false }
  }, [identity])

  const visibleFines = useMemo(() => {
    if (data.status !== 'ready') return []
    const order = { unpaid: 0, paid: 1, waived: 2, voided: 3 }
    const sorted = [...data.fines].sort((a, b) => order[fineState(a)] - order[fineState(b)] || (b.week ?? 0) - (a.week ?? 0))
    return showAllFines ? sorted : sorted.filter((fine) => fineState(fine) === 'unpaid')
  }, [data, showAllFines])

  async function signOut() {
    resetIdentityCache()
    await supabase.auth.signOut()
    router.replace('/login?next=%2Fapp')
  }

  const member = identity.member
  return (
    <div>
      <AppTitle title="내 정보">
        <p className="mt-1 text-sm text-slate-500">{member?.name || identity.session?.user?.user_metadata?.name}{member?.generation ? ` · ${member.generation}` : ''}{member?.university ? ` · ${member.university}` : ''}</p>
      </AppTitle>

      <AppSection title="벌금" action={data.status === 'ready' && data.fines.length > 0 && (
        <button type="button" onClick={() => setShowAllFines((value) => !value)} className="text-sm font-bold text-teal-700">{showAllFines ? '미납만' : '전체 보기'}</button>
      )}>
        {data.status === 'loading' && <p className="py-4 text-sm text-slate-400">불러오는 중…</p>}
        {data.status === 'error' && <p className="py-4 text-sm text-red-600">기록을 불러오지 못했어요.</p>}
        {data.status === 'ready' && (
          <>
            <div className={`rounded-3xl px-5 py-4 ${data.fineSummary.unpaidTotal ? 'bg-gradient-to-br from-red-500 to-rose-600 text-white' : 'bg-emerald-50 text-emerald-900'}`}>
              <p className="text-xs font-bold opacity-80">이번 학기 미납 벌금</p>
              <p className="mt-1 text-3xl font-black">₩{data.fineSummary.unpaidTotal.toLocaleString()}</p>
              <p className="mt-1 text-xs font-semibold opacity-80">{data.fineSummary.unpaidTotal ? `${data.fineSummary.unpaidCount}건 · 납부는 총무에게 문의해 주세요` : '미납 벌금이 없어요 👍'}{data.fineSummary.paidTotal ? ` · 납부 완료 ₩${data.fineSummary.paidTotal.toLocaleString()}` : ''}</p>
            </div>
            <ul className="mt-2 divide-y divide-slate-100">
              {visibleFines.map((fine) => {
                const state = fineState(fine)
                return (
                  <li key={fine.id} className="flex items-center gap-3 py-3 text-sm">
                    <span className="w-11 shrink-0 rounded-lg bg-teal-700 py-0.5 text-center text-xs font-bold text-white">W{fine.week}</span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate font-semibold ${state === 'voided' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{fine.category}</span>
                      {fine.reason && <span className="block truncate text-xs text-slate-500">{String(fine.reason).replace(/^\[(삭제됨|자동 취소|중복 취소)\]\s*/, '')}</span>}
                    </span>
                    <span className="shrink-0 font-bold">₩{Number(fine.amount || 0).toLocaleString()}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${FINE_TONES[state]}`}>{FINE_STATE_LABELS[state]}</span>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </AppSection>

      <AppSection title="사유서" action={<Link href="/archive/absence" className="text-sm font-bold text-teal-700">쓰기 →</Link>}>
        {data.status === 'ready' && data.absences.length === 0 && <p className="py-3 text-sm text-slate-500">이번 학기에 낸 사유서가 없어요.</p>}
        <ul className="divide-y divide-slate-100">
          {data.status === 'ready' && data.absences.map((row) => (
            <li key={row.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-800">W{row.week ?? '-'} {row.type}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${absenceTone(row.status)}`}>{!row.status || row.status === '대기' ? '결재 대기' : row.status}</span>
                <span className="ml-auto text-xs text-slate-500">{row.target_date}</span>
              </div>
              {row.admin_comment && row.status !== '대기' && <p className="mt-1 whitespace-pre-wrap break-keep border-l-[3px] border-teal-300 pl-2 text-xs leading-5 text-slate-600">{row.admin_comment}</p>}
            </li>
          ))}
        </ul>
      </AppSection>

      <NotificationSettings />

      <AppSection title="더 보기">
        <div className="space-y-2">
          <Link href="/app/install" className="flex items-center gap-3 rounded-2xl bg-violet-50 px-4 py-3 text-sm font-bold text-violet-900"><Smartphone className="h-5 w-5" aria-hidden="true" />설치·권한 안내 (안드로이드 · 아이폰)</Link>
          <Link href="/home" className="flex items-center gap-3 rounded-2xl bg-teal-50 px-4 py-3 text-sm font-bold text-teal-900"><ExternalLink className="h-5 w-5" aria-hidden="true" />웹 학회원 화면 (자료실·채점·사유서)</Link>
          <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-bold text-slate-500 hover:bg-slate-50"><LogOut className="h-5 w-5" aria-hidden="true" />로그아웃</button>
        </div>
        {data.status === 'ready' && <p className="mt-4 text-center text-xs text-slate-400">{data.semester.name} · 인사이트그래피 학회원 앱</p>}
      </AppSection>
    </div>
  )
}

function NotificationSettings() {
  const [state, setState] = useState({ status: 'loading' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const timer = setTimeout(async () => {
      const env = { platform: platformOf(), standalone: isStandalone(), supported: pushSupported(), configured: pushConfigured() }
      try {
        setState({ status: 'ready', env, ...(await loadPushState()) })
      } catch (error) {
        setState({ status: 'ready', env, ready: false, error: error.message })
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  async function toggle() {
    setBusy(true)
    setMessage('')
    try {
      if (state.subscribed) {
        await disablePush()
        setState((current) => ({ ...current, subscribed: false }))
        setMessage('이 기기의 알림을 껐어요.')
      } else {
        await enablePush()
        setState((current) => ({ ...current, subscribed: true, permission: 'granted' }))
        setMessage('알림을 켰어요 🔔')
      }
    } catch (error) {
      setMessage(PUSH_ERRORS[error.message] || `바꾸지 못했어요: ${error.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function test() {
    setBusy(true)
    setMessage('')
    try {
      await sendTestPush()
      setMessage('테스트 알림을 보냈어요. 몇 초 안에 와야 해요.')
    } catch (error) {
      setMessage(PUSH_ERRORS[error.message] || `보내지 못했어요: ${error.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function setKind(key, value) {
    const prefs = { ...state.prefs, [key]: value }
    setState((current) => ({ ...current, prefs }))
    try {
      await savePushPrefs(prefs)
    } catch (error) {
      setMessage(`저장하지 못했어요: ${error.message}`)
    }
  }

  const env = state.env
  const iosNeedsInstall = env?.platform === 'ios' && !env.standalone
  return (
    <AppSection title="알림">
      <span id="notifications" className="block scroll-mt-24" aria-hidden="true" />
      {state.status === 'loading' && <p className="py-3 text-sm text-slate-400">확인하는 중…</p>}
      {state.status === 'ready' && (
        <>
          {iosNeedsInstall ? (
            <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">아이폰은 <b>홈 화면에 설치한 앱</b>에서만 알림을 켤 수 있어요. <Link href="/app/install" className="font-bold underline">설치 방법 보기</Link></p>
          ) : !env.supported ? (
            <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">이 브라우저는 알림을 지원하지 않아요. 안드로이드는 크롬, 아이폰은 사파리로 설치해 주세요.</p>
          ) : !env.configured || !state.ready ? (
            <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">알림 서버 설정이 아직 끝나지 않았어요. 곧 켤 수 있어요.</p>
          ) : (
            <>
              <div className="flex items-center gap-3 rounded-2xl bg-teal-50/70 px-4 py-3">
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block font-bold text-slate-900">이 기기로 알림 받기</span>
                  <span className="block text-xs text-slate-500">{state.permission === 'denied' ? '알림이 차단돼 있어요. 설정에서 허용해 주세요.' : state.subscribed ? '켜져 있어요' : '꺼져 있어요'}</span>
                </span>
                <Switch checked={Boolean(state.subscribed)} disabled={busy || state.permission === 'denied'} onChange={toggle} label="이 기기로 알림 받기" />
              </div>
              {state.permission === 'denied' && <Link href="/app/install#notifications" className="mt-2 inline-block text-sm font-bold text-teal-700">알림 허용하는 법 보기 →</Link>}
              {state.subscribed && <button type="button" onClick={test} disabled={busy} className="mt-2 text-sm font-bold text-teal-700 disabled:opacity-50">🔔 알림 테스트 보내기</button>}
              <ul className="mt-2 divide-y divide-slate-100">
                {PUSH_KINDS.map((kind) => (
                  <li key={kind.key} className="flex items-center gap-3 py-3">
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block font-bold text-slate-800">{kind.label}</span>
                      <span className="block break-keep text-xs text-slate-500">{kind.description}</span>
                    </span>
                    <Switch checked={state.prefs?.[kind.key] !== false} onChange={(value) => setKind(kind.key, value)} label={kind.label} />
                  </li>
                ))}
              </ul>
            </>
          )}
          {message && <p role="status" className="mt-2 text-sm font-semibold text-slate-600">{message}</p>}
        </>
      )}
    </AppSection>
  )
}

function Switch({ checked, onChange, disabled = false, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${checked ? 'bg-teal-600' : 'bg-slate-300'}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}
