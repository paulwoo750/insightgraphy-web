import AppShell from './_components/AppShell'

export const metadata = {
  title: '인사이트그래피 학회원 앱',
  description: '출석 체크, 제출 마감, 베스트 프레젠터, 벌금 확인',
  appleWebApp: { capable: true, title: '인사이트그래피', statusBarStyle: 'default' },
  icons: { icon: '/logo.png', apple: '/app-icons/apple-touch-icon.png' },
  formatDetection: { telephone: false },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f766e',
}

export default function MemberAppLayout({ children }) {
  return <AppShell>{children}</AppShell>
}
