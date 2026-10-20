'use client'
// 베스트 프레젠터 시상식: 주차별 클러스터 시상대(1~3위) · 성장상 · 학기 명예의 전당
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { displayTopic, fetchCurrentSemester, presentationWeekFor, sortSemestersDesc, weekFromParam } from '@/lib/semester'
import { MemberPage, useMember } from '@/app/components/MemberShell'
import { ErrorState, LoadingState } from '@/app/components/ui'
import { avgOf, buildEntries, isRealScore } from '@/lib/ranking'

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
  // 기본 주차: 주소의 ?week= → 현재 학기는 현재 주차(발표가 없으면 그 전 가장 최근 발표 주차), 지난 학기는 마지막 발표 주차
  const latestWeek = semester === base.current?.code
    ? presentationWeekFor(presentations.map((row) => row.week), base.current.currentWeek)
    : Math.max(1, ...presentations.map((row) => Number(row.week) || 0))
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

  const podiums = result.clusterRankings.filter((cluster) => cluster.ranks.length > 0)

  return (
    <MemberPage>
      <style>{CEREMONY_CSS}</style>
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-950 via-indigo-950 to-violet-900 px-4 pb-10 pt-8 text-white shadow-2xl shadow-indigo-900/30 sm:px-8 sm:pt-10">
        <Spotlights />
        <Confetti />
        <div className="relative mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold tracking-[0.35em] text-amber-300 sm:text-sm">INSIGHTGRAPHY AWARDS</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
            <span className="bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400 bg-clip-text text-transparent">W{activeWeek} 베스트 프레젠터</span>
          </h1>
          <p className="mt-3 break-keep text-sm text-indigo-100 sm:text-base">🎤 {topic}</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <label className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold text-indigo-100 ring-1 ring-inset ring-white/20">
              🎓 학기
              <select value={semester || ''} onChange={(event) => { setSelectedSemester(event.target.value); setWeek(null) }} className="rounded-md bg-transparent font-bold text-white outline-none [&>option]:text-slate-900">
                {base.codes.map((code) => <option key={code} value={code}>{semesterName(code)}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 sm:justify-center" role="group" aria-label="주차 선택">
            {Array.from({ length: totalWeeks }, (_, index) => index + 1).map((value) => (
              <button key={value} type="button" aria-pressed={value === activeWeek} onClick={() => changeWeek(value)} className={`min-h-9 shrink-0 rounded-full px-3.5 text-sm font-bold transition ${value === activeWeek ? 'bg-gradient-to-r from-amber-300 to-yellow-400 text-amber-950 shadow-lg shadow-amber-500/30' : 'bg-white/10 text-indigo-100 ring-1 ring-inset ring-white/15 hover:bg-white/20'}`}>W{value}</button>
            ))}
          </div>
        </div>

        <div className="relative mt-10">
          {!semester ? <StageMessage emoji="🎭" title="시상할 학기가 없습니다." /> : semesterData.status === 'loading' ? (
            <StageMessage emoji="🥁" title="시상 결과를 집계하고 있습니다…" />
          ) : semesterData.status === 'error' ? (
            <StageMessage emoji="⚠️" title="이 학기 평가 기록을 불러오지 못했습니다." description={semesterData.error} />
          ) : podiums.length === 0 ? (
            <StageMessage emoji="🎬" title="이 주차의 시상은 아직입니다." description="발표가 등록되고 정량 평가가 모이면 시상대가 열립니다." />
          ) : (
            <div className="flex flex-wrap items-end justify-center gap-x-10 gap-y-12">
              {podiums.map((cluster) => <Podium key={String(cluster.cluster)} cluster={cluster.cluster} ranks={cluster.ranks} single={podiums.length === 1} />)}
            </div>
          )}
        </div>
      </section>

      {semesterData.status === 'ready' && (
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 p-6 text-white shadow-lg shadow-teal-600/20">
            <svg className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 opacity-25" viewBox="0 0 100 100" aria-hidden="true">
              <path d="M10 90 L40 55 L58 70 L90 20" fill="none" stroke="white" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M72 18 L92 18 L92 38" fill="none" stroke="white" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-sm font-bold text-emerald-50">🚀 W{activeWeek} 성장상</p>
            {result.improved && result.improved.diff > 0 ? (
              <div className="relative mt-3">
                <p className="text-3xl font-black">{result.improved.name} <span className="text-lg font-bold text-emerald-50">님</span></p>
                <p className="mt-1 text-sm text-emerald-50">전주 대비 평균 점수가 가장 크게 올랐습니다.</p>
                <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-1.5 text-2xl font-black ring-1 ring-inset ring-white/40">+{result.improved.diff.toFixed(2)}점</p>
              </div>
            ) : <p className="relative mt-4 text-sm text-emerald-50">전주와 비교할 평가 기록이 충분하지 않습니다.</p>}
          </section>

          <section className="relative overflow-hidden rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-yellow-50 to-white p-6 shadow-lg shadow-amber-500/10">
            <p className="text-sm font-bold text-amber-800">🏅 {semesterName(semester)} 명예의 전당 · 클러스터 1위 횟수</p>
            {result.hallOfFame.length > 0 ? (
              <ol className="mt-3 space-y-2">
                {result.hallOfFame.map((hero, index) => (
                  <li key={hero.name} className={`flex items-center justify-between rounded-xl px-4 py-2.5 ${index === 0 ? 'bg-gradient-to-r from-amber-300 to-yellow-200 shadow-sm' : 'bg-white ring-1 ring-inset ring-amber-200'}`}>
                    <span className="flex items-center gap-2 text-base font-black text-slate-900"><span aria-hidden="true">{['👑', '⭐', '✨'][index]}</span>{hero.name}</span>
                    <span className="text-xl font-black text-amber-900">{hero.count}<span className="ml-0.5 text-xs font-bold">회</span></span>
                  </li>
                ))}
              </ol>
            ) : <p className="mt-4 text-sm text-amber-900/70">아직 1위 기록이 없습니다.</p>}
          </section>
        </div>
      )}
    </MemberPage>
  )
}

const CEREMONY_CSS = `
@keyframes ig-confetti-fall { 0% { transform: translateY(-24px) rotate(0deg); opacity: 0 } 10% { opacity: 1 } 100% { transform: translateY(620px) rotate(560deg); opacity: 0.2 } }
@keyframes ig-glow { 0%, 100% { opacity: 0.45 } 50% { opacity: 0.95 } }
@keyframes ig-rise { from { transform: translateY(28px) scale(0.96) } to { transform: none } }
@keyframes ig-float { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
@media (prefers-reduced-motion: reduce) { .ig-anim { animation: none !important; opacity: 1 !important } }
`

// 무대 조명
function Spotlights() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 800 600" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="ig-beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fde68a" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#fde68a" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="ig-floor" cx="50%" cy="100%" r="60%">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="300" width="800" height="300" fill="url(#ig-floor)" />
      <polygon className="ig-anim" points="120,0 170,0 420,600 220,600" fill="url(#ig-beam)" style={{ animation: 'ig-glow 4s ease-in-out infinite' }} />
      <polygon className="ig-anim" points="630,0 680,0 580,600 380,600" fill="url(#ig-beam)" style={{ animation: 'ig-glow 4s ease-in-out 1.5s infinite' }} />
      <polygon className="ig-anim" points="385,0 415,0 470,600 330,600" fill="url(#ig-beam)" opacity="0.6" style={{ animation: 'ig-glow 5s ease-in-out .7s infinite' }} />
    </svg>
  )
}

