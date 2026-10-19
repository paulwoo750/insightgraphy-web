'use client'
// 제출·피드백 마감 탭 (한국 시간)
import { Field, HelpTip, inputClass } from '@/app/components/ui'
import { deadlineLabel, formatKst, fromKstInput } from '@/lib/semester'
import { range, REGULAR_DEADLINES, WEEKDAY_DEADLINES } from '../_lib'
import { DateTimeInput } from './AttendanceTab'

function Group({ title, help, keys, current, changes, canWrite, setDeadline }) {
  return (
    <section className="space-y-3 rounded-md border border-slate-200 p-4">
      <h3 className="flex items-center gap-1 text-sm font-bold text-slate-900">{title}{help && <HelpTip label={`${title} 설명`}>{help}</HelpTip>}</h3>
      {keys.map((key) => (
        <DateTimeInput key={key} id={`deadline-${key}`} label={deadlineLabel(key)} value={current.deadlines[key]} onChange={(value) => setDeadline(key, value)} disabled={!canWrite} changed={changes.includes(`deadline:${key}`)} />
      ))}
    </section>
  )
}

export default function DeadlinesTab({ week, mode, current, changes, canWrite, setDeadline, updateSetup, setupView }) {
  function updateTeam(group, patch) {
    updateSetup((setup) => ({ ...setup, weekday: { ...(setup.weekday || {}), [group]: { ...((setup.weekday || {})[group] || {}), ...patch } } }))
  }

  if (mode === 'weekday') {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <Group title="평일 세션 공통 마감" help="모든 평일 조에 같게 적용됩니다." keys={WEEKDAY_DEADLINES} current={current} changes={changes} canWrite={canWrite} setDeadline={setDeadline} />
        </div>
        {!setupView.weekdaySession ? (
          <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">W{week}은 평일 세션을 진행하지 않도록 설정되어 있습니다.</p>
        ) : (
          <section className="space-y-3">
            <h3 className="flex items-center gap-1 text-sm font-bold text-slate-900">
              조별 제출 마감
              <HelpTip label="조별 마감 설명">비워 두면 발표자료·영상은 그 조 진행일 자정, 정성 피드백은 다음 날 자정으로 자동 계산됩니다.</HelpTip>
            </h3>
            <div className="grid gap-4 xl:grid-cols-2">
              {range(setupView.weekdayGroupCount).map((group) => {
                const team = setupView.weekday?.[group] || {}
                const auto = team.date ? `${team.date}T23:59` : ''
                return (
                  <div key={group} className="space-y-3 rounded-md border border-slate-200 p-4">
                    <h4 className="text-sm font-bold text-teal-800">평일 {group}조 {team.date ? `· 진행 ${team.date}` : '· 진행 날짜 미정'}</h4>
                    {[
                      { key: 'slideDl', label: '발표자료 마감', fallback: auto },
                      { key: 'videoDl', label: '발표영상 마감', fallback: auto },
                      { key: 'fbDl', label: '정성 피드백 마감', fallback: team.date ? '진행 다음 날 23:59' : '' },
                    ].map((item) => (
                      <Field key={item.key} label={item.label} htmlFor={`team-${group}-${item.key}`} hint={team[item.key] ? `한국 시간 ${formatKst(fromKstInput(team[item.key]))}` : item.fallback ? `비우면 자동: ${item.fallback.replace('T', ' ')}` : '진행 날짜를 먼저 정하세요.'}>
                        <input id={`team-${group}-${item.key}`} type="datetime-local" value={team[item.key] || ''} onChange={(event) => updateTeam(group, { [item.key]: event.target.value })} disabled={!canWrite} className={inputClass} />
                      </Field>
                    ))}
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Group title="자료 제출" help="마감 이후 제출은 지각으로 표시되고 벌금 기준에 따라 처리됩니다." keys={REGULAR_DEADLINES.submission} current={current} changes={changes} canWrite={canWrite} setDeadline={setDeadline} />
      <Group title="피드백 작성" keys={REGULAR_DEADLINES.feedback} current={current} changes={changes} canWrite={canWrite} setDeadline={setDeadline} />
      <Group title="사유서" help="이 주차 결석·지각 사유서를 받는 마감입니다. 사유서 화면의 마감과 같은 값입니다." keys={REGULAR_DEADLINES.absence} current={current} changes={changes} canWrite={canWrite} setDeadline={setDeadline} />
    </div>
  )
}
