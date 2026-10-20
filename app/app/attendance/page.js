'use client'
// 앱 출석 탭: 출석하기 + 이번 학기 출결 기록
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchCurrentSemester, formatKst } from '@/lib/semester'
import { fetchMyRecords } from '@/lib/myRecords'
import { absenceThresholds, attendanceKind, ATTENDANCE_LABELS, inSemester, summarizeAttendance } from '@/lib/memberRecords'
import { useMember } from '@/app/components/MemberShell'
import AttendanceCard from '@/app/components/AttendanceCard'
import { AppSection, AppTitle } from '../_components/AppShell'

const KIND_STYLE = {
  attended: 'bg-emerald-100 text-emerald-800',
  late: 'bg-amber-100 text-amber-800',
  unauthorized: 'bg-red-100 text-red-700',
  full: 'bg-sky-100 text-sky-800',
  partial: 'bg-teal-100 text-teal-800',
  missing: 'bg-slate-100 text-slate-500',
}

export default function AppAttendance() {
  const identity = useMember()
  const [data, setData] = useState({ status: 'loading' })

  useEffect(() => {
    if (identity.status !== 'ready' || !identity.session) return undefined
    let active = true
    Promise.all([fetchCurrentSemester(), fetchMyRecords({ member: identity.member, session: identity.session })])
      .then(([semester, records]) => {
        if (!active) return
        const ref = { id: semester.id, code: semester.code, status: 'active' }
        const rows = records.attendance.filter((row) => inSemester(row, ref)).sort((a, b) => (b.week ?? 0) - (a.week ?? 0))
        setData({ status: 'ready', semester, rows, summary: summarizeAttendance(rows), thresholds: absenceThresholds({ semester_type: semester.type, total_weeks: semester.totalWeeks }) })
      })
      .catch((error) => active && setData({ status: 'error', error: error.message }))
    return () => { active = false }
  }, [identity])

  return (
    <div>
      <AppTitle title="출석" description="세션 장소에서 버튼을 누르면 위치를 확인해 출석돼요." />
      <AttendanceCard />

      <AppSection title="이번 학기 출결">
        {data.status === 'loading' && <p className="py-4 text-sm text-slate-400">불러오는 중…</p>}
        {data.status === 'error' && <p className="py-4 text-sm text-red-600">출결 기록을 불러오지 못했어요.</p>}
        {data.status === 'ready' && (
          <>
            <dl className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-emerald-50 py-3"><dt className="text-[11px] font-semibold text-emerald-800">출석</dt><dd className="text-xl font-black text-emerald-900">{data.summary.presentLike}</dd></div>
              <div className="rounded-2xl bg-amber-50 py-3"><dt className="text-[11px] font-semibold text-amber-800">지각</dt><dd className="text-xl font-black text-amber-900">{data.summary.counts.late}</dd></div>
              <div className="rounded-2xl bg-red-50 py-3"><dt className="text-[11px] font-semibold text-red-700">무단결석</dt><dd className="text-xl font-black text-red-700">{data.summary.counts.unauthorized}<span className="text-sm font-bold text-red-400">/{data.thresholds.unauthorized}</span></dd></div>
            </dl>
            <p className="mt-2 text-xs text-slate-500">무단결석이 {data.thresholds.unauthorized}회가 되면 회칙에 따라 처리돼요.</p>
            <ul className="mt-3 divide-y divide-slate-100">
              {data.rows.length === 0 && <li className="py-6 text-center text-sm text-slate-500">아직 출결 기록이 없어요.</li>}
              {data.rows.map((row) => {
                const kind = attendanceKind(row.status)
                return (
                  <li key={row.id} className="flex items-center gap-3 py-3 text-sm">
                    <span className="w-11 shrink-0 rounded-lg bg-teal-700 py-0.5 text-center text-xs font-bold text-white">W{row.week}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${KIND_STYLE[kind]}`}>{ATTENDANCE_LABELS[kind]}</span>
                    {row.session_type === 'weekday' && <span className="text-xs font-bold text-sky-700">평일</span>}
                    <span className="ml-auto text-xs text-slate-500">{row.auto_marked_at ? '출석 마감 후 자동 처리' : formatKst(row.created_at, { weekday: false })}</span>
                  </li>
                )
              })}
            </ul>
            <Link href="/archive/absence" className="mt-3 block rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">📮 결석·지각 예정이면 사유서 쓰기</Link>
          </>
        )}
      </AppSection>
    </div>
  )
}
