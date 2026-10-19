'use client'
// 조·팀·평가 편성 탭
// 팀: 함께 발표하는 단위(팀 발표 주차) / 조: 같은 공간에서 발표를 듣고 서로 평가하는 묶음 / 클러스터: 평가 점수를 비교·집계하는 상위 묶음
import { useMemo, useState } from 'react'
import { Search, UserX } from 'lucide-react'
import { Button, Field, HelpTip, inputClass, Notice, SegmentedControl, StatusBadge } from '@/app/components/ui'
import { assignmentOf, EXCLUDED, range, UNASSIGNED } from '../_lib'

function CountInput({ id, label, value, onChange, disabled, help }) {
  return (
    <Field label={<span className="inline-flex items-center gap-1">{label}{help && <HelpTip label={`${label} 설명`}>{help}</HelpTip>}</span>} htmlFor={id}>
      <input id={id} type="number" min="1" max="30" value={value} onChange={(event) => onChange(Math.max(1, Math.min(30, Number(event.target.value) || 1)))} disabled={disabled} className={`${inputClass} w-28`} />
    </Field>
  )
}

function MappingGrid({ title, fromLabel, toLabel, fromCount, toCount, mapping, onChange, disabled }) {
  return (
    <section className="rounded-md border border-slate-200 p-4">
      <h4 className="mb-3 text-sm font-bold text-slate-900">{title}</h4>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {range(fromCount).map((from) => (
          <label key={from} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm">
            <span className="font-bold text-slate-700">{from}{fromLabel}</span>
            <select value={mapping[from] || 1} onChange={(event) => onChange(from, Number(event.target.value))} disabled={disabled} className="h-8 rounded-md border border-slate-300 bg-white px-1.5 text-sm font-semibold text-slate-800">
              {range(toCount).map((to) => <option key={to} value={to}>{to}{toLabel}</option>)}
            </select>
          </label>
        ))}
      </div>
    </section>
  )
}

