// 자료 링크의 종류를 판별한다. 화면(썸네일·열기 버튼)과 서버(썸네일 API)가 같이 쓴다.
// storage_path가 'youtube'·'google_drive_link'이면 외부 링크, 그 외에는 Supabase Storage 경로다.

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif']
const OFFICE_EXTENSIONS = ['ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx', 'hwp', 'hwpx', 'key']
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'm4v']

export const DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]{10,120}$/

function extensionOf(value) {
  const clean = String(value || '').split(/[?#]/)[0]
  const match = clean.match(/\.([A-Za-z0-9]{2,5})$/)
  return match ? match[1].toLowerCase() : ''
}

export function youtubeId(url) {
  const text = String(url || '')
  const patterns = [
    /youtu\.be\/([A-Za-z0-9_-]{6,20})/,
    /youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)([A-Za-z0-9_-]{6,20})/,
    /youtube-nocookie\.com\/embed\/([A-Za-z0-9_-]{6,20})/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match[1]
  }
  return null
}

export function googleFileId(url) {
  const text = String(url || '')
  const match = text.match(/\/(?:file|presentation|document|spreadsheets|drawings|forms)\/d\/([A-Za-z0-9_-]{10,120})/)
    || text.match(/[?&]id=([A-Za-z0-9_-]{10,120})/)
  return match ? match[1] : null
}

// → { kind, id?, ext?, label }
// kind: youtube | slides | docs | sheets | drive | pdf | image | office | video | link | none
export function detectSource(url, storagePath) {
  const text = String(url || '').trim()
  if (!text) return { kind: 'none', label: '링크 없음' }

  const ytId = youtubeId(text)
  if (ytId || storagePath === 'youtube') return { kind: ytId ? 'youtube' : 'link', id: ytId, label: '유튜브 영상' }

  if (/docs\.google\.com\/presentation/.test(text)) return { kind: 'slides', id: googleFileId(text), label: 'Google 슬라이드' }
  if (/docs\.google\.com\/document/.test(text)) return { kind: 'docs', id: googleFileId(text), label: 'Google 문서' }
  if (/docs\.google\.com\/spreadsheets/.test(text)) return { kind: 'sheets', id: googleFileId(text), label: 'Google 시트' }
  if (/drive\.google\.com/.test(text)) {
    const id = googleFileId(text)
    return { kind: id ? 'drive' : 'link', id, label: id ? 'Google Drive 파일' : 'Google Drive 폴더' }
  }

  const ext = extensionOf(storagePath && !['google_drive_link', 'youtube'].includes(storagePath) ? storagePath : text)
  if (ext === 'pdf') return { kind: 'pdf', ext, label: 'PDF' }
  if (IMAGE_EXTENSIONS.includes(ext)) return { kind: 'image', ext, label: '이미지' }
  if (OFFICE_EXTENSIONS.includes(ext)) return { kind: 'office', ext, label: `${ext.toUpperCase()} 파일` }
  if (VIDEO_EXTENSIONS.includes(ext)) return { kind: 'video', ext, label: '동영상 파일' }
  return { kind: 'link', label: '외부 링크' }
}

export function youtubeThumbnail(id) {
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
}

// Google 계열은 서버 API로 첫 장 썸네일을 받는다
export function usesDriveThumbnail(source) {
  return ['slides', 'docs', 'sheets', 'drive'].includes(source.kind) && Boolean(source.id) && DRIVE_ID_PATTERN.test(source.id)
}
