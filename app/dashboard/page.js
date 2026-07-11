import { redirect } from 'next/navigation'

// /home 의 GNB·퀵메뉴가 자료실 기능을 모두 포함하므로 허브 페이지는 홈으로 통합.
export default function DashboardRedirect() {
  redirect('/home')
}
