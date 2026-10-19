'use client'

import { Suspense } from 'react'
import { AdminPage, LoadingState } from '@/app/admin/_components/AdminUI'
import SessionManager from './_components/SessionManager'

// 주차·세션·탭 문맥을 주소(?semester=&week=&session=&tab=)로 유지하므로 Suspense 안에서 읽는다
export default function SessionManagerPage() {
  return (
    <Suspense fallback={<AdminPage><LoadingState label="세션 설정을 불러오는 중입니다." /></AdminPage>}>
      <SessionManager />
    </Suspense>
  )
}
