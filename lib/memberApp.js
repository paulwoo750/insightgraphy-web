// 휴대폰 앱(/app) 데이터: 마감과 내 제출 여부, 베스트 프레젠터. 계산은 웹 화면과 같은 함수를 쓴다.
import { supabase } from '@/lib/supabase'
import { ATTENDANCE_DEADLINES, currentSemesterIdFilter, deadlineLabel, groupDeadlines } from '@/lib/semester'
import { normalizeFileCategory } from '@/lib/archive'
import { groupScores, weekRanking } from '@/lib/ranking'

// 마감 종류별 이모지·이동할 화면
const DEADLINE_KINDS = {
  proposal: { emoji: '📝', href: '/dashboard/proposal', submission: true },
  slide: { emoji: '🖥️', href: '/dashboard/slide', submission: true },
  video: { emoji: '🎬', href: '/dashboard/video', submission: true },
  proposal_comment: { emoji: '💬', href: '/dashboard/proposal' },
  vote_feedback: { emoji: '🗣️', href: '/vote/feedback' },
  video_comment: { emoji: '🪞', href: '/dashboard/video' },
  absence: { emoji: '📮', href: '/archive/absence' },
  weekday_absence: { emoji: '📮', href: '/archive/absence', weekday: true },
  weekday_self: { emoji: '🪞', href: '/dashboard/video', weekday: true },
  weekday_upload: { emoji: '🎬', href: '/dashboard/video', weekday: true },
  weekday_feedback: { emoji: '🗣️', href: '/dashboard/video', weekday: true },
}

export function deadlineKind(category) {
  return DEADLINE_KINDS[category] || { emoji: '⏳', href: '/home' }
}

// 그 주차 팀 발표면 내 팀 번호
function teamOf(weeklySetup, week, name) {
  const setup = weeklySetup?.[week] || {}
  return setup.evalMode === 'team' ? (setup.memberTeams || setup.members || {})[name] ?? null : null
}

// 이번 학기 마감 목록 + 기획서·슬라이드·영상은 내 제출 여부
export async function loadDeadlines(semester, identity) {
  const name = identity.member?.name || identity.session?.user?.user_metadata?.name || ''
  const [deadlineResult, fileResult] = await Promise.all([
    supabase.from('pr_deadlines').select('week, category, deadline_time, semester_id').or(currentSemesterIdFilter(semester)),
    supabase.from('files_metadata').select('week, file_category, uploader, uploader_member_id, created_at, is_late').eq('semester', semester.code).limit(2000),
  ])
  if (deadlineResult.error) throw deadlineResult.error
  if (fileResult.error) throw fileResult.error
  const files = fileResult.data || []
  const mine = (week, category) => {
    const team = teamOf(semester.weeklySetup, week, name)
    return files.find((file) => file.week === week
      && normalizeFileCategory(file.file_category) === category
      && ((identity.member && file.uploader_member_id === identity.member.id) || file.uploader === name || (team != null && (file.uploader === `Team ${team}` || file.uploader === `Team #${team}`)))) || null
  }
  const grouped = groupDeadlines(deadlineResult.data)
  const items = []
  for (const [weekKey, map] of Object.entries(grouped)) {
    for (const [category, at] of Object.entries(map)) {
      if (!at || ATTENDANCE_DEADLINES.includes(category)) continue
      const week = Number(weekKey)
      const kind = deadlineKind(category)
      if (kind.weekday && semester.type !== 'vacation') continue
      items.push({
        key: `${week}-${category}`,
        week,
        category,
        at,
        label: deadlineLabel(category),
        emoji: kind.emoji,
        href: `${kind.href}?week=${week}${kind.weekday ? '&session=weekday' : ''}`,
        submission: Boolean(kind.submission),
        submitted: kind.submission ? mine(week, category) : null,
      })
    }
  }
  return items.sort((a, b) => new Date(a.at) - new Date(b.at))
}

// 이번 학기 발표·점수 → 점수가 있는 주차와 주차별 순위
export async function loadRanking(semesterCode) {
  const [presentationResult, scoreResult] = await Promise.all([
    supabase.from('presentations').select('*').eq('semester', semesterCode),
    supabase.from('scores').select('presentation_id, total_score, details').eq('semester', semesterCode),
  ])
  if (presentationResult.error) throw presentationResult.error
  if (scoreResult.error) throw scoreResult.error
  const presentations = presentationResult.data || []
  const scoresByPresentation = groupScores(scoreResult.data)
  const weeks = [...new Set(presentations.map((row) => row.week))]
    .filter((week) => weekRanking(presentations, scoresByPresentation, week).clusters.length > 0)
    .sort((a, b) => a - b)
  return { presentations, scoresByPresentation, weeks }
}

// D-day 표시와 색 (하루 안 = 빨강, 사흘 안 = 주황)
export function dueChip(iso, now = Date.now()) {
  const diff = new Date(iso).getTime() - now
  if (Number.isNaN(diff)) return { text: '', tone: 'bg-slate-100 text-slate-500' }
  if (diff < 0) return { text: '마감', tone: 'bg-slate-100 text-slate-500' }
  const hours = Math.floor(diff / 3600000)
  if (hours < 24) return { text: hours < 1 ? `${Math.max(1, Math.floor(diff / 60000))}분 남음` : `${hours}시간 남음`, tone: 'bg-red-100 text-red-700' }
  const days = Math.floor(hours / 24)
  return { text: `D-${days}`, tone: days <= 3 ? 'bg-amber-100 text-amber-800' : 'bg-teal-100 text-teal-800' }
}