function AssignmentTable({ members, setup, mode, unitLabel, unitCount, canWrite, onAssign }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState([])
  const [bulkValue, setBulkValue] = useState('')

  const rows = useMemo(() => members.map((member) => ({ member, value: assignmentOf(setup, mode, member.name) })), [members, setup, mode])
  const visible = rows.filter(({ member, value }) => {
    const text = `${member.name} ${member.generation || ''} ${member.university || ''}`.toLowerCase()
    if (query && !text.includes(query.trim().toLowerCase())) return false
    if (filter === 'unassigned') return value === UNASSIGNED || value === '' || value == null
    if (filter === 'excluded') return value === EXCLUDED
    if (filter !== 'all') return String(value) === filter
    return true
  })
  const allVisibleSelected = visible.length > 0 && visible.every(({ member }) => selected.includes(member.name))

  function toggle(name) {
    setSelected((list) => list.includes(name) ? list.filter((item) => item !== name) : [...list, name])
  }

  function applyBulk() {
    if (!bulkValue || selected.length === 0) return
    onAssign(selected, bulkValue)
    setSelected([])
    setBulkValue('')
  }

  const counts = {
    unassigned: rows.filter(({ value }) => value === UNASSIGNED || value === '' || value == null).length,
    excluded: rows.filter(({ value }) => value === EXCLUDED).length,
  }

  return (
    <section className="rounded-md border border-slate-200">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-3 lg:flex-row lg:items-end">
        <Field label="학회원 검색" htmlFor={`${mode}-member-search`} className="lg:w-64">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input id={`${mode}-member-search`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="이름·기수·학교" className={`${inputClass} pl-9`} />
          </div>
        </Field>
        <Field label="보기" htmlFor={`${mode}-member-filter`} className="lg:w-48">
          <select id={`${mode}-member-filter`} value={filter} onChange={(event) => setFilter(event.target.value)} className={inputClass}>
            <option value="all">전체 {rows.length}명</option>
            <option value="unassigned">미정 {counts.unassigned}명</option>
            <option value="excluded">불참 표시 {counts.excluded}명</option>
            {range(unitCount).map((unit) => <option key={unit} value={String(unit)}>{unit}{unitLabel}</option>)}
          </select>
        </Field>
        <div className="flex flex-1 flex-wrap items-end gap-2 lg:justify-end">
          <Field label={`선택한 ${selected.length}명을`} htmlFor={`${mode}-bulk`} className="w-40">
            <select id={`${mode}-bulk`} value={bulkValue} onChange={(event) => setBulkValue(event.target.value)} disabled={!canWrite || selected.length === 0} className={inputClass}>
              <option value="">배정 선택…</option>
              {range(unitCount).map((unit) => <option key={unit} value={String(unit)}>{unit}{unitLabel}로</option>)}
              <option value={UNASSIGNED}>미정으로</option>
              <option value={EXCLUDED}>불참 표시로</option>
            </select>
          </Field>
          <Button onClick={applyBulk} disabled={!canWrite || !bulkValue || selected.length === 0}>일괄 배정</Button>
        </div>
      </div>
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-[1] bg-slate-50 text-xs font-bold text-slate-600">
            <tr className="border-b border-slate-200">
              <th className="w-10 px-3 py-2.5">
                <input type="checkbox" aria-label="보이는 학회원 모두 선택" checked={allVisibleSelected} onChange={() => setSelected((list) => allVisibleSelected ? list.filter((name) => !visible.some(({ member }) => member.name === name)) : [...new Set([...list, ...visible.map(({ member }) => member.name)])])} disabled={!canWrite} className="h-4 w-4 accent-teal-700" />
              </th>
              <th className="px-3 py-2.5">이름</th>
              <th className="px-3 py-2.5">기수 · 학교</th>
              <th className="w-44 px-3 py-2.5">배정</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-sm text-slate-500">조건에 맞는 학회원이 없습니다.</td></tr>
            ) : visible.map(({ member, value }) => {
              const unassigned = value === UNASSIGNED || value === '' || value == null
              const excluded = value === EXCLUDED
              return (
                <tr key={member.id || member.name} className={unassigned ? 'bg-amber-50/40' : excluded ? 'bg-slate-50' : ''}>
                  <td className="px-3 py-2"><input type="checkbox" aria-label={`${member.name} 선택`} checked={selected.includes(member.name)} onChange={() => toggle(member.name)} disabled={!canWrite} className="h-4 w-4 accent-teal-700" /></td>
                  <td className="px-3 py-2 font-bold text-slate-900">{member.name}</td>
                  <td className="px-3 py-2 text-slate-600">{[member.generation, member.university].filter(Boolean).join(' · ') || '-'}</td>
                  <td className="px-3 py-2">
                    <select aria-label={`${member.name} 배정`} value={unassigned ? UNASSIGNED : String(value)} onChange={(event) => onAssign([member.name], event.target.value)} disabled={!canWrite} className={`h-9 w-full rounded-md border px-2 text-sm font-semibold ${unassigned ? 'border-amber-300 bg-white text-amber-800' : excluded ? 'border-slate-300 bg-white text-slate-500' : 'border-teal-300 bg-teal-50 text-teal-900'}`}>
                      <option value={UNASSIGNED}>미정</option>
                      {range(unitCount).map((unit) => <option key={unit} value={String(unit)}>{unit}{unitLabel}</option>)}
                      {!range(unitCount).map(String).includes(String(value)) && !unassigned && !excluded && <option value={String(value)}>{value} (범위 밖)</option>}
                      <option value={EXCLUDED}>불참 표시</option>
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Board({ assignments, unitLabel, clusterOf }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {range(assignments.units).map((unit) => (
        <div key={unit} className="rounded-md border border-slate-200 bg-white p-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-900">{unit}{unitLabel}</p>
            {clusterOf && <StatusBadge tone="teal">클러스터 {clusterOf(unit)}</StatusBadge>}
          </div>
          <p className="break-keep text-sm leading-6 text-slate-600">{(assignments.byUnit[unit] || []).map((member) => member.name).join(', ') || '배정된 인원 없음'}</p>
        </div>
      ))}
      <div className="rounded-md border border-dashed border-slate-300 p-3">
        <p className="mb-1 flex items-center gap-1 text-sm font-bold text-slate-700"><UserX className="h-4 w-4" aria-hidden="true" />미정 · 불참 표시</p>
        <p className="text-sm text-slate-600">미정: {assignments.unassigned.map((member) => member.name).join(', ') || '없음'}</p>
        <p className="text-sm text-slate-600">불참 표시: {assignments.excluded.map((member) => member.name).join(', ') || '없음'}</p>
      </div>
    </section>
  )
}

export default function GroupsTab({ mode, members, canWrite, updateSetup, setupView, assignments }) {
  function assign(names, value) {
    const key = mode === 'weekday' ? 'weekdayMembers' : setupView.evalMode === 'team' ? 'memberTeams' : 'members'
    updateSetup((setup) => {
      const map = { ...(setup[key] || (key === 'memberTeams' ? setup.members : null) || {}) }
      for (const name of names) {
        if (value === UNASSIGNED) map[name] = UNASSIGNED
        else map[name] = value === EXCLUDED ? EXCLUDED : String(value)
      }
      return { ...setup, [key]: map }
    })
  }

  function setField(field, value) {
    updateSetup((setup) => ({ ...setup, [field]: value }))
  }

  function setMapping(field, from, to) {
    updateSetup((setup) => ({ ...setup, [field]: { ...(setup[field] || {}), [from]: to } }))
  }

  const notice = (
    <Notice tone="neutral" className="mb-4">
      <strong>불참 표시</strong>는 이번 주 편성에서 빼는 표시일 뿐 무단결석 확정이 아닙니다. 출결은 출석 기록과 사유서 결재로 정해지고, 출결 대시보드에서 확인합니다. 불참 표시한 사람은 제출 현황에서 미제출로 세지 않습니다.
    </Notice>
  )

  if (mode === 'weekday') {
    return (
      <div className="space-y-5">
        {notice}
        <div className="flex flex-wrap items-end gap-4">
          <CountInput id="weekday-group-count" label="평일 조 개수" value={setupView.weekdayGroupCount} onChange={(value) => setField('weekdayGroupCount', value)} disabled={!canWrite} help="평일 세션은 정규 조와 따로 조를 짭니다. 같은 조끼리 서로 정성 피드백을 씁니다." />
        </div>
        <AssignmentTable members={members} setup={{ ...setupView, weekdayMembers: setupView.weekdayMembers }} mode="weekday" unitLabel="조" unitCount={setupView.weekdayGroupCount} canWrite={canWrite} onAssign={assign} />
        <Board assignments={assignments} unitLabel="조" />
      </div>
    )
  }

  const team = setupView.evalMode === 'team'
  return (
    <div className="space-y-5">
      {notice}
      <div className="flex flex-wrap items-end gap-4">
        <Field label={<span className="inline-flex items-center gap-1">발표 단위<HelpTip label="발표 단위 설명">개인 발표는 학회원마다 조를 배정합니다. 팀 발표는 학회원을 팀에 넣고, 팀을 조(같이 듣고 평가하는 묶음)에 배정합니다.</HelpTip></span>}>
          <SegmentedControl label="발표 단위" value={setupView.evalMode} onChange={(value) => setField('evalMode', value)} disabled={!canWrite} options={[{ value: 'individual', label: '개인 발표' }, { value: 'team', label: '팀 발표' }]} />
        </Field>
        {team && <CountInput id="team-count" label="팀 개수" value={setupView.teamCount} onChange={(value) => setField('teamCount', value)} disabled={!canWrite} help="함께 발표하는 팀의 수입니다." />}
        <CountInput id="group-count" label="조 개수" value={setupView.groupCount} onChange={(value) => setField('groupCount', value)} disabled={!canWrite} help="같은 공간에서 발표를 듣고 서로 평가하는 묶음입니다." />
        <CountInput id="cluster-count" label="평가 클러스터 개수" value={setupView.clusterCount} onChange={(value) => setField('clusterCount', value)} disabled={!canWrite} help="평가 점수를 비교·집계하는 상위 묶음입니다. 조 여러 개를 한 클러스터로 묶을 수 있습니다." />
      </div>

      {team ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <MappingGrid title="팀 → 조" fromLabel="팀" toLabel="조" fromCount={setupView.teamCount} toCount={setupView.groupCount} mapping={setupView.teamGroups} onChange={(from, to) => setMapping('teamGroups', from, to)} disabled={!canWrite} />
          <MappingGrid title="조 → 평가 클러스터" fromLabel="조" toLabel="클러스터" fromCount={setupView.groupCount} toCount={setupView.clusterCount} mapping={setupView.groupClusters} onChange={(from, to) => setMapping('groupClusters', from, to)} disabled={!canWrite} />
        </div>
      ) : (
        <MappingGrid title="조 → 평가 클러스터" fromLabel="조" toLabel="클러스터" fromCount={setupView.groupCount} toCount={setupView.clusterCount} mapping={setupView.groupToCluster} onChange={(from, to) => setMapping('groupToCluster', from, to)} disabled={!canWrite} />
      )}

      <AssignmentTable members={members} setup={setupView} mode="regular" unitLabel={team ? '팀' : '조'} unitCount={team ? setupView.teamCount : setupView.groupCount} canWrite={canWrite} onAssign={assign} />
      <Board assignments={assignments} unitLabel={team ? '팀' : '조'} clusterOf={(unit) => team ? setupView.groupClusters[setupView.teamGroups[unit] || 1] || 1 : setupView.groupToCluster[unit] || 1} />
    </div>
  )
}
