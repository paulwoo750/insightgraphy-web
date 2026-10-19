'use client'
// 개요·일정 탭: 주제 입력, 이 주차의 전체 일정, 학회원 화면 미리보기
import Link from 'next/link'
import { CalendarDays, ExternalLink } from 'lucide-react'
import { Field, inputClass, StatusBadge } from '@/app/components/ui'
import WeekOverviewCard from '@/app/components/WeekOverviewCard'
import { formatKstDate, fromKstInput } from '@/lib/semester'
import { scheduleTimeLabel } from '@/lib/schedules'
import { locationName } from '../_lib'

export default function OverviewTab({ ctx, week, mode, current, base, changes, canWrite, schedules, setTopic, favorites, setupView, memberLinks, crossHost, dirty }) {
  const topicField = mode === 'weekday' ? 'weekday_topic' : 'topic'
  const topicValue = current[topicField] || ''
  const topicChanged = changes.includes(topicField)
  const otBlocked = week === 0 && !ctx.otColumnReady
  const weekdayTeams = Object.entries(setupView.weekday || {}).filter(([group]) => Number(group) <= setupView.weekdayGroupCount)
  const firstTeam = weekdayTeams.map(([, team]) => team).find((team) => team.date)

  const previewDeadlines = mode === 'weekday'
    ? [
      { key: 'weekday_absence', at: fromKstInput(current.deadlines.weekday_absence) },
      { key: 'weekday_self', at: fromKstInput(current.deadlines.weekday_self) },
    ]
    : ['proposal', 'slide', 'video', 'proposal_comment', 'vote_feedback', 'video_comment', 'absence'].map((key) => ({ key, at: fromKstInput(current.deadlines[key]) }))

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,440px)]">
      <div className="min-w-0 space-y-6">
        <Field
          label={week === 0 ? 'W0 (OT) 주제' : mode === 'weekday' ? `W${week} 평일 세션 주제` : `W${week} 정규 주제`}
          htmlFor="week-topic"
          hint={otBlocked ? 'W0 주제를 학기별로 저장하려면 STEP 15 SQL이 필요합니다.' : topicChanged ? `저장된 값: ${base[topicField] || '(비어 있음)'}` : '학기 및 주차 화면과 같은 곳에 저장되어 자료실·투표·아카이브에 같은 주제가 보입니다.'}
        >
          <input
            id="week-topic"
            value={topicValue}
            onChange={(event) => setTopic(topicField, event.target.value)}
            placeholder={week === 0 ? 'OT 및 자유 주제' : '이번 주 발표 주제'}
            disabled={!canWrite || otBlocked}
            className={`${inputClass} ${topicChanged ? 'border-amber-400 bg-amber-50/40' : ''}`}
          />
        </Field>

        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">이 주차의 전체 일정</h3>
            <Link href="/admin/hub/schedule" className="inline-flex items-center gap-1 text-sm font-bold text-teal-700 hover:text-teal-900"><CalendarDays className="h-4 w-4" aria-hidden="true" />전체 일정에서 편집</Link>
          </div>
          {mode === 'weekday' ? (
            weekdayTeams.length === 0 ? <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">평일 세션 조별 일정은 출석·장소 탭에서 정합니다.</p> : (
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {weekdayTeams.map(([group, team]) => (
                  <li key={group} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <span className="font-bold text-slate-800">{group}조</span>
                    <span className="text-slate-600">{team.date ? formatKstDate(team.date) : '날짜 미정'} {team.sessionStart || ''} · {locationName({ lat: team.lat, lng: team.lng }, favorites) || '장소 미정'}</span>
                  </li>
                ))}
              </ul>
            )
          ) : schedules.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
              {week === 0 ? 'OT 일정은 전체 일정에서 주차를 비우고 등록합니다.' : `전체 일정에 W${week}로 등록된 일정이 없습니다. 메인·타임라인에 보이려면 전체 일정에 등록하세요.`}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {schedules.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="font-bold text-slate-800">{formatKstDate(row.full_date)} · {row.title}</span>
                    <span className="ml-2 text-slate-500">{scheduleTimeLabel(row)}</span>
                  </span>
                  <span className="flex gap-1.5">
                    {row.is_break && <StatusBadge tone="red">휴회</StatusBadge>}
                    <StatusBadge tone={row.is_public ? 'green' : 'gray'}>{row.is_public ? '공개' : '내부'}</StatusBadge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section data-tour="session-preview" aria-label="학회원 화면 미리보기">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">학회원 화면 미리보기</h3>
          <span className="text-xs font-semibold text-slate-500">읽기 전용</span>
        </div>
        <WeekOverviewCard
          semesterName={ctx.name}
          week={week}
          sessionMode={mode}
          topic={mode === 'weekday' ? current.weekday_topic : current.topic}
          cancelled={ctx.weeks[week]?.status === 'cancelled'}
          scheduleDate={mode === 'weekday' ? firstTeam?.date : schedules.find((row) => !row.is_break)?.full_date}
          scheduleTitle={mode === 'weekday' ? (weekdayTeams.length > 1 ? '조마다 일정이 다릅니다' : '') : schedules.find((row) => !row.is_break)?.title}
          attendance={mode === 'weekday' ? {} : { open: fromKstInput(current.deadlines.attendance_start), late: fromKstInput(current.deadlines.session_start), end: fromKstInput(current.deadlines.attendance_end) }}
          locationLabel={mode === 'weekday' ? '조마다 다름' : locationName(setupView.location, favorites)}
          groupLabel="학회원마다 다르게 표시"
          deadlines={previewDeadlines}
          previewLabel={dirty ? '저장 전 미리보기' : '저장된 값'}
          previewTone={dirty ? 'amber' : 'green'}
        />
        <div className="mt-3 rounded-md bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-600">
          <p className="font-bold text-slate-700">실제 학회원 화면 열기 (저장된 값)</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {memberLinks.map((link) => (
              <a key={link.kind} href={link.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 font-bold text-slate-700 hover:bg-white hover:text-teal-800">
                W{week} {link.kind === 'proposal' ? '기획서' : link.kind === 'slide' ? '슬라이드' : '영상'}
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            ))}
          </div>
          {dirty && <p className="mt-2 text-amber-800">저장하지 않은 변경은 실제 화면에 아직 보이지 않습니다.</p>}
          {crossHost && <p className="mt-1">관리자 주소와 다른 본 사이트에서 열립니다. 처음 여는 경우 그곳에서 로그인해야 합니다.</p>}
        </div>
      </section>
    </div>
  )
}