// 꽃가루: 위치·색·속도를 고정해 매번 같은 그림이 되게 한다
const CONFETTI = [
  [4, 0, '#fbbf24', 'r', 7], [9, 2.4, '#f472b6', 'c', 5], [14, 1.1, '#34d399', 'r', 6], [19, 3.3, '#60a5fa', 's', 8], [24, 0.6, '#fde047', 'c', 6],
  [29, 2.9, '#c084fc', 'r', 7], [34, 1.7, '#fb7185', 's', 6], [39, 0.2, '#2dd4bf', 'c', 5], [44, 3.8, '#fbbf24', 'r', 8], [49, 1.4, '#a78bfa', 's', 7],
  [54, 2.1, '#f472b6', 'r', 6], [59, 0.9, '#fde047', 'c', 7], [64, 3.1, '#34d399', 's', 6], [69, 1.9, '#60a5fa', 'r', 5], [74, 0.4, '#fb7185', 'c', 8],
  [79, 2.6, '#fbbf24', 's', 6], [84, 1.2, '#c084fc', 'r', 7], [89, 3.5, '#2dd4bf', 'c', 6], [94, 0.7, '#fde047', 'r', 5], [97, 2.2, '#f472b6', 's', 7],
]

function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-full overflow-hidden" aria-hidden="true">
      {CONFETTI.map(([left, delay, color, shape, size], index) => (
        <span
          key={index}
          className="ig-anim absolute top-0 block"
          style={{
            left: `${left}%`,
            width: size,
            height: shape === 'r' ? size * 1.8 : size,
            background: color,
            borderRadius: shape === 'c' ? '9999px' : shape === 's' ? '2px' : '1px',
            animation: `ig-confetti-fall ${6 + (index % 5)}s linear ${delay}s infinite`,
            opacity: 0,
          }}
        />
      ))}
    </div>
  )
}

