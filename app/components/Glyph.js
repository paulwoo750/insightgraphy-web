// 인사이트그래피 아이콘 세트 (이모지 대신 쓰는 SVG)
// - 24px 격자, 1.75px 선, 둥근 끝. 색은 글자색(currentColor)을 따라가서 밝은·어두운 화면 모두 맞는다.
// - 크기는 기본 1em: 이모지가 있던 자리의 글자 크기(text-2xl 등)를 그대로 따른다.
// - duo: 면을 옅게 채운 두 톤 버전 (머리말 타일·빈 화면처럼 큰 자리에 쓴다)
// 쓰는 법: <Glyph name="trophy" />, <Glyph name="mic" className="h-4 w-4 text-teal-700" />

const ICONS = {
  // ---------------------------------------------------------------- 자료·제출
  proposal: { duo: <path d="M6 3h8l4 4v14H6z" />, line: <><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4" /><path d="M9 11.5h6M9 15h6M9 8h2.5" /></> },
  slide: { duo: <rect x="3" y="4" width="18" height="12" rx="1.5" />, line: <><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M12 16v4M8.5 20h7" /><path d="M7 12.5l3-3 2.5 2 4-4" /></> },
  video: { duo: <rect x="3" y="6" width="13" height="12" rx="2" />, line: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10.5l5-3v9l-5-3" /></> },
  clapper: { duo: <path d="M4 10h16v10H4z" />, line: <><path d="M4 10h16v10H4z" /><path d="M4 10l-.6-3.6 15.8-2.6.6 3.6" /><path d="M8.2 5.7l2.4 3.4M13.2 4.9l2.4 3.4" /></> },
  image: { duo: <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />, line: <><rect x="3.5" y="4.5" width="17" height="15" rx="1.5" /><circle cx="9" cy="9.5" r="1.6" /><path d="M4 17.5l5-4.5 3.5 3 3-2.5 4.5 4" /></> },
  folder: { duo: <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" />, line: <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6H9l2 2h8.5A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" /> },
  books: { duo: <path d="M5 4h3.5v16H5zM10.5 4H14v16h-3.5z" />, line: <><path d="M5 4h3.5v16H5zM10.5 4H14v16h-3.5z" /><path d="M15.6 5.2l3-.8 3.4 14.8-3 .8z" /><path d="M5 8h3.5M10.5 8H14" /></> },
  box: { duo: <path d="M3.5 7.5L12 3.5l8.5 4v9L12 20.5l-8.5-4z" />, line: <><path d="M3.5 7.5L12 3.5l8.5 4v9L12 20.5l-8.5-4z" /><path d="M3.5 7.5L12 11.5l8.5-4M12 11.5v9" /></> },
  notebook: { duo: <rect x="5.5" y="3.5" width="13" height="17" rx="1.5" />, line: <><rect x="5.5" y="3.5" width="13" height="17" rx="1.5" /><path d="M9 3.5v17" /><path d="M12 8h3.5M12 11h3.5" /></> },
  pen: { duo: <path d="M4.5 19.5l1-4.2L15.6 5.2a2.1 2.1 0 0 1 3 3L8.5 18.3z" />, line: <><path d="M4.5 19.5l1-4.2L15.6 5.2a2.1 2.1 0 0 1 3 3L8.5 18.3z" /><path d="M13.6 7.2l3 3" /></> },
  rulebook: { duo: <path d="M6 4h11.5v16H7.5A1.5 1.5 0 0 1 6 18.5z" />, line: <><path d="M17.5 4H7.5A1.5 1.5 0 0 0 6 5.5v13A1.5 1.5 0 0 0 7.5 20h10z" /><path d="M6 17h11.5" /><path d="M9.5 8h4.5M9.5 11h4.5" /></> },
  scroll: { duo: <path d="M7 4h11v13a3 3 0 0 1-3 3H7z" />, line: <><path d="M15 20H6a3 3 0 0 1-3-3v-1h9v1a3 3 0 0 0 3 3 3 3 0 0 0 3-3V4H7v12" /><path d="M10 8h5M10 11.5h5" /></> },

  // ---------------------------------------------------------------- 소통·평가
  chat: { duo: <path d="M4 5h16v10.5H10L5.5 19v-3.5H4z" />, line: <><path d="M4 5h16v10.5H10L5.5 19v-3.5H4z" /><path d="M8 9h8M8 12h5" /></> },
  voice: { duo: <path d="M4 9.5h3l5-4v13l-5-4H4z" />, line: <><path d="M4 9.5h3l5-4v13l-5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" /></> },
  mirror: { duo: <ellipse cx="12" cy="10" rx="5.5" ry="7" />, line: <><ellipse cx="12" cy="10" rx="5.5" ry="7" /><path d="M12 17v4M9 21h6" /><path d="M9.8 8.2l2.6-2.4M10.3 11.2l4.2-3.9" /></> },
  ballot: { duo: <path d="M4 12h16v8H4z" />, line: <><path d="M4 12h16v8H4zM3 12h18" /><path d="M8 12V4.5h8V12" /><path d="M10 8.2l1.5 1.5 2.7-2.9" /></> },
  chart: { duo: <path d="M4 20V4h16v16z" opacity="0" />, line: <><path d="M4 4v16h16" /><path d="M7.5 15l4-4 3 3 5-6" /><path d="M16 8h3.5v3.5" /></> },
  trend: { duo: <path d="M3.5 17l6-6 4 4 7-7v12h-17z" />, line: <><path d="M3.5 17l6-6 4 4 7-7" /><path d="M15 8h5.5v5.5" /></> },
  sprout: { duo: <path d="M12 12c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5z" />, line: <><path d="M12 21v-9" /><path d="M12 12c0-4 3-6.5 7-6.5 0 4-3 6.5-7 6.5zM12 14.5c0-3-2.3-5-5.5-5 0 3 2.3 5 5.5 5z" /></> },
  bulb: { duo: <path d="M8.5 14.5a6 6 0 1 1 7 0V17h-7z" />, line: <><path d="M8.5 14.5a6 6 0 1 1 7 0V17h-7z" /><path d="M9.5 20h5M10.5 17v-3l1.5-1.5 1.5 1.5v3" /></> },
  palette: { duo: <path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-.9 2-1.9 0-1.3-1-1.6-1-2.8 0-1 .8-1.8 1.8-1.8H17a3.5 3.5 0 0 0 3.5-3.5c0-3.9-3.8-7-8.5-7z" />, line: <><path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-.9 2-1.9 0-1.3-1-1.6-1-2.8 0-1 .8-1.8 1.8-1.8H17a3.5 3.5 0 0 0 3.5-3.5c0-3.9-3.8-7-8.5-7z" /><circle cx="7.8" cy="11" r="1" /><circle cx="10.5" cy="7.5" r="1" /><circle cx="15" cy="7.8" r="1" /></> },
  mic: { duo: <rect x="9" y="3" width="6" height="11" rx="3" />, line: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" /></> },
  handshake: { duo: <path d="M3 8.5l4-2 5 2 5-2 4 2v6l-9 5.5L3 14.5z" />, line: <><path d="M3 8.5l4-2 3.5 1.4M21 8.5l-4-2-6.5 2.7a1.5 1.5 0 0 0 1.2 2.7l2.3-.9 4 3.6" /><path d="M3 8.5v6l2 1.5M21 8.5v6l-3 2.2" /><path d="M7.5 15.5l2 1.6M10 13.5l3 2.7M12.5 18l1.5 1.2" /></> },

  // ---------------------------------------------------------------- 사람·역할
  person: { duo: <circle cx="12" cy="8" r="3.5" />, line: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></> },
  users: { duo: <circle cx="9" cy="8.5" r="3" />, line: <><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8" /><path d="M15 5.8a3 3 0 0 1 0 5.6M17 14.4c1.9.5 3.1 2 3.5 4.6" /></> },
  graduate: { duo: <path d="M2.5 9L12 4.5 21.5 9 12 13.5z" />, line: <><path d="M2.5 9L12 4.5 21.5 9 12 13.5z" /><path d="M6.5 11v4.5c1.5 1.5 3.5 2.2 5.5 2.2s4-.7 5.5-2.2V11" /><path d="M21.5 9v5" /></> },
  crown: { duo: <path d="M4 8l4 3.5L12 5l4 6.5L20 8l-1.5 10h-13z" />, line: <><path d="M4 8l4 3.5L12 5l4 6.5L20 8l-1.5 10h-13z" /><path d="M6 21h12" /></> },
  wrench: { duo: <path d="M14.5 4.2a4.5 4.5 0 0 0-5 6l-5.3 5.3a1.8 1.8 0 0 0 2.5 2.5l5.3-5.3a4.5 4.5 0 0 0 6-5l-2.7 2.7-2.4-.4-.4-2.4z" />, line: <path d="M14.5 4.2a4.5 4.5 0 0 0-5 6l-5.3 5.3a1.8 1.8 0 0 0 2.5 2.5l5.3-5.3a4.5 4.5 0 0 0 6-5l-2.7 2.7-2.4-.4-.4-2.4z" /> },
  compass: { duo: <circle cx="12" cy="12" r="8.5" />, line: <><circle cx="12" cy="12" r="8.5" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></> },
  grid: { duo: <path d="M4 4h7v7H4zM13 13h7v7h-7z" />, line: <><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></> },
  eye: { duo: <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />, line: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></> },
  wave: { duo: <circle cx="12" cy="12" r="8.5" />, line: <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" /><path d="M9 9.5v.5M15 9.5v.5" /></> },

  // ---------------------------------------------------------------- 장소·시간
  home: { duo: <path d="M6 9.5L12 4.5l6 5V20H6z" />, line: <><path d="M4 10.5L12 4l8 6.5" /><path d="M6 9v11h12V9" /><path d="M10 20v-5h4v5" /></> },
  pin: { duo: <path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z" />, line: <><path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21z" /><circle cx="12" cy="9.8" r="2.4" /></> },
  calendar: { duo: <path d="M3.5 5h17v4.5h-17z" />, line: <><rect x="3.5" y="5" width="17" height="15" rx="1.5" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /><path d="M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2" /></> },
  clock: { duo: <circle cx="12" cy="12" r="8.5" />, line: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></> },
  alarm: { duo: <circle cx="12" cy="13" r="7.5" />, line: <><circle cx="12" cy="13" r="7.5" /><path d="M12 9.5V13l2.5 1.5" /><path d="M4 5.5l2.5-2M20 5.5l-2.5-2" /></> },
  hourglass: { duo: <path d="M8 3.5h8c0 4-4 5.5-4 8.5 0-3-4-4.5-4-8.5z" />, line: <><path d="M7 3.5h10M7 20.5h10" /><path d="M8 3.5c0 4 4 5.5 4 8.5s-4 4.5-4 8.5M16 3.5c0 4-4 5.5-4 8.5s4 4.5 4 8.5" /></> },
  sun: { duo: <circle cx="12" cy="12" r="4" />, line: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></> },
  moon: { duo: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />, line: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" /> },

  // ---------------------------------------------------------------- 상·기록
  trophy: { duo: <path d="M8 4h8v5a4 4 0 0 1-8 0z" />, line: <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5v1.5a3 3 0 0 0 3 3M16 6h3v1.5a3 3 0 0 1-3 3" /><path d="M12 13v3.5M8.5 20h7M10 20l.4-3.5h3.2L14 20" /></> },
  medal: { duo: <circle cx="12" cy="15" r="5" />, line: <><circle cx="12" cy="15" r="5" /><path d="M8.6 3.5l2.4 6.6M15.4 3.5L13 10.1M8 3.5h8" /><path d="M12 12.8l.7 1.4 1.5.2-1.1 1 .3 1.5-1.4-.7-1.4.7.3-1.5-1.1-1 1.5-.2z" /></> },
  star: { duo: <path d="M12 3.8l2.5 5.2 5.7.7-4.2 3.9 1.1 5.6L12 16.4l-5.1 2.8 1.1-5.6-4.2-3.9 5.7-.7z" />, line: <path d="M12 3.8l2.5 5.2 5.7.7-4.2 3.9 1.1 5.6L12 16.4l-5.1 2.8 1.1-5.6-4.2-3.9 5.7-.7z" /> },
  sparkle: { duo: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />, line: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></> },
  stage: { duo: <path d="M3 4h18c-1 5-3.5 8-6 9H9C6.5 12 4 9 3 4z" />, line: <><path d="M3 4h18M3 20h18" /><path d="M4 4c.5 5 2.5 8.5 5 9.5M20 4c-.5 5-2.5 8.5-5 9.5" /><path d="M9 13.5V20M15 13.5V20" /></> },
  flag: { duo: <path d="M5 4h12l-2 4 2 4H5z" />, line: <><path d="M5 21V4h12l-2 4 2 4H5" /></> },
  check: { duo: <circle cx="12" cy="12" r="8.5" />, line: <><circle cx="12" cy="12" r="8.5" /><path d="M8 12.3l2.7 2.7L16 9.5" /></> },
  money: { duo: <rect x="3" y="6.5" width="18" height="11" rx="1.5" />, line: <><rect x="3" y="6.5" width="18" height="11" rx="1.5" /><circle cx="12" cy="12" r="2.5" /><path d="M6.5 9.5v5M17.5 9.5v5" /></> },
  dashboard: { duo: <path d="M4 4h7v9H4zM13 11h7v9h-7z" />, line: <><rect x="4" y="4" width="7" height="9" rx="1" /><rect x="13" y="4" width="7" height="5" rx="1" /><rect x="13" y="11" width="7" height="9" rx="1" /><rect x="4" y="15" width="7" height="5" rx="1" /></> },

  // ---------------------------------------------------------------- 알림·안내
  envelope: { duo: <rect x="3" y="5.5" width="18" height="13" rx="1.5" />, line: <><rect x="3" y="5.5" width="18" height="13" rx="1.5" /><path d="M3.5 6.5l8.5 6.5 8.5-6.5" /></> },
  inbox: { duo: <path d="M3.5 13.5L6 5.5h12l2.5 8v5h-17z" />, line: <><path d="M3.5 13.5L6 5.5h12l2.5 8v5h-17z" /><path d="M3.5 13.5h5l1 2h5l1-2h5" /></> },
  bell: { duo: <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />, line: <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></> },
  phone: { duo: <rect x="7" y="3" width="10" height="18" rx="2" />, line: <><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 18h2" /></> },
  download: { duo: <path d="M4.5 19.5h15" opacity="0" />, line: <><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" /><path d="M4.5 19.5h15" /></> },
  search: { duo: <circle cx="11" cy="11" r="6.5" />, line: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></> },
  lifebuoy: { duo: <path d="M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zm0 5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" fillRule="evenodd" />, line: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.5" /><path d="M6 6l3.5 3.5M18 6l-3.5 3.5M6 18l3.5-3.5M18 18l-3.5-3.5" /></> },
  alert: { duo: <path d="M12 4L2.8 19.5h18.4z" />, line: <><path d="M12 4L2.8 19.5h18.4z" /><path d="M12 10v4.5M12 17.2v.1" /></> },
  lock: { duo: <rect x="5" y="10.5" width="14" height="10" rx="1.5" />, line: <><rect x="5" y="10.5" width="14" height="10" rx="1.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5V17" /></> },
  link: { duo: <path d="M8 8h8v8H8z" opacity="0" />, line: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></> },
  toolbox: { duo: <rect x="3.5" y="8" width="17" height="11" rx="1.5" />, line: <><rect x="3.5" y="8" width="17" height="11" rx="1.5" /><path d="M9 8V5.5h6V8M3.5 12.5h17M10 11v3M14 11v3" /></> },
  pinned: { duo: <path d="M9 3.5h6l-1 5 3 3H7l3-3z" />, line: <><path d="M9 3.5h6l-1 5 3 3H7l3-3z" /><path d="M12 11.5V20" /></> },
}

export const GLYPH_NAMES = Object.keys(ICONS)

export default function Glyph({ name, className = '', duo = false, strokeWidth = 1.75, title, ...props }) {
  const icon = ICONS[name]
  if (!icon) return null
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block shrink-0 align-[-0.125em] ${className}`}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      {...props}
    >
      {title && <title>{title}</title>}
      {duo && <g fill="currentColor" stroke="none" opacity="0.16">{icon.duo}</g>}
      {icon.line}
    </svg>
  )
}

// 순위 메달 (1·2·3위). 금·은·동 색을 직접 칠한 SVG
const MEDAL_COLORS = {
  1: { ribbon: '#0f766e', face: '#fbbf24', edge: '#b45309', text: '#78350f' },
  2: { ribbon: '#334155', face: '#e2e8f0', edge: '#64748b', text: '#1e293b' },
  3: { ribbon: '#7c2d12', face: '#fdba74', edge: '#c2410c', text: '#7c2d12' },
}

export function RankMedal({ rank, className = '', title }) {
  const color = MEDAL_COLORS[rank]
  if (!color) return null
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" className={`inline-block shrink-0 align-[-0.125em] ${className}`} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <path d="M7.2 2.5h3.6l2.4 6.6-3.6 1.3z" fill={color.ribbon} />
      <path d="M16.8 2.5h-3.6l-2.4 6.6 3.6 1.3z" fill={color.ribbon} opacity="0.8" />
      <circle cx="12" cy="15" r="6.5" fill={color.face} stroke={color.edge} strokeWidth="1.25" />
      <circle cx="12" cy="15" r="4.6" fill="none" stroke={color.edge} strokeWidth="0.75" opacity="0.6" />
      <text x="12" y="17.6" textAnchor="middle" fontSize="7.5" fontWeight="800" fontFamily="Arial, Helvetica, sans-serif" fill={color.text}>{rank}</text>
    </svg>
  )
}

// 평가표 카테고리 아이콘: 운영진이 넣은 이모지를 같은 뜻의 아이콘으로 바꿔 보여 준다
const CATEGORY_GLYPHS = { '💡': 'bulb', '🎨': 'palette', '🎤': 'mic', '🗣️': 'voice', '🗣': 'voice', '🤝': 'handshake', '📌': 'pinned', '📊': 'chart', '📈': 'chart', '✨': 'sparkle', '⭐': 'star', '🏆': 'trophy', '📝': 'proposal', '🖼️': 'image', '🎬': 'clapper' }
const CATEGORY_TITLES = [[/인사이트|insight/i, 'bulb'], [/그래픽|graphic/i, 'palette'], [/딜리버리|delivery|전달/i, 'mic'], [/상호|보완|팀/i, 'handshake'], [/종합/, 'star']]

export function categoryGlyph(category) {
  const icon = String(category?.icon || '').trim()
  if (CATEGORY_GLYPHS[icon]) return CATEGORY_GLYPHS[icon]
  if (ICONS[icon]) return icon
  return CATEGORY_TITLES.find(([pattern]) => pattern.test(String(category?.title || '')))?.[1] || null
}
