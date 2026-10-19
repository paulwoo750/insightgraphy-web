'use client'
// 슬라이드 제출: 구글 드라이브(슬라이드) 공유 링크를 주차별로 제출하고 조별로 확인한다
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, Link2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { currentSemesterIdFilter, displayTopic, fetchCurrentSemester, formatKst, fromKstInput, groupDeadlines, memberGroup, nearestDeadlineWeek, submissionTopic } from '@/lib/semester'
import { MemberHeader, MemberPage, useMember } from '@/app/components/MemberShell'
import WeekOverviewCard from '@/app/components/WeekOverviewCard'
import { Button, ErrorState, Field, inputClass, LoadingState, useAsyncAction, useToast } from '@/app/components/ui'
import { RenameDialog, SubmissionList, useWeekSelection, WeekSelector } from '../_components/shared'

const GOOGLE_DRIVE_FOLDER_URL = 'https://drive.google.com/drive/folders/1F-YFI422wyYQxd0lBeJ9boaNDlr0iwFJ'

export default function SlideRoom() {
  const router = useRouter()
  const identity = useMember()
  const toast = useToast()
  const [run, submitting] = useAsyncAction()
  const [state, setState] = useState({ status: 'loading', error: '' })
  const [semester, setSemester] = useState(null)
  const [deadlineRows, setDeadlineRows] = useState([])
  const [files, setFiles] = useState([])
  const [driveLink, setDriveLink] = useState('')
  const [renaming, setRenaming] = useState(null)

  const name = identity.member?.name || identity.session?.user?.user_metadata?.name || ''

  const fetchFiles = useCallback(async (code) => {
    const { data, error } = await supabase.from('files_metadata').select('*').in('file_category', ['slide', 'weekday_slide']).eq('semester', code).eq('is_archive', false).order('created_at', { ascending: false })
    if (error) throw error
    setFiles(data || [])
  }, [])

  useEffect(() => {
    if (identity.status !== 'ready') return undefined
    if (!identity.session) {
      router.replace('/login?next=%2Fdashboard%2Fslide')
      return undefined
    }
    let active = true
    async function load() {
      try {
        const current = await fetchCurrentSemester()
        const { data, error } = await supabase.from('pr_deadlines').select('*').or(currentSemesterIdFilter(current)).in('category', ['slide', 'weekday_upload'])
        if (error) throw error
        await fetchFiles(current.code)
        if (!active) return
        setSemester(current)
        setDeadlineRows(data || [])
        setState({ status: 'ready', error: '' })
      } catch (error) {
        if (active) setState({ status: 'error', error: error.message })
      }
    }
    load()
    return () => {
      active = false
    }
  }, [identity.status, identity.session, router, fetchFiles])

  const deadlines = useMemo(() => groupDeadlines(deadlineRows), [deadlineRows])
  const selection = useWeekSelection({
    ready: state.status === 'ready',
    totalWeeks: semester?.totalWeeks || 0,
    defaultWeek: nearestDeadlineWeek(deadlineRows, 'slide'),
    allowWeekday: semester?.type === 'vacation',
  })
  const week = selection.week ?? 0
  const mode = selection.session

  // 평일세션: 내가 배정된 조의 마감(없으면 진행일 자정), 정규: 슬라이드 마감
  const myWeekdayTeam = semester ? (() => {
    const group = memberGroup(semester.weeklySetup, week, name, 'weekday')
    return group ? { group, ...(semester.weeklySetup[week]?.weekday?.[group] || {}) } : null
  })() : null
  const activeDeadline = mode === 'weekday'
    ? (myWeekdayTeam?.slideDl ? fromKstInput(myWeekdayTeam.slideDl) : myWeekdayTeam?.date ? fromKstInput(`${myWeekdayTeam.date}T23:59`) : null)
    : deadlines[week]?.slide || null
  const setup = semester?.weeklySetup?.[week] || {}
  const team = setup.evalMode === 'team' ? (setup.memberTeams || setup.members || {})[name] : null
  const fileCategory = mode === 'weekday' ? 'weekday_slide' : 'slide'
  const filesThisWeek = files.filter((file) => file.week === week && (file.file_category || 'slide') === fileCategory)

  async function submit(event) {
    event.preventDefault()
    const link = driveLink.trim()
    if (!link) {
      toast.error('구글 드라이브·슬라이드 공유 링크를 입력하세요.')
      return
    }
    if (!/^https:\/\/(drive|docs)\.google\.com\//.test(link)) {
      toast.error('구글 드라이브 또는 구글 슬라이드 공유 링크만 제출할 수 있습니다.')
      return
    }
    await run(async () => {
      const topic = submissionTopic(semester.weekTopics, week, mode)
      const isLate = activeDeadline ? Date.now() > new Date(activeDeadline).getTime() : false
      const { error } = await supabase.from('files_metadata').insert([{
        file_name: `${week}W${mode === 'weekday' ? ' [평일세션]' : ''} (${topic}) ${name} 발표자료`,
        file_url: link,
        week,
        file_category: fileCategory,
        is_archive: false,
        uploader: name,
        uploader_member_id: identity.member?.id || null,
        storage_path: 'google_drive_link',
        semester: semester.code,
        semester_id: semester.id || null,
        is_late: isLate,
        group_id: memberGroup(semester.weeklySetup, week, name, mode),
      }])
      if (error) {
        toast.error(`제출하지 못했습니다: ${error.message}`)
        return
      }
      toast.success(isLate ? '제출했습니다. 마감 이후라 지각으로 기록됩니다.' : '슬라이드를 제출했습니다.')
      setDriveLink('')
      await fetchFiles(semester.code)
    })
  }

  async function rename(value) {
    await run(async () => {
      const { error } = await supabase.from('files_metadata').update({ file_name: value }).eq('id', renaming.id)
      if (error) {
        toast.error(`이름을 바꾸지 못했습니다: ${error.message}`)
        return
      }
      toast.success('파일 이름을 바꿨습니다.')
      setRenaming(null)
      await fetchFiles(semester.code)
    })
  }

  async function remove(file) {
    if (!confirm(`'${file.file_name}' 제출 기록을 지울까요?\n드라이브의 원본 파일은 지워지지 않습니다.`)) return
    await run(async () => {
      const { data, error } = await supabase.from('files_metadata').delete().eq('id', file.id).select('id')
      if (error || !data?.length) {
        toast.error(`삭제하지 못했습니다${error ? `: ${error.message}` : ' (권한이 없거나 이미 삭제됨)'}`)
        return
      }
      toast.success('제출 기록을 지웠습니다.')
      await fetchFiles(semester.code)
    })
  }

  if (identity.status !== 'ready' || state.status === 'loading' || selection.week === null) return <MemberPage><LoadingState /></MemberPage>
  if (state.status === 'error') return <MemberPage><ErrorState title="슬라이드 자료실을 불러오지 못했습니다." description={state.error} onRetry={() => window.location.reload()} /></MemberPage>

  const weeks = Array.from({ length: semester.totalWeeks + 1 }, (_, index) => index)
  const topic = displayTopic(semester.weekTopics, week, mode)

  return (
    <MemberPage>
      <MemberHeader eyebrow="주차별 자료실" title="슬라이드 제출" description="주차별 발표 슬라이드 링크를 제출하고 조원들의 슬라이드를 미리 봅니다." actions={<Button href={GOOGLE_DRIVE_FOLDER_URL} target="_blank" icon={ExternalLink}>공유 드라이브 열기</Button>} />
      <WeekSelector weeks={weeks} week={week} onChange={selection.setWeek} session={mode} onSession={selection.setSession} allowWeekday={semester.type === 'vacation'} weekTopics={semester.weekTopics} />

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <WeekOverviewCard
          semesterName={semester.name}
          week={week}
          sessionMode={mode}
          topic={topic}
          cancelled={semester.weeks?.[week]?.status === 'cancelled'}
          scheduleDate={mode === 'weekday' ? myWeekdayTeam?.date : undefined}
          attendance={mode === 'weekday' ? {} : { open: deadlines[week]?.attendance_start, late: deadlines[week]?.session_start, end: deadlines[week]?.attendance_end }}
          groupLabel={mode === 'weekday' ? (myWeekdayTeam ? `평일 ${myWeekdayTeam.group}조` : '') : team ? `${team}팀` : memberGroup(semester.weeklySetup, week, name) ? `${memberGroup(semester.weeklySetup, week, name)}조` : ''}
          deadlines={[{ key: 'slide', label: mode === 'weekday' ? '평일 발표자료 마감' : '슬라이드 제출', at: activeDeadline }]}
        />
        <form onSubmit={submit} className="space-y-3 rounded-lg border border-slate-200 p-4">
          <h2 className="text-base font-bold text-slate-900">W{week} 슬라이드 제출</h2>
          <Field label="공유 링크" htmlFor="slide-link" hint={`파일 이름은 자동으로 "${week}W (${submissionTopic(semester.weekTopics, week, mode)}) ${name} 발표자료"가 됩니다. 마감 ${activeDeadline ? formatKst(activeDeadline) : '미정'}`}>
            <input id="slide-link" value={driveLink} onChange={(event) => setDriveLink(event.target.value)} placeholder="https://docs.google.com/presentation/…" className={inputClass} />
          </Field>
          <Button type="submit" variant="primary" icon={Link2} className="w-full" loading={submitting}>제출</Button>
          <p className="text-xs leading-5 text-slate-500">미리보기는 링크 공유가 켜진 파일만 첫 장이 보입니다. 공유를 바꾸지 않아도 제출은 됩니다.</p>
        </form>
      </div>

      <section className="mt-8" aria-label={`W${week} 제출 목록`}>
        <SubmissionList
          files={filesThisWeek}
          weeklySetup={semester.weeklySetup}
          week={week}
          session={mode}
          owner={{ member: identity.member, name, team }}
          admin={identity.admin}
          onEdit={setRenaming}
          onDelete={remove}
        />
      </section>
      {renaming && <RenameDialog file={renaming} onClose={() => setRenaming(null)} onSave={rename} saving={submitting} />}
    </MemberPage>
  )
}
