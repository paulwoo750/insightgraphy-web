'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function LandingManager() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // DB에서 불러온 원본 전체 리스트
  const [allSchedules, setAllSchedules] = useState([])
  const [allShowcases, setAllShowcases] = useState([])

  // 관리자가 체크박스로 선택한 항목들의 ID 배열 (랜딩에 표시될 것들)
  const [selectedSchIds, setSelectedSchIds] = useState([]) // 최대 4개
  const [selectedShowIds, setSelectedShowIds] = useState([]) // 최대 3개

  useEffect(() => {
    if (!sessionStorage.getItem('isIGAdmin')) {
      router.push('/admin')
      return
    }
    fetchLandingData()
  }, [])

  const fetchLandingData = async () => {
    setLoading(true)

    // 1. 전체 스케줄 불러오기 (외부 공개용만)
    const { data: schData } = await supabase.from('pr_schedules').select('*').eq('is_public', true).order('full_date', { ascending: true })
    if (schData) setAllSchedules(schData)

    // 2. 쇼케이스 불러오기
    const { data: showData } = await supabase.from('pr_showcase').select('*').order('created_at', { ascending: false })
    if (showData) setAllShowcases(showData)

    // 3. 현재 랜딩 페이지에 설정된 선택값 불러오기
    const { data: config } = await supabase.from('pr_landing_config').select('*').eq('id', 'main').single()
    if (config) {
      // 🌟 핵심 수정: DB에 '실제로 존재하는' 항목의 ID만 남기도록 교차 검증 (유령 데이터 퇴치!)
      if (config.selected_schedules && schData) {
        const validSchIds = config.selected_schedules.filter(id => schData.some(sch => sch.id === id))
        setSelectedSchIds(validSchIds)
      }
      if (config.selected_showcases && showData) {
        const validShowIds = config.selected_showcases.filter(id => showData.some(show => show.id === id))
        setSelectedShowIds(validShowIds)
      }
    }

    setLoading(false)
  }

  // --- 체크박스 핸들러 (스케줄: 최대 4개 제한) ---
  const handleScheduleToggle = (id) => {
    if (selectedSchIds.includes(id)) {
      setSelectedSchIds(selectedSchIds.filter(itemId => itemId !== id))
    } else {
      if (selectedSchIds.length >= 4) {
        alert('다가오는 일정은 최대 4개까지만 선택할 수 있습니다.')
        return
      }
      setSelectedSchIds([...selectedSchIds, id])
    }
  }

  // --- 체크박스 핸들러 (쇼케이스: 최대 3개 제한) ---
  const handleShowcaseToggle = (id) => {
    if (selectedShowIds.includes(id)) {
      setSelectedShowIds(selectedShowIds.filter(itemId => itemId !== id))
    } else {
      if (selectedShowIds.length >= 3) {
        alert('Best Practice 쇼케이스는 최대 3개까지만 선택할 수 있습니다.')
        return
      }
      setSelectedShowIds([...selectedShowIds, id])
    }
  }

  // --- 전체 저장 ---
  const handleSaveAll = async () => {
    setSaving(true)
    const { error } = await supabase.from('pr_landing_config').upsert({
      id: 'main',
      selected_schedules: selectedSchIds,
      selected_showcases: selectedShowIds
    })

    if (error) alert('저장 실패: ' + error.message)
    else alert('랜딩 페이지 대문 설정이 성공적으로 저장되었습니다! 🏠')
    
    setSaving(false)
  }

  if (loading) return <div className="min-h-screen flex justify-center items-center font-bold text-slate-400">데이터 로딩 중... 🔄</div>

  return (
    <div className="min-h-screen bg-slate-50 text-[#1a1a1a] font-sans p-6 md:p-12 pb-32">
      <div className="max-w-5xl mx-auto space-y-12">
        
        {/* 상단 헤더 & 컨트롤 바 */}
        <header className="flex justify-between items-end mb-8 border-b border-slate-200 pb-6 sticky top-0 bg-slate-50/90 backdrop-blur-md z-20 pt-4">
          <div>
            <Link href="/admin/hub" className="text-xs font-black text-slate-400 hover:text-[#32a4a1] uppercase tracking-widest mb-2 block transition-colors">← Back to Hub</Link>
            <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-800 flex items-center gap-3">
              <span className="text-4xl">🏠</span> Landing Manager
            </h1>
            <p className="text-xs font-bold text-slate-500 mt-2">홈페이지 첫 화면에 노출될 핵심 콘텐츠들을 선택하세요.</p>
          </div>
          <button onClick={handleSaveAll} disabled={saving} className="bg-[#32a4a1] text-white px-8 py-3 rounded-xl font-black uppercase tracking-widest hover:bg-[#238986] transition-all shadow-lg hover:scale-105">
            {saving ? 'Saving...' : 'Save All 💾'}
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* 1. Upcoming Schedules 선택 패널 */}
          <section className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
            <div className="mb-6 flex justify-between items-end border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-xl font-black text-slate-800">01. Upcoming Sessions</h2>
                <p className="text-xs font-bold text-slate-400 mt-1">랜딩 페이지에 노출될 일정을 <span className="text-[#32a4a1] font-black">최대 4개</span> 선택하세요.</p>
              </div>
              <span className="bg-[#32a4a1]/10 text-[#32a4a1] px-3 py-1 rounded-lg text-xs font-black">
                {selectedSchIds.length} / 4 선택됨
              </span>
            </div>

            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
              {allSchedules.map(sch => (
                <label 
                  key={sch.id} 
                  className={`flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all border-2 ${selectedSchIds.includes(sch.id) ? 'border-[#32a4a1] bg-[#e0f2f1]' : 'border-slate-100 bg-slate-50 hover:border-slate-300'}`}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="bg-slate-900 text-white px-2 py-0.5 rounded text-[9px] font-black">{sch.date_display}</span>
                      <span className="text-sm font-black text-slate-800">{sch.title}</span>
                    </div>
                    <span className="text-xs font-bold text-slate-500 line-clamp-1">{sch.description || '상세 설명 없음'}</span>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={selectedSchIds.includes(sch.id)} 
                    onChange={() => handleScheduleToggle(sch.id)} 
                    className="w-5 h-5 accent-[#32a4a1] cursor-pointer"
                  />
                </label>
              ))}
              {allSchedules.length === 0 && <p className="text-center text-xs text-slate-400 py-10">스케줄 관리자에서 먼저 일정을 추가해주세요.</p>}
            </div>
          </section>

          {/* 2. Best Practices (Showcase) 선택 패널 */}
          <section className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
            <div className="mb-6 flex justify-between items-end border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-xl font-black text-slate-800">02. Best Practices</h2>
                <p className="text-xs font-bold text-slate-400 mt-1">대문에 걸어둘 우수 PPT 작품을 <span className="text-blue-500 font-black">최대 3개</span> 선택하세요.</p>
              </div>
              <span className="bg-blue-100 text-blue-600 px-3 py-1 rounded-lg text-xs font-black">
                {selectedShowIds.length} / 3 선택됨
              </span>
            </div>

            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
              {allShowcases.map(item => (
                <label 
                  key={item.id} 
                  className={`flex items-center gap-4 p-3 rounded-2xl cursor-pointer transition-all border-2 ${selectedShowIds.includes(item.id) ? 'border-blue-500 bg-blue-50/50' : 'border-slate-100 bg-slate-50 hover:border-slate-300'}`}
                >
                  <div className="w-24 h-16 bg-slate-200 rounded-lg overflow-hidden shrink-0 relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.thumb_url || '/showcase/thumb1.png'} alt="thumb" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 flex flex-col gap-1 overflow-hidden">
                    <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">{item.author}</p>
                    <h3 className="text-sm font-black text-slate-800 truncate">{item.title}</h3>
                  </div>
                  <div className="pr-2">
                    <input 
                      type="checkbox" 
                      checked={selectedShowIds.includes(item.id)} 
                      onChange={() => handleShowcaseToggle(item.id)} 
                      className="w-5 h-5 accent-blue-500 cursor-pointer"
                    />
                  </div>
                </label>
              ))}
              {allShowcases.length === 0 && <p className="text-center text-xs text-slate-400 py-10">쇼케이스 관리자에서 먼저 작품을 추가해주세요.</p>}
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}