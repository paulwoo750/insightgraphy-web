'use client'
// 관리자 권한: 학회원을 이름·기수·학교로 찾아 역할을 준다 (학회장·개발자 전용, 개발자 역할은 개발자만)
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, Clock3, Crown, GraduationCap, KeyRound, Save, Search, ShieldAlert, UserPlus, UsersRound, Wrench } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { ACTION_LABELS, isPresidentRole, POLICY, roleCapabilities, roleEmoji, roleLabel, ROLES, roleTone } from '@/lib/permissions'
import { formatKst } from '@/lib/semester'
import { useAdminContext } from '@/app/admin/_components/AdminShell'
import {
  AdminPage,
  Button,
  EmptyState,
  ErrorState,
  Field,
  inputClass,
  LoadingState,
  Metric,
  Notice,
  PageHeader,
  Panel,
  StatusBadge,
  useAsyncAction,
  useToast,
} from '@/app/admin/_components/AdminUI'

function describeAccessError(error) {
  const message = error?.message || String(error)
  const known = message.match(/^(MEMBER_NOT_FOUND|MEMBER_NOT_LINKED|AUTH_USER_MISSING|ALREADY_REGISTERED):\s*(.*)$/)
  if (known) return known[2]
  const coded = message.match(/^(SELF_CHANGE|DEVELOPER_ONLY|LAST_LEAD):\s*(.*)$/)
  if (coded) return coded[2]
  if (message.includes('cannot demote')) return '내 계정의 역할은 스스로 낮추거나 끌 수 없습니다.'
  if (message.includes('At least one active super administrator')) return '활성 학회장이 최소 한 명은 있어야 합니다.'
  if (message.includes('Super administrator access is required')) return '학회장 또는 개발자만 할 수 있습니다.'
  if (message.includes('admin_users_role_check') || message.includes('Invalid administrator role')) return '이 역할을 쓰려면 STEP 20 SQL을 먼저 실행해야 합니다.'
  return message
}

// 관리자 계정이 학회원 명단의 누구인지: 재학 학회원 · 졸업생
function accountKindLabel(item) {
  const kind = item.account_kind || (item.member_id ? (item.member_status === 'alumni' ? 'alumni' : 'member') : 'unlinked')
  if (kind === 'member') return { tone: 'teal', icon: UsersRound, text: [item.member_generation, item.member_university].filter(Boolean).join(' · ') || '학회원' }
  if (kind === 'alumni') return { tone: 'violet', icon: GraduationCap, text: `졸업생 계정${item.member_generation || item.signup_generation ? ` · ${item.member_generation || item.signup_generation}` : ''}` }
  // 재학 학회원은 모두 명단에 연결되어 있으므로, 연결이 없는 관리자 계정은 졸업생으로 본다
  return { tone: 'violet', icon: GraduationCap, text: `졸업생 계정${item.signup_generation ? ` · ${item.signup_generation}` : ''}` }
}

const KIND_TEXT = { teal: 'text-teal-700', violet: 'text-violet-700', gray: 'text-slate-500' }

