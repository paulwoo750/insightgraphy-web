'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FolderKanban,
  Settings2,
  UsersRound,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { currentSemesterIdFilter, fetchCurrentSemester } from '@/lib/semester'
import { useAdminContext } from '@/app/admin/_components/AdminShell'
import { AdminPage, EmptyState, PageHeader, Panel, StatusBadge } from '@/app/admin/_components/AdminUI'

const moduleLinks = [
  { href: '/admin/hub/semesters', label: '학기 및 주차', description: '현재 학기, 주차 주제와 진행 상태', icon: CalendarDays, source: 'semesters' },
  { href: '/admin/hub/members', label: '학회원', description: '인물 정보와 학기별 참여 및 직책', icon: UsersRound, source: 'members' },
  { href: '/admin/hub/dashboard', label: '세션 및 제출', description: '세션 구성, 제출 파일과 마감', icon: FolderKanban, source: 'sessions' },
  { href: '/admin/hub/archive', label: '아카이브', description: '공용 자료와 과거 학기 자료', icon: Archive, source: 'files_metadata' },
  { href: '/admin/hub/absence', label: '사유서', description: '사유서 검토와 승인 처리', icon: ClipboardCheck, source: 'absence_forms' },
  { href: '/admin/hub/attendance', label: '출결 대시보드', description: '개인별 출결, 위험 기준과 벌금 현황', icon: CalendarCheck2, source: 'pr_attendance' },
]

function localDate(value) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' }).format(new Date(`${value}T00:00:00`))
}

