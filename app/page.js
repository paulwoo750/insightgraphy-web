import { redirect } from 'next/navigation'

export default function RootPage() {
  // 사용자가 주소창에 우리 사이트 주소만 치고 들어오면
  // 바로 '/login' 페이지로 강제 이동시킴! 🚀
  redirect('/login')
}