'use client'
// 학기·주차·정규/평일 선택 줄. 관리자 상단 메뉴(64px) 아래에 붙어 따라온다.
import { useEffect, useRef } from 'react'
import { ExternalLink } from 'lucide-react'
import { HelpTip, SegmentedControl } from '@/app/admin/_components/AdminUI'
import { inputClass } from '@/app/components/ui'

export default function WeekPicker({ semesterList, ctx, week, mode, dirtyWeeks, weekErrors, onSemester, onWeek, onMode, memberLinks, crossHost }) {
  const listRef = useRef(null)
  const weeks = Array.from({ length: ctx.totalWeeks + 1 }, (_, index) => index)

  // 선택한 주차 버튼이 보이도록 가로 스크롤을 맞춘다
  useEffect(() => {
    listRef.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [week])

  return (
    <section data-tour="session-week-picker" className="sticky top-16 z-20 -mx-4 mb-4 border-y border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-md sm:border">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="session-semester" className="text-sm font-bold text-slate-700">학기</label>
          <select id="session-semester" value={ctx.id} onChange={(event) => onSemester(event.target.value)} className={`${inputClass} h-9 w-auto min-w-[150px]`}>
            {semesterList.map((item) => <option key={item.id} value={item.id}>{item.name}{item.status === 'active' ? ' (운영 중)' : ''}</option>)}
          </select>
          {ctx.type === 'vacation' ? (
            <>
              <SegmentedControl
                label="세션 종류"
                size="sm"
                value={mode}
                onChange={onMode}
                options={[{ value: 'regular', label: '정규 세션' }, { value: 'weekday', label: '평일 세션' }]}
              />
              <HelpTip label="정규·평일 세션 설명">
                방학 학기에는 주말 정규 세션과 별도로 평일 세션이 있습니다. 평일 세션은 정규 조와 따로 조를 짜고, 조마다 날짜·장소·마감이 다를 수 있습니다.
              </HelpTip>
            </>
          ) : (
            <span className="text-xs font-semibold text-slate-500">정규 학기 · 정규 세션만 운영</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <span className="text-xs font-semibold text-slate-500">학회원 화면 (저장된 값)</span>
          {memberLinks.map((link) => (
            <a key={link.kind} href={link.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-md border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
              {link.kind === 'proposal' ? '기획서' : link.kind === 'slide' ? '슬라이드' : '영상'}
              <span className="sr-only">{crossHost ? ' (본 사이트 새 탭)' : ' (새 탭)'}</span>
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>
      <div ref={listRef} className="mt-3 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="주차 선택">
        {weeks.map((weekNo) => {
          const selected = weekNo === week
          const weekRow = ctx.weeks[weekNo]
          const cancelled = weekRow?.status === 'cancelled'
          const isDirty = dirtyWeeks.includes(weekNo)
          const failed = Boolean(weekErrors[weekNo])
          const isCurrent = ctx.isActive && weekNo === ctx.currentWeek
          return (
            <button
              key={weekNo}
              type="button"
              aria-pressed={selected}
              aria-label={`${weekNo}주차${isCurrent ? ' (현재 주차)' : ''}${cancelled ? ' (휴강)' : ''}${isDirty ? ' (저장 안 됨)' : ''}`}
              onClick={() => onWeek(weekNo)}
              className={`relative flex min-h-10 min-w-[52px] shrink-0 flex-col items-center justify-center rounded-md border px-2 text-sm font-bold transition-colors ${selected ? 'border-teal-700 bg-teal-700 text-white' : cancelled ? 'border-red-200 bg-red-50 text-red-700 hover:border-red-300' : 'border-slate-200 bg-white text-slate-700 hover:border-teal-400'}`}
            >
              <span>W{weekNo}</span>
              {(isCurrent || cancelled) && <span className={`text-[11px] font-semibold leading-none ${selected ? 'text-teal-100' : cancelled ? 'text-red-600' : 'text-teal-700'}`}>{cancelled ? '휴강' : '현재'}</span>}
              {(isDirty || failed) && <span className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${failed ? 'bg-red-500' : 'bg-amber-500'}`} aria-hidden="true" />}
            </button>
          )
        })}
      </div>
    </section>
  )
}