export default function AdminHubPage() {
  const { semester } = useAdminContext() || {}
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({ members: 0, participants: 0, upcomingEvents: [], issues: 0 })

  useEffect(() => {
    let active = true

    async function fetchSummary() {
      setLoading(true)
      const today = new Date().toISOString().slice(0, 10)
      const [membersResult, membershipResult, eventResult, issueResult] = await Promise.all([
        supabase.from('members').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        semester?.id
          ? supabase.from('semester_memberships').select('id', { count: 'exact', head: true }).eq('semester_id', semester.id).eq('participation_status', 'active')
          : Promise.resolve({ count: 0 }),
        // 일정의 기준 테이블은 학기별 pr_schedules다(calendar_events는 1회 백필 후 동기화되지 않는다).
        fetchCurrentSemester().then((current) =>
          supabase.from('pr_schedules').select('id, title, full_date, type').or(currentSemesterIdFilter(current)).gte('full_date', today).order('full_date').limit(5)
        ),
        supabase.from('data_migration_issues').select('id', { count: 'exact', head: true }).is('resolved_at', null),
      ])

      if (!active) return
      setSummary({
        members: membersResult.count || 0,
        participants: membershipResult.count || 0,
        upcomingEvents: eventResult.data || [],
        issues: issueResult.count || 0,
      })
      setLoading(false)
    }

    fetchSummary()
    return () => {
      active = false
    }
  }, [semester?.id])

  const tasks = useMemo(() => {
    const items = []
    if (!semester) items.push({ tone: 'red', title: '활성 학기를 지정해야 합니다.', href: '/admin/hub/semesters', action: '학기 설정' })
    if (semester && !semester.current_week_no) items.push({ tone: 'amber', title: '현재 주차가 지정되지 않았습니다.', href: '/admin/hub/semesters', action: '주차 지정' })
    if (semester && summary.participants === 0) items.push({ tone: 'amber', title: '현재 학기에 참여 학회원이 없습니다.', href: '/admin/hub/members', action: '명단 편성' })
    if (summary.issues > 0) items.push({ tone: 'red', title: `확인되지 않은 마이그레이션 항목이 ${summary.issues}건 있습니다.`, href: '/admin/hub/semesters', action: '상태 확인' })
    return items
  }, [semester, summary.issues, summary.participants])

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Operations Overview"
        title="운영 현황"
        description="학기, 학회원, 일정과 데이터 연결 상태를 한 화면에서 확인합니다. 각 정보는 표시된 기준 테이블에서 한 번만 관리합니다."
        actions={
          <Link href="/admin/hub/semesters" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800">
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            운영 설정
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric label="활성 학회원" value={loading ? '-' : `${summary.members}명`} note="members.status = active" />
        <Metric label="이번 학기 참여" value={loading ? '-' : `${summary.participants}명`} note={semester?.code || '활성 학기 없음'} tone="teal" />
        <Metric label="예정 일정" value={loading ? '-' : `${summary.upcomingEvents.length}건`} note="가까운 일정 5건 기준" tone="blue" />
        <Metric label="데이터 확인 필요" value={loading ? '-' : `${summary.issues}건`} note="미해결 연결 항목" tone={summary.issues ? 'red' : 'green'} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <div className="space-y-5">
          <Panel title="운영 작업" description="설정 누락이나 확인이 필요한 항목입니다.">
            {tasks.length === 0 ? (
              <div className="flex items-center gap-3 px-5 py-5">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                <div>
                  <p className="text-sm font-bold text-slate-800">현재 확인이 필요한 운영 설정이 없습니다.</p>
                  <p className="mt-0.5 text-xs text-slate-500">새 제출물과 일정은 각 관리 화면에서 계속 확인할 수 있습니다.</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {tasks.map((task) => (
                  <Link key={task.title} href={task.href} className="flex min-h-16 items-center gap-3 px-5 py-3 hover:bg-slate-50">
                    <AlertTriangle className={`h-5 w-5 shrink-0 ${task.tone === 'red' ? 'text-red-600' : 'text-amber-600'}`} aria-hidden="true" />
                    <p className="min-w-0 flex-1 text-sm font-semibold text-slate-800">{task.title}</p>
                    <span className="shrink-0 text-xs font-bold text-teal-700">{task.action}</span>
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="관리 영역" description="정보의 소유 화면과 기준 데이터가 분리되지 않도록 구성했습니다.">
            <div className="divide-y divide-slate-100">
              {moduleLinks.map((module) => {
                const Icon = module.icon
                return (
                  <Link key={module.href} href={module.href} className="grid min-h-[72px] grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                    <div className="grid h-9 w-9 place-items-center border border-slate-200 bg-slate-50 text-slate-600">
                      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{module.label}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{module.description}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <code className="hidden rounded bg-slate-100 px-2 py-1 text-[10px] text-slate-500 sm:block">{module.source}</code>
                      <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    </div>
                  </Link>
                )
              })}
            </div>
          </Panel>
        </div>

        <Panel title="다가오는 일정" description="오늘 이후 가까운 일정입니다." className="self-start">
          {summary.upcomingEvents.length === 0 && !loading ? (
            <EmptyState title="등록된 예정 일정이 없습니다." description="전체 일정 화면에서 새 일정을 등록할 수 있습니다." />
          ) : (
            <div className="divide-y divide-slate-100">
              {summary.upcomingEvents.map((event) => (
                <Link key={event.id} href="/admin/hub/schedule" className="flex items-center gap-3 px-4 py-4 hover:bg-slate-50">
                  <div className="w-16 shrink-0 text-xs font-bold text-slate-500">{localDate(event.full_date)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-800">{event.title}</p>
                    <div className="mt-1"><StatusBadge tone="gray">{event.type}</StatusBadge></div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </AdminPage>
  )
}

function Metric({ label, value, note, tone = 'gray' }) {
  const border = {
    gray: 'border-t-slate-300',
    teal: 'border-t-teal-600',
    blue: 'border-t-blue-600',
    green: 'border-t-emerald-600',
    red: 'border-t-red-600',
  }
  return (
    <div className={`min-h-[112px] rounded-md border border-slate-200 border-t-[3px] bg-white p-4 ${border[tone] || border.gray}`}>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 truncate text-[10px] text-slate-400">{note}</p>
    </div>
  )
}
