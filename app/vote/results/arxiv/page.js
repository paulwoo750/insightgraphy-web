'use client'
// 내 성장 기록: 내 발표 영상에 남은 셀프 피드백과 '읽음' 처리한 조원 피드백을 모아 본다
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { fetchCurrentSemester, formatKst, sortSemestersDesc } from '@/lib/semester'
import { MemberHeader, MemberPage, useMember } from '@/app/components/MemberShell'
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '@/app/components/ui'
import { FeedbackView } from '../../_components/Editorial'

export default function FeedbackArxiv() {
  const router = useRouter()
  const identity = useMember()
  const [state, setState] = useState({ status: 'loading', error: '' })
  const [presentations, setPresentations] = useState([])
  const [currentCode, setCurrentCode] = useState('')
  const [semesterNames, setSemesterNames] = useState({})
  const [selectedSemester, setSelectedSemester] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [feedback, setFeedback] = useState({ id: null, status: 'idle', error: '', self: [], peer: [], videoFound: false })
  const [retryKey, setRetryKey] = useState(0)

  const myName = identity.member?.name || identity.session?.user?.user_metadata?.name || ''

  useEffect(() => {
    if (identity.status !== 'ready') return undefined
    if (!identity.session) {
      router.replace('/login?next=%2Fvote%2Fresults%2Farxiv')
      return undefined
    }
    let active = true
    async function load() {
      try {
        const current = await fetchCurrentSemester()
        const [presentationRes, semesterRes] = await Promise.all([
          supabase.from('presentations').select('*').eq('presenter_name', myName).order('week', { ascending: false }),
          supabase.from('semesters').select('code, name'),
        ])
        if (presentationRes.error) throw presentationRes.error
        if (!active) return
        setPresentations(presentationRes.data || [])
        setCurrentCode(current.code)
        setSemesterNames(Object.fromEntries((semesterRes.data || []).map((row) => [row.code, row.name || row.code])))
        setState({ status: 'ready', error: '' })
      } catch (error) {
        if (active) setState({ status: 'error', error: error.message })
      }
    }
    load()
    return () => { active = false }
  }, [identity.status, identity.session, myName, router])

  const semesters = useMemo(() => {
    const codes = new Set(presentations.map((row) => row.semester).filter(Boolean))
    if (currentCode) codes.add(currentCode)
    return sortSemestersDesc([...codes])
  }, [presentations, currentCode])
  const semester = selectedSemester ?? (semesters.includes(currentCode) ? currentCode : semesters[0] || 'all')
  const filtered = useMemo(() => (semester === 'all' ? presentations : presentations.filter((row) => row.semester === semester)), [presentations, semester])
  const selected = filtered.find((row) => row.id === selectedId) || filtered[0] || null

  // 선택한 발표의 영상 댓글 (셀프 피드백 + 읽음 처리한 조원 피드백)
  useEffect(() => {
    if (!selected) return undefined
    let active = true
    async function loadFeedback() {
      setFeedback((prev) => ({ ...prev, id: selected.id, status: 'loading', error: '' }))
      try {
        let query = supabase.from('files_metadata').select('id').eq('week', selected.week).eq('file_category', 'video').order('created_at', { ascending: false }).limit(1)
        if (selected.semester) query = query.eq('semester', selected.semester)
        query = identity.member?.id
          ? query.or(`uploader_member_id.eq.${identity.member.id},uploader.eq."${selected.presenter_name}"`)
          : query.eq('uploader', selected.presenter_name)
        const { data: files, error } = await query
        if (error) throw error
        const fileId = files?.[0]?.id
        let comments = []
        if (fileId) {
          const { data, error: commentError } = await supabase.from('file_comments').select('*').eq('file_id', fileId).order('created_at', { ascending: true })
          if (commentError) throw commentError
          comments = data || []
        }
        if (!active) return
        setFeedback({
          id: selected.id,
          status: 'ready',
          error: '',
          videoFound: Boolean(fileId),
          self: comments.filter((row) => row.user_name === selected.presenter_name),
          peer: comments.filter((row) => row.user_name !== selected.presenter_name && row.details?.is_read === true),
        })
      } catch (error) {
        if (active) setFeedback((prev) => ({ ...prev, status: 'error', error: error.message }))
      }
    }
    loadFeedback()
    return () => { active = false }
  }, [selected, identity.member?.id, retryKey])

  if (identity.status !== 'ready' || state.status === 'loading') return <MemberPage><LoadingState label="성장 기록을 불러오는 중입니다." /></MemberPage>
  if (state.status === 'error') return <MemberPage><ErrorState title="성장 기록을 불러오지 못했습니다." description={state.error} onRetry={() => window.location.reload()} /></MemberPage>

  const label = (code) => semesterNames[code] || code

  return (
    <MemberPage>
      <MemberHeader
        eyebrow="평가 결과"
        title="내 성장 기록"
        description="내 발표 영상에 남긴 셀프 피드백과, 영상 화면에서 '읽음' 처리한 조원 피드백을 발표별로 모아 봅니다."
        actions={(
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
            학기
            <select value={semester} onChange={(event) => { setSelectedSemester(event.target.value); setSelectedId(null) }} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-teal-600">
              <option value="all">전체 누적</option>
              {semesters.map((code) => <option key={code} value={code}>{label(code)}</option>)}
            </select>
          </label>
        )}
      />

      {filtered.length === 0 ? <EmptyState title="선택한 학기에 발표 기록이 없습니다." description="발표 순서에 등록된 발표만 표시됩니다." /> : (
        <div className="grid items-start gap-10 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-24">
            <h2 className="pb-3 text-[11px] font-black uppercase tracking-[0.25em] text-teal-600">내 발표</h2>
            <ul className="space-y-0.5">
              {filtered.map((row) => (
                <li key={row.id}>
                  <button type="button" aria-current={selected?.id === row.id ? 'true' : undefined} onClick={() => setSelectedId(row.id)} className={`w-full border-l-[3px] py-2.5 pl-3 pr-1 text-left transition ${selected?.id === row.id ? 'border-teal-600 bg-teal-50/70 text-teal-800' : 'border-transparent text-slate-700 hover:border-teal-200'}`}>
                    <span className="block text-xs font-semibold text-slate-500">{label(row.semester)} · W{row.week}{row.group_id ? ` · ${row.group_id}조` : ''}</span>
                    <span className="block break-keep text-sm font-bold">{row.topic || '주제 미기록'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {selected && (
            <section className="min-w-0 space-y-6">
              <div className="flex flex-col gap-3 border-b-[3px] border-teal-600 pb-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-bold text-teal-700">{label(selected.semester)} · W{selected.week}</p>
                  <h2 className="break-keep text-2xl font-black tracking-tight text-slate-900">{selected.topic || '주제 미기록'}</h2>
                </div>
                <div className="flex gap-2">
                  <StatusBadge tone="teal">셀프 {feedback.self.length}건</StatusBadge>
                  <StatusBadge tone="gray">조원 {feedback.peer.length}건</StatusBadge>
                </div>
              </div>

              {feedback.status === 'loading' && <LoadingState />}
              {feedback.status === 'error' && <ErrorState title="피드백을 불러오지 못했습니다." description={feedback.error} onRetry={() => setRetryKey((value) => value + 1)} />}
              {feedback.status === 'ready' && !feedback.videoFound && (
                <EmptyState title="이 발표의 영상 등록을 찾지 못했습니다." description="발표영상 자료실에 영상이 등록되어야 셀프·조원 피드백이 쌓입니다." />
              )}
              {feedback.status === 'ready' && feedback.videoFound && (
                <>
                  <FeedbackGroup title="내 셀프 피드백" empty="작성한 셀프 피드백이 없습니다." rows={feedback.self} self />
                  <FeedbackGroup title="확인한 조원 피드백" empty="아직 읽음 처리한 조원 피드백이 없습니다. 발표영상 화면에서 댓글을 '읽음'으로 표시하면 이곳에 모입니다." rows={feedback.peer} />
                </>
              )}
            </section>
          )}
        </div>
      )}
    </MemberPage>
  )
}

function FeedbackGroup({ title, empty, rows, self = false }) {
  return (
    <section>
      <h3 className="mb-4 flex items-baseline gap-2">
        <span className={`text-sm font-black ${self ? 'text-violet-600' : 'text-teal-600'}`}>{title}</span>
        <span className="text-xs font-bold text-slate-400">{rows.length}</span>
      </h3>
      {rows.length === 0 ? <p className="break-keep text-sm text-slate-400">{empty}</p> : (
        <ol className="space-y-7">
          {rows.map((row, index) => <FeedbackCard key={row.id} index={index + 1} data={row.details} self={self} date={row.created_at} />)}
        </ol>
      )}
    </section>
  )
}

function FeedbackCard({ index, data, self, date }) {
  if (!data) return null
  return (
    <li className="flex gap-3">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black ${self ? 'bg-violet-100 text-violet-700' : 'bg-teal-100 text-teal-700'}`} aria-hidden="true">{index}</span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2">
          <span className="text-sm font-black text-slate-900">{self ? '셀프 피드백' : '조원 피드백'} {index}</span>
          {date && <span className="text-xs text-slate-400">{formatKst(date, { year: true })}</span>}
        </p>
        <div className="mt-2"><FeedbackView data={data} /></div>
      </div>
    </li>
  )
}
