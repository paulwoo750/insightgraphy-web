// 휴대폰 푸시 알림 (웹 푸시). 구독은 기기마다 저장하고(STEP 25), 받을 알림 종류는 계정마다 저장한다.
import { supabase } from '@/lib/supabase'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const MISSING_FUNCTION = new Set(['PGRST202', '42883'])

export const PUSH_KINDS = [
  { key: 'attendance', label: '출석 알림', description: '출석이 열릴 때, 지각 10분 전 (아직 출석 안 했을 때만)' },
  { key: 'deadline', label: '마감 알림', description: '제출 마감 하루 전·3시간 전 (아직 안 냈을 때만), 피드백 마감 3시간 전' },
  { key: 'best', label: '베스트 프레젠터', description: '운영진이 주차별 결과를 발표할 때' },
  { key: 'record', label: '벌금·사유서', description: '벌금이 새로 부과되거나 사유서 결재가 끝났을 때' },
]
export const DEFAULT_PREFS = Object.fromEntries(PUSH_KINDS.map((kind) => [kind.key, true]))

// ---------------------------------------------------------------- 기기·브라우저
export function platformOf() {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

// 카카오톡·인스타그램 등 앱 안 브라우저 (설치·알림이 안 된다)
export function inAppBrowser() {
  if (typeof navigator === 'undefined') return null
  const ua = navigator.userAgent || ''
  if (/KAKAOTALK/i.test(ua)) return '카카오톡'
  if (/Instagram/i.test(ua)) return '인스타그램'
  if (/FBAN|FBAV/i.test(ua)) return '페이스북'
  if (/NAVER\(inapp/i.test(ua)) return '네이버'
  if (/Line\//i.test(ua)) return '라인'
  return null
}

// 홈 화면에 설치한 앱으로 열었나
export function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function pushConfigured() {
  return Boolean(VAPID_PUBLIC_KEY)
}

export async function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  } catch {
    return null
  }
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)))
}

// ---------------------------------------------------------------- 구독
export async function currentSubscription() {
  if (!pushSupported()) return null
  const registration = await navigator.serviceWorker.getRegistration('/')
  return registration ? registration.pushManager.getSubscription() : null
}

// 알림 켜기: 권한을 묻고(버튼을 누른 순간에만 물을 수 있다) 이 기기를 저장한다
export async function enablePush() {
  if (!pushSupported()) throw new Error('UNSUPPORTED')
  if (!pushConfigured()) throw new Error('NOT_CONFIGURED')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'DENIED' : 'DISMISSED')
  const registration = (await registerServiceWorker()) || (await navigator.serviceWorker.ready)
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) })
  }
  const json = subscription.toJSON()
  const { error } = await supabase.rpc('member_save_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
    p_platform: platformOf(),
    p_user_agent: navigator.userAgent.slice(0, 300),
  })
  if (error) {
    if (MISSING_FUNCTION.has(error.code)) throw new Error('NOT_READY')
    throw error
  }
  return subscription
}

export async function disablePush() {
  const subscription = await currentSubscription()
  if (!subscription) return
  await supabase.rpc('member_remove_push_subscription', { p_endpoint: subscription.endpoint })
  await subscription.unsubscribe()
}

// 이 기기가 구독돼 있고 서버에도 저장돼 있는지, 받을 알림 종류
export async function loadPushState() {
  const permission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  const subscription = await currentSubscription()
  const { data, error } = await supabase.rpc('member_push_settings', { p_endpoint: subscription?.endpoint || null })
  if (error) {
    if (MISSING_FUNCTION.has(error.code)) return { ready: false, permission, subscribed: false, prefs: DEFAULT_PREFS }
    throw error
  }
  return { ready: true, permission, subscribed: Boolean(subscription && data?.device_saved), prefs: { ...DEFAULT_PREFS, ...(data?.prefs || {}) }, devices: data?.devices || 0 }
}

export async function savePushPrefs(prefs) {
  const { error } = await supabase.rpc('member_set_push_prefs', { p_prefs: prefs })
  if (error) throw error
}

export const PUSH_ERRORS = {
  UNSUPPORTED: '이 브라우저에서는 알림을 받을 수 없어요. 아이폰은 홈 화면에 설치한 앱에서 켜 주세요.',
  NOT_CONFIGURED: '알림 서버 설정이 아직 끝나지 않았어요. 운영진에게 알려 주세요.',
  NOT_READY: '알림 기능을 준비하고 있어요 (STEP 25). 운영진에게 알려 주세요.',
  DENIED: '알림이 차단돼 있어요. 설치 안내의 "알림 켜기"를 따라 허용해 주세요.',
  DISMISSED: '알림 허용 창을 닫았어요. 다시 눌러 허용해 주세요.',
  NO_DEVICE: '이 계정에 등록된 기기가 없어요. 먼저 알림을 켜 주세요.',
}

// 알림 테스트: 내 기기로 한 번 보내고 바로 발송을 요청한다
export async function sendTestPush() {
  const { data, error } = await supabase.rpc('member_send_test_push')
  if (error) throw error
  if (data?.code === 'NO_DEVICE') throw new Error('NO_DEVICE')
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData?.session?.access_token
  if (token) {
    await fetch('/api/push/send', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => null)
  }
  return data
}
