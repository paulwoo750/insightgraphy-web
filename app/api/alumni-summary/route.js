// 알럼나이 인터뷰 한 줄 요약 생성 (관리자 전용, 서버에서만 Claude API 호출)
// - 공개 방문 때는 호출하지 않는다. 관리자 화면의 "AI 요약 만들기"에서만 부른다.
// - 요청자의 로그인 토큰으로 관리자(쓰기 가능 역할)인지 DB(is_admin)에서 확인한다.
// - API 키는 서버 환경 변수(ANTHROPIC_API_KEY)에만 둔다.
// - 생성 결과는 미리보기로 돌려주고, 저장은 관리자가 확인한 뒤 학회 소개 화면의 저장으로 한다.
//   실패하면 기존 요약은 그대로 남는다.
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'
import { createUserClient } from '@/lib/supabase'
import { cleanSummary, normalizeQna, qnaFingerprint, qnaToText, SUMMARY_MAX, SUMMARY_MIN } from '@/lib/alumniSummary'

export const runtime = 'nodejs'

const MODEL = 'claude-opus-5-5'
const MAX_SOURCE_CHARS = 60000

const SYSTEM_PROMPT = `너는 대학 연합 프레젠테이션 학회 InsightGraphy의 홈페이지 편집자다.
졸업생(알럼나이) 인터뷰 전문을 읽고, 학회 소개 페이지 카드에 실을 "인터뷰 한 줄 요약"을 쓴다.

규칙:
- 한국어 한 문장, 공백 포함 ${SUMMARY_MIN}~${SUMMARY_MAX}자.
- 인터뷰 전체(모든 질문과 답변)를 근거로, 이 졸업생이 학회 활동에서 얻은 것과 그것이 이후에 어떻게 이어졌는지의 핵심을 담는다.
- 원문에 없는 사실·수치·회사명·감정은 만들지 않는다. 원문 표현을 그대로 길게 옮기지 말고 요약한다.
- 직접 인용처럼 보이지 않게 따옴표를 쓰지 않고, 1인칭("저는")도 쓰지 않는다.
- 문장만 출력한다. 설명, 머리말, 번호, 따옴표 없이.`

function failure(status, reason, message) {
  return NextResponse.json({ status: reason, message }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return failure(401, 'unauthorized', '로그인이 필요합니다.')

  const client = createUserClient(token)
  const { data: userData, error: userError } = await client.auth.getUser(token)
  if (userError || !userData?.user) return failure(401, 'unauthorized', '로그인이 만료되었습니다. 다시 로그인해 주세요.')

  // 최고관리자·관리자·운영진만 (열람자 제외) — DB의 is_admin()과 같은 기준
  const { data: allowed, error: roleError } = await client.rpc('is_admin')
  if (roleError) return failure(500, 'role_check_failed', `권한을 확인하지 못했습니다: ${roleError.message}`)
  if (!allowed) return failure(403, 'forbidden', '관리자·운영진만 AI 요약을 만들 수 있습니다.')

  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return failure(503, 'not_configured', 'AI 요약이 아직 설정되지 않았습니다. 서버 환경 변수 ANTHROPIC_API_KEY를 등록한 뒤 다시 배포하세요. 요약은 직접 입력해 저장할 수 있습니다.')
  }

  let body = {}
  try {
    body = await request.json()
  } catch {
    return failure(400, 'invalid', '요청 형식이 올바르지 않습니다.')
  }

  // 저장 전 본문으로도 만들 수 있게 화면이 보낸 문답을 우선 쓰고, 없으면 저장된 본문을 읽는다
  let qna = normalizeQna(body.qna)
  if (qna.length === 0 && body.alumniId) {
    const { data: row, error } = await client.from('pr_about_alumni').select('id, qna_json').eq('id', body.alumniId).maybeSingle()
    if (error) return failure(500, 'read_failed', `인터뷰를 읽지 못했습니다: ${error.message}`)
    qna = normalizeQna(row?.qna_json)
  }
  if (qna.length === 0 || !qna.some((item) => item.answer)) return failure(422, 'empty', '인터뷰 답변이 비어 있어 요약할 수 없습니다.')

  const source = qnaToText(qna)
  if (source.length > MAX_SOURCE_CHARS) return failure(413, 'too_long', '인터뷰 본문이 너무 길어 요약하지 않았습니다. 본문을 나눠 주세요.')

  const anthropic = new Anthropic()
  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium' },
      // 안전 분류기가 거절하면 서버가 기본 대체 모델로 같은 요청을 다시 실행한다
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `${body.name ? `졸업생: ${String(body.name).slice(0, 40)}\n\n` : ''}인터뷰 전문:\n\n${source}` }],
    })

    if (response.stop_reason === 'refusal') return failure(422, 'refused', '이 인터뷰는 자동 요약을 만들 수 없습니다. 직접 입력해 주세요.')
    const text = response.content.filter((block) => block.type === 'text').map((block) => block.text).join('\n')
    const summary = cleanSummary(text)
    if (!summary) return failure(502, 'empty_output', '요약 결과가 비어 있습니다. 다시 시도하거나 직접 입력해 주세요.')

    return NextResponse.json({
      status: 'ok',
      summary,
      model: response.model || MODEL,
      sourceHash: qnaFingerprint(qna),
      generatedAt: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return failure(503, 'not_configured', 'AI 서비스 인증에 실패했습니다. ANTHROPIC_API_KEY 값을 확인하세요.')
    if (error instanceof Anthropic.RateLimitError) return failure(429, 'rate_limited', 'AI 요청이 많아 잠시 후 다시 시도해 주세요.')
    if (error instanceof Anthropic.BadRequestError) return failure(400, 'bad_request', `AI 요청이 거절되었습니다: ${error.message}`)
    if (error instanceof Anthropic.APIError) return failure(502, 'api_error', `AI 서비스 오류(${error.status ?? '연결'}): 잠시 후 다시 시도해 주세요.`)
    return failure(500, 'failed', '요약을 만들지 못했습니다. 기존 요약은 그대로입니다.')
  }
}
