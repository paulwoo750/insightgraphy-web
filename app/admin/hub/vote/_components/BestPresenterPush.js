'use client'
// 베스트 프레젠터 발표 알림: 채점이 끝난 주차를 골라 학회원 휴대폰으로 1위를 알린다 (STEP 25).
// 같은 주차는 한 번만 보낸다. 알림 기기 수와 마지막 발송 상태도 보여 준다.
import { useEffect, useMemo, useState } from 'react'
import { BellRing, Smartphone } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchCurrentSemester } from '@/lib/semester'
import { loadRanking } from '@/lib/memberApp'
import { weekRanking, winnersLine } from '@/lib/ranking'
import { useAdminRole } from '@/app/admin/_components/AdminShell'
import { Button, Panel, useAsyncAction, useToast } from '@/app/admin/_components/AdminUI'

const MISSING_FUNCTION = new Set(['PGRST202', '42883'])

export default function BestPresenterPush() {
  const { canWrite } = useAdminRole()
  const toast = useToast()
  const [run, sending] = useAsyncAction()
  const [data, setData] = useState({ status: 'loading' })
  const [week, setWeek] = useState(null)
  const [pushStatus, setPushStatus] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const semester = await fetchCurrentSemester()
        const ranking = await loadRanking(semester.code)
        const status = await supabase.rpc('admin_push_status')
        if (!active) return
        setData({ status: 'ready', semester, ...ranking })
        setPushStatus(status.error ? { missing: MISSING_FUNCTION.has(status.error.code), error: status.error.message } : status.data)
      } catch (error) {
        if (active) setData({ status: 'error', error: error.message })
      }
    }
    load()
    return () => { active = false }
  }, [])

  const activeWeek = week ?? (data.status === 'ready' ? data.weeks[data.weeks.length - 1] ?? null : null)
  const preview = useMemo(() => {
    if (data.status !== 'ready' || activeWeek == null) return null
    const ranking = weekRanking(data.presentations, data.scoresByPresentation, activeWeek)
    return { ranking, line: winnersLine(ranking) }
  }, [data, activeWeek])

  function send() {
    if (!preview?.line) return
    if (!confirm(`W${activeWeek} 베스트 프레젠터 알림을 학회원 휴대폰으로 보낼까요?\n\n${preview.line}\n\n같은 주차는 한 번만 보내집니다.`)) return
    run(async () => {
      const { data: result, error } = await supabase.rpc('admin_queue_best_presenter_push', { p_week: activeWeek, p_winners: preview.line })
      if (error) {
        toast.error(MISSING_FUNCTION.has(error.code) ? '알림 기능(STEP 25 SQL)이 아직 적용되지 않았습니다.' : `보내지 못했습니다: ${error.message}`)
        return
      }
      if (!result.recipients) toast.info('알림을 켠 학회원이 아직 없습니다.')
      else if (!result.queued) toast.info(`W${activeWeek} 알림은 이미 보냈습니다 (${result.already}명).`)
      else toast.success(`W${activeWeek} 베스트 프레젠터 알림을 ${result.queued}명에게 보냅니다. 5분 안에 도착합니다.`)
    })
  }

  return (
    <Panel title="🏆 베스트 프레젠터 알림" description="채점이 끝난 주차를 골라 학회원 휴대폰 앱으로 1위를 알립니다. 같은 주차는 한 번만 보내집니다." className="mt-8">
      <div className="space-y-4 px-4 pb-5 sm:px-5">
        {pushStatus && !pushStatus.missing && !pushStatus.error && (
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-teal-50/70 px-3 py-2 text-xs font-semibold text-teal-900">
            <span className="inline-flex items-center gap-1"><Smartphone className="h-3.5 w-3.5" aria-hidden="true" />알림 켠 기기 {pushStatus.devices}대 · 학회원 {pushStatus.members_with_devices}명</span>
            <span>최근 24시간 발송 {pushStatus.sent_24h}건{pushStatus.pending ? ` · 대기 ${pushStatus.pending}건` : ''}</span>
            {!pushStatus.configured && <span className="text-amber-700">발송 설정(set_push_config) 전</span>}
            {pushStatus.last_cycle_note && <span className="text-slate-500">마지막 확인: {pushStatus.last_cycle_note}</span>}
          </p>
        )}
        {pushStatus?.missing && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">알림 기능(STEP 25 SQL)을 적용하면 보낼 수 있습니다.</p>}
        {data.status === 'loading' && <p className="text-sm text-slate-400">채점 결과를 불러오는 중…</p>}
        {data.status === 'error' && <p className="text-sm text-red-600">채점 결과를 불러오지 못했습니다: {data.error}</p>}
        {data.status === 'ready' && data.weeks.length === 0 && <p className="text-sm text-slate-500">이번 학기에 채점된 발표가 아직 없습니다.</p>}
        {data.status === 'ready' && data.weeks.length > 0 && (
          <>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="주차 선택">
              {data.weeks.map((value) => (
                <button key={value} type="button" aria-pressed={value === activeWeek} onClick={() => setWeek(value)} className={`min-h-9 rounded-full px-3.5 text-sm font-bold ${value === activeWeek ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-teal-50'}`}>W{value}</button>
              ))}
            </div>
            {preview && (
              <div className="rounded-xl bg-gradient-to-br from-indigo-950 via-violet-900 to-fuchsia-800 px-4 py-3 text-white">
                <p className="text-xs font-bold text-amber-200">알림 미리보기</p>
                <p className="mt-1 font-black">🏆 W{activeWeek} 베스트 프레젠터 발표!</p>
                <p className="text-sm text-white/85">{preview.line}</p>
              </div>
            )}
            <Button variant="primary" icon={BellRing} loading={sending} disabled={!canWrite || !preview?.line} onClick={send}>W{activeWeek} 알림 보내기</Button>
          </>
        )}
      </div>
    </Panel>
  )
}
