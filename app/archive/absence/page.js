'use client'
// 사유서 게시판: 주차별 자료실처럼 주차를 고르고, 그 주차 사유서를 쓰고 모두의 결재 내역을 본다
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarClock, ExternalLink, Link2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { currentSemesterIdFilter, displayTopic, fetchCurrentSemester, formatKst } from '@/lib/semester'
import { MemberHeader, MemberPage, useMember } from '@/app/components/MemberShell'
import { Button, ErrorState, Field, inputClass, LoadingState, SegmentedControl, textareaClass, useAsyncAction, useToast } from '@/app/components/ui'
import { useWeekSelection, WeekSelector } from '@/app/dashboard/_components/shared'

const GOOGLE_DRIVE_FOLDER_URL = 'https://drive.google.com/drive/folders/1kXKB1l3O9vIhCjdhINzRic_Gn6IKtZlw'
const EMPTY_FORM = { date: '', type: '결석', time: '', reason: '', proofUrl: '' }

// 결재 상태 → 표시 이름과 색
function statusInfo(status) {
  if (!status || status === '대기') return { key: 'pending', label: '결재 대기', chip: 'bg-amber-100 text-amber-800', bar: 'border-amber-400' }
  if (status.includes('완전인정')) return { key: 'full', label: status, chip: 'bg-emerald-100 text-emerald-800', bar: 'border-emerald-500' }
  if (status.includes('부분인정')) return { key: 'partial', label: status, chip: 'bg-teal-100 text-teal-800', bar: 'border-teal-500' }
  return { key: 'denied', label: status, chip: 'bg-red-100 text-red-700', bar: 'border-red-400' }
}

const TYPE_CHIPS = { 결석: 'bg-slate-800 text-white', 지각: 'bg-amber-500 text-white', 조퇴: 'bg-sky-600 text-white' }

// 마감까지 남은 시간 (하루 안 = 빨강, 사흘 안 = 주황)
function deadlineChip(iso, now) {
  const diff = new Date(iso).getTime() - now
  if (Number.isNaN(diff)) return null
  if (diff < 0) return { text: '마감 지남', tone: 'bg-red-100 text-red-700' }
  const hours = Math.floor(diff / 3600000)
  if (hours < 24) return { text: `🔥 ${Math.max(1, hours)}시간 남음`, tone: 'bg-red-100 text-red-700' }
  const days = Math.floor(hours / 24)
  return { text: `D-${days}`, tone: days <= 3 ? 'bg-amber-100 text-amber-800' : 'bg-teal-100 text-teal-800' }
}

