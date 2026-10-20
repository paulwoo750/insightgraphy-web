// 휴대폰 홈 화면 설치 정보 (PWA). 설치한 앱은 /app(학회원 앱)으로 열린다.
export default function manifest() {
  return {
    id: '/app',
    name: 'InsightGraphy 학회원',
    short_name: '인사이트그래피',
    description: '출석 체크, 제출 마감, 베스트 프레젠터, 벌금을 휴대폰에서 확인하는 인사이트그래피 학회원 앱',
    lang: 'ko',
    start_url: '/app?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#0f766e',
    categories: ['education', 'productivity'],
    icons: [
      { src: '/app-icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/app-icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/app-icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: '출석하기', short_name: '출석', url: '/app/attendance?source=shortcut', icons: [{ src: '/app-icons/icon-192.png', sizes: '192x192' }] },
      { name: '제출 마감', short_name: '마감', url: '/app/deadlines?source=shortcut', icons: [{ src: '/app-icons/icon-192.png', sizes: '192x192' }] },
    ],
  }
}
