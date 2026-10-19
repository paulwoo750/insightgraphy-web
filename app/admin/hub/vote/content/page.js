'use client'
// 평가표(채점 기준) 편집: 버전 → 카테고리 → 평가 항목 → 점수별 기준
// 이미 발표에 쓰인 버전은 지난 평가 결과 보존을 위해 삭제할 수 없다.
import { useCallback, useEffect, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { sameJson } from '@/lib/semester'
import { useAdminRole } from '@/app/admin/_components/AdminShell'
import {
  AdminPage,
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  inputClass,
  LoadingState,
  PageHeader,
  Panel,
  ReadOnlyBanner,
  SaveStatus,
  Tabs,
  textareaClass,
  useAsyncAction,
  useToast,
  useUnsavedChanges,
} from '@/app/admin/_components/AdminUI'

const COLORS = {
  blue: { label: '파랑', chip: 'bg-blue-50 text-blue-700', dot: 'bg-blue-500', border: 'border-blue-200' },
  purple: { label: '보라', chip: 'bg-purple-50 text-purple-700', dot: 'bg-purple-500', border: 'border-purple-200' },
  pink: { label: '분홍', chip: 'bg-pink-50 text-pink-700', dot: 'bg-pink-500', border: 'border-pink-200' },
  emerald: { label: '초록', chip: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-200' },
  amber: { label: '주황', chip: 'bg-amber-50 text-amber-800', dot: 'bg-amber-500', border: 'border-amber-200' },
}

function migrateLegacyData(legacy) {
  if (!legacy || Array.isArray(legacy)) return legacy || []
  const buckets = { i: [], g: [], d: [], c: [] }
  Object.keys(legacy).forEach((key) => {
    const item = { id: key, label: legacy[key].label, criteria: legacy[key].criteria }
    const bucket = key.startsWith('i') ? 'i' : key.startsWith('g') ? 'g' : key.startsWith('d') ? 'd' : 'c'
    buckets[bucket].push(item)
  })
  const meta = { i: ['인사이트', '💡', 'blue'], g: ['그래픽', '🎨', 'purple'], d: ['딜리버리', '🎤', 'pink'], c: ['상호보완성', '🔗', 'emerald'] }
  return Object.entries(buckets).filter(([, items]) => items.length).map(([key, items]) => ({ id: `cat_${key}`, title: meta[key][0], icon: meta[key][1], color: meta[key][2], items }))
}

let counter = 0
const newId = (prefix) => `${prefix}_${Date.now()}_${counter++}`

export default function VoteContentManager() {
  const { role, canWrite } = useAdminRole()
  const toast = useToast()
  const [run, saving] = useAsyncAction()
  const [state, setState] = useState({ status: 'loading', error: '' })
  const [rubrics, setRubrics] = useState({})
  const [base, setBase] = useState({})
  const [usedVersions, setUsedVersions] = useState(new Set())
  const [active, setActive] = useState('')
  const [newVersion, setNewVersion] = useState('')
  const [deleted, setDeleted] = useState([])

  const load = useCallback(async () => {
    setState({ status: 'loading', error: '' })
    const [criteriaResult, usedResult] = await Promise.all([
      supabase.from('pr_vote_criteria').select('*'),
      supabase.from('presentations').select('eval_version'),
    ])
    if (criteriaResult.error) {
      setState({ status: 'error', error: criteriaResult.error.message })
      return
    }
    const loaded = Object.fromEntries((criteriaResult.data || []).map((row) => [row.version, migrateLegacyData(row.criteria_data)]))
    const data = Object.keys(loaded).length ? loaded : { v1: [] }
    setRubrics(data)
    setBase(data)
    setUsedVersions(new Set((usedResult.data || []).map((row) => row.eval_version).filter(Boolean)))
    setActive((current) => current && data[current] ? current : Object.keys(data)[0])
    setDeleted([])
    setState({ status: 'ready', error: '' })
  }, [])

  useEffect(() => {
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])

  const dirty = !sameJson(rubrics, base) || deleted.length > 0
  useUnsavedChanges(dirty)

  function update(updater) {
    setRubrics((current) => {
      const copy = JSON.parse(JSON.stringify(current[active] || []))
      updater(copy)
      return { ...current, [active]: copy }
    })
  }

  function addVersion(event) {
    event.preventDefault()
    const name = newVersion.trim()
    if (!name) return
    if (rubrics[name]) {
      toast.error('이미 있는 버전 이름입니다.')
      return
    }
    setRubrics((current) => ({ ...current, [name]: JSON.parse(JSON.stringify(current[active] || [])) }))
    setActive(name)
    setNewVersion('')
    toast.info(`${active} 내용을 복사해 ${name} 버전을 만들었습니다. 저장해야 반영됩니다.`)
  }

  function removeVersion(version) {
    if (usedVersions.has(version)) {
      toast.error(`${version} 버전은 이미 발표 평가에 쓰여 지울 수 없습니다. 지난 평가 결과를 보존하기 위해서입니다.`)
      return
    }
    if (!confirm(`${version} 버전을 지울까요? 저장해야 반영됩니다.`)) return
    setRubrics((current) => {
      const next = { ...current }
      delete next[version]
      return next
    })
    if (base[version]) setDeleted((list) => [...list, version])
    setActive(Object.keys(rubrics).find((key) => key !== version) || '')
  }

  async function save() {
    if (!canWrite || !dirty) return
    await run(async () => {
      const failures = []
      for (const [version, data] of Object.entries(rubrics)) {
        if (sameJson(data, base[version])) continue
        const { error } = await supabase.from('pr_vote_criteria').upsert({ version, criteria_data: data })
        if (error) failures.push(`${version}: ${error.message}`)
      }
      for (const version of deleted) {
        const { error } = await supabase.from('pr_vote_criteria').delete().eq('version', version)
        if (error) failures.push(`${version} 삭제: ${error.message}`)
      }
      if (failures.length) {
        toast.error(failures.join(' / '), { title: '일부만 저장되었습니다', duration: 0 })
        return
      }
      toast.success('평가표를 저장했습니다. 다음 발표 셋업부터 바뀐 기준이 보입니다.')
      await load()
    })
  }

  if (state.status === 'loading') return <AdminPage><LoadingState /></AdminPage>
  if (state.status === 'error') return <AdminPage><ErrorState title="평가표를 불러오지 못했습니다." description={state.error} onRetry={load} /></AdminPage>

  const categories = rubrics[active] || []

  return (
    <AdminPage>
      <PageHeader
        eyebrow="학회원 시스템 · 투표 및 평가"
        title="평가표"
        description="학회원 채점 화면에 보이는 카테고리·평가 항목·점수별 기준을 버전별로 편집합니다."
        actions={<><SaveStatus state={saving ? 'saving' : dirty ? 'dirty' : 'clean'} dirtyCount={dirty ? 1 : 0} /><Button variant="primary" icon={Save} onClick={save} loading={saving} disabled={!canWrite || !dirty}>저장</Button></>}
      />
      <ReadOnlyBanner role={role} />

      <Panel className="mb-5">
        <div className="flex flex-wrap items-center gap-3 px-3">
          <Tabs tabs={Object.keys(rubrics).map((version) => ({ key: version, label: `${version}${usedVersions.has(version) ? ' · 사용 중' : ''}` }))} value={active} onChange={setActive} label="평가표 버전" className="border-b-0" />
          <form onSubmit={addVersion} className="ml-auto flex items-center gap-2 py-2">
            <input aria-label="새 버전 이름" value={newVersion} onChange={(event) => setNewVersion(event.target.value)} placeholder="새 버전 이름 (예: v3)" disabled={!canWrite} className={`${inputClass} h-9 w-44`} />
            <Button type="submit" size="sm" icon={Plus} disabled={!canWrite || !newVersion.trim()}>복사해서 추가</Button>
            {active && <Button size="sm" variant="danger" icon={Trash2} onClick={() => removeVersion(active)} disabled={!canWrite}>이 버전 삭제</Button>}
          </form>
        </div>
      </Panel>

      {categories.length === 0 ? <Panel><EmptyState title="카테고리가 없습니다." action={<Button icon={Plus} disabled={!canWrite} onClick={() => update((data) => data.push({ id: newId('cat'), title: '새 카테고리', icon: '📌', color: 'blue', items: [] }))}>카테고리 추가</Button>} /></Panel> : (
        <div className="space-y-5">
          {categories.map((category, categoryIndex) => {
            const color = COLORS[category.color] || COLORS.blue
            return (
              <Panel
                key={category.id}
                title={<span className="flex items-center gap-2"><span aria-hidden="true">{category.icon}</span>{category.title}</span>}
                action={<Button size="sm" variant="danger" icon={Trash2} disabled={!canWrite} onClick={() => { if (confirm(`'${category.title}' 카테고리와 항목을 모두 지울까요?`)) update((data) => data.splice(categoryIndex, 1)) }}>카테고리 삭제</Button>}
              >
                <div className="space-y-4 p-4 sm:p-5">
                  <div className="grid gap-3 sm:grid-cols-[80px_minmax(0,1fr)_auto]">
                    <input aria-label="아이콘" value={category.icon} onChange={(event) => update((data) => { data[categoryIndex].icon = event.target.value })} disabled={!canWrite} className={`${inputClass} text-center text-xl`} />
                    <input aria-label="카테고리 이름" value={category.title} onChange={(event) => update((data) => { data[categoryIndex].title = event.target.value })} disabled={!canWrite} className={inputClass} />
                    <div className="flex items-center gap-1.5" role="radiogroup" aria-label="색상">
                      {Object.entries(COLORS).map(([key, value]) => (
                        <button key={key} type="button" role="radio" aria-checked={category.color === key} aria-label={value.label} disabled={!canWrite} onClick={() => update((data) => { data[categoryIndex].color = key })} className={`h-7 w-7 rounded-full ${value.dot} ${category.color === key ? 'ring-2 ring-slate-900 ring-offset-2' : 'opacity-50 hover:opacity-100'}`} />
                      ))}
                    </div>
                  </div>
                  {category.items.map((item, itemIndex) => (
                    <div key={item.id} className={`space-y-3 rounded-md border bg-slate-50 p-4 ${color.border}`}>
                      <div className="flex items-center gap-2">
                        <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold ${color.chip}`}>항목 {itemIndex + 1}</span>
                        <input aria-label={`항목 ${itemIndex + 1} 이름`} value={item.label} onChange={(event) => update((data) => { data[categoryIndex].items[itemIndex].label = event.target.value })} disabled={!canWrite} className={inputClass} />
                        <IconButton icon={Trash2} label={`항목 ${itemIndex + 1} 삭제`} variant="danger" size="sm" disabled={!canWrite} onClick={() => { if (confirm('이 평가 항목을 지울까요?')) update((data) => data[categoryIndex].items.splice(itemIndex, 1)) }} />
                      </div>
                      <div className="space-y-2">
                        {item.criteria.map((criterion, criterionIndex) => (
                          <div key={criterionIndex} className="flex items-start gap-2">
                            <input aria-label="점수" type="number" value={criterion.s} onChange={(event) => update((data) => { data[categoryIndex].items[itemIndex].criteria[criterionIndex].s = Number(event.target.value); data[categoryIndex].items[itemIndex].criteria.sort((a, b) => b.s - a.s) })} disabled={!canWrite} className={`${inputClass} w-20 text-center`} />
                            <textarea aria-label="점수 기준 설명" rows={2} value={criterion.t} onChange={(event) => update((data) => { data[categoryIndex].items[itemIndex].criteria[criterionIndex].t = event.target.value })} disabled={!canWrite} className={`${textareaClass} min-h-10`} />
                            <IconButton icon={Trash2} label="기준 삭제" size="sm" disabled={!canWrite} onClick={() => update((data) => data[categoryIndex].items[itemIndex].criteria.splice(criterionIndex, 1))} />
                          </div>
                        ))}
                        <Button size="sm" icon={Plus} disabled={!canWrite} onClick={() => update((data) => { data[categoryIndex].items[itemIndex].criteria.push({ s: 0, t: '새 평가 기준' }) })}>점수 기준 추가</Button>
                      </div>
                    </div>
                  ))}
                  <Button icon={Plus} disabled={!canWrite} onClick={() => update((data) => data[categoryIndex].items.push({ id: newId('item'), label: '새 평가 항목', criteria: [{ s: 10, t: '최고 점수 기준' }, { s: 0, t: '최하 점수 기준' }] }))}>평가 항목 추가</Button>
                </div>
              </Panel>
            )
          })}
          <Button variant="dark" icon={Plus} className="w-full" disabled={!canWrite} onClick={() => update((data) => data.push({ id: newId('cat'), title: '새 카테고리', icon: '📌', color: 'blue', items: [] }))}>카테고리 추가</Button>
        </div>
      )}
    </AdminPage>
  )
}
