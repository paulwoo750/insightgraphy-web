'use client'
// 정성 피드백 작성실: 같은 클러스터 발표에 대한 피드백·메모를 미리 쓰고 임시 저장한다 (영상 댓글용)
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { displayTopic, fetchCurrentSemester, presentationWeekFor, sameJson, weekFromParam } from '@/lib/semester'
import { MemberHeader, MemberPage, rememberWeekContext, useMember } from '@/app/components/MemberShell'
import { Button, EmptyState, ErrorState, LoadingState, SaveStatus, useAsyncAction, useToast, useUnsavedChanges } from '@/app/components/ui'
import { EMPTY_FEEDBACK, FeedbackFields, TargetRail, WeekRail } from '../_components/Editorial'

const toFeedback = (qualitative) => ({ ...EMPTY_FEEDBACK, ...Object.fromEntries(Object.entries(qualitative || {}).map(([key, value]) => [key, value || ''])) })
// 팀 표기는 team_id가 실제로 있을 때만 (개인 평가인데 데이터가 겹쳐 팀처럼 보이는 것 방지)
const targetName = (target) => (target.team_id && target.members.length > 1 ? `${target.team_id}팀 (${target.members.join(', ')})` : target.members.join(', '))

export default function FeedbackPage() {
  const router = useRouter()
  const identity = useMember()
  const toast = useToast()
  const [run, saving] = useAsyncAction()
  const [state, setState] = useState({ status: 'loading', error: '' })
  const [semester, setSemester] = useState(null)
  const [week, setWeek] = useState(null)
  const [weekState, setWeekState] = useState({ status: 'idle', error: '' })
  const [evalTargets, setEvalTargets] = useState([])
  const [selectedTargetId, setSelectedTargetId] = useState(null)
  const [myInfo, setMyInfo] = useState({ cluster_id: null, group_id: null })
  const [editFeedback, setEditFeedback] = useState(EMPTY_FEEDBACK)
  const [saveError, setSaveError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  // 다시 불러와도 보던 대상을 유지하기 위해 기억한다
  const selectedRef = useRef(null)

  const myName = identity.member?.name || identity.session?.user?.user_metadata?.name || ''

  useEffect(() => {
    if (identity.status !== 'ready') return undefined
    if (!identity.session) {
      router.replace('/login?next=%2Fvote%2Ffeedback')
      return undefined
    }
    let active = true
    async function load() {
      try {
        const current = await fetchCurrentSemester()
        // 처음 주차: 주소의 ?week= → 현재 주차(발표가 없으면 그 전 가장 최근 발표 주차)
        const { data: weekRows } = await supabase.from('presentations').select('week').eq('semester', current.code)
        const resolved = presentationWeekFor((weekRows || []).map((row) => row.week), current.currentWeek)
        const initial = weekFromParam(new URLSearchParams(window.location.search).get('week'), current.totalWeeks, resolved)
        if (!active) return
        setSemester(current)
        setWeek(Math.max(1, initial))
        setState({ status: 'ready', error: '' })
      } catch (error) {
        if (active) setState({ status: 'error', error: error.message })
      }
    }
    load()
    return () => { active = false }
  }, [identity.status, identity.session, myName, router])

  useEffect(() => {
    if (!semester || week == null || !myName) return undefined
    let active = true
    async function loadWeek() {
      setWeekState({ status: 'loading', error: '' })
      try {
        // 학기 필터 필수: 같은 주차라도 학기가 다르면 order_index가 겹쳐 팀으로 잘못 묶인다
        const { data: presentations, error } = await supabase.from('presentations').select('*').eq('week', week).eq('semester', semester.code).order('order_index', { ascending: true })
        if (error) throw error
        const map = new Map()
        ;(presentations || []).forEach((row) => {
          if (!map.has(row.order_index)) map.set(row.order_index, { id: `tgt-${row.order_index}`, order_index: row.order_index, cluster_id: row.cluster_id, group_id: row.group_id, team_id: row.team_id, topic: row.topic, week: row.week, members: [], pids: [] })
          const target = map.get(row.order_index)
          target.members.push(row.presenter_name)
          target.pids.push(row.id)
        })
        const allTargets = [...map.values()]
        const myTarget = allTargets.find((target) => target.members.includes(myName))
        const { data: scoreRows, error: scoreError } = await supabase.from('scores').select('*').eq('voter_name', myName)
        if (scoreError) throw scoreError
        const combined = allTargets
          .filter((target) => target.cluster_id === myTarget?.cluster_id && !target.members.includes(myName))
          .map((target) => {
            // 팀원 수만큼 같은 내용으로 저장되므로 첫 기록을 대표로 쓴다
            const record = (scoreRows || []).find((row) => target.pids.includes(row.presentation_id))
            return { id: target.id, target_info: target, score_record_id: record?.id || null, scored: Boolean(record?.details?.scores), details: record?.details || {} }
          })
        if (!active) return
        setMyInfo({ cluster_id: myTarget?.cluster_id ?? null, group_id: myTarget?.group_id ?? null })
        setEvalTargets(combined)
        const keep = combined.find((item) => item.id === selectedRef.current) || combined[0]
        selectedRef.current = keep?.id || null
        setSelectedTargetId(keep?.id || null)
        setEditFeedback(toFeedback(keep?.details?.qualitative))
        setSaveError(false)
        setWeekState({ status: 'ready', error: '' })
      } catch (error) {
        if (active) setWeekState({ status: 'error', error: error.message })
      }
    }
    loadWeek()
    return () => { active = false }
  }, [semester, week, myName, reloadKey])

  const current = evalTargets.find((item) => item.id === selectedTargetId)
  const savedFeedback = toFeedback(current?.details?.qualitative)
  const dirty = Boolean(current) && !sameJson(savedFeedback, editFeedback)
  useUnsavedChanges(dirty, '저장하지 않은 피드백이 있습니다. 이 화면을 떠날까요?')

  function confirmDiscard() {
    return !dirty || confirm('저장하지 않은 피드백이 있습니다. 버리고 이동할까요?')
  }

  function changeWeek(value) {
    if (value === week || !confirmDiscard()) return
    setWeek(value)
    const params = new URLSearchParams(window.location.search)
    params.set('week', String(value))
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params.toString()}`)
    rememberWeekContext(value, 'regular')
  }

  function selectTarget(item) {
    if (item.id === selectedTargetId || !confirmDiscard()) return
    selectedRef.current = item.id
    setSelectedTargetId(item.id)
    setEditFeedback(toFeedback(item.details?.qualitative))
    setSaveError(false)
  }

  // 타겟에 속한 모든 발표(팀원)의 기록을 함께 갱신한다. 채점 전이면 점수 없는 임시 기록을 만든다
  function save({ quiet = false } = {}) {
    if (!current) return
    run(async () => {
      const pids = current.target_info.pids
      let error = null
      if (current.score_record_id) {
        const result = await supabase.from('scores')
          .update({ is_submitted: false, details: { ...current.details, qualitative: editFeedback } })
          .in('presentation_id', pids)
          .eq('voter_name', myName)
          .select('id')
        error = result.error || (!result.data?.length ? { message: '저장할 권한이 없거나 기록을 찾지 못했습니다.' } : null)
      } else {
        // semester를 넣지 않는다: 순위 집계(semester 기준)에 0점 임시 기록이 섞이지 않게
        const result = await supabase.from('scores').insert(pids.map((pid) => ({
          presentation_id: pid,
          voter_name: myName,
          voter_member_id: identity.member?.id || null,
          total_score: 0,
          is_submitted: false,
          details: { version: 'v1', qualitative: editFeedback },
        })))
        error = result.error
      }
      if (error) {
        setSaveError(true)
        toast.error(`피드백을 저장하지 못했습니다: ${error.message}`)
        return
      }
      setSaveError(false)
      if (!quiet) toast.success('피드백을 임시 저장했습니다. 영상 화면의 피드백 작성에서 이어서 쓸 수 있습니다.')
      setReloadKey((value) => value + 1)
    })
  }

  if (identity.status !== 'ready' || state.status === 'loading' || week == null) return <MemberPage><LoadingState label="피드백 작성실을 불러오는 중입니다." /></MemberPage>
  if (state.status === 'error') return <MemberPage><ErrorState title="피드백 작성실을 불러오지 못했습니다." description={state.error} onRetry={() => window.location.reload()} /></MemberPage>

  const weeks = Array.from({ length: Math.max(1, semester.totalWeeks) }, (_, index) => index + 1)
  const isSameGroup = current?.target_info?.group_id === myInfo.group_id
  const railItems = evalTargets.map((item) => ({ id: item.id, item, label: targetName(item.target_info), done: item.scored, draft: Boolean(item.score_record_id), sameGroup: item.target_info.group_id === myInfo.group_id }))

  return (
    <MemberPage>
      <MemberHeader
        eyebrow="평가"
        title="정성 피드백 작성실"
        description="같은 클러스터 발표에 대한 피드백을 미리 써 두는 곳입니다. 같은 조 발표는 항목별 피드백을, 다른 조 발표는 메모를 남깁니다. 써 둔 내용은 발표영상 화면에서 댓글로 불러올 수 있습니다."
        actions={<Button href="/vote/score">정량 평가로</Button>}
      />

      <WeekRail weeks={weeks} week={week} onChange={changeWeek} topic={evalTargets[0]?.target_info?.topic || displayTopic(semester.weekTopics, week, 'regular') || '주제 미정'}>
        <p className="mb-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-black uppercase tracking-widest">
          <span className="text-slate-500">{semester.name}</span>
          {myInfo.cluster_id && <><span className="h-3 w-px bg-teal-200" aria-hidden="true" /><span className="text-teal-600">클러스터 {myInfo.cluster_id} · {myInfo.group_id}조</span></>}
        </p>
      </WeekRail>

      {weekState.status === 'loading' && <LoadingState />}
      {weekState.status === 'error' && <ErrorState title="이 주차 발표를 불러오지 못했습니다." description={weekState.error} onRetry={() => setReloadKey((value) => value + 1)} />}
      {weekState.status === 'ready' && evalTargets.length === 0 && (
        <EmptyState title="이 주차에 피드백할 발표가 없습니다." description="발표 순서가 등록되지 않았거나, 내 클러스터에 다른 발표가 없습니다." />
      )}

      {weekState.status === 'ready' && evalTargets.length > 0 && (
        <div className="grid items-start gap-10 lg:grid-cols-[230px_minmax(0,1fr)] xl:gap-14">
          <TargetRail title="Feedback To" items={railItems} selectedId={selectedTargetId} onSelect={({ item }) => selectTarget(item)} />

          {!current ? (
            <EmptyState title="왼쪽에서 피드백할 발표를 고르세요." />
          ) : (
            <section className="min-w-0">
              <div className="flex flex-col gap-3 border-b-[3px] border-teal-600 pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.25em] text-teal-500">{isSameGroup ? '★ 같은 조 · 상세 피드백' : '다른 조 · 메모'}</p>
                  <h2 className="mt-1 break-keep text-3xl font-black tracking-tight text-slate-900">{targetName(current.target_info)}</h2>
                  <p className="mt-1 text-sm text-slate-500">주제 {current.target_info.topic || displayTopic(semester.weekTopics, week, 'regular') || '미정'}</p>
                </div>
                <SaveStatus state={saving ? 'saving' : saveError ? 'error' : dirty ? 'dirty' : 'clean'} dirtyCount={1} />
              </div>

              <div className="mt-8">
                {isSameGroup ? (
                  <FeedbackFields wide large value={editFeedback} onChange={(key, text) => setEditFeedback((prev) => ({ ...prev, [key]: text }))} messagePlaceholder="발표를 들으며 핵심 메시지를 기록해 보세요." />
                ) : (
                  <label className="block">
                    <span className="text-[11px] font-black uppercase tracking-[0.2em] text-teal-500">메모 <span className="ml-1 normal-case tracking-normal text-slate-400">입력칸을 벗어나면 자동 저장됩니다</span></span>
                    <textarea value={editFeedback.memo} onChange={(event) => setEditFeedback((prev) => ({ ...prev, memo: event.target.value }))} onBlur={() => { if (dirty) save({ quiet: true }) }} className="mt-2 min-h-80 w-full resize-y border-y-2 border-teal-200 bg-transparent py-4 text-sm leading-7 text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-teal-500" placeholder="이 발표에 대해 자유롭게 메모를 남기세요." />
                  </label>
                )}
              </div>

              <div className="mt-10 flex justify-end">
                <Button variant="primary" icon={Save} loading={saving} disabled={!dirty} onClick={() => save()}>임시 저장</Button>
              </div>
            </section>
          )}
        </div>
      )}
    </MemberPage>
  )
}
