'use client'
// 앱 첫 화면 안내: 아직 홈 화면에 설치하지 않았으면 설치 안내, 알림이 꺼져 있으면 알림 켜기
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BellRing, Smartphone } from 'lucide-react'
import { enablePush, isStandalone, loadPushState, platformOf, PUSH_ERRORS, pushConfigured, pushSupported } from '@/lib/push'

export function AppBanners() {
  const [env, setEnv] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const timer = setTimeout(async () => {
      let push = null
      try {
        push = await loadPushState()
      } catch {
        push = null
      }
      setEnv({ standalone: isStandalone(), platform: platformOf(), supported: pushSupported(), push })
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  if (!env) return null
  const mobile = env.platform === 'android' || env.platform === 'ios'
  const showInstall = mobile && !env.standalone
  // 아이폰은 홈 화면 앱에서만 알림을 켤 수 있다
  const canAskPush = env.supported && pushConfigured() && env.push?.ready && !env.push.subscribed && (env.platform !== 'ios' || env.standalone)
  const denied = env.push?.permission === 'denied'

  async function onEnable() {
    setBusy(true)
    setMessage('')
    try {
      await enablePush()
      setEnv((current) => ({ ...current, push: { ...current.push, subscribed: true, permission: 'granted' } }))
      setMessage('알림을 켰어요 🔔')
    } catch (error) {
      setMessage(PUSH_ERRORS[error.message] || `알림을 켜지 못했어요: ${error.message}`)
    } finally {
      setBusy(false)
    }
  }

  if (!showInstall && !canAskPush && !message) return null
  return (
    <div className="mb-4 space-y-2">
      {showInstall && (
        <Link href="/app/install" className="flex items-center gap-3 rounded-2xl bg-violet-50 px-4 py-3 text-violet-900">
          <Smartphone className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-sm font-bold">홈 화면에 설치하면 앱처럼 쓸 수 있어요<span className="block text-xs font-semibold text-violet-700/80">{env.platform === 'ios' ? '아이폰은 설치해야 알림을 받을 수 있어요' : '설치 안내 보기'}</span></span>
        </Link>
      )}
      {canAskPush && (
        <div className="flex items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-amber-900">
          <BellRing className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-sm font-bold">{denied ? '알림이 차단돼 있어요' : '출석·마감 알림을 받아 보세요'}<span className="block text-xs font-semibold text-amber-800/80">{denied ? '설치 안내의 "알림 켜기"를 따라 허용해 주세요' : '출석 열림, 마감 임박, 벌금·사유서 결과'}</span></span>
          {denied ? (
            <Link href="/app/install#notifications" className="shrink-0 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-bold text-white">방법 보기</Link>
          ) : (
            <button type="button" onClick={onEnable} disabled={busy} className="shrink-0 rounded-full bg-amber-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60">{busy ? '켜는 중' : '알림 켜기'}</button>
          )}
        </div>
      )}
      {message && <p role="status" className="px-1 text-sm font-semibold text-slate-600">{message}</p>}
    </div>
  )
}