export default function AdminAccessPage() {
  const { admin, session } = useAdminContext() || {}
  const toast = useToast()
  const [run, pending] = useAsyncAction()
  const isSuperAdmin = isPresidentRole(admin?.role)
  const isDeveloper = admin?.role === 'developer'
  // 개발자 역할은 개발자만 주고 바꿀 수 있다
  const assignableRoles = ROLES.filter((role) => isDeveloper || role.key !== 'developer')
  const [state, setState] = useState({ status: 'loading', error: '', memberMode: true })
  const [admins, setAdmins] = useState([])
  const [drafts, setDrafts] = useState({})
  const [audits, setAudits] = useState([])
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState(null)
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState(null)
  const [newRole, setNewRole] = useState('operator')
  const [email, setEmail] = useState('')

  const fetchAccessData = useCallback(async () => {
    let memberMode = true
    let result = await supabase.rpc('admin_list_access')
    if (result.error && (result.error.code === 'PGRST202' || result.error.message.includes('Could not find the function'))) {
      memberMode = false
      result = await supabase.rpc('admin_list_users')
    }
    if (result.error) {
      setState({ status: 'error', error: describeAccessError(result.error), memberMode })
      return
    }
    const auditResult = await supabase.from('admin_access_audit').select('id, actor_user_id, target_user_id, action, previous_values, new_values, created_at').order('created_at', { ascending: false }).limit(20)
    const rows = result.data || []
    setAdmins(rows)
    setDrafts(Object.fromEntries(rows.map((item) => [item.user_id, { role: item.role, is_active: item.is_active }])))
    setAudits(auditResult.data || [])
    setState({ status: 'ready', error: '', memberMode })
  }, [])

  useEffect(() => {
    if (!isSuperAdmin) return undefined
    const timer = setTimeout(fetchAccessData, 0)
    return () => clearTimeout(timer)
  }, [isSuperAdmin, fetchAccessData])

  const summary = useMemo(() => ({
    total: admins.length,
    active: admins.filter((item) => item.is_active).length,
    superAdmins: admins.filter((item) => item.role === 'super_admin' && item.is_active).length,
    developers: admins.filter((item) => item.role === 'developer' && item.is_active).length,
    alumni: admins.filter((item) => accountKindLabel(item).icon === GraduationCap).length,
    viewers: admins.filter((item) => item.role === 'viewer' && item.is_active).length,
  }), [admins])

  async function searchCandidates(event) {
    event?.preventDefault()
    setSearching(true)
    const { data, error } = await supabase.rpc('admin_access_candidates', { p_query: query.trim() || null })
    setSearching(false)
    if (error) {
      toast.error(describeAccessError(error), { title: '학회원을 찾지 못했습니다' })
      return
    }
    setCandidates(data || [])
    setPicked(null)
  }

  async function grantToMember() {
    if (!picked) return
    if (!confirm(`${picked.name}(${picked.generation || '-'} · ${picked.university || '-'})에게 ${roleLabel(newRole)} 권한을 줄까요?`)) return
    await run(async () => {
      const { error } = await supabase.rpc('admin_grant_access_member', { p_member_id: picked.member_id, p_role: newRole })
      if (error) {
        toast.error(describeAccessError(error), { title: '권한을 주지 못했습니다' })
        return
      }
      toast.success(`${picked.name}에게 ${roleLabel(newRole)} 권한을 주었습니다.`)
      setPicked(null)
      setCandidates(null)
      setQuery('')
      await fetchAccessData()
    })
  }

  async function grantByEmail(event) {
    event.preventDefault()
    if (!email.trim()) return
    await run(async () => {
      const { error } = await supabase.rpc('admin_grant_access', { p_email: email.trim(), p_role: newRole })
      if (error) {
        toast.error(describeAccessError(error), { title: '권한을 주지 못했습니다' })
        return
      }
      toast.success('관리자 권한을 등록했습니다.')
      setEmail('')
      await fetchAccessData()
    })
  }

  function updateDraft(userId, patch) {
    setDrafts((current) => ({ ...current, [userId]: { ...current[userId], ...patch } }))
  }

  async function saveAccess(item) {
    const draft = drafts[item.user_id]
    if (!draft) return
    const leadRoles = ['developer', 'super_admin']
    const lowering = (item.is_active && !draft.is_active) || (leadRoles.includes(item.role) && draft.role !== item.role)
    if (lowering && !confirm(`${item.member_name || item.display_name || item.email} 계정의 관리자 접근 수준을 낮출까요?`)) return
    await run(async () => {
      const { error } = await supabase.rpc('admin_set_access', { p_user_id: item.user_id, p_role: draft.role, p_is_active: draft.is_active })
      if (error) {
        toast.error(describeAccessError(error), { title: '권한을 바꾸지 못했습니다' })
        setDrafts((current) => ({ ...current, [item.user_id]: { role: item.role, is_active: item.is_active } }))
        return
      }
      toast.success('관리자 권한을 변경했습니다.')
      await fetchAccessData()
    })
  }

  if (!isSuperAdmin) {
    return (
      <AdminPage>
        <Panel>
          <div className="px-6 py-16 text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-amber-600" aria-hidden="true" />
            <h1 className="mt-4 text-lg font-bold text-slate-900">학회장 전용 화면입니다</h1>
            <p className="mt-2 text-sm text-slate-600">관리자 계정 조회와 역할 변경은 학회장(또는 개발자)만 할 수 있습니다. 내 역할: {roleEmoji(admin?.role)} {roleLabel(admin?.role)}</p>
            <Button className="mt-6" variant="dark" href="/admin/hub">운영 현황으로 돌아가기</Button>
          </div>
        </Panel>
        <PolicyTable className="mt-5" />
      </AdminPage>
    )
  }

  const nameOf = (userId) => {
    const row = admins.find((item) => item.user_id === userId)
    return row ? (row.member_name || row.display_name || row.email) : userId
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="정책 및 시스템"
        title="관리자 권한"
        description="학회원을 이름·기수·학교로 찾아 관리자 역할을 줍니다. 로그인 계정이 연결된 학회원만 고를 수 있고, 이름만으로 계정을 만들거나 연결하지 않습니다. 개발자 계정은 개발자만 바꿀 수 있습니다."
      />

      {state.status === 'ready' && !state.memberMode && (
        <Notice tone="warning" className="mb-4" title="STEP 16 SQL이 아직 적용되지 않았습니다">
          학회원 선택으로 권한을 주려면 STEP 16을 실행하세요. 그 전에는 아래 &lsquo;이메일로 등록&rsquo;만 쓸 수 있습니다.
        </Notice>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="전체 관리자" value={`${summary.total}명`} icon={UsersRound} tone="teal" />
        <Metric label="활성 계정" value={`${summary.active}명`} icon={Check} tone="green" />
        <Metric label="👑 학회장" value={`${summary.superAdmins}명`} icon={Crown} tone="amber" note={`🛠️ 개발자 ${summary.developers}명 · 학회장·개발자 중 최소 1명 유지`} />
        <Metric label="열람 전용" value={`${summary.viewers}명`} icon={KeyRound} tone="blue" note={summary.alumni ? `🎓 졸업생 계정 ${summary.alumni}명 포함` : undefined} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Panel title="관리자 목록" description="행마다 역할·활성 상태를 바꾼 뒤 저장합니다. 내 계정은 스스로 낮출 수 없습니다.">
          {state.status === 'loading' ? <LoadingState /> : state.status === 'error' ? <ErrorState description={state.error} onRetry={fetchAccessData} /> : admins.length === 0 ? (
            <EmptyState title="등록된 관리자 계정이 없습니다." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold text-slate-600">
                  <tr className="border-b border-slate-200"><th className="px-4 py-3">학회원 · 계정</th><th className="px-3 py-3">현재 역할</th><th className="px-3 py-3">역할 변경</th><th className="px-3 py-3">접근</th><th className="px-3 py-3"><span className="sr-only">저장</span></th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {admins.map((item) => {
                    const draft = drafts[item.user_id] || { role: item.role, is_active: item.is_active }
                    const isCurrentUser = item.user_id === session?.user?.id
                    const changed = draft.role !== item.role || draft.is_active !== item.is_active
                    const capabilities = roleCapabilities(draft.role)
                    const kind = accountKindLabel(item)
                    const lockedDeveloper = !isDeveloper && item.role === 'developer'
                    return (
                      <tr key={item.user_id} className="align-top">
                        <td className="px-4 py-3.5">
                          <p className="font-bold text-slate-900">{item.member_name || item.display_name || item.email}{isCurrentUser && <span className="ml-1.5 text-xs font-semibold text-teal-700">내 계정</span>}</p>
                          {kind && (
                            <p className={`mt-0.5 flex items-center gap-1 text-xs font-semibold ${KIND_TEXT[kind.tone] || 'text-slate-500'}`}>
                              {kind.icon && <kind.icon className="h-3.5 w-3.5" aria-hidden="true" />}{kind.text}
                            </p>
                          )}
                          <p className="text-xs text-slate-400">{item.email}</p>
                          <details className="mt-1.5">
                            <summary className="cursor-pointer text-xs font-bold text-teal-700">권한 요약</summary>
                            <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                              {capabilities.map((capability) => <li key={capability.area}>{capability.area}: {capability.actions.join('·')}</li>)}
                            </ul>
                          </details>
                        </td>
                        <td className="px-3 py-3.5"><StatusBadge tone={roleTone(item.role)}>{roleEmoji(item.role)} {roleLabel(item.role)}</StatusBadge>{!item.is_active && <StatusBadge tone="gray" className="ml-1">비활성</StatusBadge>}</td>
                        <td className="px-3 py-3.5">
                          <select aria-label={`${item.member_name || item.email} 역할`} value={draft.role} onChange={(event) => updateDraft(item.user_id, { role: event.target.value })} disabled={isCurrentUser || lockedDeveloper} title={lockedDeveloper ? '개발자 계정은 개발자만 바꿀 수 있습니다' : undefined} className={`${inputClass} h-9 w-36`}>
                            {(lockedDeveloper ? ROLES : assignableRoles).map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-3.5">
                          <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                            <input type="checkbox" checked={draft.is_active} onChange={(event) => updateDraft(item.user_id, { is_active: event.target.checked })} disabled={isCurrentUser || lockedDeveloper} className="h-4 w-4 accent-teal-700" />
                            {draft.is_active ? '활성' : '비활성'}
                          </label>
                        </td>
                        <td className="px-3 py-3.5 text-right">
                          <Button size="sm" variant={changed ? 'primary' : 'secondary'} icon={Save} onClick={() => saveAccess(item)} disabled={!changed || pending}>저장</Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="min-w-0 space-y-5">
          <Panel tour="access-member-search" title="학회원에게 권한 주기" description="동명이인은 기수·학교와 학회원 번호로 구분합니다.">
            <div className="space-y-4 p-4">
              <form onSubmit={searchCandidates} className="flex gap-2">
                <input aria-label="학회원 검색" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름·기수·학교" disabled={!state.memberMode} className={inputClass} />
                <Button type="submit" icon={Search} loading={searching} disabled={!state.memberMode}>찾기</Button>
              </form>
              {candidates && (
                candidates.length === 0 ? <p className="text-sm text-slate-500">검색 결과가 없습니다.</p> : (
                  <ul className="max-h-80 space-y-1.5 overflow-y-auto" aria-label="검색 결과">
                    {candidates.map((candidate) => {
                      const disabled = !candidate.has_login || Boolean(candidate.admin_role)
                      return (
                        <li key={candidate.member_id}>
                          <label className={`flex items-start gap-3 rounded-md border px-3 py-2 ${picked?.member_id === candidate.member_id ? 'border-teal-500 bg-teal-50' : 'border-slate-200'} ${disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
                            <input type="radio" name="access-candidate" className="mt-1 accent-teal-700" disabled={disabled} checked={picked?.member_id === candidate.member_id} onChange={() => setPicked(candidate)} />
                            <span className="min-w-0 flex-1">
                              <span className="block font-bold text-slate-900">{candidate.name}</span>
                              <span className="block text-xs text-slate-600">{[candidate.generation, candidate.university, candidate.department].filter(Boolean).join(' · ') || '-'} · {candidate.member_status}</span>
                              <span className="block text-[11px] text-slate-400">학회원 번호 {String(candidate.member_id).slice(0, 8)}{candidate.login_email ? ` · ${candidate.login_email}` : ''}</span>
                            </span>
                            {!candidate.has_login ? <StatusBadge tone="amber">로그인 계정 미연결</StatusBadge> : candidate.admin_role ? <StatusBadge tone={roleTone(candidate.admin_role)}>이미 {roleLabel(candidate.admin_role)}</StatusBadge> : null}
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )
              )}
              {candidates?.some((candidate) => !candidate.has_login) && (
                <p className="break-keep text-xs leading-5 text-slate-500">로그인 계정 미연결: 이 학회원이 직접 회원가입하고 학회원 화면에서 가입 승인(연결)이 되어야 권한을 줄 수 있습니다.</p>
              )}
              <Field label="부여할 역할" htmlFor="grant-role" hint={ROLES.find((role) => role.key === newRole)?.summary}>
                <select id="grant-role" value={newRole} onChange={(event) => setNewRole(event.target.value)} className={inputClass}>
                  {assignableRoles.map((role) => <option key={role.key} value={role.key}>{role.emoji} {role.label}</option>)}
                </select>
              </Field>
              <Button variant="primary" icon={UserPlus} className="w-full" onClick={grantToMember} loading={pending} disabled={!picked}>
                {picked ? `${picked.name}에게 ${roleLabel(newRole)} 주기` : '학회원을 먼저 고르세요'}
              </Button>
              <details className="rounded-lg bg-teal-50/40 px-3 py-2">
                <summary className="cursor-pointer text-sm font-bold text-slate-600">이메일로 등록 (보조)</summary>
                <form onSubmit={grantByEmail} className="mt-3 space-y-2">
                  <input type="email" aria-label="로그인 이메일" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="가입한 이메일" className={inputClass} />
                  <Button type="submit" size="sm" disabled={!email.trim() || pending}>이메일로 {roleLabel(newRole)} 주기</Button>
                </form>
              </details>
            </div>
          </Panel>

          <Panel title="최근 변경" description="권한 변경 이력은 자동으로 기록됩니다.">
            {audits.length === 0 ? <EmptyState title="변경 이력이 없습니다." /> : (
              <ul className="divide-y divide-slate-100">
                {audits.slice(0, 10).map((audit) => (
                  <li key={audit.id} className="flex gap-3 px-4 py-3">
                    <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    <div className="min-w-0 text-sm">
                      <p className="truncate font-bold text-slate-800">{audit.new_values?.member_name || nameOf(audit.target_user_id)}</p>
                      <p className="text-xs text-slate-500">
                        {audit.action === 'grant' ? '권한 부여' : '권한 변경'} · {audit.previous_values ? `${roleLabel(audit.previous_values.role)} → ` : ''}{roleLabel(audit.new_values?.role)}{audit.new_values?.is_active === false ? ' (비활성)' : ''} · {formatKst(audit.created_at)} · {nameOf(audit.actor_user_id)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <PolicyTable className="mt-5" showEnforcement={isDeveloper} />
    </AdminPage>
  )
}

function PolicyTable({ className = '', showEnforcement = false }) {
  return (
    <Panel
      tour="access-policy"
      className={className}
      title="역할별 권한표"
      description="메뉴·버튼·서버 함수가 이 표와 같은 기준을 씁니다. 학기 직책(회장·총무 등)과 관리자 접근 역할은 별개입니다."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs font-bold text-slate-600">
            <tr className="border-b border-slate-200">
              <th className="px-4 py-3">기능</th>
              {ROLES.map((role) => <th key={role.key} className="px-3 py-3"><StatusBadge tone={role.tone}>{role.emoji} {role.label}</StatusBadge></th>)}
              {showEnforcement && <th className="px-3 py-3"><span className="inline-flex items-center gap-1"><Wrench className="h-3.5 w-3.5" aria-hidden="true" />실제 검사 위치</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {POLICY.map((item) => (
              <tr key={item.key} className="align-top">
                <td className="px-4 py-3 font-bold text-slate-900">{item.area}</td>
                {ROLES.map((role) => {
                  const allowed = Object.entries(item.actions).filter(([, roles]) => roles.includes(role.key)).map(([action]) => ACTION_LABELS[action])
                  return <td key={role.key} className={`px-3 py-3 ${allowed.length ? 'font-semibold text-emerald-700' : 'text-slate-400'}`}>{allowed.length ? `✓ ${allowed.join(' · ')}` : '—'}</td>
                })}
                {showEnforcement && <td className="max-w-[260px] px-3 py-3 text-xs leading-5 text-slate-500">{item.enforcement}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-1.5 border-t border-slate-100 px-4 py-3 text-sm leading-6 text-slate-600 sm:px-5">
        <p><strong className="text-slate-800">👑 학회장</strong>은 모든 운영 작업과 관리자 권한 조회·변경을 합니다. <strong className="text-slate-800">🛠️ 개발자</strong>는 여기에 기존 기록 연결 검토·개발자 계정 관리가 더해집니다. 학기 마감 점검은 학회장과 개발자가 엽니다.</p>
        <p>관리자와 운영진은 권한 변경을 빼면 같은 범위이고, 운영진도 학회원 안전 삭제(기록이 있으면 삭제 불가)를 할 수 있습니다.</p>
        <p>운영진 범위를 줄이려면 해당 RPC·RLS의 역할 목록을 바꿔야 하며, 바꾸면 운영진 계정의 일부 저장 버튼이 실패합니다. 이번 업데이트에서는 기존 권한을 줄이지 않았습니다.</p>
        <p>열람자는 화면 진입 시 자동 결석 동기화·벌금 스캔이 실행되지 않고, 저장·삭제 버튼이 비활성화됩니다. 벌금·일정·제출물·콘텐츠는 예전부터 쓰던 테이블이라 DB 정책이 화면 기준보다 넓을 수 있습니다. 현재 정책은 supabase/COPY_PASTE_ORDER.md의 &lsquo;기존 테이블 정책 확인&rsquo; 쿼리로 확인하세요.</p>
        {showEnforcement && <p>관련 화면: <Link href="/admin/hub/records" className="font-bold text-teal-700 underline">기록 연결 검토</Link> (개발자 전용)</p>}
      </div>
    </Panel>
  )
}
