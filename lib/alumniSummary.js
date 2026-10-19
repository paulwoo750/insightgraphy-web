// 알럼나이 인터뷰 한 줄 요약 공통 규칙 (관리자 화면과 서버 API가 함께 쓴다)

export const SUMMARY_MIN = 40
export const SUMMARY_MAX = 80

export function normalizeQna(qna) {
  return (Array.isArray(qna) ? qna : [])
    .map((item) => ({ question: String(item?.question || '').trim(), answer: String(item?.answer || '').trim() }))
    .filter((item) => item.question || item.answer)
}

// 인터뷰 본문 지문. 요약을 만든 뒤 본문이 바뀌었는지 알아보는 데 쓴다 (보안 용도 아님).
export function qnaFingerprint(qna) {
  const text = JSON.stringify(normalizeQna(qna))
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `v1-${text.length}-${hash.toString(16)}`
}

export function qnaToText(qna) {
  return normalizeQna(qna).map((item, index) => `질문 ${index + 1}: ${item.question}\n답변 ${index + 1}: ${item.answer}`).join('\n\n')
}

// 모델 출력에서 한 문장만 남긴다 (따옴표·줄바꿈 제거)
export function cleanSummary(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)
    ?.replace(/^["'“”‘’「」『』\s]+|["'“”‘’「」『』\s]+$/g, '')
    .trim() || ''
}

export function summaryLengthNote(text) {
  const length = [...String(text || '')].length
  if (!length) return ''
  if (length < SUMMARY_MIN) return `${length}자 · 조금 짧습니다 (권장 ${SUMMARY_MIN}~${SUMMARY_MAX}자)`
  if (length > SUMMARY_MAX) return `${length}자 · 조금 깁니다 (권장 ${SUMMARY_MIN}~${SUMMARY_MAX}자)`
  return `${length}자`
}
