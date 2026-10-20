// 베스트 프레젠터 계산 (웹 시상식·휴대폰 앱·관리자 알림이 같이 쓴다)

// 정성 피드백만 임시 저장한 행(점수 없음, 0점)은 순위에 넣지 않는다
export const isRealScore = (row) => Boolean(row.details?.scores) || Number(row.total_score) > 0
export const avgOf = (rows) => (rows.length ? rows.reduce((sum, row) => sum + (row.total_score || 0), 0) / rows.length : 0)

// 같은 order_index가 여러 명이면 팀 발표로 본다
export function buildEntries(presentations, scoresByPresentation) {
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

export function groupScores(scores) {
  const map = {}
  ;(scores || []).filter(isRealScore).forEach((row) => { (map[row.presentation_id] ||= []).push(row) })
  return map
}

// 한 주차의 클러스터별 1~3위 (점수 있는 발표만)
export function weekRanking(presentations, scoresByPresentation, week) {
  const weekPresentations = presentations.filter((row) => row.week === week)
  const entries = buildEntries(weekPresentations, scoresByPresentation)
  const clusters = [...new Set(entries.map((entry) => entry.cluster))].sort((a, b) => (a ?? 0) - (b ?? 0))
  return {
    topic: weekPresentations[0]?.topic || '',
    clusters: clusters
      .map((cluster) => ({ cluster, ranks: entries.filter((entry) => entry.cluster === cluster && entry.score > 0).sort((a, b) => b.score - a.score).slice(0, 3) }))
      .filter((item) => item.ranks.length > 0),
  }
}

// 1위들을 한 줄로: "1클러스터 김하늘 · 2클러스터 3팀"
export function winnersLine(ranking) {
  return ranking.clusters
    .map((item) => `${ranking.clusters.length > 1 ? `${item.cluster ?? '-'}클러스터 ` : ''}${item.ranks[0].name}`)
    .join(' · ')
}