function StageMessage({ emoji, title, description }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl bg-white/5 px-6 py-10 text-center ring-1 ring-inset ring-white/15">
      <p className="text-4xl" aria-hidden="true">{emoji}</p>
      <p className="mt-3 text-base font-bold text-white">{title}</p>
      {description && <p className="mt-1 break-keep text-sm text-indigo-200">{description}</p>}
    </div>
  )
}

const PLACES = {
  1: { height: 'h-36 sm:h-44', step: 'from-amber-200 via-yellow-400 to-amber-500', medal: '🥇', ring: 'ring-amber-300', avatar: 'from-amber-300 to-yellow-500 text-amber-950', score: 'text-amber-300', label: '1위', delay: 0.5 },
  2: { height: 'h-24 sm:h-32', step: 'from-slate-100 via-slate-300 to-slate-400', medal: '🥈', ring: 'ring-slate-300', avatar: 'from-slate-200 to-slate-400 text-slate-800', score: 'text-slate-200', label: '2위', delay: 0.25 },
  3: { height: 'h-16 sm:h-24', step: 'from-orange-200 via-amber-600 to-orange-700', medal: '🥉', ring: 'ring-orange-400', avatar: 'from-orange-300 to-amber-700 text-orange-950', score: 'text-orange-200', label: '3위', delay: 0 },
}

// 클러스터 시상대: 2위 · 1위 · 3위 순으로 세운다
function Podium({ cluster, ranks, single }) {
  const order = [[ranks[1], 2], [ranks[0], 1], [ranks[2], 3]]
  return (
    <div className={`w-full ${single ? 'max-w-xl' : 'max-w-md'}`}>
      <p className="mb-5 text-center text-sm font-bold tracking-wide text-indigo-200">✦ 클러스터 {cluster ?? '-'} ✦</p>
      <div className="grid grid-cols-3 items-end gap-2 sm:gap-3">
        {order.map(([entry, place]) => {
          const style = PLACES[place]
          return (
            <div key={place} className="ig-anim flex min-w-0 flex-col items-center" style={{ animation: `ig-rise .7s ease-out ${style.delay}s both` }}>
              {entry ? (
                <>
                  {place === 1 && <span className="ig-anim text-3xl sm:text-4xl" style={{ animation: 'ig-float 2.4s ease-in-out infinite' }} aria-hidden="true">👑</span>}
                  <span className={`grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br text-lg font-black shadow-lg ring-4 sm:h-16 sm:w-16 sm:text-2xl ${style.avatar} ${style.ring} ${place === 1 ? 'shadow-amber-400/50' : ''}`} aria-hidden="true">
                    {String(entry.name).slice(0, 1)}
                  </span>
                  <p className={`mt-2 w-full truncate text-center font-black ${place === 1 ? 'text-base sm:text-xl' : 'text-sm sm:text-base'}`} title={entry.name}>{entry.name}</p>
                  {entry.members.length > 1 && <p className="w-full truncate text-center text-xs text-indigo-200" title={entry.members.join(', ')}>{entry.members.join(', ')}</p>}
                  <p className={`text-sm font-black sm:text-base ${style.score}`}>{entry.score.toFixed(2)}<span className="ml-0.5 text-xs font-bold">점</span></p>
                </>
              ) : <p className="pb-2 text-xs text-indigo-300/60">—</p>}
              <div className={`mt-2 flex w-full flex-col items-center rounded-t-xl bg-gradient-to-b pt-2 shadow-xl ${style.step} ${style.height}`}>
                <span className="text-2xl sm:text-3xl" role="img" aria-label={style.label}>{style.medal}</span>
                <span className="text-lg font-black text-white/90 drop-shadow sm:text-2xl">{place}</span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="h-2 rounded-b-xl bg-gradient-to-r from-violet-400/40 via-amber-300/60 to-violet-400/40" aria-hidden="true" />
    </div>
  )
}
