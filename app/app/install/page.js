'use client'
// 앱 설치·권한 안내 (안드로이드 / 아이폰). 로그인 없이 볼 수 있다.
// #install 설치 · #location 위치 권한 · #notifications 알림 · #trouble 문제 해결
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Copy, Download, EllipsisVertical, MapPin, Share, SquarePlus } from 'lucide-react'
import { inAppBrowser, isStandalone, platformOf } from '@/lib/push'

const APP_URL = 'https://insightgraphy.org/app'
const CHROME_INTENT = 'intent://insightgraphy.org/app#Intent;scheme=https;package=com.android.chrome;end'

export default function InstallGuide() {
  const [env, setEnv] = useState(null)
  const [tab, setTab] = useState(null)
  const [promptEvent, setPromptEvent] = useState(null)
  const [installed, setInstalled] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      const platform = platformOf()
      setEnv({ platform, inApp: inAppBrowser(), standalone: isStandalone() })
      setTab((current) => current || (platform === 'ios' ? 'ios' : 'android'))
    }, 0)
    // 안드로이드 크롬: 설치 창을 버튼으로 띄울 수 있다
    function onPrompt(event) {
      event.preventDefault()
      setPromptEvent(event)
    }
    function onInstalled() {
      setInstalled(true)
      setPromptEvent(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function install() {
    if (!promptEvent) return
    promptEvent.prompt()
    const choice = await promptEvent.userChoice
    if (choice?.outcome === 'accepted') setInstalled(true)
    setPromptEvent(null)
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(APP_URL)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  if (!env || !tab) return <div className="py-20 text-center text-sm text-slate-400">불러오는 중…</div>

  return (
    <div>
      <div className="mb-4 mt-1">
        <p className="text-sm font-bold text-teal-700">📱 휴대폰 앱 설치 안내</p>
        <h1 className="text-2xl font-black tracking-tight text-slate-950">홈 화면에 설치하고<br />출석·알림을 받아요</h1>
        <p className="mt-1 break-keep text-sm text-slate-500">앱스토어 없이 웹사이트를 홈 화면에 설치하는 방식이에요. 한 번 설치하면 아이콘을 눌러 바로 열 수 있어요.</p>
      </div>

      {env.standalone && <Notice tone="emerald">✅ 지금 설치한 앱으로 보고 있어요. 아래에서 알림·위치 권한만 확인하면 돼요.</Notice>}
      {env.inApp && (
        <Notice tone="amber">
          <b>{env.inApp} 안에서 열려 있어요.</b> 여기서는 설치·알림이 안 돼요.{' '}
          {env.platform === 'android'
            ? <><a href={CHROME_INTENT} className="font-bold underline">크롬으로 열기</a> 를 누르거나, 오른쪽 위 ⋮ → <b>다른 브라우저로 열기</b>를 눌러 주세요.</>
            : <>오른쪽 아래 <b>⋯</b>(또는 공유) → <b>Safari로 열기</b>를 눌러 주세요.</>}
        </Notice>
      )}

      <div role="tablist" aria-label="휴대폰 종류" className="sticky top-14 z-30 -mx-4 mb-2 flex gap-1 bg-white/95 px-4 py-2 backdrop-blur">
        {[{ key: 'android', label: '🤖 안드로이드' }, { key: 'ios', label: '🍎 아이폰' }].map((item) => (
          <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} onClick={() => setTab(item.key)} className={`flex-1 rounded-full py-2.5 text-sm font-black transition ${tab === item.key ? 'bg-teal-700 text-white' : 'bg-teal-50 text-teal-800'}`}>
            {item.label}{env.platform === item.key ? ' · 내 폰' : ''}
          </button>
        ))}
      </div>

      {tab === 'android' ? (
        <>
          <Section id="install" title="1. 설치하기" emoji="⬇️">
            <Step n={1}><b>크롬</b>(또는 삼성 인터넷)으로 <Url /> 을 열어요. 카카오톡에서 눌렀다면 오른쪽 위 ⋮ → <b>다른 브라우저로 열기</b>.</Step>
            {promptEvent && !installed && (
              <button type="button" onClick={install} className="my-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 py-4 text-base font-black text-white shadow-lg shadow-teal-900/20"><Download className="h-5 w-5" aria-hidden="true" />지금 앱 설치하기</button>
            )}
            {installed && <Notice tone="emerald">설치됐어요! 홈 화면의 <b>인사이트그래피</b> 아이콘으로 열어 주세요.</Notice>}
            <Step n={2}>설치 버튼이 안 보이면 크롬 오른쪽 위 <Glyph icon={EllipsisVertical} /> 메뉴 → <b>앱 설치</b> (또는 <b>홈 화면에 추가</b> → <b>설치</b>).</Step>
            <Step n={3}>삼성 인터넷은 아래 <b>≡</b> 메뉴 → <b>현재 페이지 추가</b> → <b>홈 화면</b>.</Step>
            <Step n={4}>홈 화면·앱 목록에 생긴 <b>인사이트그래피</b> 아이콘을 눌러 열고 로그인해요.</Step>
          </Section>

          <Section id="notifications" title="2. 알림 켜기" emoji="🔔">
            <Step n={1}>앱 첫 화면의 <b>알림 켜기</b>(또는 <b>내 정보 → 알림</b>)를 누르고 <b>허용</b>을 눌러요.</Step>
            <Step n={2}>실수로 차단했다면: 휴대폰 <b>설정 → 애플리케이션 → 인사이트그래피</b>(없으면 <b>Chrome</b>) <b>→ 알림 → 허용</b>.</Step>
            <Step n={3}>그래도 안 오면 <b>설정 → 배터리 → 백그라운드 사용 제한</b>에서 Chrome을 <b>제한 없음</b>으로 바꿔 주세요.</Step>
          </Section>

          <Section id="location" title="3. 위치 권한 (출석용)" emoji="📍">
            <Step n={1}>처음 <Glyph icon={MapPin} /> <b>출석하기</b>를 누르면 위치 허용 창이 떠요. <b>앱 사용 중에만 허용</b>을 고르고 <b>정확한 위치</b>를 켜 주세요.</Step>
            <Step n={2}>차단했다면: <b>설정 → 애플리케이션 → Chrome → 권한 → 위치 → 앱 사용 중에만 허용</b>, 그리고 <b>정확한 위치 사용</b> 켜기.</Step>
            <Step n={3}>사이트만 막혀 있으면: 크롬 <Glyph icon={EllipsisVertical} /> → <b>설정 → 사이트 설정 → 위치</b> → insightgraphy.org <b>허용</b>.</Step>
          </Section>
        </>
      ) : (
        <>
          <Section id="install" title="1. 설치하기" emoji="⬇️">
            <Step n={1}><b>사파리</b>로 <Url /> 을 열어요. 카카오톡에서 눌렀다면 오른쪽 아래 <b>⋯</b> → <b>Safari로 열기</b>.</Step>
            <Step n={2}>화면 아래 가운데 <Glyph icon={Share} /> <b>공유</b> 버튼을 눌러요.</Step>
            <Step n={3}>목록을 아래로 내려 <Glyph icon={SquarePlus} /> <b>홈 화면에 추가</b> → 오른쪽 위 <b>추가</b>.</Step>
            <Step n={4}>홈 화면의 <b>인사이트그래피</b> 아이콘으로 열고 <b>한 번 더 로그인</b>해요. (사파리와 로그인이 따로 저장돼요)</Step>
            <Tip>🔎 <b>홈 화면에 추가</b>가 안 보이면 공유 목록 맨 아래 <b>작업 편집</b>에서 추가할 수 있어요.</Tip>
          </Section>

          <Section id="notifications" title="2. 알림 켜기" emoji="🔔">
            <Step n={1}>알림은 <b>iOS 16.4 이상</b>, <b>홈 화면에 설치한 앱</b>에서만 돼요. (설정 → 일반 → 정보에서 버전 확인)</Step>
            <Step n={2}>설치한 앱에서 <b>알림 켜기</b>(또는 <b>내 정보 → 알림</b>)를 누르고 <b>허용</b>.</Step>
            <Step n={3}>차단했다면: <b>설정 → 알림 → 인사이트그래피 → 알림 허용</b> 켜기.</Step>
            <Tip>🌙 집중 모드(방해 금지)가 켜져 있으면 알림이 조용히 와요. 앱을 지우고 다시 설치하면 알림을 다시 켜야 해요.</Tip>
          </Section>

          <Section id="location" title="3. 위치 권한 (출석용)" emoji="📍">
            <Step n={1}>처음 <Glyph icon={MapPin} /> <b>출석하기</b>를 누르면 위치 허용 창이 떠요. <b>허용</b>을 눌러요. 아이폰은 가끔 다시 물을 수 있어요.</Step>
            <Step n={2}>계속 거부되면: <b>설정 → 개인정보 보호 및 보안 → 위치 서비스</b>를 켜고, 아래 <b>Safari 웹 사이트 → 앱을 사용하는 동안</b>, <b>정확한 위치</b> 켜기.</Step>
          </Section>
        </>
      )}

      <Section id="trouble" title="출석이 안 될 때" emoji="🛟">
        <Step n="·"><b>세션 장소에서 멀어요</b>가 나오면 실내에서 위치가 튄 경우가 많아요. 와이파이를 켜고 창가에서 다시 눌러 주세요.</Step>
        <Step n="·"><b>위치가 정확하지 않아요</b>가 나오면 <b>정확한 위치</b>가 꺼져 있는지 확인해 주세요.</Step>
        <Step n="·">출석 시간이 지나면 출석할 수 없어요. <Link href="/archive/absence" className="font-bold text-teal-700 underline">사유서</Link>를 내 주세요.</Step>
      </Section>

      <div className="mt-8 flex gap-2">
        <button type="button" onClick={copyLink} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-teal-50 py-3 text-sm font-bold text-teal-800">
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}{copied ? '복사했어요' : '앱 주소 복사'}
        </button>
        <Link href="/app" className="flex flex-1 items-center justify-center rounded-2xl bg-teal-700 py-3 text-sm font-bold text-white">앱 열기</Link>
      </div>
    </div>
  )
}

