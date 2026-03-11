'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function ScheduleManager() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [schedules, setSchedules] = useState([])
  const [currentDate, setCurrentDate] = useState(new Date(2026, 2, 1))
  const [selectedDateStr, setSelectedDateStr] = useState(null)

  useEffect(() => {
    if (!sessionStorage.getItem('isIGAdmin')) {
      router.push('/admin')
      return
    }
    fetchSchedules()
  }, [])

  const fetchSchedules = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('pr_schedules')
      .select('*')
      .order('full_date', { ascending: true })
    
    if (!error && data) setSchedules(data)
    setLoading(false)
  }

  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return ''
    const parts = dateStr.split('-')
    return `${parseInt(parts[1])}/${parseInt(parts[2])}`
  }

  // --- 일정 추가 ---
  const addSchedule = (defaultDate = '') => {
    setSchedules([...schedules, { 
      full_date: defaultDate, 
      date_display: formatDateDisplay(defaultDate), 
      type: 'regular', 
      week: '', 
      title: '', 
      description: '', 
      is_break: false, 
      is_public: true,
      is_allday: true,
      start_time: '',
      end_time: ''
    }])
  }

  // --- 일정 복사 ---
  const duplicateSchedule = (index) => {
    const itemToCopy = schedules[index];
    const newSchedules = [
      ...schedules.slice(0, index + 1),
      { ...itemToCopy, id: undefined },
      ...schedules.slice(index + 1)
    ];
    setSchedules(newSchedules);
  }

  // --- 일정 삭제 ---
  const removeSchedule = (index) => {
    if(confirm('이 일정을 삭제할까요?')) {
      setSchedules(schedules.filter((_, i) => i !== index))
    }
  }

  // --- 입력 핸들러 ---
  const handleChange = (index, field, value) => {
    const newSch = [...schedules]
    newSch[index][field] = value
    
    if (field === 'full_date') newSch[index].date_display = formatDateDisplay(value)
    
    if (field === 'type') {
      if (value !== 'regular') {
        newSch[index].week = '';
        newSch[index].is_break = false;
      }
    }
    setSchedules(newSch)
  }

  const handleSaveAll = async () => {
    setSaving(true)
    await supabase.from('pr_schedules').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    
    if (schedules.length > 0) {
      const validSchedules = schedules.filter(s => s.full_date).map(s => ({
        full_date: s.full_date,
        date_display: s.date_display,
        type: s.type || 'regular',
        week: s.week || '',
        title: s.title,
        description: s.description,
        is_break: s.is_break,
        is_public: s.is_public,
        is_allday: s.is_allday,
        start_time: s.start_time || '',
        end_time: s.end_time || ''
      }))
      const { error } = await supabase.from('pr_schedules').insert(validSchedules)
      if (error) alert('저장 실패: ' + error.message)
      else alert('일정이 성공적으로 저장되었습니다! 📅')
    }
    fetchSchedules()
    setSaving(false)
  }

  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i)
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  if (loading) return <div className="min-h-screen flex justify-center items-center font-bold text-slate-400">일정 불러오는 중... 🔄</div>

  return (
    <div className="min-h-screen bg-slate-50 text-[#1a1a1a] font-sans p-6 md:p-12 pb-32">
      <div className="max-w-7xl mx-auto space-y-12">
        
        {/* 상단 헤더 & 컨트롤 바 */}
        <header className="flex justify-between items-end mb-8 border-b border-slate-200 pb-6 sticky top-0 bg-slate-50/90 backdrop-blur-md z-20 pt-4">
          <div>
            <Link href="/admin/hub" className="text-xs font-black text-slate-400 hover:text-[#32a4a1] uppercase tracking-widest mb-2 block transition-colors">← Back to Hub</Link>
            <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-800 flex items-center gap-3">
              <span className="text-4xl">📅</span> Schedule Manager
            </h1>
            <p className="text-xs font-bold text-slate-500 mt-2">일정 유형과 시간을 직관적으로 편집하세요.</p>
          </div>
          <button onClick={handleSaveAll} disabled={saving} className="bg-[#32a4a1] text-white px-8 py-3 rounded-xl font-black uppercase tracking-widest hover:bg-[#238986] transition-all shadow-lg hover:scale-105">
            {saving ? 'Saving...' : 'Save All 💾'}
          </button>
        </header>

        {/* 안내 범례 */}
        <div className="flex gap-4 px-4">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500"><span className="w-3 h-3 rounded-full bg-blue-500"></span> 외부 공개용</div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500"><span className="w-3 h-3 rounded-full bg-orange-400"></span> 내부용 (Home 전용)</div>
        </div>

        {/* 1. 📋 홈페이지 표 에디터 */}
        <section className="bg-white p-8 md:p-12 rounded-[3rem] shadow-xl border border-slate-100 relative overflow-hidden">
          <div className="text-center mb-10 border-b border-slate-100 pb-8">
            <div className="inline-block bg-[#e0f2f1] text-[#0d6b69] px-6 py-2 rounded-lg font-black text-sm tracking-widest mb-2">
              실제 홈페이지 표 (Table Editor)
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-[100px_130px_1.5fr_2fr_120px_50px] gap-4 items-center mb-2 px-2 border-b border-slate-200 pb-4">
              <span className="text-[10px] font-black text-slate-400 text-center">유형/주차</span>
              <span className="text-[10px] font-black text-slate-400 text-center">날짜 및 시간</span>
              <span className="text-[10px] font-black text-slate-400 text-center">일정 이름 (Title)</span>
              <span className="text-[10px] font-black text-slate-400 text-center">세부 사항 (Description)</span>
              <span className="text-[10px] font-black text-slate-400 text-center">설정 (공개/휴회)</span>
              <span className="text-[10px] font-black text-slate-400 text-center">관리</span>
            </div>

            {schedules.map((item, idx) => (
              <div key={idx} className={`grid grid-cols-[100px_130px_1.5fr_2fr_120px_50px] gap-4 items-start bg-slate-50 p-4 rounded-xl border-l-4 transition-all hover:shadow-md ${item.is_public ? 'border-blue-500' : 'border-orange-400'} ${item.is_break ? 'opacity-60 grayscale-[50%]' : ''}`}>
                
                {/* 1. 유형 및 주차 선택 */}
                <div className="space-y-2">
                  <select value={item.type || 'regular'} onChange={e => handleChange(idx, 'type', e.target.value)} className="w-full bg-white p-2 rounded-lg text-xs font-black text-slate-700 outline-none border border-slate-200">
                    <option value="regular">정규세션</option>
                    <option value="special">특별세션</option>
                    <option value="other">기타</option>
                  </select>
                  {item.type === 'regular' && (
                    <input type="text" value={item.week} onChange={e => handleChange(idx, 'week', e.target.value)} className="w-full bg-white p-2 rounded-lg text-xs font-black text-center outline-none border border-slate-200 focus:border-[#32a4a1]" placeholder="주차 (예: 1)" />
                  )}
                </div>

                {/* 2. 날짜 및 시간 */}
                <div className="space-y-2">
                  <input type="date" value={item.full_date} onChange={e => handleChange(idx, 'full_date', e.target.value)} className="w-full bg-white p-2 rounded-lg text-xs font-black text-slate-700 outline-none border border-slate-200" />
                  <div className="flex items-center justify-between pl-1 pr-2">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={item.is_allday} onChange={e => handleChange(idx, 'is_allday', e.target.checked)} className="w-3 h-3 accent-[#32a4a1]" />
                      <span className="text-[9px] font-bold text-slate-500">종일</span>
                    </label>
                  </div>
                  {!item.is_allday && (
                    <div className="flex items-center gap-1">
                      <input type="text" placeholder="14:00" value={item.start_time} onChange={e => handleChange(idx, 'start_time', e.target.value)} className="w-full bg-white p-1.5 rounded text-[10px] font-black text-center border border-slate-200 outline-none focus:border-[#32a4a1]" />
                      <span className="text-[10px] font-black text-slate-300">-</span>
                      <input type="text" placeholder="18:00" value={item.end_time} onChange={e => handleChange(idx, 'end_time', e.target.value)} className="w-full bg-white p-1.5 rounded text-[10px] font-black text-center border border-slate-200 outline-none focus:border-[#32a4a1]" />
                    </div>
                  )}
                </div>

                {/* 3. 제목 (★ 휴회 시 취소선 제거, 대신 연한 색상 처리) */}
                <input type="text" value={item.title} onChange={e => handleChange(idx, 'title', e.target.value)} className={`w-full p-3 rounded-lg text-sm font-black outline-none border border-slate-200 focus:border-[#32a4a1] ${item.is_break ? 'bg-slate-100 text-slate-400' : 'bg-white text-slate-800'}`} placeholder="일정 이름" />

                {/* 4. 세부 사항 */}
                <textarea rows="2" value={item.description || ''} onChange={e => handleChange(idx, 'description', e.target.value)} className="w-full bg-white p-3 rounded-lg text-xs font-medium text-slate-600 outline-none border border-slate-200 focus:border-[#32a4a1] resize-none" placeholder="세부 사항 및 설명"></textarea>

                {/* 5. 설정 */}
                <div className="flex flex-col gap-2">
                  <button onClick={() => handleChange(idx, 'is_public', !item.is_public)} className={`px-2 py-1.5 rounded-md text-[10px] font-black transition-colors ${item.is_public ? 'bg-blue-100 text-blue-600 hover:bg-blue-200' : 'bg-orange-100 text-orange-600 hover:bg-orange-200'}`}>
                    {item.is_public ? '🌐 외부공개' : '🔒 내부전용'}
                  </button>
                  {item.type === 'regular' && (
                    <button onClick={() => handleChange(idx, 'is_break', !item.is_break)} className={`px-2 py-1.5 rounded-md text-[10px] font-black transition-colors ${item.is_break ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}>
                      휴회 처리
                    </button>
                  )}
                </div>

                {/* 6. 관리 */}
                <div className="flex flex-col gap-1.5">
                  <button onClick={() => duplicateSchedule(idx)} className="bg-blue-50 text-blue-500 hover:bg-blue-500 hover:text-white py-1.5 rounded-md text-[10px] font-black transition-colors">복사</button>
                  <button onClick={() => removeSchedule(idx)} className="bg-red-50 text-red-400 hover:bg-red-500 hover:text-white py-1.5 rounded-md text-[10px] font-black transition-colors">삭제</button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex justify-end">
            <button onClick={() => addSchedule('')} className="bg-slate-900 text-white px-6 py-3 rounded-xl text-sm font-black hover:bg-[#32a4a1] transition-colors shadow-lg flex items-center gap-2">
              <span className="text-lg leading-none">+</span> 표 맨 아래에 줄 추가
            </button>
          </div>
        </section>

        {/* 2. 🗓️ 달력 에디터 (클릭 시 모달) */}
        <section className="bg-white p-8 md:p-12 rounded-[3rem] shadow-xl border border-slate-100">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-black uppercase tracking-tighter text-[#1a1a1a]">Interactive Calendar</h2>
            <p className="text-slate-400 font-bold text-sm mt-2">달력의 날짜를 클릭하면 앱처럼 해당 날짜의 일정을 관리할 수 있습니다.</p>
          </div>

          <div className="max-w-2xl mx-auto bg-slate-50 p-8 rounded-[2.5rem] border border-slate-200">
            <div className="flex justify-between items-center mb-8 px-4">
              <button onClick={prevMonth} className="w-10 h-10 flex items-center justify-center bg-white rounded-full shadow-sm text-[#32a4a1] font-bold hover:bg-[#32a4a1] hover:text-white transition-all">←</button>
              <h3 className="text-2xl font-black text-slate-800 uppercase tracking-widest">{year}. {String(month + 1).padStart(2, '0')}</h3>
              <button onClick={nextMonth} className="w-10 h-10 flex items-center justify-center bg-white rounded-full shadow-sm text-[#32a4a1] font-bold hover:bg-[#32a4a1] hover:text-white transition-all">→</button>
            </div>

            <div className="grid grid-cols-7 gap-2 mb-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <div className="text-red-400">Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div className="text-blue-400">Sat</div>
            </div>

            <div className="grid grid-cols-7 gap-3">
              {blanks.map(b => <div key={`blank-${b}`} className="aspect-square bg-transparent" />)}
              {days.map(d => {
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                const dayEvents = schedules.filter(s => s.full_date === dateStr)
                const hasEvent = dayEvents.length > 0

                return (
                  <button 
                    key={d} 
                    onClick={() => setSelectedDateStr(dateStr)}
                    className={`relative aspect-square rounded-2xl flex flex-col items-center justify-center text-sm font-black transition-all hover:scale-110 active:scale-95 ${hasEvent ? 'bg-white border-2 border-[#32a4a1] text-[#0d6b69] shadow-md' : 'bg-white border border-slate-200 text-slate-600 hover:border-[#32a4a1]/50'}`}
                  >
                    <span>{d}</span>
                    {hasEvent && (
                      <div className="absolute bottom-2 flex gap-1">
                        {dayEvents.map((ev, i) => (
                          <div key={i} className={`w-1.5 h-1.5 rounded-full ${ev.is_public ? 'bg-blue-500' : 'bg-orange-400'}`} />
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </section>

      </div>

      {/* 🌟 3. 날짜 클릭 팝업 (모달) 🌟 */}
      {selectedDateStr && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-slate-200">
            
            <div className="bg-slate-50 px-8 py-6 border-b border-slate-200 flex justify-between items-center">
              <div>
                <p className="text-[#32a4a1] font-black text-xs uppercase tracking-widest mb-1">Schedule Editor</p>
                <h2 className="text-2xl font-black text-slate-800">{selectedDateStr} 일정</h2>
              </div>
              <button onClick={() => setSelectedDateStr(null)} className="text-slate-400 hover:text-slate-800 font-black text-2xl">✕</button>
            </div>

            <div className="p-8 space-y-6 max-h-[65vh] overflow-y-auto bg-[#f8f9fa]">
              {schedules.map((sch, globalIdx) => {
                if (sch.full_date !== selectedDateStr) return null;
                return (
                  // ★ 팝업창에서도 휴회 시 흐리게 처리 (opacity-60)
                  <div key={globalIdx} className={`p-6 rounded-3xl border-2 relative bg-white shadow-sm ${sch.is_public ? 'border-blue-200' : 'border-orange-200'} ${sch.is_break ? 'opacity-60 grayscale-[50%]' : ''}`}>
                    <button onClick={() => removeSchedule(globalIdx)} className="absolute top-6 right-6 text-red-400 hover:text-red-600 font-black text-sm">삭제 X</button>
                    
                    <div className="space-y-5 pr-8">
                      <div className="flex gap-2 p-1 bg-slate-100 rounded-xl w-fit">
                        {['regular', 'special', 'other'].map((tType) => (
                          <button 
                            key={tType}
                            onClick={() => handleChange(globalIdx, 'type', tType)}
                            className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${sch.type === tType ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                          >
                            {tType === 'regular' ? '정규세션' : tType === 'special' ? '특별세션' : '기타'}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-100 w-fit">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={sch.is_allday} onChange={e => handleChange(globalIdx, 'is_allday', e.target.checked)} className="w-4 h-4 accent-[#32a4a1]" />
                          <span className="text-xs font-bold text-slate-600">하루 종일</span>
                        </label>
                        {!sch.is_allday && (
                          <div className="flex items-center gap-2">
                            <div className="w-px h-4 bg-slate-300"></div>
                            <input type="text" placeholder="14:00" value={sch.start_time} onChange={e => handleChange(globalIdx, 'start_time', e.target.value)} className="w-14 bg-white p-1 rounded text-xs font-black text-center border border-slate-200 outline-none focus:border-[#32a4a1]" />
                            <span className="text-slate-400 font-bold">~</span>
                            <input type="text" placeholder="18:00" value={sch.end_time} onChange={e => handleChange(globalIdx, 'end_time', e.target.value)} className="w-14 bg-white p-1 rounded text-xs font-black text-center border border-slate-200 outline-none focus:border-[#32a4a1]" />
                          </div>
                        )}
                      </div>

                      <div className="flex gap-3">
                        {sch.type === 'regular' && (
                          <input type="text" value={sch.week} onChange={e => handleChange(globalIdx, 'week', e.target.value)} className="w-20 bg-slate-50 p-3 rounded-xl text-sm font-black text-center border border-slate-200 outline-none focus:border-[#32a4a1]" placeholder="주차(1)" />
                        )}
                        <input type="text" value={sch.title} onChange={e => handleChange(globalIdx, 'title', e.target.value)} className="flex-1 bg-slate-50 p-3 rounded-xl text-sm font-black border border-slate-200 outline-none focus:border-[#32a4a1]" placeholder={sch.type === 'other' ? '일정 이름' : '세션명 (필수)'} />
                      </div>
                      
                      <textarea rows="2" value={sch.description || ''} onChange={e => handleChange(globalIdx, 'description', e.target.value)} className="w-full bg-slate-50 p-3 rounded-xl text-xs font-medium text-slate-600 border border-slate-200 outline-none focus:border-[#32a4a1] resize-none" placeholder="세부 사항 및 설명 (선택)"></textarea>
                      
                      <div className="flex gap-2 pt-2">
                        <button onClick={() => handleChange(globalIdx, 'is_public', !sch.is_public)} className={`px-4 py-2 rounded-lg text-xs font-black transition-colors ${sch.is_public ? 'bg-blue-500 text-white' : 'bg-orange-400 text-white'}`}>
                          {sch.is_public ? '외부 공개 🌐' : '내부 전용 🔒'}
                        </button>
                        {sch.type === 'regular' && (
                          <button onClick={() => handleChange(globalIdx, 'is_break', !sch.is_break)} className={`px-4 py-2 rounded-lg text-xs font-black transition-colors ${sch.is_break ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>
                            {sch.is_break ? '휴회 처리됨 ☕️' : '정상 진행중 🏃‍♂️'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              <button onClick={() => addSchedule(selectedDateStr)} className="w-full py-5 border-2 border-dashed border-[#32a4a1]/50 text-[#32a4a1] rounded-[2rem] font-black hover:bg-[#32a4a1]/5 transition-colors">
                + 이 날짜에 새 일정 추가하기
              </button>
            </div>
            
            <div className="bg-slate-50 p-5 text-center border-t border-slate-200">
              <button onClick={() => setSelectedDateStr(null)} className="bg-slate-900 text-white px-10 py-3.5 rounded-xl text-sm font-black hover:bg-[#32a4a1] transition-colors">
                편집 완료 (창 닫기)
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}