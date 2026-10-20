// 화면 색 테마. 학회원 공간은 메뉴(섹션)별, 관리자 공간은 메뉴 묶음별로 색과 이모지를 정한다.
// Tailwind가 쓰지 않는 클래스로 판단해 지우지 않도록 클래스는 모두 전체 문자열로 적는다.

export const TONES = {
  teal: {
    hero: 'from-teal-50 via-emerald-50/40 to-white', border: 'border-teal-100', accent: 'text-teal-700', tile: 'bg-gradient-to-br from-teal-500 to-emerald-500 text-white',
    pill: 'bg-teal-600 text-white shadow-sm shadow-teal-600/30', soft: 'bg-teal-50 text-teal-800 ring-teal-200', dot: 'bg-teal-500', blobA: 'fill-teal-200', blobB: 'fill-emerald-200', line: 'stroke-teal-300', bar: 'from-teal-500 to-emerald-400', hover: 'hover:bg-teal-50 hover:text-teal-800', iconTile: 'bg-teal-100 text-teal-700',
  },
  violet: {
    hero: 'from-violet-50 via-fuchsia-50/40 to-white', border: 'border-violet-100', accent: 'text-violet-700', tile: 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white',
    pill: 'bg-violet-600 text-white shadow-sm shadow-violet-600/30', soft: 'bg-violet-50 text-violet-800 ring-violet-200', dot: 'bg-violet-500', blobA: 'fill-violet-200', blobB: 'fill-fuchsia-200', line: 'stroke-violet-300', bar: 'from-violet-500 to-fuchsia-400', hover: 'hover:bg-violet-50 hover:text-violet-800', iconTile: 'bg-violet-100 text-violet-700',
  },
  sky: {
    hero: 'from-sky-50 via-cyan-50/40 to-white', border: 'border-sky-100', accent: 'text-sky-700', tile: 'bg-gradient-to-br from-sky-500 to-cyan-500 text-white',
    pill: 'bg-sky-600 text-white shadow-sm shadow-sky-600/30', soft: 'bg-sky-50 text-sky-800 ring-sky-200', dot: 'bg-sky-500', blobA: 'fill-sky-200', blobB: 'fill-cyan-200', line: 'stroke-sky-300', bar: 'from-sky-500 to-cyan-400', hover: 'hover:bg-sky-50 hover:text-sky-800', iconTile: 'bg-sky-100 text-sky-700',
  },
  amber: {
    hero: 'from-amber-50 via-orange-50/40 to-white', border: 'border-amber-100', accent: 'text-amber-700', tile: 'bg-gradient-to-br from-amber-400 to-orange-500 text-white',
    pill: 'bg-amber-500 text-white shadow-sm shadow-amber-500/30', soft: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-500', blobA: 'fill-amber-200', blobB: 'fill-orange-200', line: 'stroke-amber-300', bar: 'from-amber-500 to-orange-400', hover: 'hover:bg-amber-50 hover:text-amber-800', iconTile: 'bg-amber-100 text-amber-700',
  },
  rose: {
    hero: 'from-rose-50 via-pink-50/40 to-white', border: 'border-rose-100', accent: 'text-rose-700', tile: 'bg-gradient-to-br from-rose-500 to-pink-500 text-white',
    pill: 'bg-rose-600 text-white shadow-sm shadow-rose-600/30', soft: 'bg-rose-50 text-rose-800 ring-rose-200', dot: 'bg-rose-500', blobA: 'fill-rose-200', blobB: 'fill-pink-200', line: 'stroke-rose-300', bar: 'from-rose-500 to-pink-400', hover: 'hover:bg-rose-50 hover:text-rose-800', iconTile: 'bg-rose-100 text-rose-700',
  },
  indigo: {
    hero: 'from-indigo-50 via-blue-50/40 to-white', border: 'border-indigo-100', accent: 'text-indigo-700', tile: 'bg-gradient-to-br from-indigo-500 to-blue-500 text-white',
    pill: 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30', soft: 'bg-indigo-50 text-indigo-800 ring-indigo-200', dot: 'bg-indigo-500', blobA: 'fill-indigo-200', blobB: 'fill-blue-200', line: 'stroke-indigo-300', bar: 'from-indigo-500 to-blue-400', hover: 'hover:bg-indigo-50 hover:text-indigo-800', iconTile: 'bg-indigo-100 text-indigo-700',
  },
  emerald: {
    hero: 'from-emerald-50 via-lime-50/40 to-white', border: 'border-emerald-100', accent: 'text-emerald-700', tile: 'bg-gradient-to-br from-emerald-500 to-lime-500 text-white',
    pill: 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30', soft: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500', blobA: 'fill-emerald-200', blobB: 'fill-lime-200', line: 'stroke-emerald-300', bar: 'from-emerald-500 to-lime-400', hover: 'hover:bg-emerald-50 hover:text-emerald-800', iconTile: 'bg-emerald-100 text-emerald-700',
  },
}

