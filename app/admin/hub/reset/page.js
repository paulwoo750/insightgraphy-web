'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Archive, ArrowRight, CalendarCheck, CheckCircle2, Database, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAdminContext, useAdminRole } from '@/app/admin/_components/AdminShell'
import { AdminPage, EmptyState, PageHeader, Panel, PresidentOnly, StatusBadge } from '@/app/admin/_components/AdminUI'

// 학기 마감 점검은 학회장·개발자만 연다 (조회만 하는 화면)
export default function SemesterCloseoutPage() {
  const { isSuperAdmin } = useAdminRole()
  if (!isSuperAdmin) return <PresidentOnly title="학기 마감 점검" />
  return <SemesterCloseoutTool />
}

function SemesterCloseoutTool() {
  const { semester } = useAdminContext() || {}
  const [loading, setLoading] = useState(true)
  const [counts, setCounts] = useState({ files: 0, scores: 0, attendance: 0, fines: 0, absences: 0, sessions: 0 })

  useEffect(() => {
    let active = true

    async function fetchStatus() {
      if (!semester?.id) {
        setLoading(false)
        return
      }

      const { data: weekRows } = await supabase.from('semester_weeks').select('id').eq('semester_id', semester.id)
      const weekIds = (weekRows || []).map((week) => week.id)
      const [files, scores, attendance, fines, absences, sessions] = await Promise.all([
        supabase.from('files_metadata').select('id', { count: 'exact', head: true }).eq('semester_id', semester.id),
        supabase.from('scores').select('id', { count: 'exact', head: true }).eq('semester_id', semester.id),
        supabase.from('pr_attendance').select('id', { count: 'exact', head: true }).eq('semester_id', semester.id),
        supabase.from('pr_fines').select('id', { count: 'exact', head: true }).eq('semester_id', semester.id),
        supabase.from('absence_forms').select('id', { count: 'exact', head: true }).eq('semester_id', semester.id),
        weekIds.length > 0
          ? supabase.from('sessions').select('id', { count: 'exact', head: true }).in('semester_week_id', weekIds)
          : Promise.resolve({ count: 0 }),
      ])

      if (!active) return
      setCounts({
        files: files.count || 0,
        scores: scores.count || 0,
        attendance: attendance.count || 0,
        fines: fines.count || 0,
        absences: absences.count || 0,
        sessions: sessions.count || 0,
      })
      setLoading(false)
    }

    fetchStatus()
    return () => {
      active = false
    }
  }, [semester?.id])

  return (
    <AdminPage>
      <PageHeader
        eyebrow="정책 및 시스템"
        title="학기 마감 점검"
        description="현재 데이터는 삭제하지 않습니다. 기록 보존 상태를 확인한 뒤 새 학기를 준비하고 전환합니다."
        actions={
          <Link href="/admin/hub/semesters" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800">
            새 학기 준비
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        }
      />

      {!semester ? (
        <Panel><EmptyState title="활성 학기가 없습니다." description="학기 및 주차 화면에서 운영할 학기를 지정하세요." /></Panel>
      ) : (
        <>
          <div className="mb-5 rounded-lg bg-emerald-50 px-4 py-3">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden="true" />
              <div>
                <p className="text-sm font-bold text-emerald-900">삭제 없는 마감 방식이 적용됐습니다.</p>
                <p className="mt-0.5 text-xs leading-5 text-emerald-800">기존의 일정·마감·사유서 일괄 삭제 기능은 제거했습니다. 새 학기를 활성화해도 과거 기록은 학기 ID로 보존됩니다.</p>
              </div>
            </div>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <RecordCount label="세션" value={counts.sessions} />
            <RecordCount label="제출 파일" value={counts.files} />
            <RecordCount label="평가 점수" value={counts.scores} />
            <RecordCount label="출석 기록" value={counts.attendance} />
            <RecordCount label="벌금 기록" value={counts.fines} />
            <RecordCount label="사유서" value={counts.absences} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Panel title="마감 절차" description={`${semester.name} 기록을 보존하면서 다음 학기로 전환합니다.`}>
              <div className="divide-y divide-slate-100">
                <CloseoutStep number="1" icon={Database} title="기록 연결 확인" description="출석, 벌금, 사유서, 파일과 점수가 현재 학기 ID에 연결됐는지 위 집계로 확인합니다." status="확인" />
                <CloseoutStep number="2" icon={Archive} title="공개 자료 정리" description="아카이브 화면에서 공개 범위와 파일명을 검토합니다. 원본 파일은 삭제하지 않습니다." href="/admin/hub/archive" status="검토" />
                <CloseoutStep number="3" icon={CalendarCheck} title="다음 학기 생성" description="학기 및 주차 화면에서 준비 상태의 새 학기와 주차를 생성합니다." href="/admin/hub/semesters" status="준비" />
                <CloseoutStep number="4" icon={CheckCircle2} title="현재 학기 전환" description="검토가 끝난 새 학기를 현재 학기로 전환합니다. 기존 학기는 종료 상태로 보존되고, 타임라인·마감·조 편성은 학기별로 나뉘어 새 학기는 빈 상태로 시작합니다." href="/admin/hub/semesters" status="전환" />
              </div>
            </Panel>

            <Panel title="현재 학기" description="canonical semester record" className="self-start">
              <dl className="divide-y divide-slate-100 text-sm">
                <InfoRow label="학기" value={semester.name} />
                <InfoRow label="코드" value={semester.code} mono />
                <InfoRow label="유형" value={semester.semester_type === 'vacation' ? '방학 학기' : '정규 학기'} />
                <InfoRow label="현재 주차" value={`${semester.current_week_no || 1} / ${semester.total_weeks}주`} />
                <div className="flex items-center justify-between px-4 py-3"><dt className="text-xs font-semibold text-slate-500">상태</dt><dd><StatusBadge tone="green">운영 중</StatusBadge></dd></div>
              </dl>
            </Panel>
          </div>
        </>
      )}

      {loading && <p className="mt-4 text-center text-xs font-semibold text-slate-400">학기 기록을 확인하고 있습니다.</p>}
    </AdminPage>
  )
}

function RecordCount({ label, value }) {
  return <div className="border-t-[3px] border-teal-500 bg-gradient-to-b from-teal-50/70 to-white px-4 pb-4 pt-3"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1.5 text-xl font-bold text-slate-950">{value}건</p></div>
}

function CloseoutStep({ number, icon: Icon, title, description, href, status }) {
  const content = (
    <div className="grid min-h-[86px] grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-5">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-teal-50 text-teal-700"><Icon className="h-[18px] w-[18px]" aria-hidden="true" /></div>
      <div><p className="text-sm font-bold text-slate-900"><span className="mr-2 text-slate-400">{number}.</span>{title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div>
      <span className="text-xs font-bold text-teal-700">{status}</span>
    </div>
  )
  return href ? <Link href={href} className="block hover:bg-slate-50">{content}</Link> : content
}

function InfoRow({ label, value, mono }) {
  return <div className="flex items-center justify-between gap-4 px-4 py-3"><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className={`text-right text-sm font-bold text-slate-800 ${mono ? 'font-mono' : ''}`}>{value}</dd></div>
}
