'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeftRight,
  Camera,
  Check,
  GraduationCap,
  Link2,
  Mail,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  UserRoundCheck,
  UserRoundPlus,
  UsersRound,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAdminContext, useAdminRole } from '@/app/admin/_components/AdminShell'
import { AdminPage, EmptyState, PageHeader, Panel, ReadOnlyBanner, StatusBadge } from '@/app/admin/_components/AdminUI'

const execRoles = ['member', '학회장', '부학회장', '총무', '기획부장', '교육부장', '홍보부장']
const memberStatuses = [
  { value: 'active', label: '활동' },
  { value: 'leave', label: '휴회' },
  { value: 'inactive', label: '비활동' },
  { value: 'alumni', label: '졸업' },
  { value: 'pending', label: '승인 대기' },
]
const participationStatuses = [
  { value: 'active', label: '참여' },
  { value: 'leave', label: '학기 휴회' },
  { value: 'withdrawn', label: '중도 종료' },
  { value: 'completed', label: '수료' },
]

const directoryTabs = [
  { value: 'active', label: '활동 학회원', icon: UserRoundCheck },
  { value: 'alumni', label: '졸업 학회원', icon: GraduationCap },
  { value: 'pending', label: '가입 승인 대기', icon: UserRoundPlus },
]

const emptyForm = {
  name: '',
  generation: '',
  university: '',
  department: '',
  status: 'active',
  is_public: true,
}

const statusTone = {
  active: 'green',
  leave: 'amber',
  inactive: 'gray',
  alumni: 'blue',
  pending: 'red',
}

function statusLabel(status) {
  return memberStatuses.find((item) => item.value === status)?.label || status
}

// 가입 승인 대기: 로그인 이메일과 계정 없는 같은 이름 기존 학회원 후보 (Supabase STEP 22)
async function fetchSignupRequests() {
  const { data, error } = await supabase.rpc('admin_signup_requests')
  if (error) return { requests: {}, unavailable: true }
  return {
    requests: Object.fromEntries((data || []).map((item) => [item.request_member_id, item])),
    unavailable: false,
  }
}

