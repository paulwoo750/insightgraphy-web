'use client'
// 연결 확인이 필요한 기존 기록 (data_migration_issues 중 resolved_at이 없는 항목)
// 실패한 SQL이 아니라, 2026-08 이관 때 학회원 한 명으로 특정하지 못한 예전 기록이다.
// 먼저 지금 상태로 다시 진단하고(읽기 전용), 연결은 관리자가 학회원과 근거를 골라 한 건씩 한다.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Link2, ListPlus, RefreshCw, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatKst } from '@/lib/semester'
import { can } from '@/lib/permissions'
import { useAdminRole } from '@/app/admin/_components/AdminShell'
import {
  AdminPage,
  DeveloperOnly,
  Button,
  EmptyState,
  ErrorState,
  Field,
  inputClass,
  LoadingState,
  Metric,
  Modal,
  Notice,
  PageHeader,
  Panel,
  ReadOnlyBanner,
  StatusBadge,
  textareaClass,
  useAsyncAction,
  useToast,
} from '@/app/admin/_components/AdminUI'

const TABLES = {
  pr_attendance: { label: '출결', impact: '마이페이지·출결 대시보드에서 이 학회원의 출결로 집계되지 않을 수 있습니다.' },
  pr_fines: { label: '벌금', impact: '마이페이지 벌금 합계에서 빠지거나 이름으로만 찾아집니다.' },
  absence_forms: { label: '사유서', impact: '결재 결과를 출결에 반영할 때 학회원을 특정하지 못할 수 있습니다.' },
  files_metadata: { label: '제출 파일', impact: '제출 현황이 이름으로만 맞춰집니다. 개명·동명이인이면 누락될 수 있습니다.' },
  archive_files: { label: '아카이브 자료', impact: '업로더 표시에만 영향이 있습니다.' },
  file_comments: { label: '피드백 댓글', impact: '내 피드백 모아보기에서 빠질 수 있습니다.' },
  presentations: { label: '발표', impact: '발표 결과·랭킹이 이름으로만 맞춰집니다.' },
  scores: { label: '평가 점수', impact: '평가자 기준 집계가 이름으로만 맞춰집니다.' },
  profiles: { label: '회원가입 계정', impact: '로그인 계정이 학회원 명단과 연결되지 않아 학회원 기능을 제대로 쓸 수 없습니다.' },
}

const CLASSES = {
  needs_link: { label: '실제 미연결', tone: 'red', fix: '학회원과 근거를 골라 연결합니다.' },
  already_linked: { label: '이미 연결됨 (오래된 경고)', tone: 'green', fix: '이관 이후 연결되었습니다. 확인 후 종료합니다.' },
  source_deleted: { label: '원본 삭제됨', tone: 'gray', fix: '원본 기록이 지워졌습니다. 확인 후 종료합니다.' },
  system_row: { label: '시스템 기록', tone: 'blue', fix: '학기 스냅샷·폴더 같은 시스템 행이라 학회원 연결이 필요 없습니다. 확인 후 종료합니다.' },
  profile_pending: { label: '가입 승인 대기', tone: 'amber', fix: '학회원 화면의 가입 승인 대기에서 승인하거나 보류합니다.' },
  profile_resolved: { label: '가입 처리 완료', tone: 'green', fix: '가입 계정이 처리되었습니다. 확인 후 종료합니다.' },
  profile_unlinked: { label: '가입 계정 미연결', tone: 'amber', fix: '학회원 화면에서 가입 계정 상태를 확인합니다.' },
}

const EVIDENCE = {
  login_account: '같은 로그인 계정',
  same_name: '같은 이름',
  admin_review: '직접 확인 (메모 필요)',
}

const ISSUE_CODES = {
  member_name_unresolved: '기록의 이름으로 학회원을 하나로 특정하지 못함',
  profile_not_in_roster: '가입 계정이 학회원 명단에 없음',
}

function sourceSummary(item) {
  const source = item.source || {}
  const parts = []
  if (source.semester) parts.push(source.semester)
  if (source.week != null && source.week !== '') parts.push(`W${source.week}`)
  if (source.status) parts.push(source.status)
  if (source.category) parts.push(source.category)
  if (source.file_category) parts.push(source.file_category)
  if (source.amount != null) parts.push(`${Number(source.amount).toLocaleString()}원`)
  if (source.file_name) parts.push(source.file_name)
  if (source.title) parts.push(source.title)
  if (source.target_date) parts.push(source.target_date)
  if (source.student_id) parts.push(source.student_id)
  return parts.join(' · ') || '-'
}

