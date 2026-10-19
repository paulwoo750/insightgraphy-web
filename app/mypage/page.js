'use client'
// 마이페이지: 학기별 출결·지각·무단/인정결석, 벌금(미납·납부·면제·취소), 사유서, 평가 바로가기
// 관리자 출결 대시보드·벌금 관리와 같은 계산 함수(lib/memberRecords)를 쓴다.
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, BarChart3, MessageSquareText } from 'lucide-react'
import { compareSemesterCodes, formatKst } from '@/lib/semester'
import { fetchMyRecords } from '@/lib/myRecords'
import { absenceThresholds, ATTENDANCE_LABELS, attendanceKind, FINE_STATE_LABELS, fineState, inSemester, summarizeAttendance, summarizeFines } from '@/lib/memberRecords'
import { MemberHeader, MemberPage, useMember } from '@/app/components/MemberShell'
import { EmptyState, ErrorState, LoadingState, Notice, SegmentedControl, StatusBadge } from '@/app/components/ui'

const KIND_TONES = { attended: 'green', full: 'green', late: 'amber', partial: 'blue', unauthorized: 'red', missing: 'gray' }
const FINE_TONES = { unpaid: 'red', paid: 'green', waived: 'blue', voided: 'gray' }

export default function MyPage() {
  const router = useRouter()
  const identity = useMember()
  const [state, setState] = useState({ status: 'loading', error: '' })
  const [records, setRecords] = useState(null)
  const [semesterId, setSemesterId] = useState('')
  const [showVoided, setShowVoided] = useState(false)

  useEffect(() => {
    if (identity.status !== 'ready') return undefined
    if (!identity.session) {
      router.replace('/login?next=%2Fmypage')
      return undefined
    }
    let active = true
    fetchMyRecords({ member: identity.member, session: identity.session }).then((result) => {
      if (!active) return
      if (result.error) {
        setState({ status: 'error', error: result.error.message })
        return
      }
      setRecords(result)
      setSemesterId((current) => current || result.semesters.find((semester) => semester.status === 'active')?.id || '')
      setState({ status: 'ready', error: '' })
    })
    return () => {
      active = false
    }
  }, [identity.status, identity.session, identity.member, router])

  // 기록이 있는 학기 + 운영 학기
  const semesterOptions = useMemo(() => {
    if (!records) return []
    const used = new Set([...records.attendance, ...records.fines, ...records.absences].map((row) => row.semesterRow?.id).filter(Boolean))
    return records.semesters
      .filter((semester) => used.has(semester.id) || semester.status === 'active')
      .sort((a, b) => compareSemesterCodes(b.code, a.code))
  }, [records])

  const selected = semesterOptions.find((semester) => semester.id === semesterId) || semesterOptions[0]
  const view = useMemo(() => {
    if (!records || !selected) return null
    const attendance = records.attendance.filter((row) => inSemester(row, selected)).sort((a, b) => (b.week ?? 0) - (a.week ?? 0))
    const fines = records.fines.filter((row) => inSemester(row, selected))
    const absences = records.absences.filter((row) => row.semester_id ? row.semester_id === selected.id : selected.status === 'active')
    return { attendance, fines, absences, attendanceSummary: summarizeAttendance(attendance), fineSummary: summarizeFines(fines), thresholds: absenceThresholds(selected) }
  }, [records, selected])

  if (identity.status !== 'ready' || state.status === 'loading') return <MemberPage><LoadingState label="내 기록을 불러오는 중입니다." /></MemberPage>
  if (state.status === 'error') return <MemberPage><ErrorState title="내 기록을 불러오지 못했습니다." description={state.error} onRetry={() => window.location.reload()} /></MemberPage>

  const member = identity.member
  const name = member?.name || identity.session?.user?.user_metadata?.name || '학회원'
  const visibleFines = (view?.fines || []).filter((fine) => showVoided || fineState(fine) !== 'voided')

  return (
    <MemberPage>
      <MemberHeader
        eyebrow="마이페이지"
        title={name}
        description={[member?.generation, member?.university, member?.department].filter(Boolean).join(' · ') || identity.session?.user?.email}
        actions={semesterOptions.length > 0 && (
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
            학기
            <select value={selected?.id || ''} onChange={(event) => setSemesterId(event.target.value)} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold">
              {semesterOptions.map((semester) => <option key={semester.id} value={semester.id}>{semester.name}{semester.status === 'active' ? ' (이번 학기)' : ''}</option>)}
            </select>
          </label>
        )}
      />
      {records.nameFallback && <Notice tone="warning" className="mb-4" title="학회원 명단과 연결되지 않은 계정입니다">이름으로 찾은 기록을 보여 줍니다. 운영진에게 학회원 연결을 요청하세요.</Notice>}
      {records.ambiguousName && <Notice tone="info" className="mb-4">이름이 같은 학회원이 있어, 학회원 연결이 안 된 예전 기록 일부는 표시하지 않습니다. 빠진 기록이 있으면 운영진에게 알려 주세요.</Notice>}

      {!view ? <EmptyState title="표시할 기록이 없습니다." /> : (
        <div className="space-y-8">
          <section aria-labelledby="summary-title">
            <h2 id="summary-title" className="sr-only">{selected.name} 요약</h2>
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
              <Stat label="출석 (완전인정 포함)" value={`${view.attendanceSummary.presentLike}회`} />
              <Stat label="지각" value={`${view.attendanceSummary.counts.late}회`} tone={view.attendanceSummary.counts.late ? 'amber' : ''} />
              <Stat label="무단결석" value={`${view.attendanceSummary.counts.unauthorized}/${view.thresholds.unauthorized}회`} tone={view.attendanceSummary.counts.unauthorized ? 'red' : ''} note="회칙 기준" />
              <Stat label="인정결석 (부분)" value={`${view.attendanceSummary.counts.partial}회`} />
              <Stat label="미납 벌금" value={`₩${view.fineSummary.unpaidTotal.toLocaleString()}`} tone={view.fineSummary.unpaidTotal ? 'red' : ''} note={`${view.fineSummary.unpaidCount}건`} />
              <Stat label="납부 완료" value={`₩${view.fineSummary.paidTotal.toLocaleString()}`} note={`면제 ${view.fineSummary.waivedCount}건 · 취소 ${view.fineSummary.voidedCount}건`} />
            </dl>
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <section aria-labelledby="attendance-title" className="rounded-lg border border-slate-200">
              <h2 id="attendance-title" className="border-b border-slate-100 px-4 py-3 text-base font-bold text-slate-900">출결 기록</h2>
              {view.attendance.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">출결 기록이 없습니다.</p> : (
                <ul className="divide-y divide-slate-100">
                  {view.attendance.map((row) => {
                    const kind = attendanceKind(row.status)
                    return (
                      <li key={row.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                        <span className="w-10 rounded bg-slate-800 py-0.5 text-center text-xs font-bold text-white">W{row.week}</span>
                        {row.session_type === 'weekday' && <StatusBadge tone="teal">평일</StatusBadge>}
                        <StatusBadge tone={KIND_TONES[kind]}>{ATTENDANCE_LABELS[kind]}</StatusBadge>
                        <span className="ml-auto text-xs text-slate-500">{row.auto_marked_at ? '출석 마감 후 자동 처리' : formatKst(row.created_at)}{row.distance_m != null ? ` · ${row.distance_m}m` : ''}</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <section aria-labelledby="fines-title" className="rounded-lg border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <h2 id="fines-title" className="text-base font-bold text-slate-900">벌금 내역</h2>
                <SegmentedControl label="취소 내역" size="sm" value={showVoided ? 'all' : 'active'} onChange={(value) => setShowVoided(value === 'all')} options={[{ value: 'active', label: '유효' }, { value: 'all', label: '취소 포함' }]} />
              </div>
              {visibleFines.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">벌금이 없습니다.</p> : (
                <ul className="divide-y divide-slate-100">
                  {visibleFines.map((fine) => {
                    const stateKey = fineState(fine)
                    return (
                      <li key={fine.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                        <span className="w-10 shrink-0 rounded bg-slate-800 py-0.5 text-center text-xs font-bold text-white">W{fine.week}</span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate font-semibold ${stateKey === 'voided' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{fine.category}</span>
                          <span className="block truncate text-xs text-slate-500">{String(fine.reason || '').replace(/^\[(삭제됨|자동 취소|중복 취소)\]\s*/, '')}</span>
                        </span>
                        <span className="shrink-0 font-bold">₩{Number(fine.amount || 0).toLocaleString()}</span>
                        <StatusBadge tone={FINE_TONES[stateKey]}>{FINE_STATE_LABELS[stateKey]}</StatusBadge>
                      </li>
                    )
                  })}
                </ul>
              )}
              <p className="border-t border-slate-100 px-4 py-2.5 text-xs leading-5 text-slate-500">과제·피드백·출석 벌금은 자동으로 계산되고, 현장 지각 등은 운영진이 반영합니다. 납부 문의는 총무에게 해 주세요.</p>
            </section>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <section aria-labelledby="absence-title" className="rounded-lg border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h2 id="absence-title" className="text-base font-bold text-slate-900">사유서</h2>
                <Link href="/archive/absence" className="text-sm font-bold text-teal-700 hover:underline">사유서 쓰기</Link>
              </div>
              {view.absences.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">제출한 사유서가 없습니다.</p> : (
                <ul className="divide-y divide-slate-100">
                  {view.absences.map((absence) => (
                    <li key={absence.id} className="px-4 py-2.5 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-800">W{absence.week ?? '-'} {absence.type}</span>
                        <StatusBadge tone={absence.status === '대기' ? 'amber' : absence.status?.includes('불허') ? 'red' : 'green'}>{absence.status === '대기' ? '결재 대기' : absence.status}</StatusBadge>
                        <span className="ml-auto text-xs text-slate-500">{absence.target_date}</span>
                      </div>
                      {absence.admin_comment && absence.status !== '대기' && <p className="mt-1 whitespace-pre-wrap break-keep text-xs text-slate-600">{absence.admin_comment}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="evaluation-title" className="rounded-lg border border-slate-200 p-4">
              <h2 id="evaluation-title" className="text-base font-bold text-slate-900">평가·피드백</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Link href="/vote/results/my" className="flex items-center gap-3 rounded-md border border-slate-200 px-4 py-3 hover:border-teal-400">
                  <BarChart3 className="h-5 w-5 text-teal-700" aria-hidden="true" />
                  <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">내 점수·분석</span><span className="block text-xs text-slate-500">주차별 점수 추이와 수상 내역</span></span>
                  <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                </Link>
                <Link href="/vote/results/arxiv" className="flex items-center gap-3 rounded-md border border-slate-200 px-4 py-3 hover:border-teal-400">
                  <MessageSquareText className="h-5 w-5 text-teal-700" aria-hidden="true" />
                  <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900">받은 피드백</span><span className="block text-xs text-slate-500">정성·셀프 피드백 모아보기</span></span>
                  <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                </Link>
              </div>
            </section>
          </div>
        </div>
      )}
    </MemberPage>
  )
}

function Stat({ label, value, note, tone = '' }) {
  const color = tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-700' : 'text-slate-950'
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className={`mt-1 text-xl font-extrabold ${color}`}>{value}</dd>
      {note && <dd className="mt-0.5 text-xs text-slate-500">{note}</dd>}
    </div>
  )
}
