'use client'

import Link from 'next/link'
import { ArrowRight, ListOrdered, NotebookPen } from 'lucide-react'
import { AdminPage, PageHeader } from '@/app/admin/_components/AdminUI'

const sections = [
  {
    href: '/admin/hub/vote/setup',
    icon: ListOrdered,
    title: '발표 세션 셋업',
    description: '세션 및 제출의 편성으로 주차별 발표 순서와 채점표 버전을 확정하고, 채점 진행을 확인합니다.',
    action: '셋업 열기',
  },
  {
    href: '/admin/hub/vote/content',
    icon: NotebookPen,
    title: '투표 화면 내용·평가표',
    description: '학회원 투표 화면의 안내 문구와 Insight·Graphic·Delivery 채점 기준, 평가표 버전을 편집합니다.',
    action: '내용 편집',
  },
]

export default function VoteManagerHub() {
  return (
    <AdminPage>
      <PageHeader eyebrow="학회원 시스템" title="투표 및 평가" description="실시간 채점의 발표 순서와 학회원에게 보이는 평가 안내를 관리합니다." />
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => {
          const Icon = section.icon
          return (
            <Link key={section.href} href={section.href} className="group flex min-h-[200px] flex-col justify-between rounded-xl bg-teal-50/50 p-6 transition-colors hover:bg-teal-100/60">
              <div>
                <Icon className="h-7 w-7 text-teal-700" aria-hidden="true" />
                <h2 className="mt-4 text-lg font-bold text-slate-900">{section.title}</h2>
                <p className="mt-1.5 break-keep text-sm leading-6 text-slate-600">{section.description}</p>
              </div>
              <span className="mt-6 inline-flex items-center gap-1 text-sm font-bold text-teal-700">{section.action}<ArrowRight className="h-4 w-4" aria-hidden="true" /></span>
            </Link>
          )
        })}
      </div>
    </AdminPage>
  )
}
