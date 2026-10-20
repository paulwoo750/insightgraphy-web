'use client'
// 학회원 홈: 이번 주차(주제·세션·출석) → 다가오는 마감과 내 제출 → 최근 자료 → 마이페이지 요약 → 일정
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, FileText, MapPin, Presentation, Video } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { currentSemesterIdFilter, deadlineLabel, displayTopic, fetchCurrentSemester, formatKst, formatKstDate, groupDeadlines, kstDateString, locationName, memberGroup } from '@/lib/semester'
import { fetchSemesterSchedules, scheduleTimeLabel } from '@/lib/schedules'
import { fetchMyRecords } from '@/lib/myRecords'
import { inSemester, summarizeAttendance, summarizeFines } from '@/lib/memberRecords'
import { normalizeFileCategory, fileCategoryLabel } from '@/lib/archive'
import { MemberPage, useMember } from '@/app/components/MemberShell'
import WeekOverviewCard from '@/app/components/WeekOverviewCard'
import FileThumbnail from '@/app/components/FileThumbnail'
import { ErrorState, LoadingState, Notice, StatusBadge } from '@/app/components/ui'

const SUBMISSIONS = [
  { key: 'proposal', label: '기획서', href: '/dashboard/proposal', icon: FileText },
  { key: 'slide', label: '슬라이드', href: '/dashboard/slide', icon: Presentation },
  { key: 'video', label: '발표영상', href: '/dashboard/video', icon: Video },
]

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export default function HomeHub() {
  const router = useRouter()
  const identity = useMember()
  const [state, setState] = useState({ status: 'loading', error: '' })
  const [semester, setSemester] = useState(null)
  const [deadlines, setDeadlines] = useState({})
  const [schedules, setSchedules] = useState([])
  const [scheduleError, setScheduleError] = useState(false)
  const [files, setFiles] = useState([])
  const [favorites, setFavorites] = useState([])
  const [records, setRecords] = useState(null)
  const [month, setMonth] = useState(() => {
    const [year, monthNumber] = kstDateString().split('-').map(Number)
    return new Date(year, monthNumber - 1, 1)
  })

  useEffect(() => {
    if (identity.status !== 'ready') return undefined
    if (!identity.session) {
      router.replace('/login?next=%2Fhome')
      return undefined
    }
    let active = true
    async function load() {
      try {
        const current = await fetchCurrentSemester()
        const [deadlineResult, scheduleResult, fileResult, favoriteResult, myRecords] = await Promise.all([
          supabase.from('pr_deadlines').select('week, category, deadline_time').or(currentSemesterIdFilter(current)),
          fetchSemesterSchedules(current, { publicOnly: false }),
          supabase.from('files_metadata').select('*').eq('semester', current.code).order('created_at', { ascending: false }).limit(300),
          supabase.from('pr_config').select('value').eq('key', 'favorite_locations').maybeSingle(),
          fetchMyRecords({ member: identity.member, session: identity.session }),
        ])
        if (!active) return
        if (deadlineResult.error || fileResult.error) throw deadlineResult.error || fileResult.error
        setSemester(current)
        setDeadlines(groupDeadlines(deadlineResult.data))
        setSchedules(scheduleResult.data || [])
        setScheduleError(Boolean(scheduleResult.error))
        setFiles(fileResult.data || [])
        try {
          setFavorites(JSON.parse(favoriteResult.data?.value || '[]'))
        } catch {
          setFavorites([])
        }
        setRecords(myRecords)
        setState({ status: 'ready', error: '' })
      } catch (error) {
        if (active) setState({ status: 'error', error: error.message })
      }
    }
    load()
    return () => {
      active = false
    }
  }, [identity.status, identity.session, identity.member, router])

  const name = identity.member?.name || identity.session?.user?.user_metadata?.name || '학회원'
  const week = semester?.currentWeek ?? 1
  const setup = semester?.weeklySetup?.[week] || {}
  const myGroup = semester ? memberGroup(semester.weeklySetup, week, name) : null
  const myTeam = setup.evalMode === 'team' ? (setup.memberTeams || setup.members || {})[name] : null
  const myUploaderNames = useMemo(() => [name, myTeam ? `Team ${myTeam}` : null].filter(Boolean), [name, myTeam])

  const mySubmissionsByWeek = useMemo(() => {
    const map = {}
    for (const file of files) {
      const mine = (identity.member && file.uploader_member_id === identity.member.id) || myUploaderNames.includes(file.uploader)
      if (!mine) continue
      const key = `${file.week}:${normalizeFileCategory(file.file_category)}`
      map[key] = map[key] || file
    }
    return map
  }, [files, identity.member, myUploaderNames])

  const upcoming = useMemo(() => {
    const now = Date.now()
    const rows = []
    for (const [weekKey, map] of Object.entries(deadlines)) {
      for (const [category, at] of Object.entries(map)) {
        if (['attendance_start', 'session_start', 'attendance_end'].includes(category)) continue
        if (!at || new Date(at).getTime() < now) continue
        rows.push({ week: Number(weekKey), category, at, submitted: mySubmissionsByWeek[`${weekKey}:${category}`] })
      }
    }
    return rows.sort((a, b) => new Date(a.at) - new Date(b.at)).slice(0, 6)
  }, [deadlines, mySubmissionsByWeek])

  const summary = useMemo(() => {
    if (!records || !semester) return null
    const semesterRef = { id: semester.id, code: semester.code, status: 'active' }
    const attendance = records.attendance.filter((row) => inSemester(row, semesterRef))
    const fines = records.fines.filter((row) => inSemester(row, semesterRef))
    return { ...summarizeAttendance(attendance), fines: summarizeFines(fines) }
  }, [records, semester])

  if (identity.status !== 'ready' || state.status === 'loading') return <MemberPage><LoadingState label="홈을 불러오는 중입니다." /></MemberPage>
  if (state.status === 'error') return <MemberPage><ErrorState title="홈 정보를 불러오지 못했습니다." description={state.error} onRetry={() => window.location.reload()} /></MemberPage>

  const weekDeadlines = deadlines[week] || {}
  const weekSchedule = schedules.find((row) => String(row.week || '') === String(week) && !row.is_break)
  const today = kstDateString()
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const firstDay = new Date(year, monthIndex, 1).getDay()
  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`
  const monthEvents = schedules.filter((row) => String(row.full_date || '').startsWith(monthKey))
  const recentFiles = files.slice(0, 6)

  return (
    <MemberPage>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-teal-700">{semester.name} · {week}주차</p>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">{name}님, 반가워요</h1>
        </div>
        {(records?.nameFallback || identity.member?.status === 'alumni') && <StatusBadge tone="violet">🎓 졸업생 계정</StatusBadge>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
        <div className="min-w-0 space-y-6">
          <WeekOverviewCard
            tour="member-week-card"
            semesterName={semester.name}
            week={week}
            topic={displayTopic(semester.weekTopics, week)}
            cancelled={semester.weeks?.[week]?.status === 'cancelled'}
            scheduleDate={weekSchedule?.full_date}
            scheduleTitle={weekSchedule ? `${weekSchedule.title} · ${scheduleTimeLabel(weekSchedule)}` : ''}
            attendance={{ open: weekDeadlines.attendance_start, late: weekDeadlines.session_start, end: weekDeadlines.attendance_end }}
            locationLabel={locationName(setup.location, favorites)}
            groupLabel={myTeam ? `${myTeam}팀` : myGroup ? `${myGroup}조` : setup.members?.[name] === '결석' ? '이번 주 편성 제외' : ''}
            deadlines={['proposal', 'slide', 'video'].map((key) => ({ key, at: weekDeadlines[key] }))}
            actions={
              <>
                <Link href="/attendance" className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800"><MapPin className="h-4 w-4" aria-hidden="true" />출석하기</Link>
                <Link href={`/dashboard/slide?week=${week}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">W{week} 자료실<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                <Link href="/archive/absence" className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"><ClipboardList className="h-4 w-4" aria-hidden="true" />사유서</Link>
              </>
            }
          />

          <section aria-labelledby="my-submissions" className="rounded-lg border border-slate-200 p-4 sm:p-5">
            <h2 id="my-submissions" className="text-base font-bold text-slate-900">W{week} 내 제출</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-3">
              {SUBMISSIONS.map((item) => {
                const file = mySubmissionsByWeek[`${week}:${item.key}`]
                const Icon = item.icon
                return (
                  <li key={item.key}>
                    <Link href={`${item.href}?week=${week}`} className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2.5 hover:border-teal-400">
                      <Icon className="h-5 w-5 text-slate-400" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold text-slate-900">{item.label}</span>
                        <span className="block text-xs text-slate-500">{file ? formatKst(file.created_at) : weekDeadlines[item.key] ? `마감 ${formatKst(weekDeadlines[item.key])}` : '마감 미정'}</span>
                      </span>
                      <StatusBadge tone={file ? (file.is_late ? 'amber' : 'green') : 'gray'}>{file ? (file.is_late ? '지각 제출' : '제출') : '미제출'}</StatusBadge>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>

          <section aria-labelledby="recent-files" data-tour="member-recent">
            <div className="mb-3 flex items-end justify-between gap-2">
              <h2 id="recent-files" className="text-base font-bold text-slate-900">최근 올라온 자료</h2>
              <Link href={`/dashboard/slide?week=${week}`} className="text-sm font-bold text-teal-700 hover:underline">자료실 가기</Link>
            </div>
            {recentFiles.length === 0 ? <p className="rounded-md border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">이번 학기에 올라온 자료가 없습니다.</p> : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {recentFiles.map((file) => {
                  const category = normalizeFileCategory(file.file_category)
                  const href = `/dashboard/${category === 'weekday_slide' ? 'slide' : category === 'weekday_video' ? 'video' : category}?week=${file.week}${String(category).startsWith('weekday') ? '&session=weekday' : ''}`
                  return (
                    <li key={file.id} className="min-w-0">
                      <FileThumbnail url={file.file_url} storagePath={file.storage_path} title={file.file_name} width={640} />
                      <Link href={href} className="mt-2 block">
                        <span className="block truncate text-sm font-bold text-slate-900" title={file.file_name}>{file.uploader} · W{file.week} {fileCategoryLabel(file.file_category, { short: true })}</span>
                        <span className="block text-xs text-slate-500">{formatKst(file.created_at)}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="min-w-0 space-y-6">
          <section aria-labelledby="upcoming-deadlines" data-tour="member-deadlines" className="rounded-lg border border-slate-200">
            <h2 id="upcoming-deadlines" className="border-b border-slate-100 px-4 py-3 text-base font-bold text-slate-900">다가오는 마감</h2>
            {upcoming.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">예정된 마감이 없습니다.</p> : (
              <ul className="divide-y divide-slate-100">
                {upcoming.map((item) => (
                  <li key={`${item.week}-${item.category}`} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-10 shrink-0 rounded bg-teal-800 py-0.5 text-center text-xs font-bold text-white">W{item.week}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-800">{deadlineLabel(item.category)}</span>
                      <span className="block text-xs text-slate-500">{formatKst(item.at)}</span>
                    </span>
                    {['proposal', 'slide', 'video'].includes(item.category) && <StatusBadge tone={item.submitted ? 'green' : 'gray'}>{item.submitted ? '제출함' : '아직'}</StatusBadge>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="mypage-summary" data-tour="member-mypage-summary" className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <h2 id="mypage-summary" className="text-base font-bold text-slate-900">이번 학기 내 기록</h2>
              <Link href="/mypage" className="text-sm font-bold text-teal-700 hover:underline">마이페이지</Link>
            </div>
            {!summary ? <p className="mt-3 text-sm text-slate-500">기록을 불러오지 못했습니다.</p> : (
              <dl className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4 xl:grid-cols-2">
                <SummaryStat label="출석" value={summary.presentLike} />
                <SummaryStat label="지각" value={summary.counts.late} tone={summary.counts.late ? 'amber' : ''} />
                <SummaryStat label="무단결석" value={summary.counts.unauthorized} tone={summary.counts.unauthorized ? 'red' : ''} />
                <SummaryStat label="미납 벌금" value={`₩${summary.fines.unpaidTotal.toLocaleString()}`} tone={summary.fines.unpaidTotal ? 'red' : ''} />
              </dl>
            )}
            {records?.ambiguousName && <p className="mt-2 text-xs text-slate-500">이름이 같은 학회원이 있어, 학회원 연결이 안 된 예전 기록 일부는 빠졌을 수 있습니다.</p>}
          </section>

          <section aria-labelledby="calendar-title" className="rounded-lg border border-slate-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="calendar-title" className="flex items-center gap-1.5 text-base font-bold text-slate-900"><CalendarDays className="h-4 w-4 text-teal-700" aria-hidden="true" />{year}년 {monthIndex + 1}월</h2>
              <div className="flex gap-1">
                <button type="button" onClick={() => setMonth(new Date(year, monthIndex - 1, 1))} className="grid h-8 w-8 place-items-center rounded-md hover:bg-slate-100" aria-label="이전 달"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
                <button type="button" onClick={() => setMonth(new Date(year, monthIndex + 1, 1))} className="grid h-8 w-8 place-items-center rounded-md hover:bg-slate-100" aria-label="다음 달"><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
              </div>
            </div>
            {scheduleError && <Notice tone="danger" className="mb-2">일정을 불러오지 못했습니다.</Notice>}
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {WEEKDAYS.map((day, index) => <div key={day} className={`py-1 font-bold ${index === 0 ? 'text-red-500' : index === 6 ? 'text-teal-700' : 'text-slate-500'}`}>{day}</div>)}
              {Array.from({ length: firstDay }, (_, index) => <div key={`blank-${index}`} />)}
              {Array.from({ length: daysInMonth }, (_, index) => {
                const day = index + 1
                const dateStr = `${monthKey}-${String(day).padStart(2, '0')}`
                const has = schedules.some((row) => row.full_date === dateStr)
                return <div key={day} className={`grid h-8 place-items-center rounded font-semibold ${dateStr === today ? 'bg-slate-900 text-white' : has ? 'bg-teal-50 text-teal-900 ring-1 ring-inset ring-teal-200' : 'text-slate-600'}`}>{day}</div>
              })}
            </div>
            <ul className="mt-3 divide-y divide-slate-100">
              {monthEvents.length === 0 ? <li className="py-4 text-center text-sm text-slate-500">이달의 일정이 없습니다.</li> : monthEvents.map((row) => (
                <li key={row.id} className="flex gap-3 py-2.5">
                  <span className="w-16 shrink-0 text-xs font-bold text-slate-600">{formatKstDate(row.full_date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-bold ${row.is_break ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{row.title}</span>
                    <span className="block text-xs text-slate-500">{scheduleTimeLabel(row)}{!row.is_public ? ' · 내부 일정' : ''}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </MemberPage>
  )
}

function SummaryStat({ label, value, tone = '' }) {
  const color = tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-700' : 'text-slate-900'
  return (
    <div className="rounded-md bg-slate-50 px-2 py-2.5">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className={`text-lg font-extrabold ${color}`}>{value}</dd>
    </div>
  )
}
