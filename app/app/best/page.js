'use client'
// 앱 베스트 탭: 주차별 클러스터 1~3위와 그 주 내 순위
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { fetchCurrentSemester } from '@/lib/semester'
import { loadRanking } from '@/lib/memberApp'
import { buildEntries, weekRanking } from '@/lib/ranking'
import { useMember } from '@/app/components/MemberShell'
import { AppSection, AppTitle } from '../_components/AppShell'

const MEDALS = ['🥇', '🥈', '🥉']

export default function AppBest() {
  const identity = useMember()
  const [data, setData] = useState({ status: 'loading' })
  const [week, setWeek] = useState(null)

  useEffect(() => {
    if (identity.status !== 'ready' || !identity.session) return undefined
    let active = true
    fetchCurrentSemester()
      .then(async (semester) => ({ semester, ranking: await loadRanking(semester.code) }))
      .then(({ semester, ranking }) => active && setData({ status: 'ready', semester, ...ranking }))
      .catch((error) => active && setData({ status: 'error', error: error.message }))
    return () => { active = false }
  }, [identity])

  const name = identity.member?.name || identity.session?.user?.user_metadata?.name || ''
  const activeWeek = week ?? (data.status === 'ready' ? data.weeks[data.weeks.length - 1] : null)
  const view = useMemo(() => {
    if (data.status !== 'ready' || activeWeek == null) return null
    const ranking = weekRanking(data.presentations, data.scoresByPresentation, activeWeek)
    // 내 순위: 내 클러스터 안에서 점수 순
    const entries = buildEntries(data.presentations.filter((row) => row.week === activeWeek), data.scoresByPresentation)
    const mine = entries.find((entry) => entry.members.includes(name))
    let myRank = null
    if (mine && mine.score > 0) {
      const sameCluster = entries.filter((entry) => entry.cluster === mine.cluster && entry.score > 0).sort((a, b) => b.score - a.score)
      myRank = { rank: sameCluster.findIndex((entry) => entry.key === mine.key) + 1, total: sameCluster.length, score: mine.score, cluster: mine.cluster }
    }
    return { ...ranking, myRank }
  }, [data, activeWeek, name])

  return (
    <div>
      <AppTitle title="베스트 프레젠터" description="주차별 클러스터 1~3위예요. 점수는 학회원 채점 평균입니다." />
      {data.status === 'loading' && <p className="py-6 text-sm text-slate-400">불러오는 중…</p>}
      {data.status === 'error' && <p className="py-6 text-sm text-red-600">결과를 불러오지 못했어요.</p>}
      {data.status === 'ready' && data.weeks.length === 0 && (
        <div className="rounded-3xl bg-gradient-to-br from-indigo-50 to-violet-50 px-6 py-10 text-center">
          <p className="text-4xl" aria-hidden="true">🏆</p>
          <p className="mt-2 font-bold text-slate-800">아직 채점된 발표가 없어요</p>
          <p className="mt-1 text-sm text-slate-500">세션이 끝나고 채점이 모이면 여기에 나와요.</p>
        </div>
      )}

      {data.status === 'ready' && data.weeks.length > 0 && (
        <>
          <div role="group" aria-label="주차 고르기" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {data.weeks.map((value) => (
              <button key={value} type="button" aria-pressed={value === activeWeek} onClick={() => setWeek(value)} className={`min-h-9 shrink-0 rounded-full px-3.5 text-sm font-bold transition ${value === activeWeek ? 'bg-violet-700 text-white' : 'bg-violet-50 text-violet-800'}`}>W{value}</button>
            ))}
          </div>

          {view && (
            <>
              <div className="mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 px-5 py-5 text-white">
                <p className="text-xs font-bold text-amber-200">W{activeWeek}{view.topic ? ` · ${view.topic}` : ''}</p>
                <div className="mt-3 space-y-4">
                  {view.clusters.map((cluster) => (
                    <div key={cluster.cluster ?? 'none'}>
                      {view.clusters.length > 1 && <p className="mb-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-violet-200">{cluster.cluster ?? '-'}클러스터</p>}
                      <ol className="space-y-1.5">
                        {cluster.ranks.map((entry, index) => (
                          <li key={entry.key} className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${index === 0 ? 'bg-gradient-to-r from-amber-300 to-yellow-200 text-amber-950' : 'bg-white/10'}`}>
                            <span className="text-2xl" aria-label={`${index + 1}위`}>{MEDALS[index]}</span>
                            <span className="min-w-0 flex-1">
                              <span className={`block truncate font-black ${index === 0 ? 'text-lg' : ''}`}>{entry.name}</span>
                              {entry.members.length > 1 && <span className={`block truncate text-xs ${index === 0 ? 'text-amber-900/80' : 'text-white/70'}`}>{entry.members.join(', ')}</span>}
                            </span>
                            <span className={`shrink-0 text-sm font-black ${index === 0 ? '' : 'text-white/80'}`}>{entry.score.toFixed(1)}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </div>

              <AppSection title="이번 주 내 결과">
                {view.myRank ? (
                  <p className="text-sm text-slate-700">
                    {view.clusters.length > 1 && <>{view.myRank.cluster}클러스터 · </>}
                    <span className="text-2xl font-black text-violet-800">{view.myRank.rank}위</span>
                    <span className="text-slate-500"> / {view.myRank.total}명 · 평균 {view.myRank.score.toFixed(1)}점</span>
                  </p>
                ) : <p className="text-sm text-slate-500">이 주차에 채점된 내 발표가 없어요.</p>}
                <Link href="/vote/results/my" className="mt-3 inline-block text-sm font-bold text-teal-700">내 점수 분석 보기 →</Link>
              </AppSection>
            </>
          )}
        </>
      )}
    </div>
  )
}
