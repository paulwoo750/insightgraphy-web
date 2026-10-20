'use client'
import { useMemo, useState } from 'react'
import { ExternalLink, Trash2 } from 'lucide-react'
import ArchiveModal from './ArchiveModal'
import FileThumbnail from '@/app/components/FileThumbnail'
import { Button, IconButton } from '@/app/components/ui'
import { formatKst, sortSemestersDesc } from '@/lib/semester'
import {
  FILE_CATEGORIES,
  REGULAR_FILE_CATEGORIES,
  WEEKDAY_FILE_CATEGORIES,
  fileCategoryLabel,
  findSnapshot,
  normalizeFileCategory,
  parseSnapshot,
  topicFromFileName,
} from '@/lib/archive'

const EMPTY_NAV = { semester: null, week: null, category: null }

// 지난 학기 자료실. 주차 주제는 반드시 "그 학기"의 기록에서만 찾는다.
// (현재 학기 week_topics로 대체하면 과거 주차에 이번 학기 주제가 붙는다)
export default function PastArchive({ currentCode, files, semesters, weekRows, archiveRows, absenceRows, canManage, onDeleteFile }) {
  const [nav, setNav] = useState(EMPTY_NAV)
  const [timelineView, setTimelineView] = useState(null)
  const [absenceView, setAbsenceView] = useState(null)

  const semesterIdByCode = useMemo(() => Object.fromEntries(semesters.map((row) => [row.code, row.id])), [semesters])
  const semesterNameByCode = useMemo(() => Object.fromEntries(semesters.map((row) => [row.code, row.name || row.code])), [semesters])

  const pastSemesters = useMemo(() => {
    const codeById = Object.fromEntries(semesters.map((row) => [row.id, row.code]))
    const codes = new Set(files.map((file) => file.semester).filter(Boolean))
    archiveRows.forEach((row) => { if (['timeline', 'absence', 'topics'].includes(row.category) && row.file_type) codes.add(row.file_type) })
    absenceRows.forEach((row) => { if (codeById[row.semester_id]) codes.add(codeById[row.semester_id]) })
    codes.delete(currentCode)
    return sortSemestersDesc([...codes])
  }, [files, archiveRows, absenceRows, semesters, currentCode])

  const semesterFiles = useMemo(() => files.filter((file) => file.semester === nav.semester), [files, nav.semester])
  const weeks = useMemo(() => [...new Set(semesterFiles.map((file) => file.week))].filter((week) => week != null).sort((a, b) => a - b), [semesterFiles])

  const topics = useMemo(() => {
    const regular = {}
    const weekday = {}
    if (!nav.semester) return { regular, weekday }

    // 근거가 약한 것부터 채우고 강한 것으로 덮어쓴다: 파일명 → 학기 스냅샷 → semester_weeks
    semesterFiles.forEach((file) => {
      const topic = topicFromFileName(file.file_name)
      if (!topic) return
      const target = WEEKDAY_FILE_CATEGORIES.includes(file.file_category) ? weekday : regular
      target[file.week] ??= topic
    })
    const snapshot = parseSnapshot(findSnapshot(archiveRows, 'topics', nav.semester), {})
    Object.entries(snapshot || {}).forEach(([key, topic]) => {
      if (!topic) return
      if (key.startsWith('weekday_')) weekday[key.slice('weekday_'.length)] = topic
      else regular[key] = topic
    })
    const semesterId = semesterIdByCode[nav.semester]
    weekRows.filter((row) => row.semester_id === semesterId).forEach((row) => {
      if (row.topic) regular[row.week_no] = row.topic
      if (row.weekday_topic) weekday[row.week_no] = row.weekday_topic
    })
    return { regular, weekday }
  }, [nav.semester, semesterFiles, archiveRows, weekRows, semesterIdByCode])

  const topicFor = (week) => topics.regular[week] || (week === 0 ? 'OT 및 자유 주제' : '자유 주제')
  const weekdayTopicFor = (week) => topics.weekday[week] || null

  const weekFiles = nav.week != null ? semesterFiles.filter((file) => file.week === nav.week) : []
  const weekdayCategories = WEEKDAY_FILE_CATEGORIES.filter((category) => weekFiles.some((file) => file.file_category === category))
  const categoryFiles = nav.category ? weekFiles.filter((file) => normalizeFileCategory(file.file_category) === nav.category) : []

  const timelineSnapshot = nav.semester ? findSnapshot(archiveRows, 'timeline', nav.semester) : null
  const absenceSnapshot = nav.semester ? findSnapshot(archiveRows, 'absence', nav.semester) : null
  const liveAbsences = nav.semester ? absenceRows.filter((row) => row.semester_id && row.semester_id === semesterIdByCode[nav.semester]) : []
  const hasAbsences = Boolean(absenceSnapshot) || liveAbsences.length > 0

  // 예전 마감 방식은 사유서를 스냅샷으로 옮겼고, 지금은 학기 ID로 원본이 보존된다
  const openAbsences = () => setAbsenceView(absenceSnapshot ? parseSnapshot(absenceSnapshot) : liveAbsences)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 text-sm font-bold text-slate-400 border-b border-slate-200 pb-4">
        <button onClick={() => setNav(EMPTY_NAV)} className="hover:text-teal-800">학기 선택</button>
        {nav.semester && <><span className="opacity-40">/</span><button onClick={() => setNav({ ...nav, week: null, category: null })} className="hover:text-teal-800">{semesterNameByCode[nav.semester] || nav.semester}</button></>}
        {nav.week != null && <><span className="opacity-40">/</span><button onClick={() => setNav({ ...nav, category: null })} className="hover:text-teal-800">{nav.week}주차</button></>}
        {nav.category && <><span className="opacity-40">/</span><span className="text-teal-800">{FILE_CATEGORIES[nav.category]?.session === 'weekday' ? '🏖️ ' : ''}{fileCategoryLabel(nav.category)}</span></>}
      </div>

      {!nav.semester && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {pastSemesters.length === 0 ? <p className="col-span-full text-slate-400 font-medium py-10 text-center">보관된 학기가 없습니다.</p> : pastSemesters.map((code) => (
            <button key={code} onClick={() => setNav({ ...EMPTY_NAV, semester: code })} className="rounded-xl bg-teal-50/60 hover:bg-teal-100/70 p-6 font-extrabold text-lg text-slate-700 hover:text-teal-800 transition-all hover:-translate-y-0.5 flex flex-col items-center gap-2">
              <span className="text-3xl">📁</span>{semesterNameByCode[code] || code} 학기
            </button>
          ))}
        </div>
      )}

      {nav.semester && nav.week == null && (timelineSnapshot || hasAbsences) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {timelineSnapshot && <SnapshotButton icon="📅" label="타임라인 열람" onClick={() => setTimelineView(parseSnapshot(timelineSnapshot))} />}
          {hasAbsences && <SnapshotButton icon="📝" label="사유서 열람" onClick={openAbsences} />}
        </div>
      )}

      {nav.semester && nav.week == null && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {weeks.length === 0 && <p className="col-span-full text-slate-400 font-medium py-10 text-center">보관된 제출 자료가 없습니다.</p>}
          {weeks.map((week) => (
            <button key={week} onClick={() => setNav({ ...nav, week })} className="rounded-xl bg-teal-50/50 hover:bg-teal-100/70 p-5 text-left transition-all group flex justify-between items-center">
              <div>
                <span className="rounded-md text-xs font-black bg-teal-700 text-white px-2 py-0.5 uppercase">Week {week}</span>
                <p className="text-base font-extrabold text-slate-800 mt-2">📚 {topicFor(week)}</p>
                {weekdayTopicFor(week) && <p className="text-sm font-bold text-teal-700 mt-1">🏖️ {weekdayTopicFor(week)}</p>}
              </div>
              <span className="text-teal-500 font-black text-sm">→</span>
            </button>
          ))}
        </div>
      )}

      {nav.semester && nav.week != null && !nav.category && (
        <div className="space-y-5">
          <CategoryGroup label={`📚 정규세션 · ${topicFor(nav.week)}`} categories={REGULAR_FILE_CATEGORIES} onSelect={(category) => setNav({ ...nav, category })} />
          {weekdayCategories.length > 0 && (
            <CategoryGroup weekday label={`🏖️ 평일세션${weekdayTopicFor(nav.week) ? ` · ${weekdayTopicFor(nav.week)}` : ''}`} categories={weekdayCategories} onSelect={(category) => setNav({ ...nav, category })} />
          )}
        </div>
      )}

      {nav.category && (
        categoryFiles.length === 0 ? <p className="py-12 text-center text-sm text-slate-500">등록된 자료가 없습니다.</p> : (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {categoryFiles.map((file) => (
              <PastCard key={file.id} file={file} manage={canManage(file)} onDelete={() => onDeleteFile(file)} />
            ))}
          </ul>
        )
      )}

      {timelineView && (
        <ArchiveModal icon="📅" title="지난 학기 타임라인" onClose={() => setTimelineView(null)}>
          {timelineView.length === 0 ? <p className="text-slate-400 font-medium text-center py-12">보관된 일정이 없습니다.</p> : (
            <div className="border-t border-slate-200">
              {timelineView.map((event, index) => (
                <div key={index} className="flex items-start gap-4 py-3 border-b border-slate-100">
                  <span className="shrink-0 text-xs font-black bg-teal-800 text-white px-2 py-0.5 mt-0.5 w-14 text-center">{event.type === 'regular' ? `W${event.week || '?'}` : event.type === 'special' ? '특별' : '기타'}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-bold ${event.is_break ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{event.title}</p>
                    {event.description && <p className="text-xs text-slate-400 font-medium mt-0.5">{event.description}</p>}
                  </div>
                  <span className="shrink-0 text-xs font-bold text-slate-400">{event.date_display}</span>
                </div>
              ))}
            </div>
          )}
        </ArchiveModal>
      )}

      {absenceView && (
        <ArchiveModal icon="📝" title="지난 학기 사유서" onClose={() => setAbsenceView(null)}>
          {absenceView.length === 0 ? <p className="text-slate-400 font-medium text-center py-12">보관된 사유서가 없습니다.</p> : (
            <div className="border-t border-slate-200">
              {absenceView.map((absence, index) => (
                <div key={absence.id || index} className="py-3 border-b border-slate-100">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="shrink-0 text-xs font-black bg-teal-800 text-white px-2 py-0.5 uppercase">W{absence.week ?? '?'}</span>
                    {absence.session_type === 'weekday' && <span className="shrink-0 text-xs font-black bg-teal-100 text-teal-800 px-2 py-0.5 uppercase">평일</span>}
                    <span className="shrink-0 text-xs font-black bg-slate-800 text-white px-2 py-0.5 uppercase">{absence.type}</span>
                    <span className="text-sm font-bold text-slate-800">{absence.user_name}</span>
                    <span className="text-xs font-medium text-slate-400">{absence.target_date}</span>
                    {absence.status && absence.status !== '대기' && <span className="text-xs font-bold text-teal-700">· {absence.status}</span>}
                  </div>
                  <p className="text-xs text-slate-500 font-medium whitespace-pre-wrap">{absence.reason}</p>
                </div>
              ))}
            </div>
          )}
        </ArchiveModal>
      )}
    </div>
  )
}

