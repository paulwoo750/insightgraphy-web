// 푸시 알림 발송: DB 대기열(push_outbox)에서 보낼 것을 가져와 웹 푸시로 보내고 결과를 보고한다.
// - 5분마다 Supabase pg_cron이 x-push-secret 헤더로 부른다 (STEP 25).
// - 로그인한 학회원의 '알림 테스트' 버튼도 부른다 (이미 대기열에 있는 것만 보낸다).
// 대기열을 읽는 DB 함수는 같은 비밀값을 확인하므로 공개 키로 불러도 안전하다.
import { timingSafeEqual } from 'node:crypto'
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BATCH = 300
const CONCURRENCY = 25

function supabaseClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function sameSecret(given, expected) {
  const a = Buffer.from(String(given || ''))
  const b = Buffer.from(String(expected || ''))
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b)
}

async function mapLimit(items, limit, task) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next++
      results[index] = await task(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export async function POST(request) {
  const secret = process.env.PUSH_CRON_SECRET
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!secret || !publicKey || !privateKey) {
    return Response.json({ ok: false, error: 'NOT_CONFIGURED' }, { status: 503 })
  }

  const supabase = supabaseClient()
  let authorized = sameSecret(request.headers.get('x-push-secret'), secret)
  if (!authorized) {
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (token) {
      const { data } = await supabase.auth.getUser(token)
      authorized = Boolean(data?.user)
    }
  }
  if (!authorized) return Response.json({ ok: false, error: 'FORBIDDEN' }, { status: 401 })

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://insightgraphy.org', publicKey, privateKey)

  let sent = 0
  let failed = 0
  let removed = 0
  for (let round = 0; round < 3; round++) {
    const { data: rows, error } = await supabase.rpc('push_claim_outbox', { p_secret: secret, p_limit: BATCH })
    if (error) return Response.json({ ok: false, error: error.message, sent, failed, removed }, { status: 500 })
    if (!rows?.length) break

    const results = await mapLimit(rows, CONCURRENCY, async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify({ title: row.title, body: row.body, url: row.url, tag: row.tag }),
          { TTL: 6 * 3600, urgency: 'high' },
        )
        return { outbox_id: row.outbox_id, subscription_id: row.subscription_id, ok: true }
      } catch (sendError) {
        return {
          outbox_id: row.outbox_id,
          subscription_id: row.subscription_id,
          ok: false,
          status: String(sendError?.statusCode || ''),
          error: String(sendError?.body || sendError?.message || 'send failed').slice(0, 300),
        }
      }
    })

    const { data: report, error: reportError } = await supabase.rpc('push_report', { p_secret: secret, p_results: results })
    if (reportError) return Response.json({ ok: false, error: reportError.message, sent, failed, removed }, { status: 500 })
    sent += report?.sent || 0
    removed += report?.removed || 0
    failed += results.filter((item) => !item.ok).length
    if (rows.length < BATCH) break
  }

  return Response.json({ ok: true, sent, failed, removed })
}
