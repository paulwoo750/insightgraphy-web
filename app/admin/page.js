'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { getAdminAccess } from '@/lib/adminAuth'
import { useSiteUrls } from '@/lib/siteUrls'

export default function AdminAuthPage() {
  const router = useRouter()
  const [state, setState] = useState({ status: 'checking', email: '' })
  const site = useSiteUrls()

  useEffect(() => {
    let active = true

    const checkUser = async () => {
      const result = await getAdminAccess()
      if (!active) return

      if (result.status === 'signed_out') {
        router.replace('/login?next=%2Fadmin%2Fhub')
        return
      }

      if (result.status === 'authorized') {
        router.replace('/admin/hub')
        return
      }

      setState({ status: 'forbidden', email: result.session?.user?.email || '' })
    }
    checkUser()
    return () => {
      active = false
    }
  }, [router])

  if (state.status === 'checking') {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-6 text-center">
        <div>
          <ShieldCheck className="mx-auto h-8 w-8 text-teal-700" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-slate-600">관리자 권한을 확인하고 있습니다.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-6 py-12 text-slate-900">
      <div className="w-full max-w-md rounded-md border border-slate-200 bg-white p-7 sm:p-9">
        <ShieldAlert className="h-8 w-8 text-amber-600" aria-hidden="true" />
        <p className="mt-5 text-xs font-bold text-slate-500">관리자 접근</p>
        <h1 className="mt-1 text-xl font-bold">관리자 권한이 등록되지 않았습니다</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          현재 로그인 계정 <strong className="text-slate-900">{state.email}</strong>은 활성 관리자 목록에 없습니다.
          최고관리자에게 관리자 권한 화면에서 이 계정(학회원)을 선택해 역할을 달라고 요청한 뒤 다시 접속해주세요.
        </p>
        <div className="mt-7 flex flex-wrap gap-2 border-t border-slate-200 pt-5">
          <Link href="/login" className="inline-flex min-h-10 items-center rounded-md bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800">다른 계정으로 로그인</Link>
          <a href={site.memberUrl('/home')} className="inline-flex min-h-10 items-center rounded-md border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50">학회원 홈으로</a>
        </div>
      </div>
    </div>
  )
}
