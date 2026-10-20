'use client'
// 정량 평가: 같은 클러스터의 발표(팀 또는 개인)를 루브릭으로 채점한다
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { displayTopic, fetchCurrentSemester, presentationWeekFor, weekFromParam } from '@/lib/semester'
import { MemberHeader, MemberPage, rememberWeekContext, useMember } from '@/app/components/MemberShell'
import { Button, EmptyState, ErrorState, LoadingState, useAsyncAction, useToast } from '@/app/components/ui'
import { EMPTY_FEEDBACK, FeedbackFields, TargetRail, WeekRail } from '../_components/Editorial'

// 루브릭 색상 키 → 고정 클래스 (Tailwind가 지우지 않도록 전체 문자열로 둔다)
const COLOR_THEMES = {
  blue: { text: 'text-teal-800', border: 'border-teal-800', lightBg: 'bg-teal-50', lightBorder: 'border-teal-200' },
  purple: { text: 'text-purple-800', border: 'border-purple-800', lightBg: 'bg-purple-50', lightBorder: 'border-purple-200' },
  pink: { text: 'text-pink-800', border: 'border-pink-800', lightBg: 'bg-pink-50', lightBorder: 'border-pink-200' },
  emerald: { text: 'text-emerald-800', border: 'border-emerald-800', lightBg: 'bg-emerald-50', lightBorder: 'border-emerald-200' },
  amber: { text: 'text-amber-700', border: 'border-amber-700', lightBg: 'bg-amber-50', lightBorder: 'border-amber-200' },
}
const themeOf = (color) => COLOR_THEMES[color] || COLOR_THEMES.blue
const itemMax = (item) => Math.max(...item.criteria.map((criterion) => criterion.s), 0)
const categoryMax = (category) => category.items.reduce((sum, item) => sum + itemMax(item), 0)

// order_index가 같은 발표자(팀원)를 하나의 평가 대상으로 묶는다
function buildTargets(presentations) {
  const map = new Map()
  presentations.forEach((row) => {
    if (!map.has(row.order_index)) {
      map.set(row.order_index, { id: `tgt-${row.order_index}`, order_index: row.order_index, cluster_id: row.cluster_id, group_id: row.group_id, team_id: row.team_id, topic: row.topic, members: [], pids: [] })
    }
    const target = map.get(row.order_index)
    target.members.push(row.presenter_name)
    target.pids.push(row.id)
  })
  return [...map.values()]
}

// 팀 표기는 team_id가 실제로 있을 때만 (개인 평가인데 데이터가 겹쳐 팀처럼 보이는 것 방지)
const isTeamTarget = (target) => Boolean(target.team_id) && target.members.length > 1
const shortName = (target) => (isTeamTarget(target) ? `${target.team_id}팀 (${target.members.join(', ')})` : target.members.join(', '))

