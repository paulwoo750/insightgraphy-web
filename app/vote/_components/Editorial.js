'use client'
// 평가·피드백 화면 공통 부품: 상자 대신 위아래 선과 밑줄로 나누는 편집 디자인
// (정량 평가, 정성 피드백 작성실, 발표영상 댓글이 같이 쓴다)

export const EMPTY_FEEDBACK = { originalMessage: '', insightPlus: '', insightMinus: '', graphicPlus: '', graphicMinus: '', deliveryPlus: '', deliveryMinus: '', memo: '' }

export const FEEDBACK_SECTIONS = [
  { key: 'insight', title: 'Insight', subtitle: '독창성 · 적합성', plus: 'insightPlus', minus: 'insightMinus', text: 'text-violet-700', dot: 'bg-violet-500', darkText: 'text-violet-300' },
  { key: 'graphic', title: 'Graphic', subtitle: '가독성 · 가시성', plus: 'graphicPlus', minus: 'graphicMinus', text: 'text-sky-700', dot: 'bg-sky-500', darkText: 'text-sky-300' },
  { key: 'delivery', title: 'Delivery', subtitle: '목소리 · 흐름', plus: 'deliveryPlus', minus: 'deliveryMinus', text: 'text-amber-700', dot: 'bg-amber-500', darkText: 'text-amber-300' },
]

// 주차 고르기 + 주제: 위아래 굵은 선 사이에 밑줄 탭
export function WeekRail({ weeks, week, onChange, topic, children }) {
  return (
    <section className="mb-10 border-y-2 border-rose-600 py-7 text-center">
      {children}
      <p className="text-[11px] font-black uppercase tracking-[0.25em] text-rose-500">Select Week</p>
      <div role="group" aria-label="주차 선택" className="mt-3 flex gap-x-5 gap-y-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:justify-center">
        {weeks.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={value === week}
            onClick={() => onChange(value)}
            className={`shrink-0 border-b-[3px] pb-1 text-base font-black transition sm:text-lg ${value === week ? 'border-rose-600 text-rose-700' : 'border-transparent text-slate-400 hover:text-slate-700'}`}
          >
            W{value}
          </button>
        ))}
      </div>
      <p className="mt-6 text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">W{week} Topic</p>
      <p className="mt-1 break-keep px-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{topic}</p>
    </section>
  )
}