export function toneOf(key) {
  return TONES[key] || TONES.teal
}

// 학회원 화면: 주소 → 섹션 색·이모지
const MEMBER_PAGES = [
  { prefix: '/dashboard/proposal', tone: 'violet', emoji: '📝' },
  { prefix: '/dashboard/slide', tone: 'violet', emoji: '🖥️' },
  { prefix: '/dashboard/video', tone: 'violet', emoji: '🎬' },
  { prefix: '/dashboard', tone: 'violet', emoji: '🗂️' },
  { prefix: '/archive/absence', tone: 'amber', emoji: '✉️' },
  { prefix: '/archive', tone: 'indigo', emoji: '📚' },
  { prefix: '/attendance', tone: 'emerald', emoji: '📍' },
  { prefix: '/vote/score', tone: 'rose', emoji: '🗳️' },
  { prefix: '/vote/feedback', tone: 'rose', emoji: '💬' },
  { prefix: '/vote/results/my', tone: 'rose', emoji: '📈' },
  { prefix: '/vote/results/arxiv', tone: 'rose', emoji: '🌱' },
  { prefix: '/vote/results/ranking', tone: 'amber', emoji: '🏆' },
  { prefix: '/vote', tone: 'rose', emoji: '🗳️' },
  { prefix: '/mypage', tone: 'sky', emoji: '🙋' },
  { prefix: '/home', tone: 'teal', emoji: '🏠' },
]

export function memberThemeFor(pathname = '') {
  const page = MEMBER_PAGES.find((item) => pathname.startsWith(item.prefix))
  return { ...toneOf(page?.tone), toneKey: page?.tone || 'teal', emoji: page?.emoji || '✨' }
}

// 관리자 화면: 메뉴 묶음 → 색, 주소 → 이모지
export const ADMIN_GROUP_TONES = { '운영 기준': 'teal', '학회원 시스템': 'violet', '외부 사이트': 'sky', '정책 및 시스템': 'amber' }

const ADMIN_EMOJI = [
  ['/admin/hub/semesters', '🗓️'], ['/admin/hub/members', '👥'], ['/admin/hub/schedule', '📅'],
  ['/admin/hub/dashboard', '🗂️'], ['/admin/hub/archive', '📦'], ['/admin/hub/vote', '🗳️'], ['/admin/hub/absence', '✉️'],
  ['/admin/hub/attendance', '✅'], ['/admin/hub/fine', '💸'], ['/admin/hub/landing', '🏠'], ['/admin/hub/about', '💬'],
  ['/admin/hub/activities', '🎤'], ['/admin/hub/showcase', '🖼️'], ['/admin/hub/join', '📮'], ['/admin/hub/rules-doc', '📜'],
  ['/admin/hub/rules', '📏'], ['/admin/hub/access', '🔐'], ['/admin/hub/records', '🔗'], ['/admin/hub/reset', '🧰'], ['/admin/hub', '📊'],
]

export function adminEmojiFor(pathname = '') {
  return ADMIN_EMOJI.find(([prefix]) => pathname.startsWith(prefix))?.[1] || '✨'
}
