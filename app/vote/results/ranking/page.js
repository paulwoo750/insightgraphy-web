'use client'
// 주차별 클러스터 순위 · 성장상 · 학기 최다 1위
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Award, Medal, TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { displayTopic, fetchCurrentSemester, sortSemestersDesc, weekFromParam } from '@/lib/semester'
import { MemberHeader, MemberPage, useMember } from '@/app/components/MemberShell'
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '@/app/components/ui'

// 정성 피드백만 임시 저장한 행(점수 없음, 0점)은 순위에 넣지 않는다
const isRealScore = (row) => Boolean(row.details?.scores) || Number(row.total_score) > 0
const avgOf = (rows) => (rows.length ? rows.reduce((sum, row) => sum + (row.total_score || 0), 0) / rows.length : 0)
const MEDAL_TONES = ['text-amber-500', 'text-slate-400', 'text-orange-700']

// 같은 order_index가 여러 명이면 팀 발표로 본다
function buildEntries(presentations, scoresByPresentation) {
  const teamMode = presentations.length > 0 && new Set(presentations.map((row) => row.order_index)).size < presentations.length
  if (!teamMode) {
    return presentations.map((row) => ({ key: row.id, name: row.presenter_name, members: [row.presenter_name], cluster: row.cluster_id, score: avgOf(scoresByPresentation[row.id] || []) }))
  }
  const map = new Map()
  presentations.forEach((row) => {
    if (!map.has(row.order_index)) map.set(row.order_index, { key: `team-${row.order_index}`, team: row.team_id, cluster: row.cluster_id, members: [], pids: [] })
    const team = map.get(row.order_index)
    team.members.push(row.presenter_name)
    team.pids.push(row.id)
  })
  return [...map.values()].map((team) => ({ ...team, name: team.team ? `${team.team}팀` : team.members.join(', '), score: avgOf(team.pids.flatMap((pid) => scoresByPresentation[pid] || [])) }))
}