export default function AbsencePage() {
  const router = useRouter()
  const identity = useMember()
  const toast = useToast()
  const [run, submitting] = useAsyncAction()
  const [state, setState] = useState({ status: 'loading', error: '' })
  const [semester, setSemester] = useState(null)
  const [regularDlMap, setRegularDlMap] = useState({}) // { [week]: deadline_time } 정규세션 사유서 마감
  const [weekdayDlMap, setWeekdayDlMap] = useState({}) // { [week]: deadline_time } 평일세션 불참 사유서 마감
  const [allAbsences, setAllAbsences] = useState([])
  const [scope, setScope] = useState('week') // week | all | mine
  const [form, setForm] = useState(EMPTY_FORM)
  const [now, setNow] = useState(() => Date.now())
  const { week, session, setWeek, setSession } = useWeekSelection({
    ready: Boolean(semester),
    totalWeeks: semester?.totalWeeks || 0,
    defaultWeek: semester?.currentWeek || 1,
    allowWeekday: semester?.type === 'vacation',
  })

  async function fetchAbsences(current) {
    const { data, error } = await supabase.from('absence_forms').select('*').or(currentSemesterIdFilter(current)).order('created_at', { ascending: false })
    if (error) throw error
    setAllAbsences(data || [])
  }

  useEffect(() => {
    if (identity.status !== 'ready') return undefined
    if (!identity.session) {
      router.replace('/login?next=%2Farchive%2Fabsence')
      return undefined
    }
    let active = true
    async function load() {
      try {
        const current = await fetchCurrentSemester()
        const { data: dlData, error } = await supabase.from('pr_deadlines')
          .select('*')
          .or(currentSemesterIdFilter(current))
          .in('category', ['absence', 'weekday_absence'])
          .order('deadline_time', { ascending: true })
        if (error) throw error
        const regular = {}
        const weekday = {}
        ;(dlData || []).forEach((row) => {
          if (!row.deadline_time) return
          if (row.category === 'absence') regular[row.week] = row.deadline_time
          else weekday[row.week] = row.deadline_time
        })
        await fetchAbsences(current)
        if (!active) return
        setSemester(current)
        setRegularDlMap(regular)
        setWeekdayDlMap(weekday)
        setState({ status: 'ready', error: '' })
      } catch (error) {
        if (active) setState({ status: 'error', error: error.message })
      }
    }
    load()
    return () => { active = false }
  }, [identity.status, identity.session, router])

  // 마감 지남 표시를 1분마다 갱신한다
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60 * 1000)
    return () => clearInterval(timer)
  }, [])

  const myName = identity.member?.name || identity.session?.user?.user_metadata?.name || ''
  const isMine = (row) => (identity.member && row.member_id ? row.member_id === identity.member.id : Boolean(myName) && row.user_name === myName)

  const isWeekday = session === 'weekday'
  const activeDeadline = (isWeekday ? weekdayDlMap : regularDlMap)[week] || null
  const activeIsLate = activeDeadline ? now > new Date(activeDeadline).getTime() : false

  function submit(event) {
    event.preventDefault()
    if (!form.date || !form.reason.trim()) {
      toast.error('날짜와 사유를 입력하세요.')
      return
    }
    if (form.type !== '결석' && !form.time) {
      toast.error('지각·조퇴는 예상 시간을 입력하세요.')
      return
    }
    const proof = form.proofUrl.trim()
    if (proof && !proof.includes('drive.google.com') && !proof.includes('docs.google.com')) {
      toast.error('증빙 자료는 구글 드라이브 링크로 제출하세요.')
      return
    }
    if (activeIsLate && !confirm('사유서 마감이 지났습니다. 지각 제출로 기록됩니다. 계속할까요?')) return
    run(async () => {
      const fullReason = form.type !== '결석' ? `[${form.time}] ${form.reason.trim()}` : form.reason.trim()
      const { error } = await supabase.from('absence_forms').insert([{
        user_name: myName,
        member_id: identity.member?.id || null,
        semester_id: semester.id || null,
        week,
        target_date: form.date,
        type: form.type,
        reason: fullReason,
        proof_url: proof,
        status: '대기',
        session_type: session || 'regular',
      }])
      if (error) {
        toast.error(`제출하지 못했습니다: ${error.message}`)
        return
      }
      toast.success('사유서를 제출했습니다. 게시판에 등록되었습니다.')
      setForm(EMPTY_FORM)
      try {
        await fetchAbsences(semester)
      } catch (loadError) {
        toast.error(`목록을 새로 불러오지 못했습니다: ${loadError.message}`)
      }
    })
  }

  if (identity.status !== 'ready' || state.status === 'loading' || week == null) return <MemberPage><LoadingState label="사유서 게시판을 불러오는 중입니다." /></MemberPage>
  if (state.status === 'error') return <MemberPage><ErrorState title="사유서 게시판을 불러오지 못했습니다." description={state.error} onRetry={() => window.location.reload()} /></MemberPage>

  const weeks = Array.from({ length: semester.totalWeeks + 1 }, (_, index) => index)
  const myAbsences = allAbsences.filter(isMine)
  const myStats = [
    { label: '총 제출', value: myAbsences.length, tone: 'text-slate-900' },
    { label: '완전 인정', value: myAbsences.filter((row) => statusInfo(row.status).key === 'full').length, tone: 'text-emerald-700' },
    { label: '부분 인정', value: myAbsences.filter((row) => statusInfo(row.status).key === 'partial').length, tone: 'text-teal-700' },
    { label: '불허', value: myAbsences.filter((row) => statusInfo(row.status).key === 'denied').length, tone: 'text-red-700' },
    { label: '결재 대기', value: myAbsences.filter((row) => statusInfo(row.status).key === 'pending').length, tone: 'text-amber-700' },
  ]
  const rows = scope === 'mine' ? myAbsences : scope === 'all' ? allAbsences : allAbsences.filter((row) => row.week === week)
  const chip = activeDeadline ? deadlineChip(activeDeadline, now) : null
  const topic = displayTopic(semester.weekTopics, week, session)
  const listTitle = scope === 'mine' ? '내 사유서' : scope === 'all' ? '이번 학기 전체 사유서' : `W${week} 사유서`

  return (
    <MemberPage>
      <MemberHeader
        eyebrow="아카이브"
        title="사유서 게시판"
        description="결석·지각·조퇴 사유서를 주차별로 제출하고, 이번 학기 모두의 결재 내역을 확인합니다. 지난 학기 사유서는 과거 자료실에서 볼 수 있습니다."
        actions={<Button href="/archive" icon={ArrowLeft}>자료실로</Button>}
      />
      <WeekSelector weeks={weeks} week={week} onChange={setWeek} session={session} onSession={setSession} allowWeekday={semester.type === 'vacation'} weekTopics={semester.weekTopics} />

      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section aria-labelledby="week-absence" className="min-w-0">
          <div className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-3 text-white">
            <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
              <span className="rounded-lg bg-white/20 px-2 py-0.5 text-base font-black ring-1 ring-inset ring-white/30">W{week}</span>
              {semester.name} · {isWeekday ? '🏖️ 평일 세션' : week === 0 ? 'OT' : '🎤 정규 세션'}
            </p>
          </div>
          <div className="px-1 pt-4">
            <h2 id="week-absence" className="break-keep text-xl font-extrabold text-slate-950">{topic || <span className="text-slate-400">주제 미정</span>}</h2>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex items-center gap-1.5 text-sm font-bold text-slate-500"><CalendarClock className="h-4 w-4 text-amber-600" aria-hidden="true" />사유서 마감</span>
              {activeDeadline ? (
                <>
                  <span className={`text-base font-extrabold ${activeIsLate ? 'text-red-700' : 'text-slate-900'}`}>{formatKst(activeDeadline, { weekday: true })}</span>
                  {chip && <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${chip.tone}`}>{chip.text}</span>}
                </>
              ) : <span className="text-sm font-bold text-slate-400">마감 미설정</span>}
            </div>
            {activeIsLate && <p className="mt-1 text-sm font-semibold text-red-700">제출 기한이 지났습니다. 지금 제출하면 지각 제출로 기록됩니다.</p>}
            {isWeekday && <p className="mt-1 text-sm text-slate-500">평일세션 불참 사유서는 조 내 일정 조정에 실패했을 때, 전주 일요일 자정까지 제출합니다.</p>}

            <div className="mt-8 border-t-2 border-amber-400 pt-4">
              <h3 className="text-sm font-bold text-slate-900">내 결재 현황 <span className="font-semibold text-slate-400">· {semester.name}</span></h3>
              <dl className="mt-3 grid grid-cols-3 gap-x-4 gap-y-4 sm:grid-cols-5">
                {myStats.map((stat) => (
                  <div key={stat.label}>
                    <dt className="text-xs font-semibold text-slate-500">{stat.label}</dt>
                    <dd className={`text-2xl font-extrabold ${stat.tone}`}>{stat.value}<span className="ml-0.5 text-sm font-bold text-slate-400">건</span></dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        <form onSubmit={submit} className="space-y-4 rounded-2xl bg-amber-50/70 p-5" aria-labelledby="absence-form-title">
          <h2 id="absence-form-title" className="text-base font-bold text-slate-900">W{week} 사유서 작성 <span className="text-sm font-semibold text-slate-500">· {isWeekday ? '평일세션' : '정규세션'}</span></h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="날짜" htmlFor="absence-date" required>
              <input id="absence-date" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className={inputClass} />
            </Field>
            <Field label="구분" htmlFor="absence-type">
              <select id="absence-type" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} className={inputClass}>
                <option value="결석">결석</option>
                <option value="지각">지각</option>
                <option value="조퇴">조퇴</option>
              </select>
            </Field>
          </div>
          {form.type !== '결석' && (
            <Field label="예상 시간" htmlFor="absence-time" required>
              <input id="absence-time" type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} className={inputClass} />
            </Field>
          )}
          <Field label="상세 사유" htmlFor="absence-reason" required>
            <textarea id="absence-reason" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} className={textareaClass} placeholder="구체적인 사유를 작성해 주세요." />
          </Field>
          <Field label="증빙 자료 링크 (선택)" htmlFor="absence-proof" hint="드라이브에 먼저 올린 뒤 공유 링크를 붙여 넣으세요.">
            <input id="absence-proof" value={form.proofUrl} onChange={(event) => setForm({ ...form, proofUrl: event.target.value })} className={inputClass} placeholder="https://drive.google.com/…" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button href={GOOGLE_DRIVE_FOLDER_URL} target="_blank" icon={Link2}>증빙 드라이브</Button>
            <Button type="submit" variant={activeIsLate ? 'danger' : 'primary'} loading={submitting} className="flex-1">{activeIsLate ? '지각 제출' : '게시판에 등록'}</Button>
          </div>
        </form>
      </div>

      <section aria-labelledby="absence-board" className="mt-10">
        <div className="flex flex-col gap-3 border-b-2 border-teal-600 pb-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 id="absence-board" className="text-lg font-extrabold text-slate-900">{listTitle} <span className="text-sm font-bold text-slate-400">{rows.length}건</span></h2>
          <SegmentedControl label="보기" size="sm" value={scope} onChange={setScope} options={[{ value: 'week', label: `W${week}` }, { value: 'all', label: '전체 주차' }, { value: 'mine', label: '내 사유서' }]} />
        </div>
        {rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">{scope === 'week' ? '이 주차에 제출된 사유서가 없습니다.' : '제출된 사유서가 없습니다.'}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => <AbsenceRow key={row.id} row={row} mine={isMine(row)} showWeek={scope !== 'week'} />)}
          </ul>
        )}
      </section>
    </MemberPage>
  )
}

function AbsenceRow({ row, mine, showWeek }) {
  const info = statusInfo(row.status)
  const comment = row.status !== '대기' && row.admin_comment
  return (
    <li className={`grid gap-x-6 gap-y-2 py-5 sm:grid-cols-[150px_minmax(0,1fr)] ${mine ? 'bg-teal-50/40' : ''}`}>
      <div className="flex flex-wrap items-start gap-1.5 sm:flex-col sm:pl-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${info.chip}`}>{info.label}</span>
        <span className="flex flex-wrap gap-1.5">
          <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${TYPE_CHIPS[row.type] || 'bg-slate-500 text-white'}`}>{row.type}</span>
          {showWeek && <span className="rounded-md bg-teal-700 px-2 py-0.5 text-xs font-bold text-white">W{row.week ?? '?'}</span>}
          {row.session_type === 'weekday' && <span className="rounded-md bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">평일</span>}
        </span>
      </div>
      <div className="min-w-0 sm:pr-2">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-base font-extrabold text-slate-900">{row.user_name}</span>
          {mine && <span className="text-xs font-bold text-teal-700">나</span>}
          <span className="text-sm font-semibold text-slate-500">{row.target_date} 해당</span>
          <span className="ml-auto text-xs text-slate-400">제출 {formatKst(row.created_at)}</span>
        </p>
        <p className="mt-1.5 whitespace-pre-wrap break-keep text-[15px] leading-7 text-slate-700">{row.reason}</p>
        {row.proof_url && (
          <a href={row.proof_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-teal-700 hover:underline">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />증빙 자료 보기
          </a>
        )}
        {comment && (
          <div className={`mt-3 border-l-[3px] pl-3 ${info.bar}`}>
            <p className="text-xs font-bold text-slate-500">{info.key === 'partial' ? '대체 과제 및 안내 사항' : '운영진 코멘트'}</p>
            <p className="mt-0.5 whitespace-pre-wrap break-keep text-sm leading-6 text-slate-800">{row.admin_comment}</p>
          </div>
        )}
      </div>
    </li>
  )
}
