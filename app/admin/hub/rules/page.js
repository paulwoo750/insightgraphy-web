'use client'
// 운영 규정: 벌금 계산 기준 (pr_config.penalty_rules). 벌금 상세 관리의 자동 스캔이 이 값을 쓴다.
import { useCallback, useEffect, useId, useState } from 'react'
import { Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchCurrentSemester, parseJson, sameJson } from '@/lib/semester'
import { useAdminRole } from '@/app/admin/_components/AdminShell'
import {
  AdminPage,
  Button,
  ErrorState,
  Field,
  inputClass,
  LoadingState,
  PageHeader,
  Panel,
  ReadOnlyBanner,
  SaveStatus,
  StatusBadge,
  useAsyncAction,
  useToast,
  useUnsavedChanges,
} from '@/app/admin/_components/AdminUI'

const DEFAULTS = {
  absenceLate: 20000,
  sessionLatePerMin: 200,
  sessionLatePer10Min: 2000,
  sessionLateMax: 12000,
  sessionLeaveUnder1h: 8000,
  sessionLeaveOver1h: 15000,
  proposalInitial: 1000,
  proposalHourly: 500,
  proposalMax: 3000,
  proposalMiss: 10000,
  proposalFake: 20000,
  slideInitial: 1000,
  slideHourly: 500,
  slideMax: 3000,
  slideMiss: 10000,
  slideFake: 20000,
  fbInitial: 1000,
  fbPer10Min: 300,
  fbMiss: 3000,
  fbFake: 6000,
}

const GROUPS = [
  { title: '사유서', description: '사전 공지 기한을 지키지 않으면 무단결석으로 처리되고 아래 벌금이 부과됩니다.', fields: [['absenceLate', '사유서 기한 미준수 · 불허']] },
  { title: '세션 지각', description: '세션 시작 후 20분까지는 1분 단위, 이후 10분 단위로 부과합니다.', fields: [['sessionLatePerMin', '20분 이내 (1분당)'], ['sessionLatePer10Min', '20분 이후 (10분당)'], ['sessionLateMax', '최대 (이후 무단결석)']] },
  { title: '세션 조퇴', fields: [['sessionLeaveUnder1h', '1시간 이하 조퇴'], ['sessionLeaveOver1h', '1시간 초과 조퇴']] },
  { title: '기획서 제출', fields: [['proposalInitial', '최초 지각'], ['proposalHourly', '1시간당'], ['proposalMax', '최대'], ['proposalMiss', '미제출'], ['proposalFake', '허위 보고']] },
  { title: '슬라이드·영상 제출', description: '발표영상과 평일세션 자료에도 같은 기준을 씁니다.', fields: [['slideInitial', '최초 지각'], ['slideHourly', '1시간당'], ['slideMax', '최대'], ['slideMiss', '미제출'], ['slideFake', '허위 보고']] },
  { title: '피드백 제출', description: '기획서 피드백, 영상 조원 평가·셀프 평가, 평일세션 정성 피드백에 공통 적용합니다.', fields: [['fbInitial', '최초 지각'], ['fbPer10Min', '10분당'], ['fbMiss', '미제출 (1시간 이상)'], ['fbFake', '허위 보고']] },
]

function migrate(parsed) {
  const value = { ...DEFAULTS, ...parsed }
  if (parsed.planInitial !== undefined) {
    // 예전 키(plan*)를 기획서(proposal*)로 옮긴다
    for (const suffix of ['Initial', 'Hourly', 'Max', 'Miss', 'Fake']) {
      value[`proposal${suffix}`] = parsed[`plan${suffix}`]
      delete value[`plan${suffix}`]
    }
  }
  return value
}

export default function RulesAdmin() {
  const { role, canWrite } = useAdminRole()
  const toast = useToast()
  const [run, saving] = useAsyncAction()
  const [state, setState] = useState({ status: 'loading', error: '' })
  const [semester, setSemester] = useState(null)
  const [penalties, setPenalties] = useState(DEFAULTS)
  const [base, setBase] = useState(DEFAULTS)

  const load = useCallback(async () => {
    setState({ status: 'loading', error: '' })
    try {
      const current = await fetchCurrentSemester()
      const value = migrate(parseJson(current.config.penalty_rules, {}))
      setSemester(current)
      setPenalties(value)
      setBase(value)
      setState({ status: 'ready', error: '' })
    } catch (error) {
      setState({ status: 'error', error: error.message })
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])

  const dirty = !sameJson(penalties, base)
  useUnsavedChanges(dirty)

  async function save() {
    if (!canWrite || !dirty) return
    await run(async () => {
      const { error } = await supabase.from('pr_config').upsert({ key: 'penalty_rules', value: JSON.stringify(penalties) })
      if (error) {
        toast.error(`규정을 저장하지 못했습니다: ${error.message}`)
        return
      }
      setBase(penalties)
      toast.success('벌금 규정을 저장했습니다. 다음 벌금 스캔부터 적용됩니다 (이미 납부된 벌금은 바뀌지 않습니다).')
    })
  }

  if (state.status === 'loading') return <AdminPage><LoadingState /></AdminPage>
  if (state.status === 'error') return <AdminPage><ErrorState title="규정을 불러오지 못했습니다." description={state.error} onRetry={load} /></AdminPage>

  return (
    <AdminPage>
      <PageHeader
        eyebrow="정책 및 시스템"
        title="운영 규정"
        description="과제·피드백·세션 벌금 계산 기준입니다. 벌금 상세 관리의 자동 스캔이 이 값을 씁니다."
        meta={<StatusBadge tone="teal">{semester?.name} · {semester?.totalWeeks}주</StatusBadge>}
        actions={<><SaveStatus state={saving ? 'saving' : dirty ? 'dirty' : 'clean'} dirtyCount={dirty ? 1 : 0} /><Button variant="primary" icon={Save} onClick={save} loading={saving} disabled={!canWrite || !dirty}>저장</Button></>}
      />
      <ReadOnlyBanner role={role} />
      <div className="grid gap-5 xl:grid-cols-2">
        {GROUPS.map((group) => (
          <Panel key={group.title} title={group.title} description={group.description}>
            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
              {group.fields.map(([key, label]) => (
                <AmountField key={key} label={label} value={penalties[key]} changed={penalties[key] !== base[key]} disabled={!canWrite} onChange={(value) => setPenalties((current) => ({ ...current, [key]: value }))} />
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </AdminPage>
  )
}

function AmountField({ label, value, onChange, disabled, changed }) {
  const id = useId()
  return (
    <Field label={label} htmlFor={id}>
      <div className="flex items-center gap-2">
        <input
          id={id}
          inputMode="numeric"
          value={value ? Number(value).toLocaleString() : ''}
          onChange={(event) => onChange(Number(event.target.value.replace(/[^0-9]/g, '')) || 0)}
          placeholder="0"
          disabled={disabled}
          className={`${inputClass} text-right ${changed ? 'border-amber-400 bg-amber-50/40' : ''}`}
        />
        <span className="text-sm font-semibold text-slate-500">원</span>
      </div>
    </Field>
  )
}
