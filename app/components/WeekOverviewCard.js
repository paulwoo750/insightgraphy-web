'use client'
// 한 주차의 학회원용 요약 카드. 학회원 홈·제출 화면과 관리자 미리보기가 같은 렌더러를 쓴다.
import { useState } from 'react'
import { CalendarClock, Clock3, MapPin, UsersRound } from 'lucide-react'
import { deadlineLabel, formatKst, formatKstDate } from '@/lib/semester'

// 남은 시간 표시와 색 (하루 안 = 빨강, 사흘 안 = 주황)
function relative(iso, now) {
  const diff = new Date(iso).getTime() - now
  if (Number.isNaN(diff)) return { text: '', tone: 'text-slate-400' }
  if (diff < 0) return { text: '마감됨', tone: 'bg-slate-100 text-slate-500' }
  const hours = Math.floor(diff / 3600000)
  if (hours < 24) return { text: `🔥 ${Math.max(1, hours)}시간 남음`, tone: 'bg-rose-100 text-rose-700' }
  const days = Math.floor(hours / 24)
  return { text: `D-${days}`, tone: days <= 3 ? 'bg-amber-100 text-amber-800' : 'bg-teal-100 text-teal-800' }
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
    <article data-tour={tour} className={`min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-teal-600 via-emerald-600 to-violet-600 px-4 py-3 text-white sm:px-5">
        <p className="flex items-center gap-2 text-sm font-bold">
          <span className="rounded-lg bg-white/20 px-2 py-0.5 text-base font-black ring-1 ring-inset ring-white/30">W{week}</span>
          {semesterName} · {sessionMode === 'weekday' ? '🏖️' : '🎤'} {sessionLabel}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {cancelled && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700 ring-1 ring-inset ring-red-200">휴강</span>}
          {previewLabel && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${previewTone === 'amber' ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>{previewLabel}</span>}
        </div>
      </div>
      <div className="px-4 py-4 sm:px-5">
        <h3 className="break-keep text-xl font-extrabold leading-8 text-slate-950">{topic || <span className="text-slate-400">주제 미정</span>}</h3>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <InfoRow tone="bg-violet-100 text-violet-700" icon={CalendarClock} label="일시" value={scheduleDate ? `${formatKstDate(scheduleDate)}${attendance.late ? ` ${formatKst(attendance.late, { weekday: false }).split(' ')[1]} 시작` : ''}` : attendance.late ? `${formatKst(attendance.late)} 시작` : '일정 미정'} detail={scheduleTitle} />
          <InfoRow tone="bg-rose-100 text-rose-700" icon={MapPin} label="장소" value={locationLabel || '장소 미정'} />
          <InfoRow tone="bg-emerald-100 text-emerald-700" icon={Clock3} label="출석" value={attendance.open || attendance.end ? `${attendance.open ? formatKst(attendance.open, { weekday: false }) : '?'} ~ ${attendance.end ? formatKst(attendance.end, { weekday: false }) : '?'}` : '출석 시간 미정'} detail={attendance.late ? `${formatKst(attendance.late, { weekday: false })} 이후 지각` : ''} />
          <InfoRow tone="bg-sky-100 text-sky-700" icon={UsersRound} label="내 편성" value={groupLabel || '편성 전'} />
        </dl>
        {visibleDeadlines.length > 0 && (
          <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
            {visibleDeadlines.map((item) => {
              const label = relative(item.at, reference)
              const done = label.text === '마감됨'
              return (
                <li key={item.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className={`font-semibold ${done ? 'text-slate-400' : 'text-slate-700'}`}>{done ? '✓ ' : '⏳ '}{item.label || deadlineLabel(item.key)}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-slate-600">{formatKst(item.at)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${label.tone}`}>{label.text}</span>
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

function InfoRow({ icon: Icon, label, value, detail, tone = 'bg-slate-100 text-slate-500' }) {
  return (
    <div className="flex min-w-0 gap-2.5">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tone}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>
      <div className="min-w-0">
        <dt className="text-xs font-semibold text-slate-500">{label}</dt>
        <dd className="break-keep font-semibold text-slate-800">{value}</dd>
        {detail && <dd className="text-xs text-slate-500">{detail}</dd>}
      </div>
    </div>
  )
}
