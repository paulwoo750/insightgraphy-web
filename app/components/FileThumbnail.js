'use client'
// 자료 실제 미리보기.
// - 유튜브: 영상 썸네일 / 이미지: 원본 축소 표시
// - Google 슬라이드·문서·Drive 파일(PPTX·PDF 포함): /api/thumbnail 이 받아 온 첫 장
// - Storage PDF: 브라우저에서 pdf.js로 첫 페이지를 그린다 (파일은 외부로 보내지 않음)
// - 그 외(docx 등)는 미지원으로 표시하고 원본 열기를 준다
// 화면에 보일 때만 만들고(지연 로딩), 만든 결과는 브라우저 캐시에 7일간 둔다. 실패해도 제출과 무관하다.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, FileText, ImageOff, Loader2, Lock, PlayCircle, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { detectSource, usesDriveThumbnail, youtubeThumbnail } from '@/lib/fileSources'

const CACHE_NAME = 'ig-thumbnails-v1'
const CACHE_DAYS = 7
const memory = new Map()

const MESSAGES = {
  not_accessible: '공유 권한 때문에 미리보기를 만들 수 없습니다.',
  not_registered: '등록된 자료가 아니라 미리보기를 만들지 않았습니다.',
  unauthorized: '로그인 후 미리보기를 볼 수 있습니다.',
  timeout: '미리보기를 가져오는 시간이 초과되었습니다.',
  too_large: '파일이 커서 미리보기를 만들지 않았습니다.',
  unsupported: '이 형식은 미리보기를 지원하지 않습니다.',
  failed: '미리보기를 만들지 못했습니다.',
}

function cacheKey(kind, id, width) {
  return new Request(`${typeof window === 'undefined' ? '' : window.location.origin}/__thumbnail/${kind}/${encodeURIComponent(id)}/${width}`)
}

async function readCache(key) {
  try {
    if (typeof caches === 'undefined') return null
    const cache = await caches.open(CACHE_NAME)
    const hit = await cache.match(key)
    if (!hit) return null
    const savedAt = Number(hit.headers.get('x-saved-at') || 0)
    if (Date.now() - savedAt > CACHE_DAYS * 86400000) {
      await cache.delete(key)
      return null
    }
    return await hit.blob()
  } catch {
    return null
  }
}

async function writeCache(key, blob) {
  try {
    if (typeof caches === 'undefined') return
    const cache = await caches.open(CACHE_NAME)
    await cache.put(key, new Response(blob, { headers: { 'content-type': blob.type, 'x-saved-at': String(Date.now()) } }))
  } catch {
    // 캐시는 선택 사항이다
  }
}

async function deleteCache(key) {
  try {
    if (typeof caches !== 'undefined') await (await caches.open(CACHE_NAME)).delete(key)
  } catch {
    // 무시
  }
}

