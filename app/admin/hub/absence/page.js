'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function AbsenceAdmin() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 🌟 시스템 설정 상태
  const [currentSemester, setCurrentSemester] = useState('2026-1')
  const [totalWeeks, setTotalWeeks] = useState(12)
  const [currentWeek, setCurrentWeek] = useState(1) 
  const [absenceLateFine, setAbsenceLateFine] = useState(20000) 

  // 🌟 마감 기한 및 폴더(탭) 상태
  const [absenceDeadlines, setAbsenceDeadlines] = useState([])
  const [selectedFolder, setSelectedFolder] = useState('all') // 🌟 주차별 폴더 선택 상태

  // 🌟 사유서 리스트 상태
  const [absences, setAbsences] = useState([])
  
  // 🌟 결재 입력 폼 상태 
  const [rejectReasons, setRejectReasons] = useState({})
  const [partialTasks, setPartialTasks] = useState({})

  const weeks = Array.from({ length: totalWeeks + 1 }, (_, i) => i)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)

    // 1. 설정값 불러오기
    const { data: configData } = await supabase.from('pr_config').select('*')
    let wks = 12
    if (configData) {
      const sem = configData.find(c => c.key === 'current_semester')?.value
      const totalWks = configData.find(c => c.key === 'total_weeks')?.value
      const curWk = configData.find(c => c.key === 'current_week')?.value
      const penConfig = configData.find(c => c.key === 'penalty_rules')?.value

      if (sem) setCurrentSemester(sem)
      if (totalWks) { wks = Number(totalWks); setTotalWeeks(wks); }
      if (curWk) setCurrentWeek(Number(curWk))
      if (penConfig) {
        const parsed = JSON.parse(penConfig)
        if (parsed.absenceLate) setAbsenceLateFine(parsed.absenceLate)
      }
    }

    // 2. 주차별 사유서 마감일 불러오기
    const { data: dlData } = await supabase.from('pr_deadlines').select('*').eq('category', 'absence')
    const newDeadlines = Array(wks + 1).fill('')
    
    if (dlData) {
      dlData.forEach(d => {
        if (d.week >= 0 && d.week <= wks && d.deadline_time) {
          const date = new Date(d.deadline_time)
          const localString = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16)
          newDeadlines[d.week] = localString
        }
      })
    }
    setAbsenceDeadlines(newDeadlines)

    // 3. 사유서 결재 리스트 전체 불러오기
    const { data: absData } = await supabase.from('absence_forms').select('*').order('created_at', { ascending: false })
    if (absData) setAbsences(absData)

    setLoading(false)
  }

  // ==========================================
  // 🕒 마감 기한 설정 로직
  // ==========================================
  const handleDeadlineChange = (weekIndex, value) => {
    const newDl = [...absenceDeadlines]
    newDl[weekIndex] = value
    setAbsenceDeadlines(newDl)
  }

  const handleSaveDeadlines = async () => {
    setSaving(true)

    await supabase.from('pr_deadlines').delete().eq('category', 'absence')
    
    const dlInserts = []
    const dlDeletes = []

    absenceDeadlines.forEach((time, idx) => {
      if (time) {
        dlInserts.push({ week: idx, category: 'absence', deadline_time: new Date(time).toISOString() })
      } else {
        dlDeletes.push({ week: idx, category: 'absence' })
      }
    })

    if (dlInserts.length > 0) {
      const { error } = await supabase.from('pr_deadlines').upsert(dlInserts, { onConflict: 'week, category' })
      if (error) alert('마감 시간 저장 오류: ' + error.message)
    }

    if (dlDeletes.length > 0) {
      for (const item of dlDeletes) {
        await supabase.from('pr_deadlines').delete().eq('week', item.week).eq('category', item.category)
      }
    }

    alert('주차별 사유서 마감 기한이 저장되었습니다! 💾')
    setSaving(false)
  }

  // ==========================================
  // 📝 사유서 결재 로직
  // ==========================================
  const handleAbsenceApproval = async (id, userName, statusType, absWeek) => {
    let finalStatus = ''
    let comment = ''
    let fineAmount = 0

    if (statusType === 'full') {
      finalStatus = '완전인정'
      comment = '사유 타당. 벌금 면제'
    } else if (statusType === 'partial') {
      const hasTask = partialTasks[id] || false
      finalStatus = `부분인정 (대체과제: ${hasTask ? 'O' : 'X'})`
      comment = '부분 인정 처리 (벌금 면제)' 
    } else if (statusType === 'reject') {
      const reason = rejectReasons[id] || ''
      if (!reason.trim()) return alert('반려 사유를 필수로 입력해주세요!')
      finalStatus = '불허'
      comment = reason
      fineAmount = absenceLateFine 
    }

    await supabase.from('absence_forms').update({ status: finalStatus, admin_comment: comment }).eq('id', id)

    // 불허인 경우에만 벌금 부과 (해당 사유서의 주차 적용, 없으면 현재 주차)
    if (fineAmount > 0) {
      const { error } = await supabase.from('pr_fines').insert([{
        user_name: userName, 
        week: absWeek || currentWeek, 
        category: '사유서 불허 페널티', 
        amount: fineAmount, 
        reason: comment, 
        is_paid: false
      }])
      
      if (error) return alert("벌금 DB 등록 에러: " + error.message)
    }

    setRejectReasons(prev => ({...prev, [id]: ''}))
    fetchData()
  }

  // 🌟 폴더별 렌더링 필터링 로직
  const filteredAbsences = absences.filter(abs => {
    if (selectedFolder === 'all') return true;
    if (selectedFolder === 'null') return abs.week === null || abs.week === undefined;
    return abs.week === selectedFolder;
  });

  if (loading) return <div className="p-10 text-center font-black text-slate-500 min-h-screen flex items-center justify-center">사유서 관리자 로딩 중... 🔄</div>

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-12 pb-32">
      <div className="max-w-[1400px] mx-auto space-y-12">
        
        <header className="border-b border-slate-200 pb-6 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <Link href="/admin/hub" className="text-xs font-black text-slate-400 hover:text-purple-600 uppercase tracking-widest mb-2 block transition-colors">← Back to Hub</Link>
            <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-800">
              📝 Absence Form Manager
            </h1>
            <p className="text-xs font-bold text-slate-500 mt-2">주차별 사유서 제출 기한을 설정하고, 접수된 사유서를 결재합니다.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-[400px_1fr] gap-8 items-start">
          
          {/* 🌟 좌측: 사유서 마감 기한 설정 */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 sticky top-8">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <h2 className="text-xl font-black text-slate-800">⏰ 주차별 마감 기한</h2>
              <button onClick={handleSaveDeadlines} disabled={saving} className="bg-slate-900 text-white px-4 py-2 rounded-xl font-black text-xs hover:bg-purple-600 transition-colors shadow-sm active:scale-95">
                {saving ? '저장 중...' : '마감일 저장 💾'}
              </button>
            </div>

            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 no-scrollbar">
              {weeks.map(w => (
                <div key={w} className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] font-black text-purple-600 uppercase tracking-widest bg-purple-100 px-2 py-0.5 rounded">
                      Week {w} 마감
                    </label>
                    <button 
                      onClick={() => handleDeadlineChange(w, '')} 
                      className="text-[9px] font-bold text-slate-400 hover:text-red-500 bg-white px-2 py-0.5 rounded-md border border-slate-200 transition-colors shadow-sm"
                      title="날짜 지우기"
                    >
                      초기화 ❌
                    </button>
                  </div>
                  <input 
                    type="datetime-local" 
                    value={absenceDeadlines[w] || ''} 
                    onChange={(e) => handleDeadlineChange(w, e.target.value)} 
                    className="w-full bg-white p-2.5 rounded-xl font-bold text-sm text-slate-700 outline-none border border-slate-200 focus:border-purple-400 transition-colors cursor-pointer" 
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 🌟 우측: 사유서 결재 리스트 */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-black text-slate-800">📬 사유서 결재함</h2>
              <span className="text-[10px] font-black bg-slate-100 text-slate-500 px-3 py-1 rounded-lg">
                폴더 내 {filteredAbsences.length}건
              </span>
            </div>

            {/* 🌟 주차별 폴더 탭 (가로 스크롤) */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-4 no-scrollbar border-b border-slate-100">
              <button 
                onClick={() => setSelectedFolder('all')} 
                className={`px-4 py-2.5 rounded-xl text-xs font-black shrink-0 transition-all border ${selectedFolder === 'all' ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
              >
                전체 보기 📂
              </button>
              {weeks.map(w => (
                <button 
                  key={w} 
                  onClick={() => setSelectedFolder(w)} 
                  className={`px-4 py-2.5 rounded-xl text-xs font-black shrink-0 transition-all border ${selectedFolder === w ? 'bg-purple-600 text-white border-purple-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                >
                  W{w} 사유서
                </button>
              ))}
              <button 
                onClick={() => setSelectedFolder('null')} 
                className={`px-4 py-2.5 rounded-xl text-xs font-black shrink-0 transition-all border ${selectedFolder === 'null' ? 'bg-slate-400 text-white border-slate-400 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
              >
                미지정 (이전 데이터)
              </button>
            </div>

            <div className="space-y-6">
              {filteredAbsences.length === 0 ? (
                <p className="text-slate-400 font-bold text-center py-10 border-2 border-dashed border-slate-100 rounded-3xl">해당 폴더에 제출된 사유서가 없습니다. 👏</p>
              ) : filteredAbsences.map(abs => (
                <div key={abs.id} className={`p-6 rounded-3xl border transition-all ${abs.status === '대기' ? 'bg-slate-50 border-blue-200 shadow-sm' : 'bg-white border-slate-100 opacity-70 hover:opacity-100'} flex flex-col lg:flex-row justify-between gap-6`}>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${abs.status === '대기' ? 'bg-blue-600 text-white' : abs.status.includes('완전인정') ? 'bg-emerald-500 text-white' : abs.status.includes('부분인정') ? 'bg-teal-500 text-white' : 'bg-red-500 text-white'}`}>
                        {abs.status === '대기' ? '대기중' : abs.status}
                      </span>
                      {/* 🌟 리스트에도 몇 주차인지 뱃지 표시 */}
                      <span className="bg-purple-100 text-purple-600 px-2 py-0.5 rounded text-[10px] font-black uppercase">
                        {abs.week !== null && abs.week !== undefined ? `W${abs.week}` : '미지정'}
                      </span>
                      <span className="bg-slate-800 text-white px-2 py-0.5 rounded text-[10px] font-black uppercase">{abs.type}</span>
                      <span className="text-xs font-black text-slate-500">{abs.user_name} | {abs.target_date}</span>
                    </div>
                    
                    <p className="text-sm font-bold text-slate-700 whitespace-pre-wrap leading-relaxed">{abs.reason}</p>
                    
                    {abs.proof_url && (
                      <a href={abs.proof_url} target="_blank" rel="noopener noreferrer" className="inline-block mt-3 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black hover:bg-blue-100 transition-colors border border-blue-100">
                        🔗 첨부된 증빙자료 열람하기
                      </a>
                    )}

                    {abs.status !== '대기' && abs.admin_comment && (
                      <div className="mt-4 p-3 bg-slate-100 rounded-xl border border-slate-200">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">운영진 코멘트</p>
                        <p className="text-xs font-bold text-slate-600">{abs.admin_comment}</p>
                      </div>
                    )}
                  </div>
                  
                  {/* 🌟 결재 컨트롤 패널 */}
                  <div className="flex flex-col gap-2 min-w-[300px] shrink-0 bg-white p-4 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 text-center border-b border-slate-100 pb-2">결재 처리</p>
                    
                    <button onClick={() => handleAbsenceApproval(abs.id, abs.user_name, 'full', abs.week)} className="bg-emerald-500 text-white py-2.5 rounded-xl font-black text-xs hover:bg-emerald-600 transition-colors shadow-sm">
                      완전 인정 (벌금 면제)
                    </button>
                    
                    <div className="flex gap-2">
                      <button onClick={() => handleAbsenceApproval(abs.id, abs.user_name, 'partial', abs.week)} className="flex-1 bg-teal-500 text-white py-2.5 rounded-xl font-black text-xs hover:bg-teal-600 transition-colors shadow-sm">
                        부분 인정
                      </button>
                      <label className="flex items-center gap-2 text-[10px] font-black text-slate-600 bg-teal-50 px-3 rounded-xl border border-teal-100 cursor-pointer hover:bg-teal-100 transition-colors">
                        <input type="checkbox" checked={partialTasks[abs.id] || false} onChange={(e) => setPartialTasks(prev => ({...prev, [abs.id]: e.target.checked}))} className="accent-teal-600" />
                        대체 과제
                      </label>
                    </div>
                    
                    <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-slate-100">
                      <input 
                        type="text" 
                        placeholder="불허(반려) 사유 입력..." 
                        value={rejectReasons[abs.id] || ''} 
                        onChange={e => setRejectReasons(prev => ({...prev, [abs.id]: e.target.value}))} 
                        className="w-full border border-slate-200 rounded-xl p-2.5 text-xs font-bold outline-none focus:border-red-400 bg-slate-50 transition-colors" 
                      />
                      <button onClick={() => handleAbsenceApproval(abs.id, abs.user_name, 'reject', abs.week)} className="w-full bg-red-500 text-white py-2.5 rounded-xl font-black text-xs hover:bg-red-600 transition-colors shadow-sm">
                        불허 (벌금 ₩{absenceLateFine.toLocaleString()} 부과)
                      </button>
                    </div>
                  </div>

                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}