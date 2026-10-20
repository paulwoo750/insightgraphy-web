'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, FileText, Pencil, Search, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchCurrentSemester, parseJson, sortSemestersDesc } from '@/lib/semester'
import {
  FILE_CATEGORIES,
  RESOURCE_CATEGORIES,
  SNAPSHOT_CATEGORIES,
  deleteSubmittedFile,
  fileCategoryLabel,
  isResourceRow,
  isSnapshotRow,
  normalizeFileCategory,
} from '@/lib/archive'
import { useAdminRole } from '@/app/admin/_components/AdminShell'
import { AdminPage, EmptyState, PageHeader, Panel, ReadOnlyBanner, StatusBadge } from '@/app/admin/_components/AdminUI'

const RESOURCE_TONES = { edu: 'teal', special: 'blue', template: 'gray' }

export default function ArchiveAdminPage() {
  const { role, canWrite } = useAdminRole()
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [currentCode, setCurrentCode] = useState('')
  const [semesterNames, setSemesterNames] = useState({})
  const [pastFiles, setPastFiles] = useState([])
  const [archiveRows, setArchiveRows] = useState([])
  const [selectedSemester, setSelectedSemester] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [resourceFilter, setResourceFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [editTarget, setEditTarget] = useState(null)

  const loadArchive = useCallback(async () => {
    const current = await fetchCurrentSemester()
    // 학기 전환은 is_archive를 바꾸지 않으므로 "현재 학기가 아닌 파일"도 과거 자료로 본다
    const pastQuery = supabase.from('files_metadata').select('*').order('week', { ascending: true }).order('created_at', { ascending: true })
    const [pastRes, archiveRes, semesterRes] = await Promise.all([
      current.code ? pastQuery.or(`is_archive.eq.true,semester.neq."${current.code}"`) : pastQuery.eq('is_archive', true),
      supabase.from('archive_files').select('*').order('created_at', { ascending: false }),
      supabase.from('semesters').select('code, name'),
    ])
    const error = pastRes.error || archiveRes.error
    if (error) setMessage(`아카이브 조회 실패: ${error.message}`)

    setCurrentCode(current.code)
    setSemesterNames(Object.fromEntries((semesterRes.data || []).map((row) => [row.code, row.name || row.code])))
    setPastFiles(pastRes.data || [])
    setArchiveRows(archiveRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    let active = true
    Promise.resolve().then(() => active && loadArchive())
    return () => { active = false }
  }, [loadArchive])

  const semesterCodes = useMemo(() => sortSemestersDesc([...new Set(pastFiles.map((file) => file.semester).filter(Boolean))]), [pastFiles])
  const activeSemester = semesterCodes.includes(selectedSemester) ? selectedSemester : semesterCodes[0] || ''
  const semesterFiles = useMemo(() => pastFiles.filter((file) => file.semester === activeSemester), [pastFiles, activeSemester])
  const semesterCategories = useMemo(() => Object.keys(FILE_CATEGORIES).filter((category) => semesterFiles.some((file) => normalizeFileCategory(file.file_category) === category)), [semesterFiles])

  const normalizedQuery = query.trim().toLowerCase()
  const matchesQuery = (...values) => !normalizedQuery || values.some((value) => String(value || '').toLowerCase().includes(normalizedQuery))

  const visibleFiles = semesterFiles.filter((file) => (categoryFilter === 'all' || normalizeFileCategory(file.file_category) === categoryFilter) && matchesQuery(file.file_name, file.uploader))
  const resources = archiveRows.filter(isResourceRow)
  const visibleResources = resources.filter((row) => (resourceFilter === 'all' || row.category === resourceFilter) && matchesQuery(row.title, row.uploader_name, row.file_type))
  const snapshots = archiveRows.filter(isSnapshotRow).sort((a, b) => String(b.file_type).localeCompare(String(a.file_type)))

  async function deleteFile(file) {
    if (!canWrite) return
    if (!confirm(`'${file.file_name}'을 삭제할까요? 제출 기록이 영구 삭제됩니다.`)) return
    const { error, storageError } = await deleteSubmittedFile(file)
    setMessage(error ? `삭제 실패: ${error.message}` : storageError ? `제출 기록은 삭제했지만 업로드 원본(${file.storage_path})을 지우지 못했습니다: ${storageError.message}. Supabase Storage에서 직접 지워 주세요.` : '제출 자료를 삭제했습니다.')
    if (!error) loadArchive()
  }

  async function deleteResource(row) {
    if (!canWrite) return
    if (!confirm(`'${row.title}' 자료를 삭제할까요?`)) return
    const { error } = await supabase.from('archive_files').delete().eq('id', row.id)
    setMessage(error ? `삭제 실패: ${error.message}` : '공용 자료를 삭제했습니다.')
    if (!error) loadArchive()
  }

  async function saveName(name) {
    if (!canWrite || !name.trim()) return
    const update = editTarget.table === 'archive_files' ? { title: name.trim() } : { file_name: name.trim() }
    const { error } = await supabase.from(editTarget.table).update(update).eq('id', editTarget.id)
    setMessage(error ? `이름 수정 실패: ${error.message}` : '이름을 수정했습니다.')
    if (error) return
    setEditTarget(null)
    loadArchive()
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="학회원 시스템"
        title="아카이브"
        description={`현재 학기(${currentCode || '미지정'})를 제외한 학기의 제출 자료와 공용 자료실을 관리합니다. 학기를 전환하면 이전 학기 자료가 자동으로 이곳에 모입니다.`}
        actions={
          <Link href="/admin/hub/rules-doc" className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:border-teal-300 hover:text-teal-800">
            <FileText className="h-4 w-4" aria-hidden="true" />
            회칙 문서 편집
          </Link>
        }
      />
      <ReadOnlyBanner role={role} />

      {message && <div className={`mb-4 rounded-md border px-4 py-3 text-sm font-semibold ${message.includes('실패') ? 'border-red-200 bg-red-50 text-red-700' : 'border-teal-200 bg-teal-50 text-teal-800'}`}>{message}</div>}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="보관 학기" value={`${semesterCodes.length}개`} />
        <Stat label="지난 학기 제출 자료" value={`${pastFiles.length}건`} />
        <Stat label="공용 자료" value={`${resources.length}건`} />
        <Stat label="학기 스냅샷" value={`${snapshots.length}건`} />
      </div>

      <label className="mb-5 flex h-10 max-w-md items-center gap-2 rounded-md border border-slate-300 bg-white px-3 focus-within:border-teal-600">
        <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="파일명·제출자·자료명 검색" className="h-full w-full bg-transparent text-sm text-slate-900 outline-none" />
      </label>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Panel title="지난 학기 제출 자료" description="기획서·슬라이드·발표영상 제출 기록입니다. 유저 아카이브의 과거 자료실에 그대로 표시됩니다.">
          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-slate-400">불러오는 중입니다.</div>
          ) : semesterCodes.length === 0 ? (
            <EmptyState title="보관된 학기가 없습니다." />
          ) : (
            <>
              <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
                {semesterCodes.map((code) => (
                  <Chip key={code} active={code === activeSemester} onClick={() => { setSelectedSemester(code); setCategoryFilter('all') }}>
                    {semesterNames[code] || code}
                    <span className="ml-1.5 text-xs opacity-70">{pastFiles.filter((file) => file.semester === code).length}</span>
                  </Chip>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-4 py-2.5 sm:px-5">
                <Chip small active={categoryFilter === 'all'} onClick={() => setCategoryFilter('all')}>전체</Chip>
                {semesterCategories.map((category) => (
                  <Chip small key={category} active={categoryFilter === category} onClick={() => setCategoryFilter(category)}>{fileCategoryLabel(category)}</Chip>
                ))}
              </div>
              {visibleFiles.length === 0 ? <EmptyState title="조건에 맞는 자료가 없습니다." /> : (
                <div className="max-h-[640px] divide-y divide-slate-100 overflow-y-auto">
                  {visibleFiles.map((file) => (
                    <Row
                      key={file.id}
                      badge={<><StatusBadge tone={FILE_CATEGORIES[normalizeFileCategory(file.file_category)]?.session === 'weekday' ? 'teal' : 'gray'}>{fileCategoryLabel(file.file_category, { short: true })}</StatusBadge><span className="w-9 text-xs font-bold text-slate-400">W{file.week ?? '?'}</span></>}
                      title={file.file_name}
                      href={file.file_url}
                      meta={file.uploader}
                      onRename={() => setEditTarget({ table: 'files_metadata', id: file.id, name: file.file_name })}
                      onDelete={() => deleteFile(file)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel title="공용 자료실" description="학회원이 올린 교육·특별세션·양식 자료입니다.">
            <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-4 py-2.5 sm:px-5">
              <Chip small active={resourceFilter === 'all'} onClick={() => setResourceFilter('all')}>전체</Chip>
              {Object.entries(RESOURCE_CATEGORIES).map(([category, label]) => (
                <Chip small key={category} active={resourceFilter === category} onClick={() => setResourceFilter(category)}>{label}</Chip>
              ))}
            </div>
            {visibleResources.length === 0 ? <EmptyState title="등록된 자료가 없습니다." /> : (
              <div className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
                {visibleResources.map((row) => (
                  <Row
                    key={row.id}
                    badge={<StatusBadge tone={RESOURCE_TONES[row.category]}>{RESOURCE_CATEGORIES[row.category]}</StatusBadge>}
                    title={row.title}
                    href={row.file_url}
                    meta={[row.category === 'template' ? null : row.file_type, row.uploader_name].filter(Boolean).join(' · ')}
                    onRename={() => setEditTarget({ table: 'archive_files', id: row.id, name: row.title })}
                    onDelete={() => deleteResource(row)}
                  />
                ))}
              </div>
            )}
          </Panel>

          <Panel title="학기 스냅샷" description="학기 전환 시 보관한 타임라인·사유서·주차 주제입니다. 유저 아카이브에서 학기별로 열람합니다.">
            {snapshots.length === 0 ? <EmptyState title="보관된 스냅샷이 없습니다." /> : (
              <div className="divide-y divide-slate-100">
                {snapshots.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                    <div className="flex min-w-0 items-center gap-2">
                      <StatusBadge tone="gray">{semesterNames[row.file_type] || row.file_type}</StatusBadge>
                      <span className="truncate text-sm font-semibold text-slate-800">{SNAPSHOT_CATEGORIES[row.category]}</span>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-slate-500">{snapshotSize(row)}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

      {editTarget && <RenameDialog initialName={editTarget.name} onSave={saveName} onClose={() => setEditTarget(null)} />}
    </AdminPage>
  )
}

function snapshotSize(row) {
  const data = parseJson(row.description, null)
  if (Array.isArray(data)) return `${data.length}건`
  if (data && typeof data === 'object') return `${Object.values(data).filter(Boolean).length}개 주제`
  return '-'
}

function Stat({ label, value }) {
  return <div className="rounded-lg bg-teal-50/40 p-4"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1.5 text-xl font-bold text-slate-950">{value}</p></div>
}

function Chip({ active, onClick, small = false, children }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center rounded-md border font-bold transition-colors ${small ? 'min-h-7 px-2.5 text-xs' : 'min-h-8 px-3 text-xs'} ${active ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:text-teal-800'}`}>
      {children}
    </button>
  )
}

function Row({ badge, title, href, meta, onRename, onDelete }) {
  return (
    <div className="group flex items-center gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
      <div className="flex shrink-0 items-center gap-2">{badge}</div>
      <div className="min-w-0 flex-1">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-1 text-sm font-semibold text-slate-900 hover:text-teal-800">
            <span className="truncate">{title}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden="true" />
          </a>
        ) : <p className="truncate text-sm font-semibold text-slate-900">{title}</p>}
        {meta && <p className="mt-0.5 truncate text-xs text-slate-500">{meta}</p>}
      </div>
      <div className="flex shrink-0 gap-1 sm:opacity-0 sm:group-hover:opacity-100">
        <IconButton label="이름 수정" onClick={onRename}><Pencil className="h-4 w-4" aria-hidden="true" /></IconButton>
        <IconButton label="삭제" danger onClick={onDelete}><Trash2 className="h-4 w-4" aria-hidden="true" /></IconButton>
      </div>
    </div>
  )
}

function IconButton({ label, danger = false, onClick, children }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className={`grid h-8 w-8 place-items-center rounded-md text-slate-400 ${danger ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-teal-50 hover:text-teal-800'}`}>
      {children}
    </button>
  )
}

function RenameDialog({ initialName, onSave, onClose }) {
  const [name, setName] = useState(initialName || '')
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="rename-title">
      <form onSubmit={(event) => { event.preventDefault(); onSave(name) }} className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex min-h-14 items-center justify-between border-b border-slate-200 px-5">
          <h2 id="rename-title" className="text-base font-bold text-slate-950">이름 수정</h2>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100" aria-label="닫기"><X className="h-5 w-5" aria-hidden="true" /></button>
        </div>
        <div className="p-5">
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-teal-600" />
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button type="button" onClick={onClose} className="min-h-10 rounded-md border border-slate-200 px-4 text-sm font-bold text-slate-600">취소</button>
          <button type="submit" disabled={!name.trim()} className="min-h-10 rounded-md bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50">저장</button>
        </div>
      </form>
    </div>
  )
}