function Section({ id, title, emoji, children }) {
  return (
    <section id={id} className="mt-7 scroll-mt-32 border-t-2 border-teal-600 pt-3">
      <h2 className="mb-2 flex items-center gap-2 text-lg font-black text-slate-900"><span aria-hidden="true">{emoji}</span>{title}</h2>
      <ol className="space-y-3">{children}</ol>
    </section>
  )
}

function Step({ n, children }) {
  return (
    <li className="flex gap-3 text-[15px] leading-7 text-slate-700">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal-100 text-xs font-black text-teal-800" aria-hidden="true">{n}</span>
      <span className="min-w-0 break-keep">{children}</span>
    </li>
  )
}

function Tip({ children }) {
  return <li className="list-none break-keep rounded-2xl bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">{children}</li>
}

function Notice({ tone, children }) {
  const style = tone === 'amber' ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'
  return <p className={`mb-3 break-keep rounded-2xl px-4 py-3 text-sm leading-6 ${style}`}>{children}</p>
}

function Glyph({ icon: Icon }) {
  return <span className="mx-0.5 inline-grid h-6 w-6 place-items-center rounded-md bg-slate-100 align-middle text-slate-700"><Icon className="h-4 w-4" aria-hidden="true" /></span>
}

function Url() {
  return <span className="rounded-md bg-teal-50 px-1.5 py-0.5 font-mono text-sm font-bold text-teal-800">insightgraphy.org/app</span>
}