// 발표 순서 목록: 선 없이 간격으로 나누고, 고른 대상은 왼쪽 색 막대로 표시
// items: [{ id, label, sameGroup, me, done, draft, disabled }]
export function TargetRail({ title = 'Cluster Flow', items, selectedId, onSelect, numbered = true }) {
  return (
    <nav aria-label="발표 순서" className="lg:sticky lg:top-24">
      <div className="flex items-end justify-between gap-2 pb-3">
        <h2 className="text-[11px] font-black uppercase tracking-[0.25em] text-rose-500">{title}</h2>
        <span className="text-[11px] font-bold text-slate-400"><span className="text-amber-500" aria-hidden="true">★</span> 같은 조</span>
      </div>
      <ol className="space-y-0.5">
        {items.map((item, index) => {
          const selected = item.id === selectedId
          return (
            <li key={item.id}>
              <button
                type="button"
                disabled={item.disabled}
                aria-current={selected ? 'true' : undefined}
                onClick={() => onSelect(item)}
                className={`flex w-full items-start gap-3 border-l-[3px] py-2.5 pl-3 pr-1 text-left transition ${selected ? 'border-rose-600 bg-rose-50/70' : 'border-transparent hover:border-rose-200'} disabled:cursor-not-allowed`}
              >
                {numbered && <span className={`w-5 shrink-0 pt-0.5 text-xs font-black ${selected ? 'text-rose-600' : 'text-slate-300'}`}>{String(index + 1).padStart(2, '0')}</span>}
                <span className="min-w-0 flex-1">
                  <span className={`block break-keep text-sm font-extrabold ${selected ? 'text-rose-800' : item.done ? 'text-slate-400 line-through decoration-slate-300' : item.me ? 'text-slate-400' : 'text-slate-800'}`}>
                    {item.label}
                    {item.sameGroup && <span className="ml-1 text-amber-500" title="같은 조" aria-label="같은 조">★</span>}
                  </span>
                  {(item.me || item.done || item.draft) && (
                    <span className="mt-0.5 block text-[11px] font-bold">
                      {item.me && <span className="text-sky-600">나의 발표</span>}
                      {item.done && <span className="text-emerald-600">✓ 채점 완료</span>}
                      {!item.done && item.draft && <span className="text-amber-600">✎ 임시 저장</span>}
                    </span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

// 줄 수에 맞춰 늘어나는 밑줄 입력칸
function LineInput({ marker, markerClass, lineClass, value, onChange, placeholder, label, large = false }) {
  return (
    <div className="flex items-start gap-2">
      <span className={`w-3 shrink-0 pt-2 text-sm font-black ${markerClass}`} aria-hidden="true">{marker}</span>
      <textarea
        aria-label={label}
        rows={1}
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`field-sizing-content min-h-10 w-full resize-y border-b-2 supports-[field-sizing:content]:resize-none bg-transparent py-2 leading-6 text-slate-800 outline-none transition placeholder:text-slate-300 ${large ? 'text-base font-semibold' : 'text-sm'} ${lineClass}`}
      />
    </div>
  )
}

// 핵심 메시지 + Insight/Graphic/Delivery 장단점 입력. wide면 장점·개선점을 나란히 둔다
export function FeedbackFields({ value, onChange, wide = false, messageLabel = '핵심 메시지', messagePlaceholder = '발표의 핵심 메시지', required = false }) {
  return (
    <div className="space-y-7">
      <label className="block">
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-rose-500">{messageLabel}{required && <span className="ml-1 text-rose-600">*</span>}</span>
        <input
          value={value.originalMessage || ''}
          onChange={(event) => onChange('originalMessage', event.target.value)}
          placeholder={messagePlaceholder}
          className="mt-1 w-full border-b-[3px] border-rose-200 bg-transparent py-2 text-base font-bold text-slate-900 outline-none transition placeholder:font-semibold placeholder:text-slate-300 focus:border-rose-600"
        />
      </label>
      {FEEDBACK_SECTIONS.map((section) => (
        <fieldset key={section.key}>
          <legend className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${section.dot}`} aria-hidden="true" />
            <span className={`text-sm font-black ${section.text}`}>{section.title}</span>
            <span className="text-xs font-semibold text-slate-400">{section.subtitle}</span>
          </legend>
          <div className={`mt-1 grid gap-x-6 ${wide ? 'sm:grid-cols-2' : ''}`}>
            <LineInput label={`${section.title} 장점`} marker="+" markerClass="text-emerald-500" lineClass="border-emerald-200 focus:border-emerald-500" value={value[section.plus]} onChange={(text) => onChange(section.plus, text)} placeholder="좋았던 점 · 배울 점" />
            <LineInput label={`${section.title} 개선점`} marker="−" markerClass="text-rose-500" lineClass="border-rose-200 focus:border-rose-500" value={value[section.minus]} onChange={(text) => onChange(section.minus, text)} placeholder="아쉬운 점 · 개선 아이디어" />
          </div>
        </fieldset>
      ))}
    </div>
  )
}

export const hasFeedbackContent = (data) => Boolean(data) && ['originalMessage', ...FEEDBACK_SECTIONS.flatMap((section) => [section.plus, section.minus])].some((key) => String(data[key] || '').trim())

// 읽기 전용 피드백 (댓글·임시 저장 노트). dark는 영상 아래 어두운 바탕용
export function FeedbackView({ data, dark = false }) {
  if (!data) return null
  const body = dark ? 'text-slate-200' : 'text-slate-700'
  return (
    <div className="space-y-3">
      {data.originalMessage && (
        <p className={`break-keep text-[15px] font-bold leading-7 ${dark ? 'text-white' : 'text-slate-900'}`}>
          <span className="mr-1 text-rose-400" aria-hidden="true">“</span>{data.originalMessage}<span className="ml-0.5 text-rose-400" aria-hidden="true">”</span>
        </p>
      )}
      {FEEDBACK_SECTIONS.map((section) => {
        const plus = data[section.plus]
        const minus = data[section.minus]
        if (!plus && !minus) return null
        return (
          <div key={section.key} className="grid gap-x-3 sm:grid-cols-[76px_minmax(0,1fr)]">
            <p className={`flex items-center gap-1.5 self-start pt-1 text-xs font-black ${dark ? section.darkText : section.text}`}><span className={`h-1.5 w-1.5 rounded-full ${section.dot}`} aria-hidden="true" />{section.title}</p>
            <div className="space-y-1">
              {plus && <p className={`whitespace-pre-wrap break-keep text-sm leading-6 ${body}`}><span className="mr-1.5 font-black text-emerald-500" aria-label="장점">+</span>{plus}</p>}
              {minus && <p className={`whitespace-pre-wrap break-keep text-sm leading-6 ${body}`}><span className="mr-1.5 font-black text-rose-500" aria-label="개선점">−</span>{minus}</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// 이름 첫 글자 동그라미. 이름마다 색이 정해진다
const AVATAR_TONES = ['bg-rose-100 text-rose-700', 'bg-violet-100 text-violet-700', 'bg-sky-100 text-sky-700', 'bg-amber-100 text-amber-800', 'bg-emerald-100 text-emerald-700', 'bg-teal-100 text-teal-700', 'bg-indigo-100 text-indigo-700']
export function Avatar({ name = '', className = '' }) {
  const text = String(name || '?')
  const hash = [...text].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black ${AVATAR_TONES[hash % AVATAR_TONES.length]} ${className}`} aria-hidden="true">{text.trim().slice(0, 1) || '?'}</span>
}
