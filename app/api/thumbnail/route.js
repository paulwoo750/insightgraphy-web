// Google 슬라이드·문서·Drive 파일의 실제 첫 장 썸네일.
// - 로그인한 사용자만 요청할 수 있다 (Authorization: Bearer <Supabase access token>).
// - 제출물(files_metadata)·자료실(archive_files)에 등록된 파일 ID만 처리한다.
// - 파일을 공개로 바꾸거나 외부 변환 서비스로 보내지 않는다. Google이 만든 썸네일을
//   서비스 계정 권한(읽기 전용)이나 링크 공유 상태 그대로 가져온다.
// - 시간·크기 제한을 두고, 접근할 수 없으면 이유를 돌려준다 (화면은 원본 열기를 보여 준다).
import { google } from 'googleapis'
import { NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase'
import { DRIVE_ID_PATTERN } from '@/lib/fileSources'

export const runtime = 'nodejs'

const FETCH_TIMEOUT_MS = 8000
const MAX_BYTES = 4 * 1024 * 1024
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const ALLOWED_WIDTHS = [320, 640, 960]
const memoryCache = new Map()

function failure(status, reason, message) {
  return NextResponse.json({ status: reason, message }, { status, headers: { 'Cache-Control': 'no-store' } })
}

async function fetchWithLimit(url, headers = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, { headers, redirect: 'follow', signal: controller.signal })
    const type = response.headers.get('content-type') || ''
    if (!response.ok || !type.startsWith('image/')) return { ok: false, status: response.status }
    const length = Number(response.headers.get('content-length') || 0)
    if (length > MAX_BYTES) return { ok: false, status: 413 }
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > MAX_BYTES) return { ok: false, status: 413 }
    return { ok: true, buffer, type }
  } catch {
    return { ok: false, status: 504 }
  } finally {
    clearTimeout(timer)
  }
}

function driveAuth() {
  if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) return null
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })
}

// 1) 서비스 계정이 볼 수 있는 파일: Drive API의 thumbnailLink
async function viaServiceAccount(fileId, width) {
  const auth = driveAuth()
  if (!auth) return { ok: false, status: 0 }
  try {
    const drive = google.drive({ version: 'v3', auth })
    const { data } = await drive.files.get({ fileId, fields: 'id, mimeType, hasThumbnail, thumbnailLink', supportsAllDrives: true }, { timeout: FETCH_TIMEOUT_MS })
    if (!data.thumbnailLink) return { ok: false, status: 415 }
    const token = await auth.getAccessToken()
    const link = data.thumbnailLink.replace(/=s\d+$/, `=w${width}`)
    return await fetchWithLimit(link, { Authorization: `Bearer ${token}` })
  } catch (error) {
    return { ok: false, status: error?.code || error?.response?.status || 502 }
  }
}

// 2) 링크 공유("링크가 있는 모든 사용자")된 파일: 공개 썸네일 주소
async function viaSharedLink(fileId, width) {
  return fetchWithLimit(`https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${width}`)
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const fileId = searchParams.get('id') || ''
  const requestedWidth = Number(searchParams.get('w')) || 640
  const width = ALLOWED_WIDTHS.reduce((best, value) => Math.abs(value - requestedWidth) < Math.abs(best - requestedWidth) ? value : best, 640)

  if (!DRIVE_ID_PATTERN.test(fileId)) return failure(400, 'invalid', '파일 ID 형식이 올바르지 않습니다.')

  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return failure(401, 'unauthorized', '로그인이 필요합니다.')
  const client = createUserClient(token)
  const { data: userData, error: userError } = await client.auth.getUser(token)
  if (userError || !userData?.user) return failure(401, 'unauthorized', '로그인이 만료되었습니다.')

  // 등록된 자료의 파일만 처리한다 (임의의 Drive 파일 조회 방지)
  const pattern = `%${fileId}%`
  const [files, archive] = await Promise.all([
    client.from('files_metadata').select('id').ilike('file_url', pattern).limit(1),
    client.from('archive_files').select('id').ilike('file_url', pattern).limit(1),
  ])
  if (!(files.data?.length || archive.data?.length)) return failure(404, 'not_registered', '등록된 자료의 파일이 아닙니다.')

  const cacheKey = `${fileId}:${width}`
  const cached = memoryCache.get(cacheKey)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return new NextResponse(cached.buffer, { headers: imageHeaders(cached.type, cached.at) })
  }

  let result = await viaServiceAccount(fileId, width)
  if (!result.ok) result = await viaSharedLink(fileId, width)
  if (!result.ok) {
    if (result.status === 413) return failure(413, 'too_large', '썸네일이 너무 커서 가져오지 않았습니다.')
    if (result.status === 504) return failure(504, 'timeout', '썸네일을 가져오는 시간이 초과되었습니다.')
    return failure(403, 'not_accessible', '공유 권한 때문에 미리보기를 만들 수 없습니다. 원본 링크로 열어 주세요.')
  }

  const at = Date.now()
  memoryCache.set(cacheKey, { buffer: result.buffer, type: result.type, at })
  if (memoryCache.size > 300) memoryCache.delete(memoryCache.keys().next().value)
  return new NextResponse(result.buffer, { headers: imageHeaders(result.type, at) })
}

function imageHeaders(type, at) {
  return {
    'Content-Type': type,
    'Cache-Control': 'private, max-age=21600',
    'X-Thumbnail-Generated-At': new Date(at).toISOString(),
    'Vary': 'Authorization',
  }
}
