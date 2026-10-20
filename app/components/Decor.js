// 제목 영역 뒤에 까는 장식 SVG (색은 테마 클래스로 바꾼다). 읽기 보조 기기에는 숨긴다.
export function HeroDecoration({ theme, className = '' }) {
  return (
    <svg className={`pointer-events-none absolute -right-8 -top-10 h-56 w-80 opacity-80 ${className}`} viewBox="0 0 320 220" fill="none" aria-hidden="true">
      <circle cx="230" cy="70" r="70" className={theme.blobA} opacity="0.55" />
      <circle cx="150" cy="150" r="46" className={theme.blobB} opacity="0.5" />
      <circle cx="290" cy="170" r="28" className={theme.blobA} opacity="0.4" />
      <path d="M40 180 C 100 120, 160 210, 230 140 S 320 120, 320 60" className={theme.line} strokeWidth="2" strokeDasharray="5 7" strokeLinecap="round" />
      {[0, 1, 2, 3, 4].map((row) => [0, 1, 2, 3, 4, 5].map((column) => (
        <circle key={`${row}-${column}`} cx={60 + column * 16} cy={30 + row * 16} r="1.8" className={theme.blobA} />
      )))}
      <path d="M262 22 l4 9 9 4 -9 4 -4 9 -4 -9 -9 -4 9 -4z" className={theme.blobB} />
      <path d="M118 96 l3 6 6 3 -6 3 -3 6 -3 -6 -6 -3 6 -3z" className={theme.blobA} />
    </svg>
  )
}

// 빈 상태 그림 (상자와 반짝임)
export function EmptyIllustration({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 120 90" fill="none" aria-hidden="true">
      <ellipse cx="60" cy="80" rx="38" ry="6" className="fill-slate-100" />
      <path d="M28 38 L60 26 L92 38 L92 70 L60 82 L28 70 Z" className="fill-teal-50 stroke-teal-300" strokeWidth="2" strokeLinejoin="round" />
      <path d="M28 38 L60 50 L92 38 M60 50 L60 82" className="stroke-teal-300" strokeWidth="2" strokeLinejoin="round" />
      <path d="M28 38 L18 28 L50 16 L60 26" className="fill-violet-50 stroke-violet-300" strokeWidth="2" strokeLinejoin="round" />
      <path d="M92 38 L102 28 L70 16 L60 26" className="fill-sky-50 stroke-sky-300" strokeWidth="2" strokeLinejoin="round" />
      <path d="M100 8 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" className="fill-amber-300" />
      <path d="M16 52 l1.5 3.5 3.5 1.5 -3.5 1.5 -1.5 3.5 -1.5 -3.5 -3.5 -1.5 3.5 -1.5z" className="fill-rose-300" />
    </svg>
  )
}