async function driveThumbnail(id, width) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) return { error: 'unauthorized' }
  const response = await fetch(`/api/thumbnail?id=${encodeURIComponent(id)}&w=${width}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    return { error: body.status || 'failed' }
  }
  return { blob: await response.blob() }
}

let pdfjsPromise = null
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((pdfjs) => {
      if (!pdfjs.GlobalWorkerOptions.workerPort) {
        pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' })
      }
      return pdfjs
    })
  }
  return pdfjsPromise
}

async function pdfThumbnail(url, width) {
  const pdfjs = await loadPdfjs()
  const task = pdfjs.getDocument({ url, disableAutoFetch: true, rangeChunkSize: 65536 })
  const timer = setTimeout(() => task.destroy(), 20000)
  try {
    const pdf = await task.promise
    const page = await pdf.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: Math.min(2, width / base.width) })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82))
    await pdf.destroy()
    return blob ? { blob } : { error: 'failed' }
  } catch {
    return { error: 'failed' }
  } finally {
    clearTimeout(timer)
  }
}

// 같은 자료를 여러 카드가 동시에 요청해도 한 번만 만든다
function resolveThumbnail(source, url, width, force = false) {
  const id = source.id || url
  const memoKey = `${source.kind}:${id}:${width}`
  if (!force && memory.has(memoKey)) return memory.get(memoKey)
  const promise = (async () => {
    const key = cacheKey(source.kind, id, width)
    if (force) await deleteCache(key)
    else {
      const cached = await readCache(key)
      if (cached) return { src: URL.createObjectURL(cached) }
    }
    const result = usesDriveThumbnail(source) ? await driveThumbnail(source.id, width) : await pdfThumbnail(url, width)
    if (result.blob) {
      await writeCache(key, result.blob)
      return { src: URL.createObjectURL(result.blob) }
    }
    memory.delete(memoKey)
    return { error: result.error || 'failed' }
  })()
  memory.set(memoKey, promise)
  return promise
}

function directSource(source, url) {
  if (source.kind === 'youtube') return youtubeThumbnail(source.id)
  if (source.kind === 'image') return url
  return null
}

const KIND_BADGES = { youtube: '영상', slides: '슬라이드', docs: '문서', sheets: '시트', drive: 'Drive', pdf: 'PDF', image: '이미지', office: '파일', video: '영상', link: '링크' }

export default function FileThumbnail({ url, storagePath, title = '', aspect = 'video', width = 640, className = '', showOpen = true }) {
  const source = detectSource(url, storagePath)
  const direct = directSource(source, url)
  const generated = usesDriveThumbnail(source) || source.kind === 'pdf'
  const containerRef = useRef(null)
  const [visible, setVisible] = useState(false)
  const [state, setState] = useState({ status: 'idle', src: null, error: null, attempt: 0 })

  useEffect(() => {
    const node = containerRef.current
    if (!node || visible) return undefined
    if (typeof IntersectionObserver === 'undefined') {
      const timer = setTimeout(() => setVisible(true), 0)
      return () => clearTimeout(timer)
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '240px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [visible])

  const run = useCallback((force) => {
    let cancelled = false
    resolveThumbnail(detectSource(url, storagePath), url, width, force).then((result) => {
      if (!cancelled) setState((current) => ({ ...current, status: result.src ? 'ready' : 'error', src: result.src || null, error: result.error || null }))
    })
    return () => {
      cancelled = true
    }
  }, [url, storagePath, width])

  useEffect(() => {
    if (!visible || !generated) return undefined
    return run(state.attempt > 0)
  }, [visible, generated, run, state.attempt])

  const ratio = aspect === 'portrait' ? 'aspect-[3/4]' : aspect === 'square' ? 'aspect-square' : 'aspect-video'
  const reason = !generated && !direct ? (source.kind === 'none' ? 'unsupported' : 'unsupported') : state.error
  const loading = generated && (!visible || state.status === 'idle' || (state.status !== 'ready' && state.status !== 'error'))
  const src = direct || state.src

  return (
    <div ref={containerRef} className={`relative ${ratio} w-full overflow-hidden rounded-lg bg-slate-100 ${className}`}>
      {src && !(generated && state.status !== 'ready') ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={title ? `${title} 미리보기` : '자료 미리보기'} loading="lazy" decoding="async" className="h-full w-full object-contain" onError={() => setState((current) => ({ ...current, status: 'error', error: 'failed', src: null }))} />
      ) : loading ? (
        <div className="grid h-full w-full place-items-center text-xs font-semibold text-slate-500" role="status">
          <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin text-teal-700" aria-hidden="true" />미리보기 만드는 중</span>
        </div>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-3 text-center">
          {reason === 'not_accessible' ? <Lock className="h-5 w-5 text-slate-400" aria-hidden="true" /> : source.kind === 'office' ? <FileText className="h-5 w-5 text-slate-400" aria-hidden="true" /> : <ImageOff className="h-5 w-5 text-slate-400" aria-hidden="true" />}
          <p className="break-keep text-xs leading-4 text-slate-500">{MESSAGES[reason] || MESSAGES.failed}</p>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {generated && reason && !['not_accessible', 'not_registered', 'unauthorized'].includes(reason) && (
              <button type="button" onClick={() => setState((current) => ({ ...current, status: 'idle', error: null, attempt: current.attempt + 1 }))} className="inline-flex min-h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
                <RefreshCw className="h-3 w-3" aria-hidden="true" />다시 만들기
              </button>
            )}
          </div>
        </div>
      )}
      <span className="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-slate-900/75 px-1.5 py-0.5 text-[11px] font-bold text-white">
        {source.kind === 'youtube' && <PlayCircle className="h-3 w-3" aria-hidden="true" />}
        {KIND_BADGES[source.kind] || '자료'}
      </span>
      {showOpen && url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="absolute bottom-1.5 right-1.5 inline-flex min-h-7 items-center gap-1 rounded bg-white/95 px-2 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:text-teal-800" aria-label={`${title || '자료'} 원본 열기 (새 탭)`}>
          <ExternalLink className="h-3 w-3" aria-hidden="true" />원본
        </a>
      )}
    </div>
  )
}
