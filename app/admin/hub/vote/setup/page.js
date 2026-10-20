'use client'
// 발표 세션 셋업: 세션 및 제출의 편성을 그대로 읽어 주차별 발표 순서·채점표를 확정한다.
// 저장은 기존 발표 행을 고치고 새 발표만 추가한다. 이미 채점이 있는 발표는 지우지 않는다
// (예전에는 주차 전체를 지웠다 다시 넣어 점수와 발표의 연결이 끊길 수 있었다).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd'
import { RotateCcw, Save, Shuffle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { displayTopic, fetchCurrentSemester } from '@/lib/semester'
import { useAdminRole } from '@/app/admin/_components/AdminShell'
import {
  AdminPage,
  Button,
  EmptyState,
  ErrorState,
  Field,
  inputClass,
  LoadingState,
  Notice,
  PageHeader,
  Panel,
  ReadOnlyBanner,
  SegmentedControl,
  StatusBadge,
  useAsyncAction,
  useToast,
} from '@/app/admin/_components/AdminUI'

function buildItems(setup, presentations) {
  const mode = setup.evalMode || 'individual'
  const mTeams = setup.memberTeams || setup.members || {}
  const tGroups = setup.teamGroups || {}
  const gClusters = setup.groupClusters || setup.groupToCluster || {}
  let items
  if (mode === 'team') {
    const teams = [...new Set(Object.values(mTeams))].filter((value) => value !== '미정' && value !== '결석' && !Number.isNaN(Number(value))).map(Number)
    items = teams.map((teamId) => {
      const groupId = Number(tGroups[teamId]) || 1
      const clusterId = Number(gClusters[groupId]) || 1
      const members = Object.keys(mTeams).filter((name) => Number(mTeams[name]) === teamId)
      const existing = presentations.find((row) => row.team_id === teamId)
      return { id: `team-${teamId}`, type: 'team', team_id: teamId, group_id: groupId, cluster_id: clusterId, members, order_index: existing ? existing.order_index : 999 }
    })
  } else {
    const names = Object.keys(mTeams).filter((name) => mTeams[name] !== '미정' && mTeams[name] !== '결석' && !Number.isNaN(Number(mTeams[name])))
    items = names.map((name) => {
      const groupId = Number(mTeams[name])
      const clusterId = Number(gClusters[groupId]) || 1
      const existing = presentations.find((row) => row.presenter_name === name)
      return { id: `ind-${name}`, type: 'individual', name, group_id: groupId, cluster_id: clusterId, order_index: existing ? existing.order_index : 999 }
    })
  }
  return { mode, items: items.sort((a, b) => a.order_index - b.order_index) }
}

export default function VoteSetup() {
  const { role, canWrite } = useAdminRole()
  const toast = useToast()
  const [run, saving] = useAsyncAction()
  const [state, setState] = useState({ status: 'loading', error: '' })
  const [semester, setSemester] = useState(null)
  const [week, setWeek] = useState(1)
  const [versions, setVersions] = useState(['v1'])
  const [evalVersion, setEvalVersion] = useState('v1')
  const [evalMode, setEvalMode] = useState('individual')
  const [items, setItems] = useState([])
  const [presentations, setPresentations] = useState([])
  const [scores, setScores] = useState([])

  const loadWeek = useCallback(async (current, targetWeek) => {
    const [presentationResult, scoreResult] = await Promise.all([
      supabase.from('presentations').select('*').eq('week', targetWeek).eq('semester', current.code).order('order_index', { ascending: true }),
      supabase.from('scores').select('id, presentation_id, voter_name, voter_member_id').eq('semester', current.code),
    ])
    if (presentationResult.error || scoreResult.error) throw presentationResult.error || scoreResult.error
    const built = buildItems(current.weeklySetup[targetWeek] || {}, presentationResult.data || [])
    setPresentations(presentationResult.data || [])
    setScores(scoreResult.data || [])
    setEvalMode(built.mode)
    setItems(built.items)
    setEvalVersion(presentationResult.data?.[0]?.eval_version || 'v1')
  }, [])

  const init = useCallback(async () => {
    setState({ status: 'loading', error: '' })
    try {
      const current = await fetchCurrentSemester()
      const { data: versionRows } = await supabase.from('pr_vote_criteria').select('version')
      if (versionRows?.length) setVersions(versionRows.map((row) => row.version))
      // 발표 편성은 다가오는 세션(날짜 기준 현재 주차)부터 연다
      const startWeek = current.currentWeek
      setSemester(current)
      setWeek(startWeek)
      await loadWeek(current, startWeek)
      setState({ status: 'ready', error: '' })
    } catch (error) {
      setState({ status: 'error', error: error.message })
    }
  }, [loadWeek])

  useEffect(() => {
    const timer = setTimeout(init, 0)
    return () => clearTimeout(timer)
  }, [init])

  async function changeWeek(nextWeek) {
    setWeek(nextWeek)
    try {
      await loadWeek(semester, nextWeek)
    } catch (error) {
      toast.error(`W${nextWeek} 발표 정보를 불러오지 못했습니다: ${error.message}`)
    }
  }

  const topic = semester ? displayTopic(semester.weekTopics, week) : ''
  const clusters = useMemo(() => [...new Set(items.map((item) => item.cluster_id))].sort((a, b) => a - b), [items])
  const scoredIds = useMemo(() => new Set(scores.map((score) => score.presentation_id)), [scores])

  function onDragEnd(result) {
    if (!result.destination || result.source.droppableId !== result.destination.droppableId) return
    const clusterId = Number(result.source.droppableId.split('-')[1])
    setItems((current) => {
      const inCluster = current.filter((item) => item.cluster_id === clusterId)
      const others = current.filter((item) => item.cluster_id !== clusterId)
      const [moved] = inCluster.splice(result.source.index, 1)
      inCluster.splice(result.destination.index, 0, moved)
      return [...inCluster, ...others]
    })
  }

  function shuffleCluster(clusterId) {
    setItems((current) => clusters.flatMap((id) => {
      const list = current.filter((item) => item.cluster_id === id)
      return id === clusterId ? [...list].sort(() => Math.random() - 0.5) : list
    }))
  }

  async function save() {
    if (!canWrite) return
    if (items.length === 0) {
      toast.error('세션 및 제출에서 이 주차 편성을 먼저 하세요. 배정된 발표자가 없습니다.')
      return
    }
    if (!confirm(`${semester.name} W${week}을 ${evalMode === 'team' ? '팀' : '개인'} 단위 평가로 확정할까요?\n이미 채점된 발표는 지우지 않고 순서·조만 고칩니다.`)) return
    await run(async () => {
      const rows = []
      let order = 0
      for (const clusterId of clusters) {
        for (const item of items.filter((entry) => entry.cluster_id === clusterId)) {
          const names = item.type === 'team' ? item.members : [item.name]
          for (const name of names) rows.push({ presenter_name: name, topic, week, eval_version: evalVersion, order_index: order, team_id: item.type === 'team' ? item.team_id : null, group_id: item.group_id, cluster_id: item.cluster_id, semester: semester.code, semester_id: semester.id })
          order++
        }
      }
      const keyOf = (row) => `${row.presenter_name}|${row.team_id ?? ''}`
      const existingByKey = new Map(presentations.map((row) => [keyOf(row), row]))
      const updates = rows.filter((row) => existingByKey.has(keyOf(row))).map((row) => ({ ...existingByKey.get(keyOf(row)), ...row }))
      const inserts = rows.filter((row) => !existingByKey.has(keyOf(row)))
      const keep = new Set(rows.map(keyOf))
      const leftovers = presentations.filter((row) => !keep.has(keyOf(row)))
      const removable = leftovers.filter((row) => !scoredIds.has(row.id)).map((row) => row.id)
      const keptScored = leftovers.filter((row) => scoredIds.has(row.id))

      const failures = []
      if (updates.length) {
        const { error } = await supabase.from('presentations').upsert(updates)
        if (error) failures.push(`수정: ${error.message}`)
      }
      if (inserts.length) {
        const { error } = await supabase.from('presentations').insert(inserts)
        if (error) failures.push(`추가: ${error.message}`)
      }
      if (removable.length) {
        const { error } = await supabase.from('presentations').delete().in('id', removable)
        if (error) failures.push(`정리: ${error.message}`)
      }
      if (failures.length) toast.error(failures.join(' / '), { title: '일부만 저장되었습니다', duration: 0 })
      else toast.success(`W${week} 발표 순서를 저장했습니다 (수정 ${updates.length} · 추가 ${inserts.length} · 정리 ${removable.length}).`)
      if (keptScored.length) toast.warning(`편성에서 빠졌지만 이미 채점된 발표 ${keptScored.length}건(${keptScored.map((row) => row.presenter_name).join(', ')})은 점수 보존을 위해 남겨 두었습니다.`, { duration: 0 })
      await loadWeek(semester, week)
    })
  }

  async function resetWeek() {
    if (!canWrite) return
    const scored = presentations.filter((row) => scoredIds.has(row.id))
    if (scored.length) {
      toast.error(`W${week}에는 이미 채점된 발표가 ${scored.length}건 있어 초기화할 수 없습니다. 점수를 보존하기 위해 순서만 다시 저장하세요.`)
      return
    }
    if (!confirm(`W${week}에 확정된 발표 ${presentations.length}건을 지울까요? (채점 기록이 없는 경우에만 가능합니다)`)) return
    await run(async () => {
      const { error } = await supabase.from('presentations').delete().in('id', presentations.map((row) => row.id))
      if (error) toast.error(`초기화하지 못했습니다: ${error.message}`)
      else toast.success(`W${week} 발표 확정을 초기화했습니다.`)
      await loadWeek(semester, week)
    })
  }

  function voterStatus(presentation) {
    const mine = scores.filter((score) => score.voter_name === presentation.presenter_name).map((score) => score.presentation_id)
    const targets = presentations.filter((row) => row.cluster_id === presentation.cluster_id && (evalMode === 'team' ? row.team_id !== presentation.team_id : row.presenter_name !== presentation.presenter_name))
    const missing = targets.filter((row) => !mine.includes(row.id))
    return { done: missing.length === 0, names: [...new Set(missing.map((row) => evalMode === 'team' ? `${row.team_id}팀` : row.presenter_name))] }
  }

  if (state.status === 'loading') return <AdminPage><LoadingState /></AdminPage>
  if (state.status === 'error') return <AdminPage><ErrorState title="발표 셋업을 불러오지 못했습니다." description={state.error} onRetry={init} /></AdminPage>

  return (
    <AdminPage>
      <PageHeader
        eyebrow="학회원 시스템 · 투표 및 평가"
        title="발표 세션 셋업"
        description="세션 및 제출의 조·팀·클러스터 편성을 그대로 읽어 발표 순서와 채점표를 확정합니다. 이미 채점이 시작된 발표의 점수는 보존됩니다."
        actions={
          <>
            <Button variant="danger" icon={RotateCcw} onClick={resetWeek} disabled={!canWrite || saving || presentations.length === 0}>이 주차 초기화</Button>
            <Button variant="primary" icon={Save} onClick={save} loading={saving} disabled={!canWrite}>확정 저장</Button>
          </>
        }
      />
      <ReadOnlyBanner role={role} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Panel title="1. 주차와 주제" description="주제와 편성은 세션 및 제출 화면 값입니다.">
            <div className="grid gap-4 p-4 sm:grid-cols-[160px_160px_minmax(0,1fr)] sm:p-5">
              <Field label="주차" htmlFor="vote-week">
                <select id="vote-week" value={week} onChange={(event) => changeWeek(Number(event.target.value))} className={inputClass}>
                  {Array.from({ length: semester.totalWeeks + 1 }, (_, index) => <option key={index} value={index}>W{index}</option>)}
                </select>
              </Field>
              <Field label="평가 단위"><p className="flex h-10 items-center text-sm font-bold text-slate-800">{evalMode === 'team' ? '팀 단위' : '개인 단위'}</p></Field>
              <Field label="주제"><p className="flex min-h-10 items-center break-keep text-sm font-bold text-slate-800">{topic || <span className="text-slate-400">주제 미정 (세션 및 제출에서 입력)</span>}</p></Field>
            </div>
          </Panel>

          <Panel title="2. 채점표 버전">
            <div className="p-4 sm:p-5">
              <SegmentedControl label="채점표 버전" value={evalVersion} onChange={setEvalVersion} disabled={!canWrite} options={versions.map((version) => ({ value: version, label: version }))} />
            </div>
          </Panel>

          <Panel title="3. 발표 순서" description="클러스터 안에서 끌어서 순서를 바꿉니다. 키보드: 항목에서 Space로 잡고 화살표로 옮긴 뒤 Space.">
            {clusters.length === 0 ? <EmptyState title="배정된 발표자가 없습니다." description="세션 및 제출 → 조·팀·평가 편성에서 이 주차 편성을 먼저 하세요." /> : (
              <DragDropContext onDragEnd={onDragEnd}>
                <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-2">
                  {clusters.map((clusterId) => {
                    const clusterItems = items.filter((item) => item.cluster_id === clusterId)
                    return (
                      <section key={clusterId}>
                        <div className="mb-2 flex items-center justify-between">
                          <h3 className="text-sm font-bold text-teal-800">평가 클러스터 {clusterId}</h3>
                          <Button size="sm" icon={Shuffle} onClick={() => shuffleCluster(clusterId)} disabled={!canWrite}>섞기</Button>
                        </div>
                        <Droppable droppableId={`cluster-${clusterId}`} isDropDisabled={!canWrite}>
                          {(provided) => (
                            <ol {...provided.droppableProps} ref={provided.innerRef} className="min-h-[80px] space-y-2 rounded-lg bg-teal-50/40 p-3">
                              {clusterItems.map((item, index) => (
                                <Draggable key={item.id} draggableId={String(item.id)} index={index} isDragDisabled={!canWrite}>
                                  {(dragProvided, snapshot) => (
                                    <li ref={dragProvided.innerRef} {...dragProvided.draggableProps} {...dragProvided.dragHandleProps} className={`rounded-md border bg-white px-3 py-2.5 text-sm ${snapshot.isDragging ? 'border-teal-600 shadow-lg' : 'border-slate-200'}`}>
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-bold text-slate-900"><span className="mr-2 text-slate-400">{index + 1}</span>{item.type === 'team' ? `${item.team_id}팀` : item.name}</span>
                                        <StatusBadge tone="teal">{item.group_id}조</StatusBadge>
                                      </div>
                                      {item.type === 'team' && <p className="mt-1 pl-5 text-xs text-slate-600">{item.members.join(', ')}</p>}
                                    </li>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </ol>
                          )}
                        </Droppable>
                      </section>
                    )
                  })}
                </div>
              </DragDropContext>
            )}
          </Panel>
        </div>

        <Panel title="채점 진행" description={`확정된 발표 ${presentations.length}건`} className="self-start">
          {presentations.length === 0 ? <EmptyState title="확정된 발표가 없습니다." /> : (
            <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
              {presentations.map((presentation) => {
                const status = voterStatus(presentation)
                return (
                  <li key={presentation.id} className="px-4 py-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900">{presentation.presenter_name}</span>
                      <StatusBadge tone={status.done ? 'green' : 'amber'}>{status.done ? '평가 완료' : `남은 평가 ${status.names.length}`}</StatusBadge>
                    </div>
                    <p className="text-xs text-slate-500">클러스터 {presentation.cluster_id} · {presentation.group_id}조{evalMode === 'team' ? ` · ${presentation.team_id}팀` : ''}{scoredIds.has(presentation.id) ? ' · 채점 받음' : ''}</p>
                    {!status.done && <p className="mt-1 break-keep text-xs text-amber-800">미완료: {status.names.join(', ')}</p>}
                  </li>
                )
              })}
            </ul>
          )}
          {presentations.some((row) => row.topic && row.topic !== topic) && (
            <Notice tone="info" className="m-3">확정된 발표의 주제가 지금 주제와 다릅니다. 확정 저장하면 지금 주제로 맞춰집니다.</Notice>
          )}
        </Panel>
      </div>
    </AdminPage>
  )
}
