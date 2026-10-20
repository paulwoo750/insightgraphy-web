'use client'
// 내 평가 결과: 학기별(또는 전체 누적) 점수 추이·영역 균형·분산·주차별 상세
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar,
  ComposedChart, Bar,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { fetchCurrentSemester, sortSemestersDesc } from '@/lib/semester'
import { MemberHeader, MemberPage, useMember } from '@/app/components/MemberShell'
import { ErrorState, LoadingState, StatusBadge } from '@/app/components/ui'

const CATEGORY_COLORS = ['#0f766e', '#0369a1', '#be185d', '#b45309', '#4338ca']
// 종합 카테고리('종합', '4. 종합')는 영역 분석에서 뺀다
const isSummaryCategory = (title) => String(title || '').replace(/^\d+\.\s*/, '').trim() === '종합'
const TOOLTIP_STYLE = { borderRadius: '6px', border: '1px solid #cbd5e1', boxShadow: 'none', fontSize: 12 }

// 정성 피드백만 임시 저장한 행(점수 없음, 0점)은 평가로 세지 않는다
const isRealScore = (row) => Boolean(row.details?.scores) || Number(row.total_score) > 0
const round1 = (value) => Math.round(value * 10) / 10
const average = (rows) => (rows.length ? round1(rows.reduce((sum, row) => sum + (row.total_score || 0), 0) / rows.length) : 0)

