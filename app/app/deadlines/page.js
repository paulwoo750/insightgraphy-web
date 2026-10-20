'use client'
// 앱 마감 탭: 다가오는 마감(주차별)과 내 제출 여부, 최근 지난 마감
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { fetchCurrentSemester, formatKst } from '@/lib/semester'
import { dueChip, loadDeadlines } from '@/lib/memberApp'
import { useMember } from '@/app/components/MemberShell'
import { SegmentedControl } from '@/app/components/ui'
import { AppSection, AppTitle } from '../_components/AppShell'

const DAY = 24 * 3600 * 1000

export default function AppDeadlines() {
  const identity = useMember()
  const [data, setData] = useState({ status: 'loading' })
  const [view, setView] = useState('upcoming')
  const [now] = useState(() => Date.now())

  useEffect(() => {
    if (identity.status !== 'ready' || !identity.session) return undefined
    let active = true
    fetchCurrentSemester()
      .then(async (semester) => ({ semester, items: await loadDeadlines(semester, identity) }))
      .then(({ semester, items }) => active && setData({ status: 'ready', semester, items }))
      .catch((error) => active && setData({ status: 'error', error: error.message }))
    return () => { active = false }
  }, [identity])

  const groups = useMemo(() => {
    if (data.status !== 'ready') return []
    const items = view === 'upcoming'
      ? data.items.filter((item) => new Date(item.at).getTime() >= now)
      : data.items.filter((item) => new Date(item.at).getTime() < now && new Date(item.at).getTime() >= now - 14 * DAY).reverse()
    const byWeek = new Map()
    items.forEach((item) => {
      if (!byWeek.has(item.week)) byWeek.set(item.week, [])
      byWeek.get(item.week).push(item)
    })
    return [...byWeek.entries()]
  }, [data, view, now])

  const missing = data.status === 'ready' ? data.items.filter((item) => item.submission && !item.submitted && new Date(item.at).getTime() >= now).length : 0

  return (
    <div>
      <AppTitle title="마감" description="기획서·슬라이드·영상은 내가 냈는지도 함께 보여 줘요.">
        <div className="mt-3 flex items-center justify-between gap-2">
          <SegmentedControl label="보기" size="sm" value={view} onChange={setView} options={[{ value: 'upcoming', label: '다가오는 마감' }, { value: 'past', label: '지난 2주' }]} />
          {missing > 0 && view === 'upcoming' && <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">안 낸 제출 {missing}개</span>}
        </div>
      </AppTitle>

      {data.status === 'loading' && <p className="py-6 text-sm text-slate-400">불러오는 중…</p>}
      {data.status === 'error' && <p className="py-6 text-sm text-red-600">마감을 불러오지 못했어요.</p>}
      {data.status === 'ready' && groups.length === 0 && <p className="py-10 text-center text-sm text-slate-500">{view === 'upcoming' ? '예정된 마감이 없어요 🎉' : '지난 2주 동안 마감이 없었어요.'}</p>}

      {groups.map(([week, items]) => (
        <AppSection key={week} title={`W${week}${data.semester.weekTopics?.[week] ? ` · ${data.semester.weekTopics[week]}` : ''}`} className="first-of-type:mt-2">
          <ul className="divide-y divide-slate-100">
            {items.map((item) => {
              const chip = dueChip(item.at, now)
              const late = item.submitted?.is_late
              return (
                <li key={item.key}>
                  <Link href={item.href} className="flex items-center gap-3 py-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-teal-50 text-xl" aria-hidden="true">{item.emoji}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-900">{item.label}</span>
                      <span className="block text-xs text-slate-500">{formatKst(item.at)}</span>
                      {item.submission && (
                        <span className={`mt-0.5 inline-block text-xs font-bold ${item.submitted ? (late ? 'text-amber-700' : 'text-emerald-700') : 'text-red-600'}`}>
                          {item.submitted ? (late ? '⏰ 지각 제출함' : '✅ 제출함') : '아직 안 냈어요'}
                        </span>
                      )}
                    </span>
                    {view === 'upcoming' && <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${chip.tone}`}>{chip.text}</span>}
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </AppSection>
      ))}
    </div>
  )
}
