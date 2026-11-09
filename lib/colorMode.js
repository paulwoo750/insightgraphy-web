// 화면 밝기 (밝게 · 어둡게 · 기기 설정 따라가기). 기기마다 브라우저에 저장한다.
// 첫 화면이 깜빡이지 않게 app/layout.tsx의 COLOR_MODE_SCRIPT(lib/colorModeScript.js)가 그리기 전에 <html data-theme>를 정하고,
// 여기 함수들은 바꿀 때 같은 규칙으로 다시 적용한다. 공개 페이지는 늘 밝게 보인다 (app/dark-theme.css).
import { useSyncExternalStore } from 'react'
import { COLOR_MODE_KEY as KEY } from '@/lib/colorModeScript'

const EVENT = 'ig-color-mode'

export const COLOR_MODES = [
  { value: 'system', label: '기기 설정' },
  { value: 'light', label: '밝게' },
  { value: 'dark', label: '어둡게' },
]

export function getColorMode() {
  try {
    const value = window.localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

function systemDark() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches)
}

export function applyColorMode(mode = getColorMode()) {
  const dark = mode === 'dark' || (mode !== 'light' && systemDark())
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
}

export function setColorMode(mode) {
  try {
    if (mode === 'light' || mode === 'dark') window.localStorage.setItem(KEY, mode)
    else window.localStorage.removeItem(KEY)
  } catch {
    // 저장이 막힌 브라우저: 이번 화면에만 적용
  }
  applyColorMode(mode)
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(callback) {
  const query = window.matchMedia?.('(prefers-color-scheme: dark)')
  window.addEventListener(EVENT, callback)
  window.addEventListener('storage', callback)
  query?.addEventListener('change', callback)
  return () => {
    window.removeEventListener(EVENT, callback)
    window.removeEventListener('storage', callback)
    query?.removeEventListener('change', callback)
  }
}

// 고른 설정 ('system' | 'light' | 'dark')
export function useColorMode() {
  return useSyncExternalStore(subscribe, getColorMode, () => 'system')
}

// 지금 실제로 어두운 화면인지 (그래프 색처럼 CSS 변수로 못 바꾸는 곳에 쓴다)
export function useIsDark() {
  return useSyncExternalStore(subscribe, () => document.documentElement.getAttribute('data-theme') === 'dark', () => false)
}