export default function ScorePage() {
  const router = useRouter()
  const identity = useMember()
  const toast = useToast()
  const [run, submitting] = useAsyncAction()
  const [state, setState] = useState({ status: 'loading', error: '' })
  const [semester, setSemester] = useState(null)
  const [week, setWeek] = useState(null)
  const [weekState, setWeekState] = useState({ status: 'idle', error: '' })
  const [version, setVersion] = useState('v1')
  const [evalTargets, setEvalTargets] = useState([])
  const [votedPids, setVotedPids] = useState([])
  // 정성 피드백 화면에서 먼저 임시 저장한 행 (점수 없음): { [presentation_id]: row }
  const [drafts, setDrafts] = useState({})
  const [selectedTargetId, setSelectedTargetId] = useState('')
  const [myInfo, setMyInfo] = useState({ cluster_id: null, group_id: null })
  const [rubric, setRubric] = useState([])
  const [scores, setScores] = useState({})
  const [feedback, setFeedback] = useState(EMPTY_FEEDBACK)
  const [reloadKey, setReloadKey] = useState(0)

  const myName = identity.member?.name || identity.session?.user?.user_metadata?.name || ''

  // 학기 정보와 처음 볼 주차 (주소의 ?week= → 이번 학기 가장 최근 발표 주차)
  useEffect(() => {
    if (identity.status !== 'ready') return undefined
    if (!identity.session) {
      router.replace('/login?next=%2Fvote%2Fscore')
      return undefined
    }
    let active = true
    async function load() {
      try {
        const current = await fetchCurrentSemester()
        // 기본 주차: 현재 주차에 발표가 있으면 그 주차, 없으면 그 전 가장 최근 발표 주차
        const { data: weekRows, error } = await supabase.from('presentations').select('week').eq('semester', current.code)
        if (error) throw error
        const fallback = presentationWeekFor((weekRows || []).map((row) => row.week), current.currentWeek)
        const initial = weekFromParam(new URLSearchParams(window.location.search).get('week'), current.totalWeeks, fallback)
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
  }, [identity.status, identity.session, router])

  // 주차별 발표·루브릭·내 채점 기록
  useEffect(() => {
    if (!semester || week == null || !myName) return undefined
    let active = true
    async function loadWeek() {
      setWeekState({ status: 'loading', error: '' })
      try {
        // 학기 필터 필수: 같은 주차라도 학기가 다르면 order_index가 겹쳐 팀으로 잘못 묶인다
        const { data: presentations, error } = await supabase.from('presentations').select('*').eq('week', week).eq('semester', semester.code).order('order_index', { ascending: true })
        if (error) throw error
        const allTargets = buildTargets(presentations || [])
        const myTarget = allTargets.find((target) => target.members.includes(myName))
        const myCluster = myTarget?.cluster_id || 1
        const targets = allTargets.filter((target) => target.cluster_id === myCluster)
        const currentVersion = presentations?.[0]?.eval_version || 'v1'

        let criteria = []
        if (presentations?.length) {
          const { data: rubricRow, error: rubricError } = await supabase.from('pr_vote_criteria').select('criteria_data').eq('version', currentVersion).maybeSingle()
          if (rubricError) throw rubricError
          criteria = Array.isArray(rubricRow?.criteria_data) ? rubricRow.criteria_data : []
        }
        const { data: scoreRows, error: scoreError } = await supabase.from('scores').select('id, presentation_id, details').eq('voter_name', myName)
        if (scoreError) throw scoreError
        // 점수(details.scores)가 있어야 채점 완료다. 피드백만 임시 저장한 행은 채점 때 그 행을 채운다
        const voted = (scoreRows || []).filter((row) => row.details?.scores).map((row) => row.presentation_id)
        const draftRows = Object.fromEntries((scoreRows || []).filter((row) => !row.details?.scores).map((row) => [row.presentation_id, row]))
        if (!active) return

        const initialScores = {}
        criteria.forEach((category) => category.items.forEach((item) => { initialScores[item.id] = null }))
        // 내 팀이 아니고 아직 평가하지 않은 첫 대상
        const next = targets.find((target) => !target.members.includes(myName) && !target.pids.some((pid) => voted.includes(pid)))
        setMyInfo({ cluster_id: myCluster, group_id: myTarget?.group_id || 1 })
        setEvalTargets(targets)
        setVersion(currentVersion)
        setRubric(criteria)
        setScores(initialScores)
        setVotedPids(voted)
        setDrafts(draftRows)
        setSelectedTargetId(next?.id || '')
        setFeedback({ ...EMPTY_FEEDBACK, ...(next ? draftRows[next.pids[0]]?.details?.qualitative : null) })
        setWeekState({ status: 'ready', error: '' })
      } catch (error) {
        if (active) setWeekState({ status: 'error', error: error.message })
      }
    }
    loadWeek()
    return () => { active = false }
  }, [semester, week, myName, reloadKey])

  function changeWeek(value) {
    setWeek(value)
    const params = new URLSearchParams(window.location.search)
    params.set('week', String(value))
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params.toString()}`)
    rememberWeekContext(value, 'regular')
  }

  const categoryTotal = (category) => category.items.reduce((sum, item) => sum + (scores[item.id] || 0), 0)
  const grandTotal = rubric.reduce((sum, category) => sum + categoryTotal(category), 0)
  const maxPossible = rubric.reduce((sum, category) => sum + categoryMax(category), 0)
  const scoredCount = Object.values(scores).filter((value) => value !== null).length
  const itemCount = Object.keys(scores).length

  // 팀 평가는 팀원 수만큼 같은 점수를 개별로 넣는다 (나중 분석용)
  function submit() {
    const target = evalTargets.find((row) => row.id === selectedTargetId)
    if (!target) {
      toast.error('채점할 대상이 없습니다.')
      return
    }
    if (scoredCount < itemCount) {
      toast.error(`아직 평가하지 않은 항목이 ${itemCount - scoredCount}개 있습니다.`)
      return
    }
    run(async () => {
      const row = (pid) => ({
        presentation_id: pid,
        voter_name: myName,
        voter_member_id: identity.member?.id || null,
        total_score: grandTotal,
        semester: semester.code,
        details: { scores, version, qualitative: feedback },
      })
      const draftPids = target.pids.filter((pid) => drafts[pid])
      const newPids = target.pids.filter((pid) => !drafts[pid])
      const results = await Promise.all([
        ...draftPids.map((pid) => supabase.from('scores').update(row(pid)).eq('id', drafts[pid].id).select('id')),
        ...(newPids.length ? [supabase.from('scores').insert(newPids.map(row))] : []),
      ])
      const error = results.find((result) => result.error)?.error || (results.slice(0, draftPids.length).some((result) => !result.data?.length) ? { message: '임시 저장 기록을 갱신할 권한이 없습니다.' } : null)
      if (error) {
        toast.error(`채점을 저장하지 못했습니다: ${error.message}`)
        return
      }
      toast.success(`${shortName(target)} 채점을 저장했습니다.`)
      setReloadKey((value) => value + 1)
    })
  }

  if (identity.status !== 'ready' || state.status === 'loading' || week == null) return <MemberPage><LoadingState label="평가 화면을 불러오는 중입니다." /></MemberPage>
  if (state.status === 'error') return <MemberPage><ErrorState title="평가 화면을 불러오지 못했습니다." description={state.error} onRetry={() => window.location.reload()} /></MemberPage>

  const weeks = Array.from({ length: Math.max(1, semester.totalWeeks) }, (_, index) => index + 1)
  const currentTarget = evalTargets.find((target) => target.id === selectedTargetId)
  const targetsToScore = evalTargets.filter((target) => !target.members.includes(myName))
  const allEvaluated = targetsToScore.length > 0 && targetsToScore.every((target) => target.pids.some((pid) => votedPids.includes(pid)))
  const isSameGroup = currentTarget?.group_id === myInfo.group_id
  const topic = evalTargets[0]?.topic || displayTopic(semester.weekTopics, week, 'regular') || '주제 미정'
  const railItems = evalTargets.map((target) => {
    const done = target.pids.some((pid) => votedPids.includes(pid))
    const me = target.members.includes(myName)
    return { id: target.id, target, label: shortName(target), me, done, draft: Boolean(drafts[target.pids[0]]), sameGroup: !me && target.group_id === myInfo.group_id, disabled: me || done }
  })

  function selectTarget({ id, target }) {
    if (id === selectedTargetId) return
    if (scoredCount > 0 && !confirm('입력하던 점수와 피드백이 지워집니다. 다른 발표로 바꿀까요?')) return
    setSelectedTargetId(id)
    setFeedback({ ...EMPTY_FEEDBACK, ...drafts[target.pids[0]]?.details?.qualitative })
    setScores((prev) => Object.fromEntries(Object.keys(prev).map((key) => [key, null])))
  }

  return (
    <MemberPage>
      <MemberHeader
        eyebrow="평가"
        title="정량 평가"
        description="같은 클러스터의 발표를 루브릭에 따라 채점합니다. 같은 조 발표에는 정성 피드백을, 다른 조 발표에는 간단한 메모를 남길 수 있습니다."
        actions={<Button href="/vote/feedback">정성 피드백 작성</Button>}
      />

      <WeekRail weeks={weeks} week={week} onChange={changeWeek} topic={topic}>
        <p className="mb-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-black uppercase tracking-widest">
          <span className="text-slate-500">{semester.name}</span>
          <span className="h-3 w-px bg-teal-200" aria-hidden="true" />
          <span className="text-slate-500">평가표 {version}</span>
          {myInfo.cluster_id && <><span className="h-3 w-px bg-teal-200" aria-hidden="true" /><span className="text-teal-600">클러스터 {myInfo.cluster_id} · {myInfo.group_id}조</span></>}
        </p>
      </WeekRail>

      {weekState.status === 'loading' && <LoadingState />}
      {weekState.status === 'error' && <ErrorState title="이 주차 발표를 불러오지 못했습니다." description={weekState.error} onRetry={() => setReloadKey((value) => value + 1)} />}
      {weekState.status === 'ready' && evalTargets.length === 0 && (
        <EmptyState title="이 주차에 등록된 발표가 없습니다." description="운영진이 발표 순서를 등록하면 채점할 수 있습니다." />
      )}

      {weekState.status === 'ready' && evalTargets.length > 0 && (
        <div className="grid items-start gap-10 lg:grid-cols-[210px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)_400px] xl:gap-12">
          <TargetRail items={railItems} selectedId={selectedTargetId} onSelect={selectTarget} />

          <div className="min-w-0">
            {allEvaluated ? (
              <div className="border-y-2 border-teal-600 py-20 text-center">
                <span className="text-6xl" aria-hidden="true">🏆</span>
                <h2 className="mt-6 text-2xl font-black text-slate-900 sm:text-3xl">이 주차 평가를 모두 마쳤습니다</h2>
                <p className="mt-2 text-sm text-slate-500">결과는 운영진이 공개하면 내 결과에서 확인할 수 있습니다.</p>
                <Link href="/vote/results/my" className="mt-8 inline-block border-b-[3px] border-teal-600 pb-1 text-sm font-black text-teal-700 transition hover:text-teal-900">내 결과 보기 ↗</Link>
              </div>
            ) : !currentTarget ? (
              <EmptyState title="채점할 대상을 왼쪽에서 고르세요." description="내 발표와 이미 채점한 발표는 고를 수 없습니다." />
            ) : rubric.length === 0 ? (
              <EmptyState title={`평가표 ${version}을 찾지 못했습니다.`} description="운영진에게 평가표 설정을 확인해 달라고 알려 주세요." />
            ) : (
              <div className="space-y-14">
                <div className="border-b-[3px] border-teal-600 pb-6 text-center">
                  <p className="text-[11px] font-black uppercase tracking-[0.25em] text-teal-500">Now Scoring</p>
                  <p className="mt-2 break-keep text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">{isTeamTarget(currentTarget) ? `${currentTarget.team_id}팀 (${currentTarget.members.join(', ')})` : `${currentTarget.members[0]} 님`}</p>
                  <div className="mx-auto mt-5 h-1.5 max-w-xs overflow-hidden rounded-full bg-teal-100" role="progressbar" aria-valuemin={0} aria-valuemax={itemCount} aria-valuenow={scoredCount} aria-label="평가한 항목">
                    <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-all" style={{ width: `${itemCount ? (scoredCount / itemCount) * 100 : 0}%` }} />
                  </div>
                  <p className="mt-2 text-xs font-bold text-slate-400">{scoredCount} / {itemCount}개 항목 평가</p>
                </div>
                {rubric.map((category, index) => (
                  <CategorySection key={category.id || index} category={category} total={categoryTotal(category)} theme={themeOf(category.color)}>
                    {category.items.map((item) => (
                      <EvaluationItem key={item.id} item={item} value={scores[item.id]} onChange={(value) => setScores((prev) => ({ ...prev, [item.id]: Number(value) }))} theme={themeOf(category.color)} />
                    ))}
                  </CategorySection>
                ))}
                <div className="border-y-2 border-teal-600 py-12 text-center">
                  <p className="text-[11px] font-black uppercase tracking-[0.25em] text-teal-500">Total Score</p>
                  <p className="mt-3 text-6xl font-black tracking-tight text-slate-900 sm:text-7xl">{grandTotal}<span className="ml-3 text-2xl text-slate-300 sm:text-3xl">/ {maxPossible}</span></p>
                  <Button variant="primary" size="lg" className="mt-8 w-full max-w-sm" loading={submitting} onClick={submit}>채점 제출</Button>
                </div>
              </div>
            )}
          </div>

          {!allEvaluated && currentTarget && (
            <aside className="min-w-0 lg:col-span-2 xl:sticky xl:top-24 xl:col-span-1">
              <div className="flex items-end justify-between gap-2 border-b-2 border-teal-600 pb-3">
                <h2 className="break-keep text-lg font-black text-slate-900">{isSameGroup ? '정성 피드백' : '메모'}</h2>
                <span className={`text-[11px] font-black uppercase tracking-widest ${isSameGroup ? 'text-amber-600' : 'text-slate-400'}`}>{isSameGroup ? '★ 같은 조' : '다른 조'}</span>
              </div>
              <div className="mt-6">
                {isSameGroup ? (
                  <FeedbackFields value={feedback} onChange={(key, text) => setFeedback((prev) => ({ ...prev, [key]: text }))} />
                ) : (
                  <textarea aria-label="메모" value={feedback.memo} onChange={(event) => setFeedback((prev) => ({ ...prev, memo: event.target.value }))} className="min-h-80 w-full resize-y border-b-2 border-teal-200 bg-transparent py-1 text-sm leading-7 text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-teal-500" placeholder="자유롭게 메모하세요." />
                )}
              </div>
            </aside>
          )}
        </div>
      )}
    </MemberPage>
  )
}

function CategorySection({ category, total, theme, children }) {
  return (
    <section>
      <div className={`flex items-end justify-between gap-3 border-b-2 pb-3 ${theme.border}`}>
        <h2 className={`flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl ${theme.text}`}>{category.icon && <span aria-hidden="true">{category.icon}</span>}{category.title}</h2>
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Score <span className={`ml-1 text-2xl ${theme.text}`}>{total}</span><span className="text-sm">/{categoryMax(category)}</span></p>
      </div>
      <div className="mt-8 space-y-12">{children}</div>
    </section>
  )
}

// 기준 문장을 눌러도 그 점수를 고른다. 아래 숫자는 기준 사이 점수까지 고를 수 있다
function EvaluationItem({ item, value, onChange, theme }) {
  const max = itemMax(item)
  const min = Math.min(...item.criteria.map((criterion) => criterion.s), 0)
  const points = []
  for (let point = max; point >= min; point--) points.push(point)
  const empty = value === null || value === undefined
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <h3 className="text-lg font-extrabold tracking-tight text-slate-900">{item.label}</h3>
        <span className={`text-sm font-black ${empty ? 'text-slate-300' : theme.text}`}>{empty ? '— pt' : `${value} pt`}</span>
      </div>
      <ul className="mt-3 space-y-0.5">
        {[...item.criteria].sort((a, b) => b.s - a.s).map((criterion, index) => {
          const selected = value === criterion.s
          return (
            <li key={index}>
              <button type="button" onClick={() => onChange(criterion.s)} className={`flex w-full items-start gap-4 rounded-md px-2 py-2 text-left transition ${selected ? theme.lightBg : 'hover:bg-slate-50'}`}>
                <span className={`min-w-0 flex-1 break-keep text-[13px] leading-6 ${selected ? `${theme.text} font-extrabold` : 'text-slate-600'}`}>{criterion.t}</span>
                <span className={`w-8 shrink-0 pt-0.5 text-right text-xs font-black ${selected ? theme.text : 'text-slate-300'}`}>{criterion.s}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label={`${item.label} 점수`}>
        {points.map((point) => (
          <button key={point} type="button" aria-pressed={value === point} onClick={() => onChange(point)} className={`min-h-10 min-w-9 flex-1 border-b-[3px] pb-1 text-lg transition ${value === point ? `${theme.border} ${theme.text} font-black` : 'border-transparent font-bold text-slate-300 hover:border-slate-200 hover:text-slate-600'}`}>{point}</button>
        ))}
      </div>
    </div>
  )
}
