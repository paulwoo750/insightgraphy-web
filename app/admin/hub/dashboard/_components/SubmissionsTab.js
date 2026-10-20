'use client'
// 제출물 탭: 선택한 학기·주차·세션·유형의 대상 명단 기준 제출 현황
import { useState } from 'react'
import { ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { Button, EmptyState, Field, inputClass, Modal, Notice, SegmentedControl, StatusBadge, useAsyncAction, useToast } from '@/app/components/ui'
import FileThumbnail from '@/app/components/FileThumbnail'
import { supabase } from '@/lib/supabase'
import { deleteSubmittedFile, fileCategoryLabel } from '@/lib/archive'
import { formatKst } from '@/lib/semester'
import { detectSource } from '@/lib/fileSources'

const STATE_LABELS = {
  ontime: { label: '제출', tone: 'green' },
  late: { label: '지각 제출', tone: 'amber' },
  missing: { label: '미제출', tone: 'red' },
  makeup: { label: '보강 제출', tone: 'blue' },
  excluded: { label: '불참 표시', tone: 'gray' },
  unassigned: { label: '편성 미정', tone: 'gray' },
}

export default function SubmissionsTab({ mode, summary, filesError, canWrite, onFilesChanged, week }) {
  const [typeKey, setTypeKey] = useState(summary?.[0]?.type.key)
  const [filter, setFilter] = useState('all')
  const [detail, setDetail] = useState(null)
  const entry = summary?.find((item) => item.type.key === typeKey) || summary?.[0]

  if (!entry) return <EmptyState title="제출 유형이 없습니다." />

  const rows = entry.rows.filter((row) => filter === 'all' || (filter === 'missing' ? row.state === 'missing' : filter === 'late' ? row.state === 'late' : filter === 'done' ? ['ontime', 'late', 'makeup'].includes(row.state) : row.kind !== 'target'))
  const missingNames = entry.rows.filter((row) => row.state === 'missing').map((row) => row.label)

  return (
    <div className="space-y-5">
      {filesError && <Notice tone="danger" title="제출물을 불러오지 못했습니다">{filesError}</Notice>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl label="제출 유형" value={entry.type.key} onChange={setTypeKey} options={summary.map((item) => ({ value: item.type.key, label: item.type.label }))} />
        <SegmentedControl
          label="상태로 거르기"
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: '전체' },
            { value: 'done', label: '제출' },
            { value: 'late', label: '지각' },
            { value: 'missing', label: '미제출' },
            { value: 'other', label: '대상 아님' },
          ]}
        />
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Count label="대상" value={entry.counts.targets} />
        <Count label="제출" value={entry.counts.submitted} tone="green" />
        <Count label="그중 지각" value={entry.counts.late} tone="amber" />
        <Count label="미제출" value={entry.counts.missing} tone="red" />
        <Count label="편성 미정" value={entry.counts.unassigned} note="미제출로 세지 않음" />
        <Count label="불참 표시" value={entry.counts.excluded} note={entry.counts.makeup ? `보강 ${entry.counts.makeup}` : '미제출로 세지 않음'} />
      </dl>
      {!entry.roster.hasSetup && (
        <Notice tone="info">W{week}은 편성이 없어 학기 명단 전체를 대상으로 셉니다.</Notice>
      )}
      {missingNames.length > 0 && (
        <p className="break-keep rounded-md bg-red-50 px-4 py-3 text-sm text-red-900"><strong>미제출</strong> {missingNames.join(', ')}</p>
      )}

      <div className="overflow-x-auto border-y border-slate-200">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs font-bold text-slate-600">
            <tr className="border-b border-slate-200">
              <th className="w-40 px-3 py-2.5">미리보기</th>
              <th className="px-3 py-2.5">제출자 · 팀</th>
              <th className="px-3 py-2.5">제출 시각 (KST)</th>
              <th className="w-28 px-3 py-2.5">상태</th>
              <th className="w-32 px-3 py-2.5"><span className="sr-only">작업</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-10 text-center text-sm text-slate-500">해당하는 항목이 없습니다.</td></tr>
            ) : rows.map((row) => {
              const state = STATE_LABELS[row.state] || STATE_LABELS.missing
              return (
                <tr key={row.key} className="align-middle">
                  <td className="px-3 py-2">
                    {row.latest ? <FileThumbnail url={row.latest.file_url} storagePath={row.latest.storage_path} title={row.latest.file_name} width={320} showOpen={false} /> : <div className="grid aspect-video place-items-center rounded-lg bg-slate-100 text-xs text-slate-400">없음</div>}
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-bold text-slate-900">{row.label}</p>
                    <p className="text-xs text-slate-500">{row.detail}</p>
                    {row.files.length > 1 && <p className="text-xs text-slate-500">제출 {row.files.length}건 (최근 것 표시)</p>}
                  </td>
                  <td className="px-3 py-2 text-slate-700">{row.latest ? formatKst(row.latest.created_at) : '-'}</td>
                  <td className="px-3 py-2"><StatusBadge tone={state.tone}>{state.label}</StatusBadge></td>
                  <td className="px-3 py-2">
                    {row.latest && (
                      <div className="flex justify-end gap-1.5">
                        <a href={row.latest.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-md border border-slate-300 px-2 text-xs font-bold text-slate-700 hover:bg-slate-50" aria-label={`${row.label} 원본 열기`}>
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />열기
                        </a>
                        <Button size="sm" onClick={() => setDetail(row.latest)}>상세</Button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {entry.extra.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-bold text-slate-900">명단과 이름이 맞지 않는 제출 {entry.extra.length}건</h3>
          <p className="mb-3 text-sm text-slate-600">개명·오타·명단 밖 업로드일 수 있습니다. 제출 현황 숫자에는 넣지 않았습니다.</p>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {entry.extra.map((file) => (
              <li key={file.id} className="rounded-lg bg-teal-50/40 p-3">
                <FileThumbnail url={file.file_url} storagePath={file.storage_path} title={file.file_name} width={320} />
                <p className="mt-2 truncate text-sm font-bold text-slate-900" title={file.file_name}>{file.uploader}</p>
                <p className="text-xs text-slate-500">{formatKst(file.created_at)}</p>
                <Button size="sm" className="mt-2" onClick={() => setDetail(file)}>상세</Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {detail && <FileDetail file={detail} canWrite={canWrite} mode={mode} onClose={() => setDetail(null)} onFilesChanged={onFilesChanged} />}
    </div>
  )
}

function Count({ label, value, tone = 'gray', note }) {
  const tones = { gray: 'text-slate-900', green: 'text-emerald-700', amber: 'text-amber-700', red: 'text-red-700' }
  return (
    <div className="rounded-lg bg-teal-50/40 px-3 py-2.5">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className={`text-xl font-bold ${tones[tone]}`}>{value}</dd>
      {note && <dd className="text-xs text-slate-500">{note}</dd>}
    </div>
  )
}

function FileDetail({ file, canWrite, onClose, onFilesChanged }) {
  const toast = useToast()
  const [run, pending] = useAsyncAction()
  const [name, setName] = useState(file.file_name || '')
  const source = detectSource(file.file_url, file.storage_path)

  async function rename() {
    if (!name.trim() || name.trim() === file.file_name) return
    await run(async () => {
      const { error } = await supabase.from('files_metadata').update({ file_name: name.trim() }).eq('id', file.id)
      if (error) {
        toast.error(`이름을 바꾸지 못했습니다: ${error.message}`)
        return
      }
      onFilesChanged((list) => list.map((item) => item.id === file.id ? { ...item, file_name: name.trim() } : item))
      toast.success('파일 이름을 바꿨습니다.')
    })
  }

  async function remove() {
    const storageNote = source.kind === 'pdf' || source.kind === 'image' || source.kind === 'office' ? '\n업로드된 원본 파일도 함께 삭제됩니다.' : '\n외부 링크(드라이브·유튜브) 원본은 지워지지 않습니다.'
    if (!confirm(`${file.uploader}의 제출 기록을 삭제할까요?${storageNote}\n이 작업은 되돌릴 수 없습니다.`)) return
    await run(async () => {
      const { error, storageError } = await deleteSubmittedFile(file)
      if (error) {
        toast.error(`삭제하지 못했습니다: ${error.message}`)
        return
      }
      onFilesChanged((list) => list.filter((item) => item.id !== file.id))
      if (storageError) {
        toast.warning(`제출 기록은 지웠지만 업로드 원본(${file.storage_path})을 지우지 못했습니다: ${storageError.message}. 아카이브 화면에서 다시 시도하거나 Supabase Storage에서 직접 지워 주세요.`, { duration: 0 })
      } else {
        toast.success('제출 기록을 삭제했습니다.')
      }
      onClose()
    })
  }

  return (
    <Modal
      title={file.file_name || '제출물'}
      description={`${fileCategoryLabel(file.file_category)} · ${file.uploader} · ${formatKst(file.created_at)}${file.is_late ? ' · 지각' : ''}`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="danger" icon={Trash2} onClick={remove} disabled={!canWrite || pending}>삭제</Button>
          <Button href={file.file_url} target="_blank" icon={ExternalLink}>원본 열기</Button>
          <Button onClick={onClose}>닫기</Button>
        </>
      }
    >
      <div className="space-y-4 p-5">
        <FileThumbnail url={file.file_url} storagePath={file.storage_path} title={file.file_name} width={960} showOpen={false} />
        <p className="text-xs text-slate-500">{source.label} · 미리보기는 원본의 첫 장입니다. 공유 권한이 없으면 원본 열기로 확인하세요.</p>
        <form onSubmit={(event) => { event.preventDefault(); rename() }} className="flex flex-wrap items-end gap-2">
          <Field label="파일 이름" htmlFor="submission-name" className="min-w-[240px] flex-1">
            <input id="submission-name" value={name} onChange={(event) => setName(event.target.value)} disabled={!canWrite} className={inputClass} />
          </Field>
          <Button type="submit" icon={Pencil} disabled={!canWrite || pending || !name.trim() || name.trim() === file.file_name}>이름 바꾸기</Button>
        </form>
      </div>
    </Modal>
  )
}
