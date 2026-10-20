'use client'
// 출석: 출석 시간·장소 반경·지각 여부는 서버가 확인한다 (STEP 24). 휴대폰 앱의 출석 탭과 같은 카드를 쓴다.
import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Smartphone } from 'lucide-react'
import { MemberHeader, MemberPage, useMember } from '@/app/components/MemberShell'
import AttendanceCard from '@/app/components/AttendanceCard'
import { LoadingState } from '@/app/components/ui'

export default function AttendancePage() {
  const router = useRouter()
  const identity = useMember()

  useEffect(() => {
    if (identity.status === 'ready' && !identity.session) router.replace('/login?next=%2Fattendance')
  }, [identity.status, identity.session, router])

  if (identity.status !== 'ready' || !identity.session) return <MemberPage><LoadingState label="출석 정보를 불러오는 중입니다." /></MemberPage>

  return (
    <MemberPage>
      <MemberHeader eyebrow="출석" title="출석 체크" description="세션 장소에서 출석하기를 누르면 위치를 확인해 출석이 기록됩니다. 출석 시간과 지각 기준은 서버 시간으로 판단합니다." />
      <div className="mx-auto grid max-w-4xl items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <AttendanceCard />
        <aside className="space-y-5 text-sm leading-6 text-slate-600">
          <div className="border-t-2 border-teal-600 pt-3">
            <h2 className="font-bold text-slate-900">출석이 안 될 때</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 break-keep">
              <li>위치 권한을 허용하고, 휴대폰의 ‘정확한 위치’를 켜 주세요.</li>
              <li>실내에서는 와이파이를 켜면 위치가 더 정확해집니다.</li>
              <li>출석이 끝난 뒤에는 사유서를 내 주세요.</li>
            </ul>
          </div>
          <Link href="/app/install" className="flex items-center gap-3 rounded-2xl bg-teal-50 px-4 py-3 font-bold text-teal-800 transition hover:bg-teal-100">
            <Smartphone className="h-5 w-5" aria-hidden="true" />
            <span className="min-w-0 flex-1">휴대폰 앱으로 설치하면 출석이 더 빨라요<span className="block text-xs font-semibold text-teal-700/80">안드로이드 · 아이폰 설치 안내</span></span>
          </Link>
        </aside>
      </div>
    </MemberPage>
  )
}