export default function MyAnalytics() {
  const router = useRouter()
  const identity = useMember()
  const [state, setState] = useState({ status: 'loading', error: '' })
  const [data, setData] = useState({ presentations: [], scores: [], files: [], semesterRows: [], criteria: [], currentCode: '' })
  const [selectedSemester, setSelectedSemester] = useState(null)

  const myName = identity.member?.name || identity.session?.user?.user_metadata?.name || ''

  useEffect(() => {
    if (identity.status !== 'ready') return undefined
    if (!identity.session) {
      router.replace('/login?next=%2Fvote%2Fresults%2Fmy')
      return undefined
    }
    let active = true
    async function load() {
      try {
        const current = await fetchCurrentSemester()
        const fileQuery = identity.member?.id
          ? supabase.from('files_metadata').select('id, semester, is_late, uploader, uploader_member_id').or(`uploader_member_id.eq.${identity.member.id},uploader.eq."${myName}"`)
          : supabase.from('files_metadata').select('id, semester, is_late, uploader, uploader_member_id').eq('uploader', myName)
        const [presentationRes, scoreRes, fileRes, semesterRes, criteriaRes] = await Promise.all([
          supabase.from('presentations').select('*'),
          supabase.from('scores').select('id, presentation_id, total_score, details, semester'),
          fileQuery,
          supabase.from('semesters').select('code, name, total_weeks, status'),
          supabase.from('pr_vote_criteria').select('*'),
        ])
        const failed = [presentationRes, scoreRes, fileRes, criteriaRes].find((result) => result.error)
        if (failed) throw failed.error
        if (!active) return
        setData({
          presentations: presentationRes.data || [],
          scores: (scoreRes.data || []).filter(isRealScore),
          files: fileRes.data || [],
          semesterRows: semesterRes.data || [],
          criteria: criteriaRes.data || [],
          currentCode: current.code,
        })
        setState({ status: 'ready', error: '' })
      } catch (error) {
        if (active) setState({ status: 'error', error: error.message })
      }
    }
    load()
    return () => { active = false }
  }, [identity.status, identity.session, identity.member?.id, myName, router])

  const categoryInfo = useMemo(() => {
    const criteriaMap = {}
    const names = []
    data.criteria.forEach((row) => {
      criteriaMap[row.version] = row.criteria_data || []
      ;(row.criteria_data || []).forEach((category) => {
        if (!isSummaryCategory(category.title) && !names.includes(category.title)) names.push(category.title)
      })
    })
    const colorMap = Object.fromEntries(names.map((name, index) => [name, CATEGORY_COLORS[index % CATEGORY_COLORS.length]]))
    return { names, colorMap, criteriaMap }
  }, [data.criteria])

  const semesterOptions = useMemo(() => {
    const codes = new Set([...data.scores.map((row) => row.semester), ...data.files.map((row) => row.semester), ...data.presentations.filter((row) => row.presenter_name === myName).map((row) => row.semester)].filter(Boolean))
    if (data.currentCode) codes.add(data.currentCode)
    const names = Object.fromEntries(data.semesterRows.map((row) => [row.code, row.name || row.code]))
    return sortSemestersDesc([...codes]).map((code) => ({ code, name: names[code] || code }))
  }, [data, myName])

  // 기본 학기: 현재 학기 → 기록이 있는 가장 최근 학기 → 전체
  const semester = selectedSemester ?? (semesterOptions.some((option) => option.code === data.currentCode) ? data.currentCode : semesterOptions[0]?.code || 'all')

  const report = useMemo(() => {
    const { names, criteriaMap } = categoryInfo
    const scores = semester === 'all' ? data.scores : data.scores.filter((row) => row.semester === semester)
    const files = semester === 'all' ? data.files : data.files.filter((row) => row.semester === semester)
    const presentations = semester === 'all' ? data.presentations : data.presentations.filter((row) => row.semester === semester)
    const scoresByPresentation = {}
    scores.forEach((row) => { (scoresByPresentation[row.presentation_id] ||= []).push(row) })

    const categoryScores = (row) => {
      const rubric = criteriaMap[row.details?.version || 'v1'] || []
      const itemScores = row.details?.scores || {}
      const result = Object.fromEntries(names.map((name) => [name, 0]))
      rubric.forEach((category) => {
        if (names.includes(category.title)) result[category.title] = category.items.reduce((sum, item) => sum + (itemScores[item.id] || 0), 0)
      })
      return result
    }
    const averageCategories = (rows) => {
      const totals = Object.fromEntries(names.map((name) => [name, 0]))
      rows.forEach((row) => {
        const values = categoryScores(row)
        names.forEach((name) => { totals[name] += values[name] })
      })
      return Object.fromEntries(names.map((name) => [name, rows.length ? round1(totals[name] / rows.length) : 0]))
    }

    // 실제 학기 주차 수 (전체 누적이면 기록된 가장 큰 주차)
    const semesterRow = data.semesterRows.find((row) => row.code === semester)
    const maxWeekInData = Math.max(0, ...presentations.map((row) => Number(row.week) || 0))
    const totalWeeks = Math.max(semesterRow?.total_weeks || 0, maxWeekInData, 1)

    const awards = []
    const clubTrend = []
    const variance = []
    const weekly = Array.from({ length: totalWeeks }, (_, index) => index + 1).map((week) => {
      const weekPresentations = presentations.filter((row) => row.week === week)
      const weekScores = weekPresentations.flatMap((row) => scoresByPresentation[row.id] || [])
      const clubAvg = average(weekScores)
      clubTrend.push({ name: `${week}주`, clubTotal: clubAvg })
      if (weekScores.length) {
        const totals = weekScores.map((row) => row.total_score || 0)
        variance.push({ name: `${week}주`, range: [Math.min(...totals), Math.max(...totals)], avg: clubAvg })
      }
      const mine = weekPresentations.find((row) => row.presenter_name === myName)
      if (!mine) return { name: `${week}주`, week, total: 0, presented: false }
      const ranking = weekPresentations
        .filter((row) => row.cluster_id === mine.cluster_id)
        .map((row) => ({ name: row.presenter_name, score: average(scoresByPresentation[row.id] || []) }))
        .sort((a, b) => b.score - a.score)
      if (ranking[0]?.name === myName && ranking[0].score > 0) awards.push({ week, semester: mine.semester, topic: mine.topic })
      const myScores = scoresByPresentation[mine.id] || []
      return { name: `${week}주`, week, total: average(myScores), presented: true, scored: myScores.length > 0, ...averageCategories(myScores) }
    })

    const myPresentations = presentations.filter((row) => row.presenter_name === myName)
    const myScores = myPresentations.flatMap((row) => scoresByPresentation[row.id] || [])
    // 만점: 내가 받은 평가표 버전 중 가장 큰 총점 (없으면 105)
    const versionMax = (version) => (criteriaMap[version] || []).reduce((sum, category) => sum + category.items.reduce((itemSum, item) => itemSum + Math.max(0, ...item.criteria.map((criterion) => criterion.s)), 0), 0)
    const maxTotal = Math.max(0, ...myScores.map((row) => versionMax(row.details?.version || 'v1'))) || 105

    return {
      weekly,
      clubTrend,
      variance,
      awards,
      maxTotal,
      myOverall: myScores.length ? { total: average(myScores), categories: averageCategories(myScores) } : null,
      clubOverall: averageCategories(scores),
      submissions: { total: files.length, late: files.filter((row) => row.is_late).length, presented: myPresentations.length },
    }
  }, [categoryInfo, data, semester, myName])

  if (identity.status !== 'ready' || state.status === 'loading') return <MemberPage><LoadingState label="평가 결과를 계산하는 중입니다." /></MemberPage>
  if (state.status === 'error') return <MemberPage><ErrorState title="평가 결과를 불러오지 못했습니다." description={state.error} onRetry={() => window.location.reload()} /></MemberPage>

  const radarData = categoryInfo.names.map((name) => ({ subject: name, me: report.myOverall?.categories[name] || 0, base: report.clubOverall[name] || 0 }))
  const scoredWeeks = report.weekly.filter((row) => row.scored)
  const semesterLabel = semester === 'all' ? '전체 누적' : semesterOptions.find((option) => option.code === semester)?.name || semester

  return (
    <MemberPage>
      <MemberHeader
        eyebrow="평가 결과"
        title="내 평가 리포트"
        description="받은 정량 평가를 학기별로 모아 봅니다. 정성 피드백만 임시 저장한 기록은 점수에 포함되지 않습니다."
        actions={(
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
            학기
            <select value={semester} onChange={(event) => setSelectedSemester(event.target.value)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-teal-600">
              <option value="all">전체 누적</option>
              {semesterOptions.map((option) => <option key={option.code} value={option.code}>{option.name}</option>)}
            </select>
          </label>
        )}
      >
        <div className="mt-3"><StatusBadge tone="teal">{semesterLabel} 리포트</StatusBadge></div>
      </MemberHeader>

      <div className="grid gap-8 lg:grid-cols-3">
        <section className="border-t-2 border-teal-600 pt-4">
          <h2 className="text-sm font-bold text-slate-600">평균 점수</h2>
          {report.myOverall ? (
            <>
              <p className="mt-3 text-5xl font-extrabold text-teal-800">{report.myOverall.total}<span className="ml-2 text-lg font-bold text-slate-400">/ {report.maxTotal}</span></p>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
                {categoryInfo.names.map((name) => (
                  <div key={name} className="min-w-0">
                    <dt className="truncate text-xs font-semibold text-slate-500" title={name}>{name}</dt>
                    <dd className="text-lg font-extrabold" style={{ color: categoryInfo.colorMap[name] }}>{report.myOverall.categories[name]}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : <p className="mt-6 text-sm text-slate-500">아직 받은 정량 평가가 없습니다.</p>}
        </section>

        <section className="border-t-2 border-teal-600 pt-4">
          <h2 className="text-sm font-bold text-slate-600">제출 현황</h2>
          <dl className="mt-3 divide-y divide-slate-100">
            <div className="flex items-baseline justify-between py-2.5"><dt className="text-sm text-slate-600">제출한 자료</dt><dd className="text-2xl font-extrabold text-teal-800">{report.submissions.total}건</dd></div>
            <div className="flex items-baseline justify-between py-2.5"><dt className="text-sm text-slate-600">지각 제출</dt><dd className="text-2xl font-extrabold text-red-700">{report.submissions.late}건</dd></div>
            <div className="flex items-baseline justify-between py-2.5"><dt className="text-sm text-slate-600">발표 횟수</dt><dd className="text-2xl font-extrabold text-slate-700">{report.submissions.presented}회</dd></div>
          </dl>
          <p className="mt-1 text-xs text-slate-500">주차별 제출 여부는 마이페이지와 각 자료실에서 확인하세요.</p>
        </section>

        <section className="flex flex-col border-t-2 border-teal-600 pt-4">
          <h2 className="text-sm font-bold text-slate-600">클러스터 1위 <span className="font-semibold text-slate-400">· {report.awards.length}회</span></h2>
          <ul className="mt-3 max-h-56 flex-1 space-y-2 overflow-y-auto">
            {report.awards.map((award) => (
              <li key={`${award.semester}-${award.week}`} className="border-b border-slate-100 pb-2">
                <p className="text-xs font-bold text-amber-700">{semester === 'all' && award.semester ? `${award.semester} · ` : ''}{award.week}주차 클러스터 1위</p>
                <p className="truncate text-sm font-semibold text-slate-800">{award.topic || '주제 미기록'}</p>
              </li>
            ))}
            {report.awards.length === 0 && <li className="py-10 text-center text-sm text-slate-500">아직 기록이 없습니다.</li>}
          </ul>
        </section>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <ChartCard title="총점 추이" empty={scoredWeeks.length === 0}>
          <LineChart data={scoredWeeks} margin={{ right: 20, left: -10, top: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, report.maxTotal]} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="total" name="내 점수" stroke="#0f766e" strokeWidth={3} dot={{ r: 4, fill: '#0f766e' }} />
            <Line data={report.clubTrend.filter((row) => row.clubTotal > 0)} type="monotone" dataKey="clubTotal" name="학회 평균" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
          </LineChart>
        </ChartCard>

        <ChartCard title="영역 균형 (학회 평균과 비교)" empty={!report.myOverall}>
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
            <PolarGrid stroke="#cbd5e1" />
            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: '#334155' }} />
            <Radar name="내 평균" dataKey="me" stroke="#0f766e" fill="#ccfbf1" fillOpacity={0.6} strokeWidth={2} />
            <Radar name="학회 평균" dataKey="base" stroke="#94a3b8" fill="#f1f5f9" fillOpacity={0.4} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
          </RadarChart>
        </ChartCard>

        <ChartCard title="주차별 점수 분포" empty={report.variance.length === 0}>
          <ComposedChart data={report.variance} margin={{ right: 20, left: -10, top: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, report.maxTotal]} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="range" fill="#e2e8f0" radius={[2, 2, 2, 2]} barSize={24} name="최저~최고" />
            <Line dataKey="avg" stroke="#0f766e" strokeWidth={3} dot={{ r: 4, fill: '#0f766e' }} name="학회 평균" />
          </ComposedChart>
        </ChartCard>

        <ChartCard title="영역별 추이" empty={scoredWeeks.length === 0}>
          <LineChart data={scoredWeeks} margin={{ right: 20, left: -10, top: 10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            {categoryInfo.names.map((name) => <Line key={name} name={name} type="monotone" dataKey={name} stroke={categoryInfo.colorMap[name]} strokeWidth={2.5} dot={{ r: 3 }} />)}
          </LineChart>
        </ChartCard>
      </div>

      <section className="mt-8 border-t-2 border-teal-600 pt-4">
        <h2 className="text-base font-bold text-slate-900">주차별 상세</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {report.weekly.map((row) => (
            <li key={row.week} className={`rounded-xl p-3 ${row.scored ? 'bg-teal-50/60' : 'bg-slate-50/70 opacity-80'}`}>
              <div className="flex items-baseline justify-between pb-1">
                <span className="text-base font-bold text-slate-900">W{row.week}</span>
                <span className={`text-sm font-bold ${row.scored ? 'text-teal-800' : 'text-slate-500'}`}>{row.scored ? `${row.total}점` : row.presented ? '평가 없음' : '발표 없음'}</span>
              </div>
              {row.scored && (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  {categoryInfo.names.map((name) => (
                    <div key={name} className="flex justify-between gap-1">
                      <dt className="truncate text-slate-500" title={name}>{name}</dt>
                      <dd className="font-bold text-slate-800">{row[name] || 0}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          ))}
        </ul>
      </section>
    </MemberPage>
  )
}

function ChartCard({ title, empty, children }) {
  return (
    <section className="flex h-[380px] flex-col border-t-2 border-teal-600 pt-4">
      <h2 className="text-sm font-bold text-slate-600">{title}</h2>
      <div className="mt-3 min-h-0 flex-1">
        {empty ? <p className="grid h-full place-items-center text-sm text-slate-500">표시할 평가 기록이 없습니다.</p> : <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>}
      </div>
    </section>
  )
}
