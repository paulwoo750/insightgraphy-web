'use client'
// 사유서 게시판: 이번 학기 사유서를 공개 제출하고 모두의 결재 내역을 확인한다
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ExternalLink, Link2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { currentSemesterIdFilter, fetchCurrentSemester, formatKst } from '@/lib/semester'
import { MemberHeader, MemberPage, useMember } from '@/app/components/MemberShell'
import { Button, ErrorState, Field, inputClass, LoadingState, SegmentedControl, StatusBadge, textareaClass, useAsyncAction, useToast } from '@/app/components/ui'

const GOOGLE_DRIVE_FOLDER_URL = 'https://drive.google.com/drive/folders/1kXKB1l3O9vIhCjdhINzRic_Gn6IKtZlw'
const EMPTY_FORM = { week: 1, date: '', type: '결석', time: '', reason: '', proofUrl: '', sessionType: 'regular' }

function statusTone(status) {
  if (!status || status === '대기') return 'gray'
  if (status.includes('완전인정')) return 'green'
  if (status.includes('부분인정')) return 'teal'
  return 'red'
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
  const [selectedFolder, setSelectedFolder] = useState('all')
  const [absenceForm, setAbsenceForm] = useState(EMPTY_FORM)
  const [now, setNow] = useState(() => Date.now())

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
        // 기본 주차: 실제 세션 날짜 기준 현재 주차
        const targetWeek = current.currentWeek || 1
        await fetchAbsences(current)
        if (!active) return
        setSemester(current)
        setRegularDlMap(regular)
        setWeekdayDlMap(weekday)
        setAbsenceForm((prev) => ({ ...prev, week: Math.min(targetWeek, current.totalWeeks) }))
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

  const isWeekday = absenceForm.sessionType === 'weekday'
  const activeDeadline = (isWeekday ? weekdayDlMap : regularDlMap)[absenceForm.week] || null
  const activeIsLate = activeDeadline ? now > new Date(activeDeadline).getTime() : false

  function submit(event) {
    event.preventDefault()
    if (!absenceForm.date || !absenceForm.reason.trim()) {
      toast.error('날짜와 사유를 입력하세요.')
      return
    }
    if (absenceForm.type !== '결석' && !absenceForm.time) {
      toast.error('지각·조퇴는 예상 시간을 입력하세요.')
      return
    }
    const proof = absenceForm.proofUrl.trim()
    if (proof && !proof.includes('drive.google.com') && !proof.includes('docs.google.com')) {
      toast.error('증빙 자료는 구글 드라이브 링크로 제출하세요.')
      return
    }
    if (activeIsLate && !confirm('사유서 마감이 지났습니다. 지각 제출로 기록됩니다. 계속할까요?')) return
    run(async () => {
      const fullReason = absenceForm.type !== '결석' ? `[${absenceForm.time}] ${absenceForm.reason.trim()}` : absenceForm.reason.trim()
      const { error } = await supabase.from('absence_forms').insert([{
        user_name: myName,
        member_id: identity.member?.id || null,
        semester_id: semester.id || null,
        week: absenceForm.week,
        target_date: absenceForm.date,
        type: absenceForm.type,
        reason: fullReason,
        proof_url: proof,
        status: '대기',
        session_type: absenceForm.sessionType || 'regular',
      }])
      if (error) {
        toast.error(`제출하지 못했습니다: ${error.message}`)
        return
      }
      toast.success('사유서를 제출했습니다. 게시판에 등록되었습니다.')
      setAbsenceForm((prev) => ({ ...prev, date: '', time: '', reason: '', proofUrl: '' }))
      try {
        await fetchAbsences(semester)
      } catch (loadError) {
        toast.error(`목록을 새로 불러오지 못했습니다: ${loadError.message}`)
      }
    })
  }

  if (identity.status !== 'ready' || state.status === 'loading') return <MemberPage><LoadingState label="사유서 게시판을 불러오는 중입니다." /></MemberPage>
  if (state.status === 'error') return <MemberPage><ErrorState title="사유서 게시판을 불러오지 못했습니다." description={state.error} onRetry={() => window.location.reload()} /></MemberPage>

  const weeks = Array.from({ length: semester.totalWeeks + 1 }, (_, index) => index)
  const myAbsences = allAbsences.filter(isMine)
  const myStats = [
    { label: '총 제출', value: myAbsences.length, tone: 'text-slate-900' },
    { label: '완전 인정', value: myAbsences.filter((row) => row.status?.includes('완전인정')).length, tone: 'text-emerald-700' },
    { label: '부분 인정', value: myAbsences.filter((row) => row.status?.includes('부분인정')).length, tone: 'text-teal-700' },
    { label: '불허', value: myAbsences.filter((row) => row.status?.includes('불허')).length, tone: 'text-red-700' },
    { label: '결재 대기', value: myAbsences.filter((row) => !row.status || row.status === '대기').length, tone: 'text-amber-700' },
  ]
  const filteredAbsences = allAbsences.filter((row) => {
    if (selectedFolder === 'all') return true
    if (selectedFolder === 'none') return row.week === null || row.week === undefined
    return row.week === selectedFolder
  })
  const hasUnassigned = allAbsences.some((row) => row.week === null || row.week === undefined)
  const folderButton = (value, label) => (
    <button key={String(value)} type="button" aria-pressed={selectedFolder === value} onClick={() => setSelectedFolder(value)} className={`min-h-9 shrink-0 rounded-md border px-3 text-sm font-bold ${selectedFolder === value ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-teal-400'}`}>{label}</button>
  )

  return (
    <MemberPage>
      <MemberHeader
        eyebrow="아카이브"
        title="사유서 게시판"
        description="결석·지각·조퇴 사유서를 제출하고, 이번 학기 모두의 결재 내역을 확인합니다. 지난 학기 사유서는 과거 자료실에서 볼 수 있습니다."
        actions={<Button href="/archive" icon={ArrowLeft}>자료실로</Button>}
      />

      <section aria-labelledby="my-absence-stats" className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
        <h2 id="my-absence-stats" className="text-base font-bold text-slate-900">내 사유서 결재 현황 <span className="text-sm font-semibold text-slate-500">· {semester.name}</span></h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {myStats.map((stat) => (
            <div key={stat.label} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2.5">
              <dt className="text-xs font-semibold text-slate-500">{stat.label}</dt>
              <dd className={`text-xl font-extrabold ${stat.tone}`}>{stat.value}건</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section aria-labelledby="absence-board" className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
          <h2 id="absence-board" className="text-base font-bold text-slate-900">전체 사유서</h2>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-2" role="group" aria-label="주차별 보기">
            {folderButton('all', '전체')}
            {weeks.map((week) => folderButton(week, `W${week}`))}
            {hasUnassigned && folderButton('none', '주차 미지정')}
          </div>

          {filteredAbsences.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-slate-300 px-4 py-12 text-center text-sm text-slate-500">이 주차에 제출된 사유서가 없습니다.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {filteredAbsences.map((row) => {
                const mine = isMine(row)
                const isPartial = row.status?.includes('부분인정')
                return (
                  <li key={row.id} className={`rounded-lg border p-4 ${mine ? 'border-teal-200 bg-teal-50/40' : 'border-slate-200 bg-white'}`}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge tone={statusTone(row.status)}>{!row.status || row.status === '대기' ? '결재 대기' : row.status}</StatusBadge>
                      <StatusBadge tone="teal">W{row.week ?? '?'}</StatusBadge>
                      {row.session_type === 'weekday' && <StatusBadge tone="blue">평일세션</StatusBadge>}
                      <StatusBadge tone="gray">{row.type}</StatusBadge>
                      {mine && <StatusBadge tone="teal">내 사유서</StatusBadge>}
                    </div>
                    <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="text-base font-bold text-slate-900">{row.user_name} <span className="text-sm font-semibold text-slate-500">· {row.target_date} 해당</span></p>
                      <p className="text-xs text-slate-500">제출 {formatKst(row.created_at)}</p>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{row.reason}</p>
                    {row.proof_url && <Button size="sm" className="mt-3" href={row.proof_url} target="_blank" icon={ExternalLink}>증빙 자료 보기</Button>}
                    {row.status !== '대기' && row.admin_comment && (
                      <div className={`mt-3 rounded-md border p-3 ${isPartial ? 'border-teal-100 bg-teal-50' : 'border-slate-100 bg-slate-50'}`}>
                        <p className={`text-xs font-bold ${isPartial ? 'text-teal-700' : 'text-slate-500'}`}>{isPartial ? '대체 과제 및 안내 사항' : '운영진 결재 코멘트'}</p>
                        <p className={`mt-1 whitespace-pre-wrap text-sm leading-6 ${isPartial ? 'text-teal-800' : 'text-slate-700'}`}>{row.admin_comment}</p>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <div className={`rounded-lg border p-4 ${activeIsLate ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge tone="gray">{semester.name || '학기 미설정'}</StatusBadge>
              <StatusBadge tone={isWeekday ? 'blue' : 'teal'}>{isWeekday ? '평일세션' : '정규세션'}</StatusBadge>
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-600">W{absenceForm.week} 사유서 마감</p>
            {activeDeadline ? (
              <p className={`text-lg font-extrabold ${activeIsLate ? 'text-red-700' : 'text-emerald-700'}`}>{formatKst(activeDeadline, { weekday: true })}</p>
            ) : <p className="text-sm font-bold text-slate-500">마감 미설정</p>}
            {activeIsLate && <p className="mt-1 text-xs font-bold text-red-700">제출 기한이 지났습니다. 지금 제출하면 지각 제출로 기록됩니다.</p>}
          </div>

          <form onSubmit={submit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-base font-bold text-slate-900">새 사유서 작성</h2>
            {semester.type === 'vacation' && (
              <Field label="세션 유형" hint={isWeekday ? '조 내 일정 조정에 실패했을 때, 전주 일요일 자정까지 제출합니다.' : undefined}>
                <SegmentedControl label="세션 유형" value={absenceForm.sessionType} onChange={(value) => setAbsenceForm({ ...absenceForm, sessionType: value })} options={[{ value: 'regular', label: '정규세션' }, { value: 'weekday', label: '평일세션' }]} />
              </Field>
            )}
            <Field label="해당 주차" htmlFor="absence-week">
              <select id="absence-week" value={absenceForm.week} onChange={(event) => setAbsenceForm({ ...absenceForm, week: Number(event.target.value) })} className={inputClass}>
                {weeks.map((week) => <option key={week} value={week}>{week}주차</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="날짜" htmlFor="absence-date" required>
                <input id="absence-date" type="date" value={absenceForm.date} onChange={(event) => setAbsenceForm({ ...absenceForm, date: event.target.value })} className={inputClass} />
              </Field>
              <Field label="구분" htmlFor="absence-type">
                <select id="absence-type" value={absenceForm.type} onChange={(event) => setAbsenceForm({ ...absenceForm, type: event.target.value })} className={inputClass}>
                  <option value="결석">결석</option>
                  <option value="지각">지각</option>
                  <option value="조퇴">조퇴</option>
                </select>
              </Field>
            </div>
            {absenceForm.type !== '결석' && (
              <Field label="예상 시간" htmlFor="absence-time" required>
                <input id="absence-time" type="time" value={absenceForm.time} onChange={(event) => setAbsenceForm({ ...absenceForm, time: event.target.value })} className={inputClass} />
              </Field>
            )}
            <Field label="상세 사유" htmlFor="absence-reason" required>
              <textarea id="absence-reason" value={absenceForm.reason} onChange={(event) => setAbsenceForm({ ...absenceForm, reason: event.target.value })} className={textareaClass} placeholder="구체적인 사유를 작성해 주세요." />
            </Field>
            <Field label="증빙 자료 링크 (선택)" htmlFor="absence-proof" hint="드라이브에 먼저 올린 뒤 공유 링크를 붙여 넣으세요.">
              <input id="absence-proof" value={absenceForm.proofUrl} onChange={(event) => setAbsenceForm({ ...absenceForm, proofUrl: event.target.value })} className={inputClass} placeholder="https://drive.google.com/…" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button href={GOOGLE_DRIVE_FOLDER_URL} target="_blank" icon={Link2}>증빙 드라이브 열기</Button>
              <Button type="submit" variant={activeIsLate ? 'danger' : 'primary'} loading={submitting} className="flex-1">{activeIsLate ? '지각 제출' : '게시판에 등록'}</Button>
            </div>
          </form>
        </aside>
      </div>
    </MemberPage>
  )
}