function SnapshotButton({ icon, label, onClick }) {
  return (
    <button onClick={onClick} className="rounded-xl bg-teal-50 hover:bg-teal-100 p-5 flex items-center justify-between transition-colors group">
      <span className="flex items-center gap-3 font-extrabold text-teal-800"><span className="text-2xl">{icon}</span> {label}</span>
      <span className="text-teal-500 font-black text-sm group-hover:translate-x-1 transition-transform">보기 →</span>
    </button>
  )
}

function CategoryGroup({ label, categories, onSelect, weekday = false }) {
  return (
    <div>
      <p className={`text-xs font-black uppercase tracking-widest mb-2 ${weekday ? 'text-teal-700' : 'text-slate-400'}`}>{label}</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {categories.map((category) => (
          <button key={category} onClick={() => onSelect(category)} className={`rounded-xl p-8 font-extrabold text-lg transition-all hover:-translate-y-0.5 flex flex-col items-center gap-3 ${weekday ? 'bg-teal-50 text-teal-800 hover:bg-teal-100/70' : 'bg-indigo-50/60 text-slate-700 hover:bg-indigo-100/60 hover:text-indigo-800'}`}>
            <span className="text-3xl">{weekday ? '🏖️' : ''}{FILE_CATEGORIES[category].icon}</span>{fileCategoryLabel(category)}
          </button>
        ))}
      </div>
    </div>
  )
}

function PastCard({ file, manage, onDelete }) {
  return (
    <li className="flex min-w-0 flex-col transition hover:-translate-y-0.5">
      <FileThumbnail url={file.file_url} storagePath={file.storage_path} title={file.file_name} />
      <div className="mt-2 min-w-0">
        <p className="truncate text-sm font-bold text-slate-900" title={file.file_name}>{file.file_name}</p>
        <p className="text-xs text-slate-500">{fileCategoryLabel(file.file_category, { short: true })} · {file.uploader || '제출자 미상'}{file.created_at ? ` · ${formatKst(file.created_at, { year: true })}` : ''}</p>
      </div>
      <div className="mt-2 flex items-center gap-1">
        <Button size="sm" className="flex-1" href={file.file_url} target="_blank" icon={ExternalLink}>원본</Button>
        {manage && <IconButton size="sm" icon={Trash2} label="삭제" onClick={onDelete} className="text-red-600 hover:bg-red-50" />}
      </div>
    </li>
  )
}
