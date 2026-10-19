// 제출 파일(files_metadata)과 아카이브(archive_files) 공통 규칙.
import { supabase } from '@/lib/supabase'
import { parseJson } from '@/lib/semester'

export const FILE_CATEGORIES = {
  proposal: { label: '기획서', short: '기획서', icon: '📄', session: 'regular' },
  slide: { label: '슬라이드', short: '슬라이드', icon: '🖼️', session: 'regular' },
  video: { label: '발표영상', short: '영상', icon: '🎬', session: 'regular' },
  weekday_slide: { label: '평일세션 슬라이드', short: '평일 슬라이드', icon: '🖼️', session: 'weekday' },
  weekday_video: { label: '평일세션 영상', short: '평일 영상', icon: '🎬', session: 'weekday' },
}

export const REGULAR_FILE_CATEGORIES = ['proposal', 'slide', 'video']
export const WEEKDAY_FILE_CATEGORIES = ['weekday_slide', 'weekday_video']

// 초기 업로드는 기획서를 'plan'으로 저장했다.
export function normalizeFileCategory(category) {
  return category === 'plan' ? 'proposal' : category
}

export function fileCategoryLabel(category, { short = false } = {}) {
  const meta = FILE_CATEGORIES[normalizeFileCategory(category)]
  if (!meta) return '자료'
  return short ? meta.short : meta.label
}

// 자동 생성 파일명 `3W [평일세션] (주제) 이름 발표자료`에서 주제를 꺼낸다.
// 주제 안에 괄호가 있어도 되도록 첫 '('부터 마지막 ')'까지를 주제로 본다.
export function topicFromFileName(fileName) {
  const match = String(fileName || '').match(/^\s*\d+W(?:\s*\[[^\]]*\])?\s*\((.+)\)\s*[^()]*$/)
  const topic = match?.[1]?.trim()
  return topic && topic !== '자유 주제' && topic !== 'OT 및 자유 주제' ? topic : null
}

// archive_files 중 사용자 자료가 아닌 시스템 행
export const SNAPSHOT_CATEGORIES = {
  timeline: '타임라인',
  absence: '사유서',
  topics: '주차별 주제',
}
export const FOLDER_PLACEHOLDER_TITLE = '--FOLDER--'

export const RESOURCE_CATEGORIES = {
  edu: '교육',
  special: '특별세션',
  template: '양식',
}

export function isSnapshotRow(row) {
  return Object.hasOwn(SNAPSHOT_CATEGORIES, row.category)
}

export function isResourceRow(row) {
  return Object.hasOwn(RESOURCE_CATEGORIES, row.category) && row.title !== FOLDER_PLACEHOLDER_TITLE
}

export function findSnapshot(archiveRows, category, semesterCode) {
  return archiveRows.find((row) => row.category === category && row.file_type === semesterCode) || null
}

export function parseSnapshot(row, fallback = []) {
  return row ? parseJson(row.description, fallback) : fallback
}

// 학기 전환 직전에 현재 학기의 타임라인·주차 주제를 학기별 스냅샷으로 남긴다.
// 같은 학기 스냅샷이 이미 있으면 내용을 갱신하고, 원본 데이터는 건드리지 않는다.
export async function saveSemesterSnapshots(semesterCode) {
  if (!semesterCode) return { error: null }
  const [{ data: schedules, error: scheduleError }, { data: topicRow, error: topicError }, { data: existing, error: existingError }] = await Promise.all([
    supabase.from('pr_schedules').select('*').order('full_date', { ascending: true }),
    supabase.from('pr_config').select('value').eq('key', 'week_topics').maybeSingle(),
    supabase.from('archive_files').select('id, category').in('category', ['timeline', 'topics']).eq('file_type', semesterCode),
  ])
  const readError = scheduleError || topicError || existingError
  if (readError) return { error: readError }

  const snapshots = [
    { category: 'timeline', title: `${semesterCode} 타임라인`, description: JSON.stringify(schedules || []) },
    { category: 'topics', title: `${semesterCode} 주차별 주제`, description: topicRow?.value || '{}' },
  ]

  for (const snapshot of snapshots) {
    const row = { ...snapshot, uploader_name: 'SYSTEM', file_type: semesterCode, semester: semesterCode, file_url: '' }
    const current = (existing || []).find((item) => item.category === snapshot.category)
    const { error } = current
      ? await supabase.from('archive_files').update(row).eq('id', current.id)
      : await supabase.from('archive_files').insert([row])
    if (error) return { error }
  }
  return { error: null }
}

// Storage에 직접 올린 파일만 원본을 함께 지운다 (드라이브·유튜브 링크는 외부 원본).
const EXTERNAL_STORAGE_PATHS = new Set(['google_drive_link', 'youtube'])

export async function deleteSubmittedFile(file) {
  if (file.storage_path && !EXTERNAL_STORAGE_PATHS.has(file.storage_path)) {
    await supabase.storage.from('ig-files').remove([file.storage_path])
  }
  return supabase.from('files_metadata').delete().eq('id', file.id)
}