// 기존 기록 연결 검토는 개발자만 연다 (DB 함수도 is_developer로 막는다)
export default function RecordLinkPage() {
  const { isDeveloper } = useAdminRole()
  if (!isDeveloper) return <DeveloperOnly title="기록 연결 검토" />
  return <RecordLinkReview />
}

function RecordLinkReview() {
  const { role } = useAdminRole()
  const canLink = can('records', 'update', role)
  const toast = useToast()
  const [run, pending] = useAsyncAction()
  const [state, setState] = useState({ status: 'loading', error: '', fallback: false })
  const [report, setReport] = useState({ issues: [], untracked: [], generated_at: null })
  const [query, setQuery] = useState('')
  const [classFilter, setClassFilter] = useState('all')
  const [tableFilter, setTableFilter] = useState('all')
  const [selected, setSelected] = useState(null)

  const load = useCallback(async () => {
    setState((current) => ({ ...current, status: 'loading', error: '' }))
    const { data, error } = await supabase.rpc('admin_record_link_report')
    if (!error) {
      setReport(data || { issues: [], untracked: [] })
      setState({ status: 'ready', error: '', fallback: false })
      return
    }
    // STEP 17 전에는 목록만 읽기 전용으로 보여 준다 (지금 상태 재진단 없음)
    if (error.code === 'PGRST202' || error.message.includes('Could not find the function')) {
      const { data: rows, error: rowsError } = await supabase.from('data_migration_issues').select('*').is('resolved_at', null).order('created_at')
      if (rowsError) {
        setState({ status: 'error', error: rowsError.message, fallback: true })
        return
      }
      setReport({ issues: (rows || []).map((row) => ({ ...row, classification: 'unknown', raw_name: row.details?.name, candidates: [] })), untracked: [], generated_at: null })
      setState({ status: 'ready', error: '', fallback: true })
      return
    }
    setState({ status: 'error', error: error.message, fallback: false })
  }, [])

  useEffect(() => {
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])

  const counts = useMemo(() => {
    const result = {}
    for (const item of report.issues || []) result[item.classification] = (result[item.classification] || 0) + 1
    return result
  }, [report])

  const filtered = (report.issues || []).filter((item) => {
    if (classFilter !== 'all' && item.classification !== classFilter) return false
    if (tableFilter !== 'all' && item.source_table !== tableFilter) return false
    if (query) {
      const text = `${item.raw_name || ''} ${sourceSummary(item)} ${TABLES[item.source_table]?.label || ''}`.toLowerCase()
      if (!text.includes(query.trim().toLowerCase())) return false
    }
    return true
  })

  async function queueUntracked() {
    if (!confirm('지금 학회원과 연결되지 않은 기록을 검토 목록에 추가할까요? 기록 자체는 바뀌지 않습니다.')) return
    await run(async () => {
      const { data, error } = await supabase.rpc('admin_queue_unlinked_records')
      if (error) {
        toast.error(`추가하지 못했습니다: ${error.message}`)
        return
      }
      toast.success(`${data || 0}건을 검토 목록에 추가했습니다.`)
      await load()
    })
  }

  const untrackedTotal = (report.untracked || []).reduce((sum, item) => sum + Number(item.count || 0), 0)

  return (
    <AdminPage>
      <PageHeader
        eyebrow="정책 및 시스템"
        title="연결 확인이 필요한 기존 기록"
        description="실패한 SQL 개수가 아닙니다. 2026-08 데이터 이관 때 이름만으로 학회원 한 명을 특정하지 못한 예전 출결·벌금·제출·평가 기록과, 명단에 없던 가입 계정입니다. 지금 상태로 다시 확인한 결과를 보여 줍니다."
        actions={<Button icon={RefreshCw} onClick={load} loading={state.status === 'loading'}>다시 진단</Button>}
      />
      <ReadOnlyBanner role={role} />

      {state.fallback && (
        <Notice tone="warning" className="mb-4" title="STEP 17 SQL이 아직 적용되지 않았습니다">
          지금은 목록만 보여 줍니다. 현재 연결 상태 재진단·후보 추천·연결 처리는 STEP 17을 실행한 뒤 사용할 수 있습니다.
        </Notice>
      )}

      {state.status === 'error' ? (
        <Panel><ErrorState title="기록을 불러오지 못했습니다." description={`${state.error} — 관리자 계정으로 로그인했는지 확인하세요. 원인이 계속되면 STEP 17의 확인 쿼리로 DB에서 직접 확인할 수 있습니다.`} onRetry={load} /></Panel>
      ) : state.status === 'loading' && report.issues.length === 0 ? (
        <Panel><LoadingState label="기록을 지금 상태로 다시 확인하는 중입니다." /></Panel>
      ) : (
        <>
          <div data-tour="records-summary" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="열린 검토 항목" value={`${report.issues.length}건`} note={report.generated_at ? `${formatKst(report.generated_at)} 기준` : '재진단 전'} />
            <Metric label="실제 미연결" value={`${counts.needs_link || 0}건`} note="학회원을 골라 연결 필요" tone={counts.needs_link ? 'red' : 'green'} />
            <Metric label="오래된 경고" value={`${(counts.already_linked || 0) + (counts.source_deleted || 0) + (counts.system_row || 0) + (counts.profile_resolved || 0)}건`} note="이미 연결·원본 삭제·시스템 기록" tone="blue" />
            <Metric label="목록 밖 미연결 기록" value={`${untrackedTotal}건`} note="이관 이후 새로 생긴 미연결 기록" tone={untrackedTotal ? 'amber' : 'green'} />
          </div>

          {untrackedTotal > 0 && (
            <Notice
              tone="info"
              className="mb-5"
              title="검토 목록에 없는 미연결 기록"
              action={canLink && !state.fallback ? <Button size="sm" icon={ListPlus} onClick={queueUntracked} loading={pending}>검토 목록에 추가</Button> : null}
            >
              {report.untracked.map((item) => `${TABLES[item.source_table]?.label || item.source_table} ${item.count}건`).join(' · ')}. STEP 17 이후 새 기록은 본인 계정으로 작성하면 자동으로 연결됩니다.
            </Notice>
          )}

          <Panel
            title="검토 목록"
            description={`${filtered.length}건 표시 · 한 건씩 처리하며, 숫자를 줄이기 위한 일괄 해결은 없습니다.`}
            action={
              <div className="flex flex-wrap gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input aria-label="이름·내용 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름·내용 검색" className={`${inputClass} h-9 w-48 pl-9`} />
                </div>
                <select aria-label="상태로 거르기" value={classFilter} onChange={(event) => setClassFilter(event.target.value)} className={`${inputClass} h-9 w-auto`}>
                  <option value="all">모든 상태</option>
                  {Object.entries(CLASSES).map(([key, value]) => <option key={key} value={key}>{value.label} {counts[key] ? `(${counts[key]})` : ''}</option>)}
                </select>
                <select aria-label="자료 종류로 거르기" value={tableFilter} onChange={(event) => setTableFilter(event.target.value)} className={`${inputClass} h-9 w-auto`}>
                  <option value="all">모든 자료</option>
                  {Object.entries(TABLES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
                </select>
              </div>
            }
          >
            {filtered.length === 0 ? (
              <EmptyState icon={CheckCircle2} title={report.issues.length === 0 ? '열린 검토 항목이 없습니다.' : '조건에 맞는 항목이 없습니다.'} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] border-collapse text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold text-slate-600">
                    <tr className="border-b border-slate-200">
                      <th className="px-4 py-3">현재 상태</th>
                      <th className="px-3 py-3">대상 이름</th>
                      <th className="px-3 py-3">자료 종류</th>
                      <th className="px-3 py-3">원본 내용</th>
                      <th className="px-3 py-3">연결</th>
                      <th className="px-3 py-3">발생</th>
                      <th className="px-3 py-3"><span className="sr-only">상세</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((item) => {
                      const klass = CLASSES[item.classification] || { label: '재진단 필요', tone: 'gray' }
                      return (
                        <tr key={item.id}>
                          <td className="px-4 py-3"><StatusBadge tone={klass.tone}>{klass.label}</StatusBadge></td>
                          <td className="px-3 py-3 font-bold text-slate-900">{item.raw_name || '(이름 없음)'}</td>
                          <td className="px-3 py-3 text-slate-700">{TABLES[item.source_table]?.label || item.source_table}</td>
                          <td className="max-w-[320px] truncate px-3 py-3 text-slate-600" title={sourceSummary(item)}>{sourceSummary(item)}</td>
                          <td className="px-3 py-3 text-slate-700">{item.linked_member ? `${item.linked_member.name} (${item.linked_member.generation || '-'})` : item.classification === 'needs_link' ? `후보 ${item.candidates?.length || 0}명` : '-'}</td>
                          <td className="px-3 py-3 text-slate-500">{formatKst(item.created_at, { weekday: false })}</td>
                          <td className="px-3 py-3 text-right"><Button size="sm" onClick={() => setSelected(item)}>상세</Button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}

      {selected && <IssueDetail item={selected} canLink={canLink && !state.fallback} onClose={() => setSelected(null)} onDone={() => { setSelected(null); load() }} />}
    </AdminPage>
  )
}

function IssueDetail({ item, canLink, onClose, onDone }) {
  const toast = useToast()
  const [run, pending] = useAsyncAction()
  const klass = CLASSES[item.classification] || { label: '재진단 필요', tone: 'gray', fix: 'STEP 17을 적용하면 지금 상태로 다시 진단합니다.' }
  const table = TABLES[item.source_table] || { label: item.source_table, impact: '' }
  const [memberId, setMemberId] = useState(item.candidates?.length === 1 ? item.candidates[0].id : '')
  const [evidence, setEvidence] = useState(item.candidates?.length === 1 ? item.candidates[0].evidence : 'admin_review')
  const [note, setNote] = useState('')
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const closeable = ['already_linked', 'source_deleted', 'system_row', 'profile_resolved'].includes(item.classification)

  async function searchMembers(event) {
    event.preventDefault()
    if (!search.trim()) return
    const { data, error } = await supabase.from('members').select('id, name, generation, university, status').ilike('name', `%${search.trim()}%`).order('name').limit(20)
    if (error) toast.error(`학회원을 찾지 못했습니다: ${error.message}`)
    setResults(data || [])
  }

  function choose(member, nextEvidence) {
    setMemberId(member.id)
    setEvidence(nextEvidence)
  }

  async function link() {
    if (!memberId) return
    const chosen = [...(item.candidates || []), ...results].find((member) => member.id === memberId)
    if (!confirm(`${table.label} 기록(${item.raw_name || '이름 없음'})을 ${chosen?.name || '선택한 학회원'}(${chosen?.generation || '-'})에 연결할까요?\n근거: ${EVIDENCE[evidence]}`)) return
    await run(async () => {
      const { error } = await supabase.rpc('admin_link_record', { p_issue_id: item.id, p_member_id: memberId, p_evidence: evidence, p_note: note || null })
      if (error) {
        toast.error(error.message.replace(/^[A-Z_]+:\s*/, ''), { title: '연결하지 못했습니다' })
        return
      }
      toast.success('연결을 확인하고 항목을 종료했습니다.')
      onDone()
    })
  }

  async function close() {
    await run(async () => {
      const { error } = await supabase.rpc('admin_close_record_issue', { p_issue_id: item.id, p_reason: item.classification, p_note: note || null })
      if (error) {
        toast.error(error.message.replace(/^[A-Z_]+:\s*/, ''), { title: '종료하지 못했습니다' })
        return
      }
      toast.success('지금 상태를 다시 확인하고 항목을 종료했습니다.')
      onDone()
    })
  }

  return (
    <Modal
      title={`${table.label} · ${item.raw_name || '이름 없음'}`}
      description={ISSUE_CODES[item.issue_code] || item.issue_code}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>닫기</Button>
          {item.classification === 'profile_pending' && <Button href="/admin/hub/members">학회원 화면에서 처리</Button>}
          {closeable && <Button variant="primary" icon={CheckCircle2} onClick={close} loading={pending} disabled={!canLink}>확인 후 종료</Button>}
          {item.classification === 'needs_link' && <Button variant="primary" icon={Link2} onClick={link} loading={pending} disabled={!canLink || !memberId || (evidence === 'admin_review' && !note.trim())}>선택한 학회원에 연결</Button>}
        </>
      }
    >
      <div className="space-y-5 p-5 text-sm">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div><dt className="text-xs font-bold text-slate-500">현재 상태</dt><dd className="mt-1"><StatusBadge tone={klass.tone}>{klass.label}</StatusBadge></dd></div>
          <div><dt className="text-xs font-bold text-slate-500">원본</dt><dd className="mt-1 break-all text-slate-800">{item.source_table} #{item.source_pk}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs font-bold text-slate-500">원본 내용</dt><dd className="mt-1 break-keep text-slate-800">{sourceSummary(item)}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs font-bold text-slate-500">영향</dt><dd className="mt-1 break-keep text-slate-800">{table.impact}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs font-bold text-slate-500">해결 방법</dt><dd className="mt-1 break-keep text-slate-800">{klass.fix}</dd></div>
          {item.linked_member && <div className="sm:col-span-2"><dt className="text-xs font-bold text-slate-500">현재 연결</dt><dd className="mt-1 text-slate-800">{item.linked_member.name} · {item.linked_member.generation || '-'} · {item.linked_member.status}</dd></div>}
        </dl>

        {!canLink && <Notice tone="neutral">연결·종료는 개발자 계정만 할 수 있습니다.</Notice>}

        {item.classification === 'needs_link' && (
          <>
            <section>
              <h3 className="mb-2 text-sm font-bold text-slate-900">추천 후보</h3>
              {(item.candidates || []).length === 0 ? (
                <p className="text-slate-500">같은 로그인 계정이나 같은 이름의 학회원이 없습니다. 아래에서 직접 찾아 고르세요.</p>
              ) : (
                <ul className="space-y-2">
                  {item.candidates.map((candidate) => (
                    <li key={candidate.id}>
                      <label className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 ${memberId === candidate.id ? 'border-teal-500 bg-teal-50' : 'border-slate-200'}`}>
                        <input type="radio" name="candidate" checked={memberId === candidate.id} onChange={() => choose(candidate, candidate.evidence)} disabled={!canLink} className="accent-teal-700" />
                        <span className="font-bold text-slate-900">{candidate.name}</span>
                        <span className="text-slate-600">{[candidate.generation, candidate.university, candidate.status].filter(Boolean).join(' · ')}</span>
                        <StatusBadge tone={candidate.evidence === 'login_account' ? 'green' : 'amber'} className="ml-auto">{EVIDENCE[candidate.evidence]}</StatusBadge>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {(item.candidates || []).length > 1 && <p className="mt-2 text-amber-800">같은 이름이 여러 명입니다. 기수·학교·기록 시기를 확인하고 고르세요.</p>}
            </section>
            <section>
              <h3 className="mb-2 text-sm font-bold text-slate-900">학회원 직접 찾기</h3>
              <form onSubmit={searchMembers} className="flex gap-2">
                <input aria-label="학회원 이름" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="이름" className={inputClass} disabled={!canLink} />
                <Button type="submit" icon={Search} disabled={!canLink}>찾기</Button>
              </form>
              {results.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {results.map((member) => (
                    <li key={member.id}>
                      <label className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 ${memberId === member.id ? 'border-teal-500 bg-teal-50' : 'border-slate-200'}`}>
                        <input type="radio" name="candidate" checked={memberId === member.id} onChange={() => choose(member, 'admin_review')} className="accent-teal-700" />
                        <span className="font-bold text-slate-900">{member.name}</span>
                        <span className="text-slate-600">{[member.generation, member.university, member.status].filter(Boolean).join(' · ')}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
              <Field label="근거" htmlFor="link-evidence">
                <select id="link-evidence" value={evidence} onChange={(event) => setEvidence(event.target.value)} disabled={!canLink} className={inputClass}>
                  {Object.entries(EVIDENCE).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </Field>
              <Field label="메모" htmlFor="link-note" hint={evidence === 'admin_review' ? '직접 확인으로 연결할 때는 무엇을 보고 확인했는지 적어 주세요.' : '선택 사항'}>
                <textarea id="link-note" value={note} onChange={(event) => setNote(event.target.value)} disabled={!canLink} className={`${textareaClass} min-h-16`} />
              </Field>
            </div>
          </>
        )}
        {closeable && (
          <Field label="메모 (선택)" htmlFor="close-note">
            <textarea id="close-note" value={note} onChange={(event) => setNote(event.target.value)} disabled={!canLink} className={`${textareaClass} min-h-16`} />
          </Field>
        )}
        {item.classification === 'profile_pending' && (
          <p className="break-keep text-slate-700">이 가입 계정은 아직 학회원으로 승인되지 않았습니다. <Link href="/admin/hub/members" className="font-bold text-teal-700 underline">학회원 화면</Link>의 가입 승인 대기에서 승인하거나 보류하면, 다시 진단했을 때 &lsquo;가입 처리 완료&rsquo;로 바뀌어 종료할 수 있습니다.</p>
        )}
      </div>
    </Modal>
  )
}
