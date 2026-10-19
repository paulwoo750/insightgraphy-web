'use client'
// 주차별 자료실(기획서·슬라이드·영상) 공통 부품
// - 주차·세션 문맥: 주소(?week=&session=)로 열고 바꾸며, 다른 자료실 메뉴로 이어진다
// - 제출 목록: 조별로 묶고 실제 미리보기(썸네일)를 보여 준다. 수정·삭제는 본인 제출물(또는 관리자)만
import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { formatKst, groupSubmissionsByTeam, weekFromParam } from '@/lib/semester'
import { canWrite } from '@/lib/permissions'
import { rememberWeekContext } from '@/app/components/MemberShell'
import FileThumbnail from '@/app/components/FileThumbnail'
import { Button, Field, inputClass, Modal, SegmentedControl, StatusBadge } from '@/app/components/ui'

export function useWeekSelection({ ready, totalWeeks, defaultWeek, allowWeekday }) {
  const [selection, setSelection] = useState({ week: null, session: 'regular' })

  useEffect(() => {
    if (!ready) return undefined
    const timer = setTimeout(() => {
      const params = new URLSearchParams(window.location.search)
      const week = weekFromParam(params.get('week'), totalWeeks, defaultWeek)
      const session = allowWeekday && params.get('session') === 'weekday' ? 'weekday' : 'regular'
      setSelection({ week, session })
      rememberWeekContext(week, session)
    }, 0)
    return () => clearTimeout(timer)
  }, [ready, totalWeeks, defaultWeek, allowWeekday])

  const update = useCallback((patch) => {
    setSelection((current) => {
      const next = { ...current, ...patch }
      const params = new URLSearchParams(window.location.search)
      params.set('week', String(next.week))
      if (next.session === 'weekday') params.set('session', 'weekday')
      else params.delete('session')
      window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params.toString()}`)
      rememberWeekContext(next.week, next.session)
      return next
    })
  }, [])

  return { ...selection, setWeek: (week) => update({ week }), setSession: (session) => update({ session }) }
}

// 본인 제출물인지 (학회원 ID → 이름 → 팀 이름 순)
export function isOwnFile(file, { member, name, team }) {
  if (member && file.uploader_member_id) return file.uploader_member_id === member.id
  return file.uploader === name || (team != null && (file.uploader === `Team ${team}` || file.uploader === `Team #${team}`))
}

export function WeekSelector({ weeks, week, onChange, session, onSession, allowWeekday, weekTopics }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto" role="group" aria-label="주차 선택">
        {weeks.map((value) => {
          const topic = session === 'weekday' ? weekTopics?.[`weekday_${value}`] : weekTopics?.[value]
          return (
            <button key={value} type="button" aria-pressed={value === week} title={topic || undefined} onClick={() => onChange(value)} className={`min-h-9 shrink-0 rounded-md border px-3 text-sm font-bold ${value === week ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 text-slate-600 hover:border-teal-400'}`}>
              W{value}
            </button>
          )
        })}
      </div>
      {allowWeekday && (
        <SegmentedControl label="세션 종류" size="sm" value={session} onChange={onSession} options={[{ value: 'regular', label: '정규 세션' }, { value: 'weekday', label: '평일 세션' }]} />
      )}
    </div>
  )
}

export function SubmissionList({ files, weeklySetup, week, session, owner, admin, onEdit, onDelete, onOpen, emptyText = '이 주차에 제출된 자료가 없습니다.', aspect = 'video' }) {
  const { groups, maxGroup } = groupSubmissionsByTeam(files, weeklySetup, week, session)
  const adminCanManage = canWrite(admin?.role)
  const sections = []
  for (let group = 1; group <= maxGroup; group++) sections.push({ key: group, title: `${group}조`, list: groups[group] })
  if (groups['미분류']?.length) sections.push({ key: 'none', title: maxGroup === 0 ? '제출 목록' : '조 미편성 · 개별 제출', list: groups['미분류'] })

  if (files.length === 0) return <p className="rounded-lg border border-dashed border-slate-300 px-4 py-12 text-center text-sm text-slate-500">{emptyText}</p>

  return (
    <div className="space-y-8">
      {sections.filter((section) => section.list.length > 0).map((section) => (
        <section key={section.key} aria-labelledby={`group-${section.key}`}>
          <div className="mb-3 flex items-end justify-between border-b border-slate-200 pb-2">
            <h3 id={`group-${section.key}`} className="text-base font-bold text-slate-900">{section.title}</h3>
            <span className="text-xs font-semibold text-slate-500">{section.list.length}건</span>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {section.list.map((file) => {
              const mine = isOwnFile(file, owner)
              const manage = mine || adminCanManage
              return (
                <li key={file.id} className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
                  <FileThumbnail url={file.file_url} storagePath={file.storage_path} title={file.file_name} aspect={aspect} />
                  <div className="mt-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900" title={file.file_name}>{file.file_name}</p>
                      <p className="text-xs text-slate-500">{file.uploader}{mine ? ' · 내 제출' : ''} · {formatKst(file.created_at)}</p>
                    </div>
                    {file.is_late && <StatusBadge tone="red">지각</StatusBadge>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {onOpen ? <Button size="sm" variant="primary" onClick={() => onOpen(file)}>열기·피드백</Button> : <Button size="sm" href={file.file_url} target="_blank" icon={ExternalLink}>원본 열기</Button>}
                    {manage && onEdit && <Button size="sm" icon={Pencil} onClick={() => onEdit(file)}>이름 수정</Button>}
                    {manage && onDelete && <Button size="sm" variant="danger" icon={Trash2} onClick={() => onDelete(file)}>삭제</Button>}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

export function RenameDialog({ file, onClose, onSave, saving }) {
  const [value, setValue] = useState(file.file_name || '')
  return (
    <Modal title="파일 이름 수정" onClose={onClose} size="sm" footer={<><Button onClick={onClose}>취소</Button><Button variant="primary" onClick={() => onSave(value.trim())} loading={saving} disabled={!value.trim() || value.trim() === file.file_name}>저장</Button></>}>
      <div className="p-5">
        <Field label="파일 이름" htmlFor="rename-file"><input id="rename-file" value={value} onChange={(event) => setValue(event.target.value)} className={inputClass} /></Field>
      </div>
    </Modal>
  )
}
