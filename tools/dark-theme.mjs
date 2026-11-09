// 다크 모드 색 변환표 만들기 → app/dark-theme.css
// 실행: node tools/dark-theme.mjs  (npm run dev · npm run build 전에 자동으로 실행된다)
//
// 화면 코드는 밝은 화면 기준 Tailwind 색 클래스(bg-white, text-slate-500, border-teal-200 …)만 쓴다.
// 이 스크립트가 코드에서 실제로 쓰는 색 클래스를 찾아, 속성별(배경·글자·선…) 변수로 나눈 뒤
//   1) 밝은 화면: Tailwind 기본값 그대로 (@theme)
//   2) 다크 모드 + 내부 화면(.ig-themed가 있는 페이지): 어두운 화면에 맞는 값
//   3) .theme-fixed 안 (색을 직접 디자인한 어두운 카드·그라데이션 카드): 밝은 화면 값 그대로
// 를 적는다. 배경과 글자를 따로 바꿀 수 있는 건 Tailwind v4가 bg-*는 --background-color-*,
// text-*는 --text-color-*를 먼저 찾기 때문이다. 공개 페이지는 .ig-themed가 없어서 늘 밝게 보인다.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import colors from 'tailwindcss/colors'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCAN = ['app', 'lib']
const OUT = path.join(ROOT, 'app', 'dark-theme.css')

const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']
const NEUTRALS = ['slate', 'gray', 'zinc', 'neutral', 'stone']
const FAMILIES = Object.keys(colors).filter((name) => typeof colors[name] === 'object')
const slate = colors.slate

// 다크 모드의 기본 바탕 (bg-white 자리)
export const SURFACE = '#0f1623'

const alpha = (color, value) => color.replace(/\)\s*$/, ` / ${value})`)

// 회색 계열: 밝은 바탕용 단계를 어두운 바탕용 단계로 뒤집는다
const NEUTRAL = {
  bg: { 50: '#151d2b', 100: '#1b2434', 200: '#243044', 300: '#304057', 400: slate[600], 500: slate[500], 600: slate[500], 700: slate[600], 800: slate[600], 900: slate[700], 950: slate[950] },
  text: { 50: '#1e2737', 100: '#2a3546', 200: '#3b475a', 300: '#536076', 400: '#7a879b', 500: '#97a3b6', 600: '#b3bdcb', 700: '#cbd4df', 800: '#e1e7ef', 900: '#eef2f7', 950: '#f8fafc' },
  border: { 50: '#172030', 100: '#1d2737', 200: '#263247', 300: '#334157', 400: '#475569', 500: '#64748b', 600: '#7a879b', 700: '#97a3b6', 800: '#cbd4df', 900: '#e1e7ef', 950: '#eef2f7' },
}

// 색 계열: 옅은 바탕은 반투명 색으로, 진한 글자는 밝은 단계로
function chromaticDark(kind, palette, shade) {
  const c = palette
  if (kind === 'bg') return { 50: alpha(c[400], 0.1), 100: alpha(c[400], 0.16), 200: alpha(c[400], 0.24), 300: alpha(c[400], 0.34), 700: c[600], 800: c[700], 900: c[800], 950: c[900] }[shade]
  if (kind === 'text') return { 500: c[400], 600: c[400], 700: c[300], 800: c[200], 900: c[100], 950: c[50] }[shade]
  if (kind === 'border') return { 50: alpha(c[400], 0.12), 100: alpha(c[400], 0.18), 200: alpha(c[400], 0.26), 300: alpha(c[400], 0.38), 400: c[500], 600: c[500], 700: c[500], 800: c[600], 900: c[700], 950: c[800] }[shade]
  if (kind === 'accent') return { 50: c[400], 100: c[400], 200: c[400], 300: c[400], 600: c[500], 700: c[500], 800: c[500], 900: c[500], 950: c[500] }[shade]
  return undefined
}

function darkValue(kind, family, shade) {
  if (family === 'white') return kind === 'text' || kind === 'accent' ? undefined : SURFACE
  if (family === 'black') return kind === 'text' ? '#f8fafc' : undefined
  if (NEUTRALS.includes(family)) return NEUTRAL[kind === 'accent' ? 'border' : kind]?.[shade]
  return chromaticDark(kind, colors[family], shade)
}

function lightValue(family, shade) {
  if (family === 'white') return colors.white
  if (family === 'black') return colors.black
  return colors[family][shade]
}

// 클래스 접두어 → Tailwind 테마 변수 이름 + 어떤 규칙으로 바꿀지
const PREFIXES = {
  bg: ['--background-color', 'bg'], from: ['--background-color', 'bg'], via: ['--background-color', 'bg'], to: ['--background-color', 'bg'],
  text: ['--text-color', 'text'], caret: ['--caret-color', 'text'],
  border: ['--border-color', 'border'], divide: ['--border-color', 'border'],
  ring: ['--ring-color', 'border'], outline: ['--outline-color', 'border'], stroke: ['--stroke', 'border'], decoration: ['--text-decoration-color', 'border'],
  fill: ['--fill', 'bg'], accent: ['--accent-color', 'accent'],
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      yield* walk(full)
    } else if (/\.(js|jsx|ts|tsx|mjs)$/.test(entry.name)) {
      yield full
    }
  }
}

const pattern = new RegExp(
  `(?<![\\w-])(bg|from|via|to|text|caret|border(?:-[xytrblse])?|divide|ring|outline|stroke|decoration|fill|accent)-(white|black|${FAMILIES.filter((name) => !['white', 'black'].includes(name)).join('|')})(?:-(${SHADES.join('|')}))?(?![\\w-])`,
  'g',
)

const used = new Map() // 변수 이름 → { kind, family, shade }
for (const folder of SCAN) {
  for (const file of walk(path.join(ROOT, folder))) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(pattern)) {
      const prefix = match[1].startsWith('border') ? 'border' : match[1]
      const family = match[2]
      const shade = match[3]
      if ((family === 'white' || family === 'black') !== !shade) continue
      const [namespace, kind] = PREFIXES[prefix]
      const name = `${namespace}-${family}${shade ? `-${shade}` : ''}`
      if (used.has(name)) continue
      const dark = darkValue(kind, family, shade)
      if (dark === undefined) continue
      used.set(name, { light: lightValue(family, shade), dark })
    }
  }
}

const names = [...used.keys()].sort()
const block = (pick) => names.map((name) => `  ${name}: ${used.get(name)[pick]};`).join('\n')

const css = `/* 자동 생성 파일 — 직접 고치지 마세요. tools/dark-theme.mjs를 고친 뒤 node tools/dark-theme.mjs 실행 */
/* 내부 화면에서 쓰는 색 클래스 ${names.length}개의 밝은 값 · 어두운 값 */

@theme {
${block('light')}
}

:root[data-theme="dark"]:has(.ig-themed) {
  color-scheme: dark;
  --background: ${SURFACE};
  --foreground: #e1e7ef;
${block('dark')}
}

:root[data-theme="dark"]:has(.ig-themed) .theme-fixed {
${block('light')}
}
`

writeFileSync(OUT, css)
console.log(`dark-theme.css: ${names.length}개 색 변수`)
