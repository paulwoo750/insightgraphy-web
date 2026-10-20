'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FolderKanban,
  Link2,
  Settings2,
  UsersRound,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchCurrentSemester, formatKst, formatKstDate, kstDateString } from '@/lib/semester'
import { fetchSemesterSchedules, scheduleTimeLabel } from '@/lib/schedules'
import { useAdminContext } from '@/app/admin/_components/AdminShell'
import { AdminPage, Button, EmptyState, ErrorState, LoadingState, Metric, PageHeader, Panel, ReadOnlyBanner, StatusBadge } from '@/app/admin/_components/AdminUI'

const moduleLinks = [
  { href: '/admin/hub/semesters', label: '학기 및 주차', description: '현재 학기, 주차 주제와 진행 상태', icon: CalendarDays, tile: 'bg-teal-100 text-teal-700' },
  { href: '/admin/hub/members', label: '학회원', description: '인물 정보와 학기별 참여 및 직책', icon: UsersRound, tile: 'bg-sky-100 text-sky-700' },
  { href: '/admin/hub/dashboard', label: '세션 및 제출', description: '주차별 주제·출석·마감·편성·제출물', icon: FolderKanban, tile: 'bg-violet-100 text-violet-700' },
  { href: '/admin/hub/archive', label: '아카이브', description: '공용 자료와 과거 학기 자료', icon: Archive, tile: 'bg-indigo-100 text-indigo-700' },
  { href: '/admin/hub/absence', label: '사유서', description: '사유서 검토와 승인 처리', icon: ClipboardCheck, tile: 'bg-amber-100 text-amber-700' },
  { href: '/admin/hub/attendance', label: '출결 대시보드', description: '개인별 출결, 위험 기준과 벌금 현황', icon: CalendarCheck2, tile: 'bg-emerald-100 text-emerald-700' },
]

