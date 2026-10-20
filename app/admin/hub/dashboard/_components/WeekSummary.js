'use client'
// 선택한 주차 요약: 주제·일시·장소·편성 인원·제출 현황·미설정 항목
import { AlertTriangle, CalendarClock, CheckCircle2, MapPin, MessageSquareText, UsersRound } from 'lucide-react'
import { formatKst, formatKstDate, fromKstInput } from '@/lib/semester'
import { locationName, readSetup } from '../_lib'

function missingItems({ week, mode, current, setup, assignments, schedules }) {
  const items = []
  const topic = mode === 'weekday' ? current.weekday_topic : current.topic
  if (!topic?.trim()) items.push({ label: '주제', tab: 'overview' })
  if (mode === 'regular') {
    if (week > 0 && schedules.length === 0) items.push({ label: '전체 일정 등록', tab: 'overview' })
    if (!setup.location?.lat) items.push({ label: '출석 장소', tab: 'attendance' })
    if (!current.deadlines.attendance_start || !current.deadlines.attendance_end) items.push({ label: '출석 시간', tab: 'attendance' })
    if (week > 0 && !current.deadlines.slide) items.push({ label: '슬라이드 마감', tab: 'deadlines' })
  } else {
    if (!setup.weekdaySession) items.push({ label: '평일 세션 진행 여부', tab: 'attendance' })
    else if (Object.keys(setup.weekday || {}).length === 0) items.push({ label: '조별 진행 일정', tab: 'attendance' })
  }
  if (assignments.unassigned.length > 0) items.push({ label: `편성 미정 ${assignments.unassigned.length}명`, tab: 'groups' })
  return items
}

export default function WeekSummary({ ctx, week, mode, current, favorites, assignments, submissionSummary, schedules, onTab }) {
  const setup = readSetup(current.setup)
  const topic = mode === 'weekday' ? current.weekday_topic : current.topic
  const mainSchedule = schedules.find((row) => !row.is_break) || schedules[0]
  const sessionStart = fromKstInput(current.deadlines.session_start)
  const missing = missingItems({ week, mode, current, setup, assignments, schedules })
  const assignedCount = Object.values(assignments.byUnit).reduce((sum, list) => sum + list.length, 0)
  const total = assignedCount + assignments.unassigned.length + assignments.excluded.length + assignments.outOfRange.length
  const cancelled = ctx.weeks[week]?.status === 'cancelled'

  return (
    <section aria-label={`${week}주차 요약`} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <SummaryCard icon={MessageSquareText} label={`W${week} ${mode === 'weekday' ? '평일 주제' : week === 0 ? 'OT 주제' : '정규 주제'}`} onClick={() => onTab('overview')}>
        <p className={`break-keep text-base font-bold leading-6 ${topic ? 'text-slate-950' : 'text-slate-400'}`}>{topic || '주제 미정'}</p>
        {cancelled && <p className="mt-1 text-xs font-bold text-red-600">이 주차는 휴강(취소)으로 표시되어 있습니다.</p>}
      </SummaryCard>
      <SummaryCard icon={CalendarClock} label="일시 · 장소" onClick={() => onTab(mode === 'weekday' ? 'attendance' : 'overview')}>
        {mode === 'weekday' ? (
          <p className="text-sm font-semibold text-slate-800">{setup.weekdaySession ? `조별 일정 ${Object.keys(setup.weekday || {}).length}개 조` : '평일 세션 없음'}</p>
        ) : (
          <>
            <p className="text-sm font-semibold text-slate-800">{mainSchedule ? `${formatKstDate(mainSchedule.full_date)} ${mainSchedule.title}` : sessionStart ? formatKst(sessionStart) : '일정 미정'}</p>
            <p className="mt-1 flex items-center gap-1 text-sm text-slate-600"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{locationName(setup.location, favorites) || '장소 미정'}</p>
          </>
        )}
      </SummaryCard>
      <SummaryCard icon={UsersRound} label={mode === 'weekday' ? '평일 조 편성' : setup.evalMode === 'team' ? '팀 편성' : '조 편성'} onClick={() => onTab('groups')}>
        <p className="text-sm font-semibold text-slate-800">{assignedCount}/{total}명 배정 · {assignments.units}{mode !== 'weekday' && setup.evalMode === 'team' ? '팀' : '조'}</p>
        <p className="mt-1 text-sm text-slate-600">미정 {assignments.unassigned.length}명 · 불참 표시 {assignments.excluded.length}명</p>
      </SummaryCard>
      <SummaryCard icon={CheckCircle2} label="제출 현황" onClick={() => onTab('submissions')}>
        <ul className="space-y-0.5 text-sm">
          {(submissionSummary || []).map((entry) => (
            <li key={entry.type.key} className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-700">{entry.type.label}</span>
              <span className="text-slate-600">
                {entry.counts.submitted}/{entry.counts.targets}
                {entry.counts.late > 0 && <span className="ml-1 text-amber-700">지각 {entry.counts.late}</span>}
                {entry.counts.missing > 0 && <span className="ml-1 text-red-700">미제출 {entry.counts.missing}</span>}
              </span>
            </li>
          ))}
        </ul>
      </SummaryCard>
      {missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 md:col-span-2 xl:col-span-4">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="font-bold">미설정</span>
          {missing.map((item) => (
            <button key={item.label} type="button" onClick={() => onTab(item.tab)} className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-amber-900 ring-1 ring-inset ring-amber-300 hover:bg-amber-100">
              {item.label}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function SummaryCard({ icon: Icon, label, children, onClick }) {
  return (
    <div className="min-w-0 rounded-lg bg-teal-50/40 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold text-slate-500"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}</p>
        <button type="button" onClick={onClick} className="rounded px-1.5 text-xs font-bold text-teal-700 hover:bg-teal-50 hover:text-teal-900">설정</button>
      </div>
      {children}
    </div>
  )
}
