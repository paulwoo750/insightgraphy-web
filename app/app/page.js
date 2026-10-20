'use client'
// 앱 첫 화면(오늘): 출석 카드, 다가오는 마감, 내 기록 요약, 이번 주 베스트 프레젠터
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { fetchCurrentSemester, displayTopic, formatKst } from '@/lib/semester'
import { fetchMyRecords } from '@/lib/myRecords'
import { inSemester, summarizeAttendance, summarizeFines } from '@/lib/memberRecords'
import { dueChip, loadDeadlines, loadRanking } from '@/lib/memberApp'
import { weekRanking, winnersLine } from '@/lib/ranking'
import { useMember } from '@/app/components/MemberShell'
import AttendanceCard from '@/app/components/AttendanceCard'
import { AppSection } from './_components/AppShell'
import { AppBanners } from './_components/AppBanners'

export default function AppToday() {
  const identity = useMember()
  const [data, setData] = useState({ status: 'loading' })
  const [now] = useState(() => Date.now())

  useEffect(() => {
    if (identity.status !== 'ready' || !identity.session) return undefined
    let active = true
    async function load() {
      try {
        const semester = await fetchCurrentSemester()
        const [deadlines, records, ranking] = await Promise.all([
          loadDeadlines(semester, identity).catch(() => []),
          fetchMyRecords({ member: identity.member, session: identity.session }).catch(() => null),
          loadRanking(semester.code).catch(() => null),
        ])
        if (active) setData({ status: 'ready', semester, deadlines, records, ranking })
      } catch (error) {
        if (active) setData({ status: 'error', error: error.message })
      }
    }
    load()
    return () => { active = false }
  }, [identity])

  const name = identity.member?.name || identity.session?.user?.user_metadata?.name || '학회원'
  const summary = useMemo(() => {
    if (data.status !== 'ready' || !data.records) return null
    const ref = { id: data.semester.id, code: data.semester.code, status: 'active' }
    return {
      attendance: summarizeAttendance(data.records.attendance.filter((row) => inSemester(row, ref))),
      fines: summarizeFines(data.records.fines.filter((row) => inSemester(row, ref))),
    }
  }, [data])

  const upcoming = data.status === 'ready' ? data.deadlines.filter((item) => new Date(item.at).getTime() >= now).slice(0, 4) : []
  const latestBest = useMemo(() => {
    if (data.status !== 'ready' || !data.ranking?.weeks.length) return null
    const week = data.ranking.weeks[data.ranking.weeks.length - 1]
    const ranking = weekRanking(data.ranking.presentations, data.ranking.scoresByPresentation, week)
    return { week, line: winnersLine(ranking) }
  }, [data])

  return (
    <div>
      <div className="mb-4 mt-1">
        <p className="text-sm font-bold text-teal-700">{data.status === 'ready' ? `${data.semester.name} · ${data.semester.currentWeek}주차` : ' '}</p>
        <h1 className="text-2xl font-black tracking-tight text-slate-950">{name}님, 반가워요 👋</h1>
        {data.status === 'ready' && displayTopic(data.semester.weekTopics, data.semester.currentWeek) && (
          <p className="mt-0.5 text-sm text-slate-500">이번 주제 · {displayTopic(data.semester.weekTopics, data.semester.currentWeek)}</p>
        )}
      </div>

      <AppBanners />
      <AttendanceCard compact />

      <AppSection title="다가오는 마감" action={<Link href="/app/deadlines" className="flex items-center text-sm font-bold text-teal-700">전체<ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>}>
        {data.status === 'loading' && <p className="py-4 text-sm text-slate-400">불러오는 중…</p>}
        {data.status === 'ready' && upcoming.length === 0 && <p className="py-4 text-sm text-slate-500">예정된 마감이 없어요 🎉</p>}
        <ul className="divide-y divide-slate-100">
          {upcoming.map((item) => {
            const chip = dueChip(item.at, now)
            return (
              <li key={item.key}>
                <Link href={item.href} className="flex items-center gap-3 py-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-teal-50 text-xl" aria-hidden="true">{item.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-900">W{item.week} {item.label}</span>
                    <span className="block text-xs text-slate-500">{formatKst(item.at)}{item.submission ? (item.submitted ? ' · ✅ 제출함' : ' · 아직 안 냄') : ''}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${chip.tone}`}>{chip.text}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </AppSection>

      <AppSection title="이번 학기 내 기록" action={<Link href="/app/me" className="flex items-center text-sm font-bold text-teal-700">자세히<ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>}>
        {summary ? (
          <dl className="grid grid-cols-4 gap-2 text-center">
            <Stat label="출석" value={summary.attendance.presentLike} />
            <Stat label="지각" value={summary.attendance.counts.late} tone={summary.attendance.counts.late ? 'text-amber-700' : ''} />
            <Stat label="무단결석" value={summary.attendance.counts.unauthorized} tone={summary.attendance.counts.unauthorized ? 'text-red-600' : ''} />
            <Stat label="미납 벌금" value={summary.fines.unpaidTotal ? `₩${(summary.fines.unpaidTotal / 1000).toLocaleString()}k` : '₩0'} tone={summary.fines.unpaidTotal ? 'text-red-600' : ''} />
          </dl>
        ) : <p className="py-4 text-sm text-slate-400">{data.status === 'loading' ? '불러오는 중…' : '기록을 불러오지 못했어요.'}</p>}
      </AppSection>

      {latestBest && (
        <Link href="/app/best" className="mt-7 flex items-center gap-3 rounded-3xl bg-gradient-to-br from-indigo-950 via-violet-900 to-fuchsia-800 px-5 py-4 text-white">
          <span className="text-3xl" aria-hidden="true">🏆</span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold text-amber-200">W{latestBest.week} 베스트 프레젠터</span>
            <span className="block truncate font-black">{latestBest.line}</span>
          </span>
          <ChevronRight className="h-5 w-5 text-white/70" aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}

function Stat({ label, value, tone = '' }) {
  return (
    <div className="rounded-2xl bg-teal-50/60 px-1 py-3">
      <dt className="text-[11px] font-semibold text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-lg font-black ${tone || 'text-slate-900'}`}>{value}</dd>
    </div>
  )
}