export default function AdminHubPage() {
  const { semester, role } = useAdminContext() || {}
  const [state, setState] = useState({ status: 'loading', error: '' })
  const [summary, setSummary] = useState({ members: 0, participants: 0, upcomingEvents: [], issues: null, issuesError: '', legacy: null, week: null })
  const isDeveloper = role === 'developer'
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true

    async function fetchSummary() {
      setState({ status: 'loading', error: '' })
      const today = kstDateString()
      const current = await fetchCurrentSemester()
      const [membersResult, membershipResult, scheduleResult, issueResult] = await Promise.all([
        supabase.from('members').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        current.id
          ? supabase.from('semester_memberships').select('id', { count: 'exact', head: true }).eq('semester_id', current.id).eq('participation_status', 'active')
          : Promise.resolve({ count: 0 }),
        // 일정 원본은 학기별 pr_schedules (관리자는 내부 일정도 본다)
        fetchSemesterSchedules(current, { publicOnly: false }),
        supabase.from('data_migration_issues').select('id', { count: 'exact', head: true }).is('resolved_at', null),
      ])
      if (!active) return
      const failed = membersResult.error || scheduleResult.error
      if (failed) {
        setState({ status: 'error', error: failed.message })
        return
      }
      setSummary({
        members: membersResult.count || 0,
        participants: membershipResult.count || 0,
        upcomingEvents: (scheduleResult.data || []).filter((row) => row.full_date >= today).slice(0, 5),
        issues: issueResult.error ? null : issueResult.count || 0,
        issuesError: issueResult.error?.message || '',
        legacy: current.legacy,
        week: current.id ? { current: current.currentWeek, stored: current.storedCurrentWeek, source: current.currentWeekSource, date: current.currentWeekDate, total: current.totalWeeks } : null,
      })
      setState({ status: 'ready', error: '' })
    }

    fetchSummary()
    return () => {
      active = false
    }
  }, [semester?.id, reloadKey])

  const tasks = useMemo(() => {
    const items = []
    if (!semester) items.push({ tone: 'red', title: '활성 학기를 지정해야 합니다.', href: '/admin/hub/semesters', action: '학기 설정' })
    if (summary.week && summary.week.source === 'schedule' && summary.week.stored !== summary.week.current) items.push({ tone: 'amber', title: `저장된 현재 주차(W${summary.week.stored})가 날짜 기준 현재 주차(W${summary.week.current})와 다릅니다.`, description: '화면 표시는 이미 날짜 기준입니다. 학기 및 주차에서 맞추면 주차 진행 상태(완료·현재·예정)도 함께 맞춰집니다.', href: '/admin/hub/semesters', action: '맞추기' })
    if (summary.week && summary.week.source !== 'schedule') items.push({ tone: 'amber', title: '세션 날짜가 없어 저장된 현재 주차를 씁니다.', description: '전체 일정에 정규 세션 주차를 넣거나 출석 시간을 저장하면 실제 날짜로 현재 주차를 계산합니다.', href: '/admin/hub/schedule', action: '일정 입력' })
    if (semester && state.status === 'ready' && summary.participants === 0) items.push({ tone: 'amber', title: '현재 학기에 참여 학회원이 없습니다.', href: '/admin/hub/members', action: '명단 편성' })
    if (summary.legacy?.codeMismatch) items.push({ tone: 'amber', title: `예전 설정의 현재 학기(${summary.legacy.legacyCode})가 운영 학기와 다릅니다.`, href: '/admin/hub/semesters', action: '확인' })
    const topicIssues = (summary.legacy?.topicConflicts?.length || 0) + (summary.legacy?.topicsMissing?.length || 0)
    if (topicIssues > 0) items.push({ tone: 'amber', title: `주차 주제 ${topicIssues}칸이 예전 설정값과 다릅니다.`, href: '/admin/hub/semesters', action: '주제 확인' })
    if (isDeveloper && summary.issues > 0) items.push({ tone: 'amber', title: `연결 확인이 필요한 기존 기록이 ${summary.issues}건 있습니다.`, description: '실패한 작업이 아니라, 학회원과 연결되지 않은 예전 출결·벌금·제출 등의 기록입니다.', href: '/admin/hub/records', action: '목록 보기' })
    return items
  }, [semester, summary, state.status, isDeveloper])

  return (
    <AdminPage>
      <PageHeader
        eyebrow="운영 기준"
        title="운영 현황"
        description="학기, 학회원, 일정과 기록 연결 상태를 한 화면에서 확인합니다."
        actions={<Button variant="primary" icon={Settings2} href="/admin/hub/semesters">운영 설정</Button>}
      />
      <ReadOnlyBanner role={role} />

      {state.status === 'error' ? (
        <Panel><ErrorState title="운영 현황을 불러오지 못했습니다." description={state.error} onRetry={() => setReloadKey((key) => key + 1)} /></Panel>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Metric label="👥 활성 학회원" value={state.status === 'loading' ? '-' : `${summary.members}명`} note="활동 중인 학회원" tone="sky" icon={UsersRound} />
            <Metric label="🎓 이번 학기 참여" value={state.status === 'loading' ? '-' : `${summary.participants}명`} note={semester?.name || '활성 학기 없음'} tone="teal" icon={CheckCircle2} />
            <Metric label="📅 다가오는 일정" value={state.status === 'loading' ? '-' : `${summary.upcomingEvents.length}건`} note="오늘 이후 5건까지 · 내부 일정 포함" tone="blue" icon={CalendarDays} />
            {isDeveloper ? (
              <Metric
                label="🔗 연결 확인이 필요한 기존 기록"
                value={state.status === 'loading' ? '-' : summary.issues == null ? '확인 불가' : `${summary.issues}건`}
                note={summary.issuesError ? '열람 권한이 없거나 조회에 실패했습니다.' : '학회원과 연결되지 않은 예전 기록 (개발자 전용)'}
                tone={summary.issues ? 'amber' : 'green'}
                icon={Link2}
                href="/admin/hub/records"
              />
            ) : (
              <Metric
                label="📍 현재 주차"
                value={state.status === 'loading' || !summary.week ? '-' : `W${summary.week.current}`}
                note={summary.week?.date ? `다음 세션 ${formatKst(`${summary.week.date}T00:00:00+09:00`, { time: false })} · 날짜 기준` : '세션 날짜가 없어 저장된 주차'}
                tone="violet"
                icon={CalendarClock}
                href="/admin/hub/dashboard"
              />
            )}
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
            <div className="min-w-0 space-y-5">
              <Panel title="운영 작업" description="설정 누락이나 확인이 필요한 항목입니다.">
                {state.status === 'loading' ? <LoadingState /> : tasks.length === 0 ? (
                  <div className="flex items-center gap-3 px-5 py-5">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-bold text-slate-800">현재 확인이 필요한 운영 설정이 없습니다.</p>
                      <p className="mt-0.5 text-sm text-slate-500">새 제출물과 일정은 각 관리 화면에서 계속 확인할 수 있습니다.</p>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {tasks.map((task) => (
                      <Link key={task.title} href={task.href} className="flex min-h-16 items-center gap-3 px-5 py-3 hover:bg-slate-50">
                        <AlertTriangle className={`h-5 w-5 shrink-0 ${task.tone === 'red' ? 'text-red-600' : 'text-amber-600'}`} aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="break-keep text-sm font-semibold text-slate-800">{task.title}</p>
                          {task.description && <p className="mt-0.5 break-keep text-sm text-slate-500">{task.description}</p>}
                        </div>
                        <span className="shrink-0 text-sm font-bold text-teal-700">{task.action}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="관리 영역">
                <div className="divide-y divide-slate-100">
                  {[...moduleLinks, ...(isDeveloper ? [{ href: '/admin/hub/records', label: '기록 연결 검토', description: '학회원과 연결되지 않은 기존 기록 확인 (개발자)', icon: Link2, tile: 'bg-slate-900 text-white' }] : [])].map((module) => {
                    const Icon = module.icon
                    return (
                      <Link key={module.href} href={module.href} className="grid min-h-[72px] grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                        <div className={`grid h-9 w-9 place-items-center rounded-lg ${module.tile || 'bg-slate-100 text-slate-600'}`}>
                          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900">{module.label}</p>
                          <p className="mt-0.5 truncate text-sm text-slate-500">{module.description}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                      </Link>
                    )
                  })}
                </div>
              </Panel>
            </div>

            <Panel title="다가오는 일정" description="오늘(한국 날짜) 이후 가까운 일정" className="self-start" action={<Button size="sm" variant="ghost" href="/admin/hub/schedule">전체 일정</Button>}>
              {state.status === 'loading' ? <LoadingState /> : summary.upcomingEvents.length === 0 ? (
                <EmptyState title="등록된 예정 일정이 없습니다." description="전체 일정 화면에서 새 일정을 등록할 수 있습니다." />
              ) : (
                <div className="divide-y divide-slate-100">
                  {summary.upcomingEvents.map((event) => (
                    <Link key={event.id} href="/admin/hub/schedule" className="flex items-center gap-3 px-4 py-4 hover:bg-slate-50">
                      <div className="w-20 shrink-0 text-sm font-bold text-slate-600">{formatKstDate(event.full_date)}</div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-800">{event.title}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <StatusBadge tone="gray">{scheduleTimeLabel(event)}</StatusBadge>
                          {!event.is_public && <StatusBadge tone="amber">내부 일정</StatusBadge>}
                          {event.is_break && <StatusBadge tone="red">휴회</StatusBadge>}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </AdminPage>
  )
}
