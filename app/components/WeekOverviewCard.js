'use client'
// 한 주차의 학회원용 요약 카드. 학회원 홈·제출 화면과 관리자 미리보기가 같은 렌더러를 쓴다.
import { useState } from 'react'
import { CalendarClock, Clock3, MapPin, UsersRound } from 'lucide-react'
import { deadlineLabel, formatKst, formatKstDate } from '@/lib/semester'

function relative(iso, now) {
  const diff = new Date(iso).getTime() - now
  if (Number.isNaN(diff)) return ''
  if (diff < 0) return '마감됨'
  const hours = Math.floor(diff / 3600000)
  if (hours < 24) return `${Math.max(1, hours)}시간 남음`
  return `${Math.floor(hours / 24)}일 남음`
}

export default function WeekOverviewCard({
  semesterName,
  week,
  sessionMode = 'regular',
  topic,
  cancelled = false,
  scheduleDate,
  scheduleTitle,
  attendance = {},
  locationLabel,
  groupLabel,
  deadlines = [],
  previewLabel,
  previewTone = 'amber',
  actions,
  now,
  className = '',
  tour,
}) {
  const [mountedAt] = useState(() => Date.now())
  const reference = now ?? mountedAt
  const sessionLabel = sessionMode === 'weekday' ? '평일 세션' : week === 0 ? 'OT' : '정규 세션'
  const visibleDeadlines = deadlines.filter((item) => item.at).sort((a, b) => new Date(a.at) - new Date(b.at))
  return (
    <article data-tour={tour} className={`min-w-0 rounded-lg border border-slate-200 bg-white ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
        <p className="text-sm font-bold text-teal-800">{semesterName} · {week}주차 · {sessionLabel}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {cancelled && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700 ring-1 ring-inset ring-red-200">휴강</span>}
          {previewLabel && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${previewTone === 'amber' ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>{previewLabel}</span>}
        </div>
      </div>
      <div className="px-4 py-4 sm:px-5">
        <h3 className="break-keep text-xl font-bold leading-8 text-slate-950">{topic || <span className="text-slate-400">주제 미정</span>}</h3>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <InfoRow icon={CalendarClock} label="일시" value={scheduleDate ? `${formatKstDate(scheduleDate)}${attendance.late ? ` ${formatKst(attendance.late, { weekday: false }).split(' ')[1]} 시작` : ''}` : attendance.late ? `${formatKst(attendance.late)} 시작` : '일정 미정'} detail={scheduleTitle} />
          <InfoRow icon={MapPin} label="장소" value={locationLabel || '장소 미정'} />
          <InfoRow icon={Clock3} label="출석" value={attendance.open || attendance.end ? `${attendance.open ? formatKst(attendance.open, { weekday: false }) : '?'} ~ ${attendance.end ? formatKst(attendance.end, { weekday: false }) : '?'}` : '출석 시간 미정'} detail={attendance.late ? `${formatKst(attendance.late, { weekday: false })} 이후 지각` : ''} />
          <InfoRow icon={UsersRound} label="내 편성" value={groupLabel || '편성 전'} />
        </dl>
        {visibleDeadlines.length > 0 && (
          <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
            {visibleDeadlines.map((item) => {
              const label = relative(item.at, reference)
              return (
                <li key={item.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="font-semibold text-slate-700">{item.label || deadlineLabel(item.key)}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-slate-600">{formatKst(item.at)}</span>
                    <span className={`text-xs font-bold ${label === '마감됨' ? 'text-slate-400' : 'text-teal-700'}`}>{label}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </article>
  )
}

function InfoRow({ icon: Icon, label, value, detail }) {
  return (
    <div className="flex min-w-0 gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      <div className="min-w-0">
        <dt className="text-xs font-semibold text-slate-500">{label}</dt>
        <dd className="break-keep font-semibold text-slate-800">{value}</dd>
        {detail && <dd className="text-xs text-slate-500">{detail}</dd>}
      </div>
    </div>
  )
}
