'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, Clock3, KeyRound, Save, ShieldAlert, ShieldCheck, UserPlus, UsersRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAdminContext } from '@/app/admin/_components/AdminShell'
import { AdminPage, EmptyState, PageHeader, Panel, StatusBadge } from '@/app/admin/_components/AdminUI'

const roles = [
  { value: 'super_admin', label: '최고관리자', description: '관리자 권한 변경을 포함한 전체 접근' },
  { value: 'admin', label: '관리자', description: '운영 및 콘텐츠 전체 관리' },
  { value: 'operator', label: '운영진', description: '학기와 학회원 시스템 운영' },
  { value: 'viewer', label: '열람자', description: '관리 화면 열람만 가능' },
]

const roleTones = {
  super_admin: 'red',
  admin: 'teal',
  operator: 'blue',
  viewer: 'gray',
}

function roleLabel(role) {
  return roles.find((item) => item.value === role)?.label || role
}

function formatDate(value) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export default function AdminAccessPage() {
  const { admin, session } = useAdminContext() || {}
  const [admins, setAdmins] = useState([])
  const [drafts, setDrafts] = useState({})
  const [audits, setAudits] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [email, setEmail] = useState('')
  const [newRole, setNewRole] = useState('operator')
  const [adding, setAdding] = useState(false)
  const [message, setMessage] = useState('')

  const isSuperAdmin = admin?.role === 'super_admin'

  async function fetchAccessData() {
    const [adminResult, auditResult] = await Promise.all([
      supabase.rpc('admin_list_users'),
      supabase.from('admin_access_audit').select('id, actor_user_id, target_user_id, action, previous_values, new_values, created_at').order('created_at', { ascending: false }).limit(20),
    ])
    if (adminResult.error) throw adminResult.error

    const rows = adminResult.data || []
    setAdmins(rows)
    setDrafts(Object.fromEntries(rows.map((item) => [item.user_id, { role: item.role, is_active: item.is_active }])))
    setAudits(auditResult.data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!isSuperAdmin) return
    fetchAccessData().catch((error) => {
      setMessage(`권한 목록 조회 실패: ${error.message}`)
      setLoading(false)
    })
  }, [isSuperAdmin])

  const summary = useMemo(() => ({
    total: admins.length,
    active: admins.filter((item) => item.is_active).length,
    superAdmins: admins.filter((item) => item.role === 'super_admin' && item.is_active).length,
    viewers: admins.filter((item) => item.role === 'viewer' && item.is_active).length,
  }), [admins])

  async function grantAccess(event) {
    event.preventDefault()
    if (!email.trim()) return
    setAdding(true)
    setMessage('')
    try {
      const { error } = await supabase.rpc('admin_grant_access', { p_email: email.trim(), p_role: newRole })
      if (error) throw error
      await fetchAccessData()
      setEmail('')
      setNewRole('operator')
      setMessage('관리자 권한을 등록했습니다.')
    } catch (error) {
      setMessage(`권한 등록 실패: ${error.message}`)
    } finally {
      setAdding(false)
    }
  }

  function updateDraft(userId, patch) {
    setDrafts((current) => ({ ...current, [userId]: { ...current[userId], ...patch } }))
  }

  async function saveAccess(item) {
    const draft = drafts[item.user_id]
    if (!draft) return
    const disabling = item.is_active && !draft.is_active
    const demotingSuper = item.role === 'super_admin' && draft.role !== 'super_admin'
    if ((disabling || demotingSuper) && !confirm(`${item.display_name || item.email} 계정의 관리자 접근 수준을 낮출까요?`)) return

    setSavingId(item.user_id)
    setMessage('')
    try {
      const { error } = await supabase.rpc('admin_set_access', {
        p_user_id: item.user_id,
        p_role: draft.role,
        p_is_active: draft.is_active,
      })
      if (error) throw error
      await fetchAccessData()
      setMessage('관리자 권한을 변경했습니다.')
    } catch (error) {
      setMessage(`권한 변경 실패: ${error.message}`)
    } finally {
      setSavingId('')
    }
  }

  if (!isSuperAdmin) {
    return (
      <AdminPage>
        <Panel>
          <div className="px-6 py-16 text-center">
            <ShieldAlert className="mx-auto h-8 w-8 text-amber-600" aria-hidden="true" />
            <h1 className="mt-4 text-lg font-bold text-slate-900">최고관리자 전용 화면입니다</h1>
            <p className="mt-2 text-sm text-slate-500">관리자 계정과 역할 변경은 super_admin만 수행할 수 있습니다.</p>
            <Link href="/admin/hub" className="mt-6 inline-flex min-h-10 items-center rounded-md bg-slate-900 px-4 text-sm font-bold text-white">운영 현황으로 돌아가기</Link>
          </div>
        </Panel>
      </AdminPage>
    )
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Access Control"
        title="관리자 권한"
        description="이미 가입된 Supabase 로그인 계정에 관리자 역할을 부여합니다. 비밀번호와 로그인 정보는 이 화면에서 다루지 않습니다."
      />

      {message && <div className={`mb-4 rounded-md border px-4 py-3 text-sm font-semibold ${message.includes('실패') ? 'border-red-200 bg-red-50 text-red-700' : 'border-teal-200 bg-teal-50 text-teal-800'}`}>{message}</div>}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="전체 관리자" value={`${summary.total}명`} icon={UsersRound} />
        <Metric label="활성 계정" value={`${summary.active}명`} icon={Check} tone="green" />
        <Metric label="최고관리자" value={`${summary.superAdmins}명`} icon={ShieldCheck} tone="red" />
        <Metric label="열람 전용" value={`${summary.viewers}명`} icon={KeyRound} tone="blue" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="관리자 목록" description="역할이나 활성 상태를 바꾼 뒤 행별 저장 버튼을 누르세요.">
          {loading ? (
            <div className="px-5 py-14 text-center text-sm font-semibold text-slate-400">권한 목록을 불러오는 중입니다.</div>
          ) : admins.length === 0 ? (
            <EmptyState title="등록된 관리자 계정이 없습니다." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead className="bg-slate-50 text-[11px] font-bold text-slate-500">
                  <tr className="border-b border-slate-200"><th className="px-4 py-3">계정</th><th className="px-3 py-3">현재 역할</th><th className="px-3 py-3">역할 변경</th><th className="px-3 py-3">접근 상태</th><th className="w-14 px-3 py-3"><span className="sr-only">저장</span></th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {admins.map((item) => {
                    const draft = drafts[item.user_id] || { role: item.role, is_active: item.is_active }
                    const isCurrentUser = item.user_id === session?.user?.id
                    const changed = draft.role !== item.role || draft.is_active !== item.is_active
                    return (
                      <tr key={item.user_id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3.5">
                          <p className="text-sm font-bold text-slate-900">{item.display_name || item.email}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">{item.email}{isCurrentUser ? ' · 현재 계정' : ''}</p>
                        </td>
                        <td className="px-3 py-3.5"><StatusBadge tone={roleTones[item.role]}>{roleLabel(item.role)}</StatusBadge></td>
                        <td className="px-3 py-3.5">
                          <select value={draft.role} onChange={(event) => updateDraft(item.user_id, { role: event.target.value })} disabled={isCurrentUser} className="h-9 w-32 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-teal-600 disabled:bg-slate-100 disabled:text-slate-400">
                            {roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-3.5">
                          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                            <input type="checkbox" checked={draft.is_active} onChange={(event) => updateDraft(item.user_id, { is_active: event.target.checked })} disabled={isCurrentUser} className="accent-teal-700" />
                            {draft.is_active ? '활성' : '비활성'}
                          </label>
                        </td>
                        <td className="px-3 py-3.5 text-right">
                          <button type="button" onClick={() => saveAccess(item)} disabled={!changed || savingId === item.user_id} className="grid h-9 w-9 place-items-center rounded-md text-teal-700 hover:bg-teal-50 disabled:text-slate-300" title="권한 변경 저장" aria-label={`${item.display_name || item.email} 권한 저장`}>
                            <Save className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel title="관리자 추가" description="먼저 회원가입이 완료된 이메일이어야 합니다.">
            <form onSubmit={grantAccess} className="space-y-4 p-4">
              <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">로그인 이메일</span><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="member@example.com" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-teal-600" /></label>
              <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600">부여 역할</span><select value={newRole} onChange={(event) => setNewRole(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-600">{roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
              <p className="rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-600">{roles.find((role) => role.value === newRole)?.description}</p>
              <button type="submit" disabled={adding} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50"><UserPlus className="h-4 w-4" aria-hidden="true" />{adding ? '등록 중' : '권한 등록'}</button>
            </form>
          </Panel>

          <Panel title="최근 변경" description="권한 변경 이력이 자동으로 기록됩니다.">
            {audits.length === 0 ? <EmptyState title="변경 이력이 없습니다." /> : (
              <div className="divide-y divide-slate-100">
                {audits.slice(0, 8).map((audit) => {
                  const target = admins.find((item) => item.user_id === audit.target_user_id)
                  return <div key={audit.id} className="flex gap-3 px-4 py-3"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" /><div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{target?.display_name || audit.target_user_id}</p><p className="mt-0.5 text-[10px] text-slate-500">{audit.action === 'grant' ? '권한 등록' : '권한 변경'} · {formatDate(audit.created_at)}</p></div></div>
                })}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </AdminPage>
  )
}

function Metric({ label, value, icon: Icon, tone = 'gray' }) {
  const colors = { gray: 'border-t-slate-300 text-slate-500', green: 'border-t-emerald-600 text-emerald-600', red: 'border-t-red-600 text-red-600', blue: 'border-t-blue-600 text-blue-600' }
  return <div className={`rounded-md border border-slate-200 border-t-[3px] bg-white p-4 ${colors[tone]}`}><div className="flex items-center justify-between"><p className="text-[11px] font-semibold text-slate-500">{label}</p><Icon className="h-4 w-4" aria-hidden="true" /></div><p className="mt-1.5 text-xl font-bold text-slate-950">{value}</p></div>
}
