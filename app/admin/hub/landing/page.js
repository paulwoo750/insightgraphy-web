'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { DEFAULT_LANDING, DEFAULT_SCHEDULE, mergeContent } from '@/lib/siteContent'

export default function LandingManager() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('landing') // landing | schedule | select

  // 공개 페이지 문구
  const [land, setLand] = useState(DEFAULT_LANDING)
  const [sch, setSch] = useState(DEFAULT_SCHEDULE)

  // 대문에 노출할 항목 선택
  const [allSchedules, setAllSchedules] = useState([])
  const [allShowcases, setAllShowcases] = useState([])
  const [selectedSchIds, setSelectedSchIds] = useState([])
  const [selectedShowIds, setSelectedShowIds] = useState([])

  useEffect(() => {
    if (!sessionStorage.getItem('isIGAdmin')) { router.push('/admin'); return }
    fetchLandingData()
  }, [])

  const fetchLandingData = async () => {
    setLoading(true)

    const { data: cfgRows } = await supabase.from('pr_config').select('key, value').in('key', ['landing_content', 'schedule_content'])
    const pick = (k) => { try { return JSON.parse(cfgRows?.find(r => r.key === k)?.value || 'null') } catch { return null } }
    setLand(mergeContent(DEFAULT_LANDING, pick('landing_content')))
    setSch(mergeContent(DEFAULT_SCHEDULE, pick('schedule_content')))

    const { data: schData } = await supabase.from('pr_schedules').select('*').eq('is_public', true).order('full_date', { ascending: true })
    if (schData) setAllSchedules(schData)

    const { data: showData } = await supabase.from('pr_showcase').select('*').order('created_at', { ascending: false })
    if (showData) setAllShowcases(showData)

    const { data: config } = await supabase.from('pr_landing_config').select('*').eq('id', 'main').single()
    if (config) {
      if (config.selected_schedules && schData) setSelectedSchIds(config.selected_schedules.filter(id => schData.some(s => s.id === id)))
      if (config.selected_showcases && showData) setSelectedShowIds(config.selected_showcases.filter(id => showData.some(s => s.id === id)))
    }

    setLoading(false)
  }

  // 중첩 객체 업데이트 헬퍼
  const upLand = (section, field, value) => setLand(p => ({ ...p, [section]: { ...p[section], [field]: value } }))
  const upSch = (section, field, value) => setSch(p => ({ ...p, [section]: { ...p[section], [field]: value } }))
  const upActItem = (idx, field, value) => setLand(p => ({
    ...p, activities: { ...p.activities, items: p.activities.items.map((it, i) => i === idx ? { ...it, [field]: value } : it) }
  }))

  const handleScheduleToggle = (id) => {
    if (selectedSchIds.includes(id)) setSelectedSchIds(selectedSchIds.filter(i => i !== id))
    else { if (selectedSchIds.length >= 4) return alert('다가오는 일정은 최대 4개까지만 선택할 수 있습니다.'); setSelectedSchIds([...selectedSchIds, id]) }
  }
  const handleShowcaseToggle = (id) => {
    if (selectedShowIds.includes(id)) setSelectedShowIds(selectedShowIds.filter(i => i !== id))
    else { if (selectedShowIds.length >= 3) return alert('Best Practice 쇼케이스는 최대 3개까지만 선택할 수 있습니다.'); setSelectedShowIds([...selectedShowIds, id]) }
  }

  const handleSaveAll = async () => {
    setSaving(true)
    const { error: e1 } = await supabase.from('pr_config').upsert([
      { key: 'landing_content', value: JSON.stringify(land) },
      { key: 'schedule_content', value: JSON.stringify(sch) }
    ])
    const { error: e2 } = await supabase.from('pr_landing_config').upsert({
      id: 'main', selected_schedules: selectedSchIds, selected_showcases: selectedShowIds
    })
    if (e1 || e2) alert('저장 실패: ' + (e1 || e2).message)
    else alert('공개 페이지 설정이 저장되었습니다! 🏠')
    setSaving(false)
  }

  const resetLanding = () => { if (confirm('랜딩 문구를 기본값으로 되돌릴까요? (저장 전까지는 반영되지 않습니다)')) setLand(DEFAULT_LANDING) }
  const resetSchedule = () => { if (confirm('타임라인 문구를 기본값으로 되돌릴까요? (저장 전까지는 반영되지 않습니다)')) setSch(DEFAULT_SCHEDULE) }

  if (loading) return <div className="min-h-screen bg-white flex justify-center items-center font-bold text-slate-400">데이터 로딩 중... 🔄</div>

  const TabBtn = ({ id, label }) => (
    <button onClick={() => setTab(id)} className={`px-5 py-2.5 text-xs font-bold transition-colors border-b-[3px] ${tab === id ? 'border-teal-800 text-teal-800' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>{label}</button>
  )

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans p-6 md:p-12 pb-32">
      <div className="max-w-4xl mx-auto">

        <header className="mb-6 border-b border-slate-200 pb-6 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <Link href="/admin/hub" className="text-xs font-black text-slate-400 hover:text-teal-800 uppercase tracking-widest mb-3 block transition-colors">← Back to Hub</Link>
            <h1 className="text-3xl md:text-4xl font-extrabold text-teal-800 tracking-tight">공개 페이지 문구 관리</h1>
            <p className="text-sm font-medium text-slate-500 mt-2">대문(랜딩)과 타임라인 페이지의 모든 문구를 직접 수정합니다.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <a href="/" target="_blank" rel="noopener noreferrer" className="px-4 py-2.5 border border-slate-300 text-slate-600 text-xs font-bold hover:border-teal-700 hover:text-teal-800 transition-colors">대문 미리보기 ↗</a>
            <button onClick={handleSaveAll} disabled={saving} className="px-6 py-2.5 bg-teal-800 text-white text-xs font-bold hover:bg-teal-900 transition-colors disabled:bg-slate-300">{saving ? '저장 중...' : '전체 저장 💾'}</button>
          </div>
        </header>

        <div className="flex gap-1 border-b border-slate-200 mb-8 overflow-x-auto no-scrollbar">
          <TabBtn id="landing" label="🏠 대문 문구" />
          <TabBtn id="schedule" label="📅 타임라인 문구" />
          <TabBtn id="select" label="✅ 대문 노출 항목" />
        </div>

        {/* ================= 대문 문구 ================= */}
        {tab === 'landing' && (
          <div className="space-y-10">
            <Section title="1. 히어로 (첫 화면)" onReset={resetLanding} resetLabel="랜딩 전체 초기화">
              <Field label="상단 작은 문구" value={land.hero.eyebrow} onChange={v => upLand('hero', 'eyebrow', v)} />
              <div className="grid grid-cols-2 gap-4">
                <Field label="큰 제목 (1줄)" value={land.hero.titleLine1} onChange={v => upLand('hero', 'titleLine1', v)} />
                <Field label="큰 제목 (2줄)" value={land.hero.titleLine2} onChange={v => upLand('hero', 'titleLine2', v)} />
              </div>
              <Field label="소개 문구 (줄바꿈으로 여러 줄)" value={land.hero.desc} onChange={v => upLand('hero', 'desc', v)} textarea rows={4} />
              <div className="grid grid-cols-2 gap-4">
                <Field label="왼쪽 버튼" value={land.hero.btnPrimary} onChange={v => upLand('hero', 'btnPrimary', v)} />
                <Field label="오른쪽 버튼" value={land.hero.btnSecondary} onChange={v => upLand('hero', 'btnSecondary', v)} />
              </div>
            </Section>

            <Section title="2. 핵심 활동 (4개 카드)">
              <Field label="섹션 제목" value={land.activities.title} onChange={v => upLand('activities', 'title', v)} />
              <Field label="카드 하단 링크 문구" value={land.activities.cardLink} onChange={v => upLand('activities', 'cardLink', v)} />
              <div className="space-y-4 mt-2">
                {land.activities.items.map((it, i) => (
                  <div key={i} className="border border-slate-200 border-l-[3px] border-l-teal-800 p-4">
                    <p className="text-[10px] font-black text-teal-700 uppercase tracking-widest mb-3">카드 {i + 1}</p>
                    <div className="grid grid-cols-[70px_1fr] gap-3 mb-3">
                      <Field label="아이콘" value={it.icon} onChange={v => upActItem(i, 'icon', v)} />
                      <Field label="제목" value={it.title} onChange={v => upActItem(i, 'title', v)} />
                    </div>
                    <Field label="설명" value={it.desc} onChange={v => upActItem(i, 'desc', v)} textarea rows={2} />
                    <Field label="연결 주소" value={it.href} onChange={v => upActItem(i, 'href', v)} />
                  </div>
                ))}
              </div>
            </Section>

            <Section title="3. 우수 작품 (Best Practices)">
              <Field label="제목" value={land.showcase.title} onChange={v => upLand('showcase', 'title', v)} />
              <Field label="설명" value={land.showcase.desc} onChange={v => upLand('showcase', 'desc', v)} />
              <div className="grid grid-cols-2 gap-4">
                <Field label="버튼" value={land.showcase.btn} onChange={v => upLand('showcase', 'btn', v)} />
                <Field label="항목이 없을 때 문구" value={land.showcase.empty} onChange={v => upLand('showcase', 'empty', v)} />
              </div>
            </Section>

            <Section title="4. 다가오는 일정">
              <Field label="제목" value={land.sessions.title} onChange={v => upLand('sessions', 'title', v)} />
              <Field label="인용 문구" value={land.sessions.quote} onChange={v => upLand('sessions', 'quote', v)} />
              <div className="grid grid-cols-2 gap-4">
                <Field label="버튼" value={land.sessions.btn} onChange={v => upLand('sessions', 'btn', v)} />
                <Field label="일정이 없을 때 문구" value={land.sessions.empty} onChange={v => upLand('sessions', 'empty', v)} />
              </div>
            </Section>

            <Section title="5. 푸터">
              <Field label="저작권 문구" value={land.footer.text} onChange={v => upLand('footer', 'text', v)} />
            </Section>
          </div>
        )}

        {/* ================= 타임라인 문구 ================= */}
        {tab === 'schedule' && (
          <div className="space-y-10">
            <div className="border-l-[3px] border-teal-800 bg-teal-50/50 px-4 py-3">
              <p className="text-xs font-bold text-teal-900 break-keep">일정 자체(날짜·세션명)는 <Link href="/admin/hub/schedule" className="underline">일정표 관리</Link>에서 수정합니다. 여기서는 페이지의 <b>문구와 학기명</b>을 수정합니다.</p>
            </div>

            <Section title="1. 상단 헤더" onReset={resetSchedule} resetLabel="타임라인 전체 초기화">
              <Field label="작은 문구 (예: InsightGraphy 2026)" value={sch.header.eyebrow} onChange={v => upSch('header', 'eyebrow', v)} />
              <Field label="큰 제목" value={sch.header.title} onChange={v => upSch('header', 'title', v)} />
            </Section>

            <Section title="2. 일정표 (학기명 · 인용구 · 표 머리말)">
              <Field label="⭐ 학기명 배지 (예: 2026년 1학기 세션 일정)" value={sch.table.semesterBadge} onChange={v => upSch('table', 'semesterBadge', v)} highlight />
              <Field label="인용 문구" value={sch.table.quote} onChange={v => upSch('table', 'quote', v)} />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="1열 머리말" value={sch.table.colType} onChange={v => upSch('table', 'colType', v)} />
                <Field label="2열 머리말" value={sch.table.colDate} onChange={v => upSch('table', 'colDate', v)} />
                <Field label="3열 머리말" value={sch.table.colTitle} onChange={v => upSch('table', 'colTitle', v)} />
                <Field label="4열 머리말" value={sch.table.colNote} onChange={v => upSch('table', 'colNote', v)} />
              </div>
              <Field label="휴회 표시 문구" value={sch.table.breakLabel} onChange={v => upSch('table', 'breakLabel', v)} />
            </Section>

            <Section title="3. 여정 타임라인 (Journey Line)">
              <Field label="제목" value={sch.journey.title} onChange={v => upSch('journey', 'title', v)} />
              <Field label="설명" value={sch.journey.desc} onChange={v => upSch('journey', 'desc', v)} />
              <Field label="세부 설명이 없을 때 기본 문구" value={sch.journey.defaultDesc} onChange={v => upSch('journey', 'defaultDesc', v)} />
            </Section>

            <Section title="4. 월별 달력">
              <Field label="제목" value={sch.calendar.title} onChange={v => upSch('calendar', 'title', v)} />
              <Field label="이달의 일정 제목 (뒤에 '9월'이 자동으로 붙습니다)" value={sch.calendar.eventsTitle} onChange={v => upSch('calendar', 'eventsTitle', v)} />
              <Field label="일정이 없을 때 문구" value={sch.calendar.empty} onChange={v => upSch('calendar', 'empty', v)} />
            </Section>

            <Section title="5. 푸터">
              <Field label="저작권 문구" value={sch.footer.text} onChange={v => upSch('footer', 'text', v)} />
            </Section>

            <a href="/schedule" target="_blank" rel="noopener noreferrer" className="inline-block px-5 py-2.5 border border-slate-300 text-slate-600 text-xs font-bold hover:border-teal-700 hover:text-teal-800 transition-colors">타임라인 미리보기 ↗</a>
          </div>
        )}

        {/* ================= 대문 노출 항목 선택 ================= */}
        {tab === 'select' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <section>
              <div className="mb-4 flex justify-between items-end border-b border-slate-200 pb-3">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900">다가오는 일정</h2>
                  <p className="text-xs font-medium text-slate-400 mt-1">대문에 노출할 일정 <b className="text-teal-800">최대 4개</b></p>
                </div>
                <span className="bg-teal-50 text-teal-800 px-3 py-1 text-xs font-black">{selectedSchIds.length} / 4</span>
              </div>
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {allSchedules.map(s => (
                  <label key={s.id} className={`flex items-center justify-between p-3 cursor-pointer transition-colors border ${selectedSchIds.includes(s.id) ? 'border-teal-700 bg-teal-50' : 'border-slate-200 hover:border-slate-400'}`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="bg-slate-900 text-white px-2 py-0.5 text-[9px] font-black shrink-0">{s.date_display}</span>
                        <span className="text-sm font-bold text-slate-800 truncate">{s.title}</span>
                      </div>
                      <span className="text-xs font-medium text-slate-400 truncate block">{s.description || '설명 없음'}</span>
                    </div>
                    <input type="checkbox" checked={selectedSchIds.includes(s.id)} onChange={() => handleScheduleToggle(s.id)} className="w-5 h-5 accent-teal-700 cursor-pointer shrink-0 ml-3" />
                  </label>
                ))}
                {allSchedules.length === 0 && <p className="text-center text-xs text-slate-400 py-10">일정표 관리에서 먼저 일정을 추가해주세요.</p>}
              </div>
            </section>

            <section>
              <div className="mb-4 flex justify-between items-end border-b border-slate-200 pb-3">
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900">우수 작품</h2>
                  <p className="text-xs font-medium text-slate-400 mt-1">대문에 노출할 작품 <b className="text-teal-800">최대 3개</b></p>
                </div>
                <span className="bg-teal-50 text-teal-800 px-3 py-1 text-xs font-black">{selectedShowIds.length} / 3</span>
              </div>
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {allShowcases.map(item => (
                  <label key={item.id} className={`flex items-center gap-3 p-3 cursor-pointer transition-colors border ${selectedShowIds.includes(item.id) ? 'border-teal-700 bg-teal-50' : 'border-slate-200 hover:border-slate-400'}`}>
                    <div className="w-20 h-14 bg-slate-100 overflow-hidden shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.thumb_url || '/showcase/thumb1.png'} alt="thumb" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black text-teal-700 uppercase tracking-widest">{item.author}</p>
                      <h3 className="text-sm font-bold text-slate-800 truncate">{item.title}</h3>
                    </div>
                    <input type="checkbox" checked={selectedShowIds.includes(item.id)} onChange={() => handleShowcaseToggle(item.id)} className="w-5 h-5 accent-teal-700 cursor-pointer shrink-0" />
                  </label>
                ))}
                {allShowcases.length === 0 && <p className="text-center text-xs text-slate-400 py-10">쇼케이스 관리에서 먼저 작품을 추가해주세요.</p>}
              </div>
            </section>
          </div>
        )}

      </div>
    </div>
  )
}

function Section({ title, children, onReset, resetLabel }) {
  return (
    <section>
      <div className="flex justify-between items-end border-b border-teal-800 pb-2 mb-5">
        <p className="text-[10px] font-black text-teal-700 uppercase tracking-widest">{title}</p>
        {onReset && <button onClick={onReset} className="text-[10px] font-bold text-slate-400 hover:text-red-600 transition-colors">{resetLabel}</button>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Field({ label, value, onChange, textarea, rows = 3, highlight }) {
  const cls = `w-full border ${highlight ? 'border-teal-600' : 'border-slate-300'} p-3 text-sm font-bold outline-none focus:border-teal-700 transition-colors`
  return (
    <div>
      <label className={`text-[10px] font-black uppercase tracking-widest block mb-2 ${highlight ? 'text-teal-700' : 'text-slate-500'}`}>{label}</label>
      {textarea
        ? <textarea rows={rows} value={value ?? ''} onChange={e => onChange(e.target.value)} className={cls + ' resize-y leading-relaxed'} />
        : <input type="text" value={value ?? ''} onChange={e => onChange(e.target.value)} className={cls} />}
    </div>
  )
}