export default function AdminMembersPage() {
  const { semester: activeSemester, admin } = useAdminContext() || {}
  const { canWrite } = useAdminRole()
  const [members, setMembers] = useState([])
  const [semesters, setSemesters] = useState([])
  const [semesterId, setSemesterId] = useState('')
  const [memberships, setMemberships] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [directoryTab, setDirectoryTab] = useState('active')
  const [selectedMemberIds, setSelectedMemberIds] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [onlySemester, setOnlySemester] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [addToSemester, setAddToSemester] = useState(true)
  const [message, setMessage] = useState('')
  const [groupPhotoUrl, setGroupPhotoUrl] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [signupRequests, setSignupRequests] = useState({})
  const [requestsUnavailable, setRequestsUnavailable] = useState(false)

  useEffect(() => {
    let active = true
    fetchSignupRequests().then(({ requests, unavailable }) => {
      if (!active) return
      setSignupRequests(requests)
      setRequestsUnavailable(unavailable)
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true

    async function fetchBaseData() {
      setLoading(true)
      let memberRequest = supabase.from('members').select('id, name, generation, university, department, status, requested_status, is_public, auth_user_id, created_at').order('name')
      let [memberResult, semesterResult, photoResult] = await Promise.all([
        memberRequest,
        supabase.from('semesters').select('id, code, name, status').order('created_at', { ascending: false }),
        supabase.from('pr_config').select('value').eq('key', 'members_group_photo').maybeSingle(),
      ])

      if (memberResult.error?.code === '42703') {
        memberRequest = supabase.from('members').select('id, name, generation, university, department, status, is_public, auth_user_id, created_at').order('name')
        memberResult = await memberRequest
      }

      if (!active) return
      if (memberResult.error) setMessage(`학회원 조회 실패: ${memberResult.error.message}`)
      setMembers((memberResult.data || []).map((member) => ({
        ...member,
        requested_status: member.requested_status || (member.status === 'alumni' ? 'alumni' : 'active'),
      })))
      setSemesters(semesterResult.data || [])
      setGroupPhotoUrl(photoResult.data?.value || '')
      setSemesterId((current) => current || activeSemester?.id || semesterResult.data?.find((item) => item.status === 'active')?.id || semesterResult.data?.[0]?.id || '')
      setLoading(false)
    }

    fetchBaseData()
    return () => {
      active = false
    }
  }, [activeSemester?.id])

  useEffect(() => {
    let active = true

    async function fetchMemberships() {
      if (!semesterId) {
        setMemberships({})
        return
      }
      const { data, error } = await supabase
        .from('semester_memberships')
        .select('id, member_id, role, participation_status')
        .eq('semester_id', semesterId)

      if (!active) return
      if (error) {
        setMessage(`학기 명단 조회 실패: ${error.message}`)
        return
      }
      setMemberships(Object.fromEntries((data || []).map((item) => [item.member_id, item])))
    }

    fetchMemberships()
    return () => {
      active = false
    }
  }, [semesterId])

  const selectedSemester = semesters.find((item) => item.id === semesterId)
  const activeCount = members.filter((member) => member.status === 'active').length
  const alumniCount = members.filter((member) => member.status === 'alumni').length
  const pendingCount = members.filter((member) => member.status === 'pending').length
  const canDeleteMembers = ['developer', 'super_admin', 'admin', 'operator'].includes(admin?.role)
  const canLinkAccounts = canWrite && canDeleteMembers
  // 직접 고르는 연결 대상: 로그인 계정이 없는 기존 학회원 (승인 대기 행 제외)
  const unlinkedRoster = useMemo(
    () => members.filter((member) => !member.auth_user_id && member.status !== 'pending'),
    [members]
  )

  const filteredMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR')
    return members.filter((member) => {
      const matchesQuery = !normalizedQuery || [member.name, member.generation, member.university, member.department]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('ko-KR')
        .includes(normalizedQuery)
      const matchesStatus = statusFilter === 'all' || member.status === statusFilter
      const matchesDirectory = directoryTab === 'alumni'
        ? member.status === 'alumni'
        : directoryTab === 'pending'
          ? member.status === 'pending'
          : member.status !== 'alumni' && member.status !== 'pending'
      const membership = memberships[member.id]
      const matchesSemester = !onlySemester || (membership && membership.participation_status !== 'withdrawn')
      return matchesQuery && matchesStatus && matchesDirectory && matchesSemester
    })
  }, [directoryTab, members, memberships, onlySemester, query, statusFilter])

  function openNewMember() {
    setEditingId(null)
    setForm(emptyForm)
    setAddToSemester(Boolean(semesterId))
    setFormOpen(true)
  }

  function openEditMember(member) {
    setEditingId(member.id)
    setForm({
      name: member.name || '',
      generation: member.generation || '',
      university: member.university || '',
      department: member.department || '',
      status: member.status,
      is_public: member.is_public,
    })
    setFormOpen(true)
  }

  async function refreshMembers() {
    let { data, error } = await supabase
      .from('members')
      .select('id, name, generation, university, department, status, requested_status, is_public, auth_user_id, created_at')
      .order('name')
    if (error?.code === '42703') {
      const fallback = await supabase
        .from('members')
        .select('id, name, generation, university, department, status, is_public, auth_user_id, created_at')
        .order('name')
      data = fallback.data
      error = fallback.error
    }
    if (error) throw error
    setMembers((data || []).map((member) => ({
      ...member,
      requested_status: member.requested_status || (member.status === 'alumni' ? 'alumni' : 'active'),
    })))
  }

  function toggleMember(memberId) {
    setSelectedMemberIds((current) => current.includes(memberId)
      ? current.filter((id) => id !== memberId)
      : [...current, memberId])
  }

  function toggleAllVisible() {
    const visibleIds = filteredMembers.map((member) => member.id)
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedMemberIds.includes(id))
    setSelectedMemberIds((current) => allSelected
      ? current.filter((id) => !visibleIds.includes(id))
      : [...new Set([...current, ...visibleIds])])
  }

  async function bulkMoveMembers(targetStatus) {
    if (selectedMemberIds.length === 0) return
    const targetLabel = targetStatus === 'alumni' ? '졸업 학회원' : '활동 학회원'
    const likelyExisting = members.filter((member) => selectedMemberIds.includes(member.id)
      && member.status === 'pending'
      && signupRequests[member.id]?.candidates?.some((candidate) => candidate.linkable && candidate.match === 'name_generation'))
    const duplicateNote = likelyExisting.length > 0
      ? `\n\n주의: ${likelyExisting.map((member) => member.name).join(', ')}은(는) 이름·기수가 같은 기존 학회원이 있습니다. 같은 사람이면 이동하지 말고 아래 '기존 학회원에 연결'을 쓰세요. 이동하면 명단이 중복되고 예전 기록과 이어지지 않습니다.`
      : ''
    if (!confirm(`선택한 ${selectedMemberIds.length}명을 ${targetLabel}으로 이동할까요?${duplicateNote}`)) return

    setSaving(true)
    setMessage('')
    const { data, error } = await supabase.rpc('admin_bulk_set_member_status', {
      p_member_ids: selectedMemberIds,
      p_target_status: targetStatus,
      p_semester_id: targetStatus === 'active' ? semesterId || null : null,
    })

    if (error) {
      setMessage(`일괄 이관 실패: ${error.message}. Supabase STEP 8 실행 여부를 확인하세요.`)
      setSaving(false)
      return
    }

    await refreshMembers()
    setMemberships((current) => {
      const next = { ...current }
      selectedMemberIds.forEach((memberId) => {
        if (next[memberId]) next[memberId] = { ...next[memberId], participation_status: targetStatus === 'alumni' ? 'completed' : 'active' }
      })
      return next
    })
    setSelectedMemberIds([])
    setDirectoryTab(targetStatus)
    setMessage(`${data || selectedMemberIds.length}명을 ${targetLabel}으로 이동했습니다.`)
    setSaving(false)
  }

  // 가입 신청(승인 대기 행)의 로그인 계정을 기존 학회원 행으로 옮긴다. 신청 행은 기존 학회원 행에 합쳐진다
  async function linkSignupToMember(member, target) {
    const request = signupRequests[member.id]
    const targetId = target.member_id || target.id
    const pendingTarget = target.status === 'pending'
    if (!confirm(`가입 신청 ${member.name}(${member.generation || '기수 미입력'}, ${request?.email || '이메일 확인 불가'})을\n기존 학회원 ${target.name}(${target.generation || '기수 미입력'} · ${statusLabel(target.status)})에 연결할까요?\n\n- 이 로그인 계정은 바로 ${pendingTarget ? '승인 대기 상태인' : '승인된'} 기존 학회원으로 들어옵니다.\n- 기존 학회원의 이름·기수·상태와 출결·제출 기록은 그대로입니다.\n- 가입 신청 행은 기존 학회원 행에 합쳐져 목록에서 사라집니다.\n\n이메일과 이름으로 본인인지 확인한 뒤 진행하세요.`)) return

    setSaving(true)
    setMessage('')
    const { data, error } = await supabase.rpc('admin_link_signup_to_member', {
      p_request_member_id: member.id,
      p_target_member_id: targetId,
    })

    if (error) {
      setMessage(`계정 연결 실패: ${error.message}`)
      setSaving(false)
      return
    }

    await refreshMembers()
    const { requests, unavailable } = await fetchSignupRequests()
    setSignupRequests(requests)
    setRequestsUnavailable(unavailable)
    // 신청 행의 학기 명단은 기존 학회원으로 옮겨지고, 둘 다 있던 학기는 기존 학회원 쪽이 남는다
    setMemberships((current) => {
      const next = { ...current }
      const moved = next[member.id]
      delete next[member.id]
      if (moved && !next[targetId]) next[targetId] = { ...moved, member_id: targetId }
      return next
    })
    setSelectedMemberIds((current) => current.filter((id) => id !== member.id))
    setMessage(`${data?.name || target.name} 학회원에 로그인 계정을 연결했습니다.${pendingTarget ? ' 이 학회원은 아직 승인 대기이므로 승인도 진행하세요.' : ' 이 계정은 바로 학회원 공간을 쓸 수 있습니다.'}`)
    setSaving(false)
  }

  async function deleteSelectedMembers() {
    if (selectedMemberIds.length === 0) return
    const selectedNames = members
      .filter((member) => selectedMemberIds.includes(member.id))
      .map((member) => member.name)
      .join(', ')

    if (!confirm(`선택한 ${selectedMemberIds.length}명을 영구 삭제할까요?\n\n${selectedNames}\n\n연결된 로그인 계정도 삭제되며 이 작업은 되돌릴 수 없습니다. 운영 기록이 있는 학회원은 안전을 위해 삭제되지 않습니다.`)) return
    if (!confirm('마지막 확인입니다. 정말 삭제할까요?')) return

    setSaving(true)
    setMessage('')
    const { data, error } = await supabase.rpc('admin_delete_members', {
      p_member_ids: selectedMemberIds,
    })

    if (error) {
      setMessage(`학회원 삭제 실패: ${error.message}. Supabase STEP 9 실행 여부를 확인하세요.`)
      setSaving(false)
      return
    }

    const blocked = Array.isArray(data?.blocked) ? data.blocked : []
    if (blocked.length > 0) {
      const details = blocked.map((item) => `${item.name}(${item.reasons})`).join(', ')
      setMessage(`운영 기록 보호를 위해 삭제하지 않았습니다: ${details}. 해당 학회원은 졸업 학회원으로 이관하세요.`)
      setSaving(false)
      return
    }

    const deletedIds = Array.isArray(data?.deleted_ids) ? data.deleted_ids : selectedMemberIds
    await refreshMembers()
    setMemberships((current) => Object.fromEntries(
      Object.entries(current).filter(([memberId]) => !deletedIds.includes(memberId))
    ))
    setSelectedMemberIds([])
    setMessage(`${data?.deleted_count || deletedIds.length}명의 학회원과 연결된 로그인 계정을 삭제했습니다.`)
    setSaving(false)
  }

  async function saveMember(event) {
    event.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setMessage('')

    try {
      const payload = {
        name: form.name.trim(),
        generation: form.generation.trim() || null,
        university: form.university.trim() || null,
        department: form.department.trim() || null,
        status: form.status,
        requested_status: form.status === 'alumni' ? 'alumni' : 'active',
        is_public: form.is_public,
      }

      let memberId = editingId
      if (editingId) {
        const { error } = await supabase.from('members').update(payload).eq('id', editingId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('members').insert(payload).select('id').single()
        if (error) throw error
        memberId = data.id
      }

      if (!editingId && addToSemester && semesterId) {
        const { error } = await supabase.from('semester_memberships').insert({
          semester_id: semesterId,
          member_id: memberId,
          role: 'member',
          participation_status: 'active',
        })
        if (error) {
          await refreshMembers()
          setFormOpen(false)
          setMessage(`학회원은 등록됐지만 학기 명단 추가에 실패했습니다: ${error.message}`)
          return
        }
        setMemberships((current) => ({
          ...current,
          [memberId]: { member_id: memberId, role: 'member', participation_status: 'active' },
        }))
      }

      await refreshMembers()
      setFormOpen(false)
      setMessage(editingId ? '학회원 정보를 수정했습니다.' : '새 학회원을 등록했습니다.')
    } catch (error) {
      setMessage(`저장 실패: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function updateMembership(memberId, patch) {
    if (!semesterId) return
    setMessage('')
    const current = memberships[memberId]
    const payload = {
      semester_id: semesterId,
      member_id: memberId,
      role: current?.role || 'member',
      participation_status: current?.participation_status || 'active',
      ...patch,
    }
    const { data, error } = await supabase
      .from('semester_memberships')
      .upsert(payload, { onConflict: 'semester_id,member_id' })
      .select('id, member_id, role, participation_status')
      .single()

    if (error) {
      setMessage(`학기 명단 저장 실패: ${error.message}`)
      return
    }
    setMemberships((currentMemberships) => ({ ...currentMemberships, [memberId]: data }))
  }

  async function uploadGroupPhoto() {
    if (!photoFile) return
    setUploadingPhoto(true)
    setMessage('')
    try {
      const extension = photoFile.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `members/group_${Date.now()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('showcase').upload(path, photoFile)
      if (uploadError) throw uploadError
      const publicUrl = supabase.storage.from('showcase').getPublicUrl(path).data.publicUrl
      const { error: configError } = await supabase.from('pr_config').upsert({ key: 'members_group_photo', value: publicUrl })
      if (configError) throw configError
      setGroupPhotoUrl(publicUrl)
      setPhotoFile(null)
      setMessage('공개 단체사진을 변경했습니다.')
    } catch (error) {
      setMessage(`사진 업로드 실패: ${error.message}`)
    } finally {
      setUploadingPhoto(false)
    }
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="운영 기준"
        title="학회원 관리"
        description="학회원 기본 정보는 한 번만 등록하고, 학기별 참여 여부와 직책은 선택한 학기 명단에서 관리합니다."
        actions={
          <button type="button" onClick={openNewMember} disabled={!canWrite} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50">
            <Plus className="h-4 w-4" aria-hidden="true" />
            학회원 등록
          </button>
        }
      />
      <ReadOnlyBanner role={admin?.role} />

      {message && (
        <div className={`mb-4 rounded-md border px-4 py-3 text-sm font-semibold ${message.includes('실패') ? 'border-red-200 bg-red-50 text-red-700' : 'border-teal-200 bg-teal-50 text-teal-800'}`}>
          {message}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Summary label="전체 등록" value={`${members.length}명`} />
        <Summary label="현재 활동" value={`${activeCount}명`} tone="teal" />
        <Summary label="졸업 학회원" value={`${alumniCount}명`} tone="blue" />
        <Summary label="가입 승인 대기" value={`${pendingCount}명`} tone={pendingCount ? 'red' : 'green'} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel
          title="학회원 명단"
          description={`${selectedSemester?.name || '학기 미선택'} 기준 참여 정보가 함께 표시됩니다.`}
          action={
            <select value={semesterId} onChange={(event) => setSemesterId(event.target.value)} className="h-9 max-w-44 rounded-md border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-teal-600">
              <option value="">학기 선택</option>
              {semesters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          }
        >
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-white p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="inline-flex max-w-full overflow-x-auto border-y border-slate-200 bg-slate-50 p-1">
              {directoryTabs.map((item) => {
                const Icon = item.icon
                const count = item.value === 'active' ? members.length - alumniCount - pendingCount : item.value === 'alumni' ? alumniCount : pendingCount
                return (
                  <button key={item.value} type="button" onClick={() => { setDirectoryTab(item.value); setSelectedMemberIds([]) }} className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded px-3 text-xs font-bold ${directoryTab === item.value ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {item.label}
                    <span className="text-xs text-slate-400">{count}</span>
                  </button>
                )
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">{selectedMemberIds.length}명 선택</span>
              <button type="button" onClick={() => bulkMoveMembers('active')} disabled={!canWrite || saving || selectedMemberIds.length === 0} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-teal-50 px-3 text-xs font-bold text-teal-800 hover:bg-teal-100 disabled:opacity-40">
                <ArrowLeftRight className="h-4 w-4" aria-hidden="true" /> 활동으로 이동
              </button>
              <button type="button" onClick={() => bulkMoveMembers('alumni')} disabled={!canWrite || saving || selectedMemberIds.length === 0} className="inline-flex min-h-9 items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-800 hover:bg-blue-100 disabled:opacity-40">
                <GraduationCap className="h-4 w-4" aria-hidden="true" /> 졸업으로 이관
              </button>
              {canDeleteMembers && (
                <button type="button" onClick={deleteSelectedMembers} disabled={!canWrite || saving || selectedMemberIds.length === 0} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-red-50 px-3 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-40">
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> 영구 삭제
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/70 p-3 sm:flex-row sm:items-center">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
              <span className="sr-only">학회원 검색</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름, 기수, 학교 검색" className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-teal-600" />
            </label>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-teal-600">
              <option value="all">전체 상태</option>
              {memberStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <label className="flex h-9 items-center gap-2 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700">
              <input type="checkbox" checked={onlySemester} onChange={(event) => setOnlySemester(event.target.checked)} className="accent-teal-700" />
              선택 학기만
            </label>
          </div>

          {directoryTab === 'pending' && (
            <div className={`border-b px-4 py-3 text-xs leading-5 ${requestsUnavailable ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-600'}`}>
              {requestsUnavailable
                ? '가입 계정의 이메일과 기존 학회원 연결 후보를 불러오지 못했습니다. Supabase STEP 22 실행 여부를 확인하세요. 실행 전에는 새 학회원 승인만 할 수 있습니다.'
                : '이미 명단에 있는 학회원이 가입했다면 이메일과 이름으로 본인인지 확인한 뒤 기존 학회원에 연결하세요. 연결하면 예전 출결·제출 기록이 그대로 이어집니다. 새 학회원은 선택한 뒤 활동으로 이동 또는 졸업으로 이관으로 승인합니다.'}
            </div>
          )}

          {loading ? (
            <div className="px-5 py-12 text-center text-sm font-semibold text-slate-400">명단을 불러오는 중입니다.</div>
          ) : filteredMembers.length === 0 ? (
            <EmptyState title="조건에 맞는 학회원이 없습니다." description="검색어나 필터를 변경하거나 새 학회원을 등록하세요." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-left">
                <thead className="bg-white text-xs font-bold text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="w-12 px-4 py-3">
                      <input type="checkbox" checked={filteredMembers.length > 0 && filteredMembers.every((member) => selectedMemberIds.includes(member.id))} onChange={toggleAllVisible} aria-label="현재 목록 전체 선택" className="accent-teal-700" />
                    </th>
                    <th className="px-4 py-3">학회원</th>
                    <th className="px-3 py-3">소속</th>
                    <th className="px-3 py-3">전역 상태</th>
                    <th className="px-3 py-3">학기 참여</th>
                    <th className="px-3 py-3">학기 직책</th>
                    <th className="w-14 px-3 py-3"><span className="sr-only">수정</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMembers.map((member) => {
                    const membership = memberships[member.id]
                    return (
                      <Fragment key={member.id}>
                      <tr className="hover:bg-slate-50/80">
                        <td className="px-4 py-3.5">
                          <input type="checkbox" checked={selectedMemberIds.includes(member.id)} onChange={() => toggleMember(member.id)} aria-label={`${member.name} 선택`} className="accent-teal-700" />
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="grid h-9 w-9 shrink-0 place-items-center bg-slate-900 text-xs font-bold text-white">{member.name.slice(0, 1)}</div>
                            <div>
                              <p className="text-sm font-bold text-slate-900">{member.name}</p>
                              <p className="mt-0.5 text-xs text-slate-500">{member.generation || '기수 미입력'} · {member.is_public ? '공개' : '비공개'}{member.status === 'pending' ? ` · ${member.requested_status === 'alumni' ? '졸업' : '활동'} 요청` : ''}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5 text-xs text-slate-600">
                          <p className="font-semibold">{member.university || '-'}</p>
                          <p className="mt-0.5 text-slate-400">{member.department || '-'}</p>
                        </td>
                        <td className="px-3 py-3.5"><StatusBadge tone={statusTone[member.status]}>{statusLabel(member.status)}</StatusBadge></td>
                        <td className="px-3 py-3.5">
                          <select
                            value={membership?.participation_status || 'not_enrolled'}
                            onChange={(event) => updateMembership(member.id, { participation_status: event.target.value === 'not_enrolled' ? 'withdrawn' : event.target.value })}
                            disabled={!canWrite || !semesterId}
                            className="h-8 w-28 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-teal-600 disabled:bg-slate-100"
                          >
                            <option value="not_enrolled">미편성</option>
                            {participationStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-3.5">
                          <select
                            value={membership?.role || 'member'}
                            onChange={(event) => updateMembership(member.id, { role: event.target.value, participation_status: membership?.participation_status === 'withdrawn' ? 'active' : membership?.participation_status || 'active' })}
                            disabled={!canWrite || !semesterId || !membership || membership.participation_status === 'withdrawn'}
                            className="h-8 w-28 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-teal-600 disabled:bg-slate-100 disabled:text-slate-400"
                          >
                            {execRoles.map((role) => <option key={role} value={role}>{role === 'member' ? '일반' : role}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-3.5 text-right">
                          <button type="button" onClick={() => openEditMember(member)} className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-900" title="학회원 정보 수정" aria-label={`${member.name} 정보 수정`}>
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                      {member.status === 'pending' && !requestsUnavailable && (
                        <SignupRequestRow
                          member={member}
                          request={signupRequests[member.id]}
                          roster={unlinkedRoster}
                          disabled={!canLinkAccounts || saving}
                          onLink={(target) => linkSignupToMember(member, target)}
                        />
                      )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel title="공개 단체사진" description="외부 학회원 소개 페이지에 표시됩니다.">
            <div className="p-4">
              {groupPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={groupPhotoUrl} alt="InsightGraphy 단체사진" className="aspect-[4/3] w-full border border-slate-200 object-cover" />
              ) : (
                <div className="grid aspect-[4/3] place-items-center border border-dashed border-slate-300 bg-slate-50 text-slate-400">
                  <Camera className="h-7 w-7" aria-hidden="true" />
                </div>
              )}
              <label className="mt-3 flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">
                <Camera className="h-4 w-4" aria-hidden="true" />
                {photoFile ? photoFile.name : '사진 선택'}
                <input type="file" accept="image/*" onChange={(event) => setPhotoFile(event.target.files?.[0] || null)} className="sr-only" />
              </label>
              <button type="button" onClick={uploadGroupPhoto} disabled={!canWrite || !photoFile || uploadingPhoto} className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-3 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">
                <Upload className="h-4 w-4" aria-hidden="true" />
                {uploadingPhoto ? '업로드 중' : '단체사진 적용'}
              </button>
            </div>
          </Panel>

          <Panel title="데이터 구분" description="중복 입력을 막기 위한 저장 기준입니다.">
            <div className="divide-y divide-slate-100 text-xs">
              <DataRule icon={UsersRound} label="개인 기본 정보" source="members" />
              <DataRule icon={UserRoundCheck} label="학기 참여 및 직책" source="semester_memberships" />
            </div>
          </Panel>
        </div>
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="member-form-title">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-xl bg-white shadow-2xl">
            <div className="flex min-h-16 items-center justify-between border-b border-slate-200 px-5">
              <div>
                <p className="text-xs font-bold text-teal-700">학회원 정보</p>
                <h2 id="member-form-title" className="text-base font-bold text-slate-950">{editingId ? '학회원 정보 수정' : '새 학회원 등록'}</h2>
              </div>
              <button type="button" onClick={() => setFormOpen(false)} className="grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100" aria-label="닫기">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={saveMember} className="p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="이름" required><input autoFocus required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="form-input" /></Field>
                <Field label="기수"><input value={form.generation} onChange={(event) => setForm({ ...form, generation: event.target.value })} placeholder="예: 29기" className="form-input" /></Field>
                <Field label="학교"><input value={form.university} onChange={(event) => setForm({ ...form, university: event.target.value })} className="form-input" /></Field>
                <Field label="학과"><input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} className="form-input" /></Field>
                <Field label="전역 상태">
                  <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="form-input">
                    {memberStatuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </Field>
                <Field label="외부 명단 공개">
                  <label className="flex h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700">
                    <input type="checkbox" checked={form.is_public} onChange={(event) => setForm({ ...form, is_public: event.target.checked })} className="accent-teal-700" />
                    공개 페이지에 표시
                  </label>
                </Field>
              </div>
              {!editingId && semesterId && (
                <label className="mt-4 flex items-start gap-3 rounded-lg bg-teal-50 p-3 text-sm text-teal-900">
                  <input type="checkbox" checked={addToSemester} onChange={(event) => setAddToSemester(event.target.checked)} className="mt-0.5 accent-teal-700" />
                  <span><strong>{selectedSemester?.name}</strong> 참여 명단에도 바로 추가</span>
                </label>
              )}
              <div className="mt-6 flex justify-end gap-2 border-t border-slate-200 pt-4">
                <button type="button" onClick={() => setFormOpen(false)} className="min-h-10 rounded-md border border-slate-200 px-4 text-sm font-bold text-slate-600 hover:bg-slate-50">취소</button>
                <button type="submit" disabled={!canWrite || saving} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {saving ? '저장 중' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .form-input { width: 100%; height: 40px; border: 1px solid #e2e8f0; border-radius: 6px; padding: 0 12px; background: white; color: #0f172a; font-size: 14px; outline: none; }
        .form-input:focus { border-color: #0f766e; box-shadow: 0 0 0 3px rgba(15, 118, 110, .1); }
      `}</style>
    </AdminPage>
  )
}

// 가입 승인 대기 행 아래: 로그인 이메일, 기존 학회원 후보와 연결 버튼
function SignupRequestRow({ member, request, roster, disabled, onLink }) {
  if (!request) {
    return (
      <tr className="bg-slate-50/70">
        <td />
        <td colSpan={6} className="px-4 py-2.5 text-xs text-slate-500">로그인 계정이 연결되지 않은 승인 대기 행입니다.</td>
      </tr>
    )
  }

  const candidates = request.candidates || []
  const recordCount = Object.values(request.records || {}).reduce((sum, count) => sum + Number(count || 0), 0)
  const otherRoster = roster.filter((item) => !candidates.some((candidate) => candidate.member_id === item.id))

  return (
    <tr className="bg-slate-50/70">
      <td />
      <td colSpan={6} className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
            <Mail className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            {request.email || '이메일 없음'}
          </span>
          <span className={request.email_confirmed ? 'font-semibold text-teal-700' : 'font-semibold text-amber-700'}>
            {request.email_confirmed ? '이메일 인증 완료' : '이메일 인증 전'}
          </span>
          {request.signed_up_at && <span>가입 {new Date(request.signed_up_at).toLocaleDateString('ko-KR')}</span>}
          {recordCount > 0 && <span>이 신청으로 남은 기록 {recordCount}건 (연결하면 함께 옮겨짐)</span>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {candidates.map((candidate) => candidate.linkable ? (
            <button
              key={candidate.member_id}
              type="button"
              onClick={() => onLink(candidate)}
              disabled={disabled}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-teal-200 bg-white px-3 text-xs font-bold text-teal-800 hover:bg-teal-50 disabled:opacity-40"
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
              기존 학회원 {candidate.name}({candidate.generation || '기수 미입력'} · {statusLabel(candidate.status)})에 연결
              <span className="font-semibold text-slate-400">{candidate.match === 'name_generation' ? '이름·기수 같음' : '이름만 같음'}</span>
            </button>
          ) : (
            <span key={candidate.member_id} className="inline-flex min-h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-500">
              {candidate.name}({candidate.generation || '기수 미입력'}) 연결 불가: {candidate.reason}
            </span>
          ))}
          {otherRoster.length > 0 && (
            <select
              value=""
              onChange={(event) => {
                const target = otherRoster.find((item) => item.id === event.target.value)
                if (target) onLink(target)
              }}
              disabled={disabled}
              aria-label={`${member.name} 가입 신청을 연결할 다른 기존 학회원 선택`}
              className="h-8 max-w-64 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-600 outline-none focus:border-teal-600 disabled:opacity-40"
            >
              <option value="">다른 기존 학회원에 연결…</option>
              {otherRoster.map((item) => (
                <option key={item.id} value={item.id}>{item.name} ({item.generation || '기수 미입력'} · {statusLabel(item.status)})</option>
              ))}
            </select>
          )}
        </div>
        {candidates.length === 0 && (
          <p className="mt-2 text-xs text-slate-500">이름이 같은 기존 학회원이 없습니다. 새 학회원이면 선택한 뒤 활동으로 이동 또는 졸업으로 이관으로 승인하세요.</p>
        )}
      </td>
    </tr>
  )
}

function Summary({ label, value, tone = 'gray' }) {
  const tones = { gray: 'border-t-slate-300', teal: 'border-t-teal-600', blue: 'border-t-blue-600', green: 'border-t-emerald-600', red: 'border-t-red-600' }
  return (
    <div className={`border-t-[3px] bg-gradient-to-b from-slate-50/70 to-white p-4 ${tones[tone]}`}>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1.5 text-xl font-bold text-slate-950">{value}</p>
    </div>
  )
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-slate-600">{label}{required && <span className="ml-1 text-red-600">*</span>}</span>
      {children}
    </label>
  )
}

function DataRule({ icon: Icon, label, source }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
      <span className="min-w-0 flex-1 font-semibold text-slate-700">{label}</span>
      <code className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-500">{source}</code>
    </div>
  )
}