export default function RankingPage() {
  const router = useRouter()
  const identity = useMember()
  const [state, setState] = useState({ status: 'loading', error: '' })
  const [base, setBase] = useState({ current: null, semesterRows: [], codes: [] })
  const [selectedSemester, setSelectedSemester] = useState(null)
  const [semesterData, setSemesterData] = useState({ code: null, status: 'idle', error: '', presentations: [], scores: [] })
  const [week, setWeek] = useState(null)

  useEffect(() => {
    if (identity.status !== 'ready') return undefined
    if (!identity.session) {
      router.replace('/login?next=%2Fvote%2Fresults%2Franking')
      return undefined
    }
    let active = true
    async function load() {
      try {
        const current = await fetchCurrentSemester()
        const [presentationRes, semesterRes] = await Promise.all([
          supabase.from('presentations').select('semester').not('semester', 'is', null),
          supabase.from('semesters').select('id, code, name, total_weeks, status'),
        ])
        if (presentationRes.error) throw presentationRes.error
        const codes = new Set((presentationRes.data || []).map((row) => row.semester))
        if (current.code) codes.add(current.code)
        if (!active) return
        setBase({ current, semesterRows: semesterRes.data || [], codes: sortSemestersDesc([...codes]) })
        setState({ status: 'ready', error: '' })
      } catch (error) {
        if (active) setState({ status: 'error', error: error.message })
      }
    }
    load()
    return () => { active = false }
  }, [identity.status, identity.session, router])

  const semester = selectedSemester ?? (base.codes.includes(base.current?.code) ? base.current.code : base.codes[0] || null)

  useEffect(() => {
    if (!semester) return undefined
    let active = true
    async function loadSemester() {
      setSemesterData((prev) => ({ ...prev, status: 'loading', error: '' }))
      try {
        const [presentationRes, scoreRes] = await Promise.all([
          supabase.from('presentations').select('*').eq('semester', semester),
          supabase.from('scores').select('presentation_id, total_score, details').eq('semester', semester),
        ])
        const failed = presentationRes.error || scoreRes.error
        if (failed) throw failed
        if (!active) return
        setSemesterData({ code: semester, status: 'ready', error: '', presentations: presentationRes.data || [], scores: (scoreRes.data || []).filter(isRealScore) })
      } catch (error) {
        if (active) setSemesterData((prev) => ({ ...prev, status: 'error', error: error.message }))
      }
    }
    loadSemester()
    return () => { active = false }
  }, [semester])

  const semesterRow = base.semesterRows.find((row) => row.code === semester)
  const presentations = useMemo(() => (semesterData.code === semester ? semesterData.presentations : []), [semesterData, semester])
  const maxWeekInData = Math.max(0, ...presentations.map((row) => Number(row.week) || 0))
  const totalWeeks = Math.max(semesterRow?.total_weeks || 0, maxWeekInData, 1)
  // 기본 주차: 주소의 ?week= → 가장 최근 발표 주차
  const latestWeek = [...presentations].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]?.week ?? 1
  const activeWeek = week ?? weekFromParam(typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('week'), totalWeeks, latestWeek)

  const result = useMemo(() => {
    const scoresByPresentation = {}
    semesterData.scores.forEach((row) => { (scoresByPresentation[row.presentation_id] ||= []).push(row) })
    const weekPresentations = presentations.filter((row) => row.week === activeWeek)
    const entries = buildEntries(weekPresentations, scoresByPresentation)
    const clusters = [...new Set(entries.map((entry) => entry.cluster))].sort((a, b) => (a ?? 0) - (b ?? 0))
    const clusterRankings = clusters.map((cluster) => ({ cluster, ranks: entries.filter((entry) => entry.cluster === cluster && entry.score > 0).sort((a, b) => b.score - a.score).slice(0, 3) }))

    // 성장상: 전주 대비 개인 평균 상승폭 1위
    const personal = (rows) => Object.fromEntries(rows.map((row) => [row.presenter_name, avgOf(scoresByPresentation[row.id] || [])]))
    const now = personal(weekPresentations)
    const prev = personal(presentations.filter((row) => row.week === activeWeek - 1))
    const improved = Object.entries(now)
      .filter(([name, score]) => prev[name] > 0 && score > 0)
      .map(([name, score]) => ({ name, diff: score - prev[name] }))
      .sort((a, b) => b.diff - a.diff)[0] || null

    // 학기 최다 1위 (팀 1위는 팀원 모두에게)
    const wins = {}
    for (let w = 1; w <= totalWeeks; w++) {
      const weekEntries = buildEntries(presentations.filter((row) => row.week === w), scoresByPresentation)
      ;[...new Set(weekEntries.map((entry) => entry.cluster))].forEach((cluster) => {
        const best = weekEntries.filter((entry) => entry.cluster === cluster).sort((a, b) => b.score - a.score)[0]
        if (best && best.score > 0) best.members.forEach((name) => { wins[name] = (wins[name] || 0) + 1 })
      })
    }
    const hallOfFame = Object.entries(wins).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 3)
    return { clusterRankings, improved, hallOfFame, topic: weekPresentations[0]?.topic }
  }, [semesterData.scores, presentations, activeWeek, totalWeeks])

  function changeWeek(value) {
    setWeek(value)
    const params = new URLSearchParams(window.location.search)
    params.set('week', String(value))
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params.toString()}`)
  }

  if (identity.status !== 'ready' || state.status === 'loading') return <MemberPage><LoadingState label="순위를 불러오는 중입니다." /></MemberPage>
  if (state.status === 'error') return <MemberPage><ErrorState title="순위를 불러오지 못했습니다." description={state.error} onRetry={() => window.location.reload()} /></MemberPage>

  const semesterName = (code) => base.semesterRows.find((row) => row.code === code)?.name || code
  const topic = result.topic || (semester === base.current?.code ? displayTopic(base.current.weekTopics, activeWeek, 'regular') || '주제 미정' : '주제 미기록')

  return (
    <MemberPage>
      <MemberHeader
        eyebrow="평가 결과"
        title="주차별 순위"
        description="클러스터별 정량 평가 평균 상위 3명(팀)과 성장상, 학기 최다 1위를 보여 줍니다."
        actions={(
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
            학기
            <select value={semester || ''} onChange={(event) => { setSelectedSemester(event.target.value); setWeek(null) }} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-teal-600">
              {base.codes.map((code) => <option key={code} value={code}>{semesterName(code)}</option>)}
            </select>
          </label>
        )}
      />

      {!semester ? <EmptyState title="순위를 볼 학기가 없습니다." /> : (
        <>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="주차 선택">
              {Array.from({ length: totalWeeks }, (_, index) => index + 1).map((value) => (
                <button key={value} type="button" aria-pressed={value === activeWeek} onClick={() => changeWeek(value)} className={`min-h-9 shrink-0 rounded-md border px-3 text-sm font-bold ${value === activeWeek ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 text-slate-600 hover:border-teal-400'}`}>W{value}</button>
              ))}
            </div>
            <p className="mt-2 px-1 text-sm text-slate-600">W{activeWeek} 주제 <span className="font-bold text-slate-900">{topic}</span></p>
          </div>

          {semesterData.status === 'loading' && <LoadingState className="mt-6" />}
          {semesterData.status === 'error' && <div className="mt-6"><ErrorState title="이 학기 평가 기록을 불러오지 못했습니다." description={semesterData.error} onRetry={() => setSelectedSemester(semester)} /></div>}

          {semesterData.status === 'ready' && (
            <>
              {result.clusterRankings.every((cluster) => cluster.ranks.length === 0) ? (
                <div className="mt-6"><EmptyState title="이 주차에는 아직 순위가 없습니다." description="발표가 등록되고 정량 평가가 모이면 표시됩니다." /></div>
              ) : (
                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {result.clusterRankings.filter((cluster) => cluster.ranks.length > 0).map((cluster) => (
                    <section key={String(cluster.cluster)} className="rounded-lg border border-slate-200 bg-white p-4">
                      <h2 className="text-sm font-bold text-teal-700">클러스터 {cluster.cluster ?? '-'}</h2>
                      <ol className="mt-2 divide-y divide-slate-100">
                        {cluster.ranks.map((entry, index) => (
                          <li key={entry.key} className={`flex items-center justify-between gap-3 py-3 ${index === 0 ? 'rounded-md bg-teal-50/60 px-2' : 'px-2'}`}>
                            <div className="flex min-w-0 items-center gap-3">
                              <Medal className={`h-5 w-5 shrink-0 ${MEDAL_TONES[index]}`} aria-label={`${index + 1}위`} />
                              <div className="min-w-0">
                                <p className={`truncate text-base font-bold ${index === 0 ? 'text-teal-900' : 'text-slate-800'}`}>{entry.name}</p>
                                {entry.members.length > 1 && <p className="truncate text-xs text-slate-500">{entry.members.join(', ')}</p>}
                              </div>
                            </div>
                            <p className={`shrink-0 text-lg font-extrabold ${index === 0 ? 'text-teal-700' : 'text-slate-700'}`}>{entry.score.toFixed(2)}<span className="ml-0.5 text-xs font-semibold text-slate-500">점</span></p>
                          </li>
                        ))}
                      </ol>
                    </section>
                  ))}
                </div>
              )}

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <section className="rounded-lg border border-slate-200 bg-white p-5">
                  <h2 className="flex items-center gap-2 text-sm font-bold text-slate-600"><TrendingUp className="h-4 w-4" aria-hidden="true" />W{activeWeek} 성장상</h2>
                  {result.improved && result.improved.diff > 0 ? (
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-2xl font-extrabold text-teal-800">{result.improved.name} 님</p>
                        <p className="text-sm text-slate-500">전주 대비 평균 점수가 가장 크게 올랐습니다.</p>
                      </div>
                      <p className="text-3xl font-extrabold text-teal-600">+{result.improved.diff.toFixed(2)}</p>
                    </div>
                  ) : <p className="mt-4 text-sm text-slate-500">전주와 비교할 평가 기록이 충분하지 않습니다.</p>}
                </section>
                <section className="rounded-lg border border-slate-200 bg-white p-5">
                  <h2 className="flex items-center gap-2 text-sm font-bold text-slate-600"><Award className="h-4 w-4" aria-hidden="true" />{semesterName(semester)} 최다 1위</h2>
                  {result.hallOfFame.length > 0 ? (
                    <ol className="mt-2 divide-y divide-slate-100">
                      {result.hallOfFame.map((hero, index) => (
                        <li key={hero.name} className="flex items-center justify-between py-2.5">
                          <span className="flex items-center gap-2 text-base font-bold text-slate-800">{hero.name}{index === 0 && <StatusBadge tone="amber">최다</StatusBadge>}</span>
                          <span className="text-xl font-extrabold text-teal-700">{hero.count}<span className="ml-0.5 text-xs font-semibold text-slate-500">회</span></span>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="mt-4 text-sm text-slate-500">아직 1위 기록이 없습니다.</p>}
                </section>
              </div>
            </>
          )}
        </>
      )}
    </MemberPage>
  )
}
