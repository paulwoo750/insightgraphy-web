'use client'
// 기획서 제출: 파일(PDF 권장)을 올리고 조원 기획서에 피드백 댓글을 남긴다
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, FileUp, Pencil, Send, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { deleteSubmittedFile } from '@/lib/archive'
import { currentSemesterIdFilter, displayTopic, fetchCurrentSemester, formatKst, groupDeadlines, memberGroup, nearestDeadlineWeek, submissionTopic } from '@/lib/semester'
import { MemberHeader, MemberPage, useMember } from '@/app/components/MemberShell'
import WeekOverviewCard from '@/app/components/WeekOverviewCard'
import FileThumbnail from '@/app/components/FileThumbnail'
import { Button, ErrorState, Field, LoadingState, Modal, StatusBadge, textareaClass, useAsyncAction, useToast } from '@/app/components/ui'
import { RenameDialog, SubmissionList, useWeekSelection, WeekSelector } from '../_components/shared'

const MAX_UPLOAD_BYTES = 30 * 1024 * 1024
const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'hwp', 'hwpx', 'ppt', 'pptx']

export default function ProposalRoom() {
  const router = useRouter()
  const identity = useMember()
  const toast = useToast()
  const [run, busy] = useAsyncAction()
  const fileInput = useRef(null)
  const [state, setState] = useState({ status: 'loading', error: '' })
  const [semester, setSemester] = useState(null)
  const [deadlineRows, setDeadlineRows] = useState([])
  const [files, setFiles] = useState([])
  const [renaming, setRenaming] = useState(null)
  const [viewing, setViewing] = useState(null)

  const name = identity.member?.name || identity.session?.user?.user_metadata?.name || ''

  const fetchFiles = useCallback(async (code) => {
    const { data, error } = await supabase.from('files_metadata').select('*').in('file_category', ['proposal', 'plan']).eq('semester', code).eq('is_archive', false).order('created_at', { ascending: false })
    if (error) throw error
    setFiles(data || [])
  }, [])

  useEffect(() => {
    if (identity.status !== 'ready') return undefined
    if (!identity.session) {
      router.replace('/login?next=%2Fdashboard%2Fproposal')
      return undefined
    }
    let active = true
    async function load() {
      try {
        const current = await fetchCurrentSemester()
        const { data, error } = await supabase.from('pr_deadlines').select('*').or(currentSemesterIdFilter(current)).in('category', ['proposal', 'proposal_comment'])
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
  const selection = useWeekSelection({ ready: state.status === 'ready', totalWeeks: semester?.totalWeeks || 0, defaultWeek: nearestDeadlineWeek(deadlineRows, 'proposal'), allowWeekday: false })
  const week = selection.week ?? 0
  const setup = semester?.weeklySetup?.[week] || {}
  const team = setup.evalMode === 'team' ? (setup.memberTeams || setup.members || {})[name] : null
  const filesThisWeek = files.filter((file) => file.week === week)

  async function upload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      toast.error(`올릴 수 없는 형식입니다 (${ALLOWED_EXTENSIONS.join(', ')}). 미리보기를 위해 PDF를 권장합니다.`)
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error('30MB 이하 파일만 올릴 수 있습니다.')
      return
    }
    await run(async () => {
      const storagePath = `dashboard/proposal/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: uploadError } = await supabase.storage.from('ig-files').upload(storagePath, file)
      if (uploadError) {
        toast.error(`파일을 올리지 못했습니다: ${uploadError.message}. 다시 시도하세요.`)
        return
      }
      const { data: { publicUrl } } = supabase.storage.from('ig-files').getPublicUrl(storagePath)
      const deadline = deadlines[week]?.proposal
      const isLate = deadline ? Date.now() > new Date(deadline).getTime() : false
      const { error: dbError } = await supabase.from('files_metadata').insert([{
        file_name: `${week}W (${submissionTopic(semester.weekTopics, week)}) ${name}.${ext}`,
        file_url: publicUrl,
        week,
        file_category: 'proposal',
        is_archive: false,
        uploader: name,
        uploader_member_id: identity.member?.id || null,
        storage_path: storagePath,
        semester: semester.code,
        semester_id: semester.id || null,
        is_late: isLate,
        group_id: memberGroup(semester.weeklySetup, week, name),
      }])
      if (dbError) {
        // 기록이 안 남았으면 올린 파일도 지워 고아 파일을 남기지 않는다
        await supabase.storage.from('ig-files').remove([storagePath])
        toast.error(`제출 기록을 남기지 못했습니다: ${dbError.message}. 다시 시도하세요.`)
        return
      }
      toast.success(isLate ? '제출했습니다. 마감 이후라 지각으로 기록됩니다.' : '기획서를 제출했습니다.')
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
    if (!confirm(`'${file.file_name}'을 지울까요? 올린 파일과 제출 기록이 함께 삭제됩니다.`)) return
    await run(async () => {
      const { error, storageError } = await deleteSubmittedFile(file)
      if (error) {
        toast.error(`삭제하지 못했습니다: ${error.message}`)
        return
      }
      if (storageError) toast.warning('제출 기록은 지웠지만 올린 파일을 지우지 못했습니다. 운영진에게 알려 주세요.')
      else toast.success('기획서를 지웠습니다.')
      await fetchFiles(semester.code)
    })
  }

  if (identity.status !== 'ready' || state.status === 'loading' || selection.week === null) return <MemberPage><LoadingState /></MemberPage>
  if (state.status === 'error') return <MemberPage><ErrorState title="기획서 자료실을 불러오지 못했습니다." description={state.error} onRetry={() => window.location.reload()} /></MemberPage>

  const weeks = Array.from({ length: semester.totalWeeks + 1 }, (_, index) => index)
  const group = memberGroup(semester.weeklySetup, week, name)

  return (
    <MemberPage>
      <MemberHeader eyebrow="주차별 자료실" title="기획서 제출" description="주차별 기획서를 올리고 조원 기획서에 피드백을 남깁니다." />
      <WeekSelector weeks={weeks} week={week} onChange={selection.setWeek} session="regular" weekTopics={semester.weekTopics} />

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <WeekOverviewCard
          semesterName={semester.name}
          week={week}
          topic={displayTopic(semester.weekTopics, week)}
          cancelled={semester.weeks?.[week]?.status === 'cancelled'}
          attendance={{ open: deadlines[week]?.attendance_start, late: deadlines[week]?.session_start, end: deadlines[week]?.attendance_end }}
          groupLabel={team ? `${team}팀` : group ? `${group}조` : ''}
          deadlines={[{ key: 'proposal', at: deadlines[week]?.proposal }, { key: 'proposal_comment', at: deadlines[week]?.proposal_comment }]}
        />
        <div className="space-y-3 rounded-lg border border-slate-200 p-4">
          <h2 className="text-base font-bold text-slate-900">W{week} 기획서 제출</h2>
          <p className="text-sm leading-6 text-slate-600">PDF로 올리면 조원들이 첫 페이지 미리보기와 함께 바로 읽을 수 있습니다. 30MB 이하.</p>
          <input ref={fileInput} type="file" accept=".pdf,.doc,.docx,.hwp,.hwpx,.ppt,.pptx" onChange={upload} className="sr-only" id="proposal-upload" />
          <Button variant="primary" icon={FileUp} className="w-full" loading={busy} onClick={() => fileInput.current?.click()}>파일 골라 제출</Button>
          <p className="text-xs text-slate-500">마감 {deadlines[week]?.proposal ? formatKst(deadlines[week].proposal) : '미정'} · 마감 이후 제출은 지각으로 기록됩니다.</p>
        </div>
      </div>

      <section className="mt-8" aria-label={`W${week} 제출 목록`}>
        <SubmissionList files={filesThisWeek} weeklySetup={semester.weeklySetup} week={week} owner={{ member: identity.member, name, team }} admin={identity.admin} onEdit={setRenaming} onDelete={remove} onOpen={setViewing} aspect="portrait" />
      </section>

      {renaming && <RenameDialog file={renaming} onClose={() => setRenaming(null)} onSave={rename} saving={busy} />}
      {viewing && <ProposalViewer file={viewing} deadline={deadlines[viewing.week]?.proposal_comment} identity={identity} onClose={() => setViewing(null)} />}
    </MemberPage>
  )
}

function ProposalViewer({ file, deadline, identity, onClose }) {
  const toast = useToast()
  const [run, busy] = useAsyncAction()
  const [comments, setComments] = useState([])
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(null)
  const userId = identity.session?.user?.id
  const name = identity.member?.name || identity.session?.user?.user_metadata?.name || '익명'
  const isPdf = /\.pdf($|\?)/i.test(file.storage_path || file.file_url)

  const loadComments = useCallback(async () => {
    const { data, error } = await supabase.from('file_comments').select('*').eq('file_id', file.id).order('created_at', { ascending: true })
    if (error) toast.error(`피드백을 불러오지 못했습니다: ${error.message}`)
    setComments(data || [])
  }, [file.id, toast])

  useEffect(() => {
    const timer = setTimeout(loadComments, 0)
    return () => clearTimeout(timer)
  }, [loadComments])

  async function add() {
    if (!draft.trim()) return
    await run(async () => {
      const { error } = await supabase.from('file_comments').insert([{ file_id: file.id, user_id: userId, user_name: name, member_id: identity.member?.id || null, comment_text: draft.trim() }])
      if (error) {
        toast.error(`피드백을 남기지 못했습니다: ${error.message}`)
        return
      }
      setDraft('')
      await loadComments()
    })
  }

  async function saveEdit() {
    await run(async () => {
      const { error } = await supabase.from('file_comments').update({ comment_text: editing.text }).eq('id', editing.id)
      if (error) {
        toast.error(`수정하지 못했습니다: ${error.message}`)
        return
      }
      setEditing(null)
      await loadComments()
    })
  }

  async function removeComment(comment) {
    if (!confirm('이 피드백을 지울까요?')) return
    await run(async () => {
      const { error } = await supabase.from('file_comments').delete().eq('id', comment.id)
      if (error) toast.error(`지우지 못했습니다: ${error.message}`)
      await loadComments()
    })
  }

  return (
    <Modal title={file.file_name} description={`${file.uploader} · ${formatKst(file.created_at)}${deadline ? ` · 피드백 마감 ${formatKst(deadline)}` : ''}`} onClose={onClose} size="xl">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <div className="min-h-[50vh] border-b border-slate-200 bg-slate-50 lg:border-b-0 lg:border-r">
          {isPdf ? (
            <iframe title={`${file.file_name} 미리보기`} src={file.file_url} className="h-[70vh] w-full border-0" />
          ) : (
            <div className="p-5">
              <FileThumbnail url={file.file_url} storagePath={file.storage_path} title={file.file_name} aspect="portrait" />
              <Button className="mt-3" href={file.file_url} target="_blank" icon={ExternalLink}>원본 파일 열기</Button>
            </div>
          )}
        </div>
        <div className="flex max-h-[70vh] flex-col">
          <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
            {comments.length === 0 ? <li className="px-4 py-10 text-center text-sm text-slate-500">아직 피드백이 없습니다.</li> : comments.map((comment) => {
              const mine = comment.user_id === userId
              const late = deadline && new Date(comment.created_at) > new Date(deadline)
              return (
                <li key={comment.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-teal-800">{comment.user_name}</span>
                    {late && <StatusBadge tone="red">지각</StatusBadge>}
                    <span className="text-xs text-slate-500">{formatKst(comment.created_at)}</span>
                    {mine && editing?.id !== comment.id && (
                      <span className="ml-auto flex gap-1">
                        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing({ id: comment.id, text: comment.comment_text || '' })}>수정</Button>
                        <Button size="sm" variant="ghost" icon={Trash2} onClick={() => removeComment(comment)}>삭제</Button>
                      </span>
                    )}
                  </div>
                  {editing?.id === comment.id ? (
                    <div className="mt-2 space-y-2">
                      <textarea aria-label="피드백 수정" value={editing.text} onChange={(event) => setEditing({ ...editing, text: event.target.value })} className={textareaClass} />
                      <div className="flex gap-2"><Button size="sm" variant="primary" onClick={saveEdit} loading={busy}>저장</Button><Button size="sm" onClick={() => setEditing(null)}>취소</Button></div>
                    </div>
                  ) : <p className="mt-1 whitespace-pre-wrap break-keep text-sm leading-6 text-slate-700">{comment.comment_text}</p>}
                </li>
              )
            })}
          </ul>
          <div className="border-t border-slate-200 p-4">
            <Field label="피드백 남기기" htmlFor="proposal-comment">
              <textarea id="proposal-comment" value={draft} onChange={(event) => setDraft(event.target.value)} className={`${textareaClass} min-h-20`} placeholder="좋았던 점과 고칠 점을 구체적으로 적어 주세요." />
            </Field>
            <Button className="mt-2 w-full" variant="primary" icon={Send} onClick={add} loading={busy} disabled={!draft.trim()}>등록</Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
