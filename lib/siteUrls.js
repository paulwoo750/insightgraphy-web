'use client'
// 공개·학회원·관리자 호스트를 구분하는 URL 헬퍼.
// 관리자 호스트(admin.insightgraphy.org, admin.localhost)에서는 proxy.ts가 '/'를 관리자 로그인으로,
// '/schedule'·'/archive' 같은 경로를 관리자 편집 화면으로 바꾼다. 그래서 관리자 화면에서 공개
// 사이트나 학회원 화면을 열 때는 같은 경로가 아니라 본 사이트 주소로 보내야 한다.
import { useSyncExternalStore } from 'react'

const ADMIN_HOSTNAME = process.env.NEXT_PUBLIC_ADMIN_HOSTNAME || 'admin.insightgraphy.org'
const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || 'https://insightgraphy.org'

export function isAdminHostname(hostname) {
  const host = String(hostname || '').toLowerCase()
  return host === ADMIN_HOSTNAME || host === 'admin.localhost'
}

// 브라우저에서 본 사이트(공개+학회원) 주소
export function mainOrigin() {
  if (typeof window === 'undefined') return ''
  const { protocol, hostname, port } = window.location
  if (!isAdminHostname(hostname)) return window.location.origin
  if (hostname === 'admin.localhost') return `${protocol}//localhost${port ? `:${port}` : ''}`
  if (hostname === ADMIN_HOSTNAME) {
    const siteHost = hostname.replace(/^admin\./, '')
    return `${protocol}//${siteHost}${port ? `:${port}` : ''}`
  }
  return SITE_ORIGIN
}

// 현재 창이 관리자 호스트인가
export function onAdminHost() {
  return typeof window !== 'undefined' && isAdminHostname(window.location.hostname)
}

function joinPath(origin, path = '/') {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${origin}${normalized}`
}

// 공개 사이트 경로 (랜딩, /schedule, /about …)
export function publicUrl(path = '/', origin = mainOrigin()) {
  return origin ? joinPath(origin, path) : path
}

// 학회원 화면 경로 (/home, /dashboard/slide …)
export function memberUrl(path = '/home', origin = mainOrigin()) {
  return origin ? joinPath(origin, path) : path
}

// 관리자 화면 경로. 관리자 호스트에서도 /admin/hub/... 경로는 그대로 열린다.
export function adminUrl(path = '/admin/hub') {
  return path
}

function subscribe() {
  return () => {}
}

// 렌더링 중에 쓸 본 사이트 주소. 서버 렌더링과 첫 화면은 상대 경로를 쓰고, 브라우저에서 바로 바꾼다.
export function useMainOrigin() {
  return useSyncExternalStore(subscribe, mainOrigin, () => '')
}

export function useSiteUrls() {
  const origin = useMainOrigin()
  return {
    origin,
    publicUrl: (path) => publicUrl(path, origin),
    memberUrl: (path) => memberUrl(path, origin),
    // 다른 호스트로 가는 링크는 새 탭에서 연다 (로그인 상태가 호스트마다 따로 저장된다)
    crossHost: Boolean(origin) && typeof window !== 'undefined' && origin !== window.location.origin,
  }
}
