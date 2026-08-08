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
  const [weekdayDeadlines, setWeekdayDeadlines] = useState([])
  const [selectedFolder, setSelectedFolder] = useState('all')

  // 🌟 방학학기: 정규세션 / 평일세션 구분
  const [semesterType, setSemesterType] = useState('regular')
  const [dlTab, setDlTab] = useState('regular')      // 마감 설정 탭
  const [sessionFilter, setSessionFilter] = useState('all') // 결재함 필터
  const [attendances, setAttendances] = useState([])

  // 🌟 사유서 리스트 상태
  const [absences, setAbsences] = useState([])
  
  // 🌟 결재 입력 폼 상태 
  const [rejectReasons, setRejectReasons] = useState({})
  
  // 🌟 [변경됨] 대체 과제 상세 내용 상태 관리 (단순 boolean -> 문자열)
  const [partialTasks, setPartialTasks] = useState({})
  const [partialInputs, setPartialInputs] = useState({}) 

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
      setSemesterType(configData.find(c => c.key === 'semester_type')?.value || 'regular')
      if (penConfig) {
        const parsed = JSON.parse(penConfig)
        if (parsed.absenceLate) setAbsenceLateFine(parsed.absenceLate)
      }
    }

    // 2. 주차별 사유서 마감일 불러오기 (정규 = absence / 평일세션 = weekday_absence)
    const { data: dlData } = await supabase.from('pr_deadlines').select('*').in('category', ['absence', 'weekday_absence'])
    const regDl = Array(wks + 1).fill('')
    const wdDl = Array(wks + 1).fill('')

    if (dlData) {
      dlData.forEach(d => {
        if (d.week >= 0 && d.week <= wks && d.deadline_time) {
          const date = new Date(d.deadline_time)
          const localString = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16)
          if (d.category === 'weekday_absence') wdDl[d.week] = localString
          else regDl[d.week] = localString
        }
      })
    }
    setAbsenceDeadlines(regDl)
    setWeekdayDeadlines(wdDl)

    // 3. 사유서 결재 리스트 + 출석 기록(연동 표시용) 불러오기
    const { data: absData } = await supabase.from('absence_forms').select('*').order('created_at', { ascending: false })
    if (absData) setAbsences(absData)

    const { data: attData } = await supabase.from('pr_attendance').select('*')
    setAttendances(attData || [])

    setLoading(false)
  }

  // ==========================================
  // 🕒 마감 기한 설정 로직
  // ==========================================
  const handleDeadlineChange = (weekIndex, value) => {
    if (dlTab === 'weekday') {
      const newDl = [...weekdayDeadlines]
      newDl[weekIndex] = value
      setWeekdayDeadlines(newDl)
    } else {
      const newDl = [...absenceDeadlines]
      newDl[weekIndex] = value
      setAbsenceDeadlines(newDl)
    }
  }

  const handleSaveDeadlines = async () => {
    setSaving(true)

    const dlInserts = []
    const dlDeletes = []

    const collect = (arr, category) => {
      arr.forEach((time, idx) => {
        if (time) dlInserts.push({ week: idx, category, deadline_time: new Date(time).toISOString() })
        else dlDeletes.push({ week: idx, category })
      })
    }
    collect(absenceDeadlines, 'absence')
    if (semesterType === 'vacation') collect(weekdayDeadlines, 'weekday_absence')

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
  // 📝 사유서 결재 로직 (부분인정 내용 포함)
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
      const taskDetail = partialInputs[id] || ''
      
      // 🌟 대체 과제가 체크되어 있다면 상세 내용을 꼭 적도록 강제!
      if (hasTask && !taskDetail.trim()) {
        return alert("대체 과제가 체크되어 있습니다. 과제 내용과 제출 기한을 텍스트 칸에 상세히 입력해주세요! ✍️")
      }

      finalStatus = `부분인정 (대체과제: ${hasTask ? 'O' : 'X'})`
      comment = hasTask ? `[대체 과제 부여]\n${taskDetail}` : '부분 인정 처리 (별도 대체 과제 없음)' 
      
    } else if (statusType === 'reject') {
      const reason = rejectReasons[id] || ''
      if (!reason.trim()) return alert('반려 사유를 필수로 입력해주세요!')
      finalStatus = '불허'
      comment = reason
      fineAmount = absenceLateFine 
    }

    await supabase.from('absence_forms').update({ status: finalStatus, admin_comment: comment }).eq('id', id)

    if (fineAmount > 0) {
      const { error } = await supabase.from('pr_fines').insert([{
        user_name: userName, 
        week: absWeek || currentWeek, 
        category: '사유서 불허 페널티',
        amount: fineAmount,
        reason: comment,
        is_paid: false,
        semester: currentSemester
      }])
      
      if (error) return alert("벌금 DB 등록 에러: " + error.message)
    }

    setRejectReasons(prev => ({...prev, [id]: ''}))
    setPartialInputs(prev => ({...prev, [id]: ''})) 
    fetchData()
  }

  // 폴더별 + 세션 유형별 필터링
  const filteredAbsences = absences.filter(abs => {
    if (sessionFilter !== 'all' && (abs.session_type || 'regular') !== sessionFilter) return false;
    if (selectedFolder === 'all') return true;
    if (selectedFolder === 'null') return abs.week === null || abs.week === undefined;
    return abs.week === selectedFolder;
  });

  // 🌟 해당 사유서의 출석 기록 (연동 상태 표시용)
  const attFor = (abs) => attendances.find(a =>
    a.user_name === abs.user_name && a.week === abs.week &&
    (a.session_type || 'regular') === (abs.session_type || 'regular')
  );
  // 마감 기한 대비 지각 제출 여부
  const isLateSubmit = (abs) => {
    const arr = (abs.session_type === 'weekday') ? weekdayDeadlines : absenceDeadlines;
    const dl = arr[abs.week];
    return dl ? new Date(abs.created_at) > new Date(dl) : false;
  };

  if (loading) return <div className="p-10 text-center font-black text-slate-500 min-h-screen flex items-center justify-center">사유서 관리자 로딩 중... 🔄</div>

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-12 pb-32">
      <div className="max-w-[1400px] mx-auto space-y-12">
        
        <header className="border-b border-slate-200 pb-6 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <Link href="/admin/hub" className="text-xs font-black text-slate-400 hover:text-teal-600 uppercase tracking-widest mb-2 block transition-colors">← Back to Hub</Link>
            <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-800">
              📝 Absence Form Manager
            </h1>
            <p className="text-xs font-bold text-slate-500 mt-2">주차별 사유서 제출 기한을 설정하고, 접수된 사유서를 결재합니다.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-[400px_1fr] gap-8 items-start">
          
          {/* 좌측: 마감 기한 설정 */}
          <div className="bg-white p-8 rounded-none shadow-sm border border-slate-200 sticky top-8">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <h2 className="text-xl font-black text-slate-800">⏰ 주차별 마감 기한</h2>
              <button onClick={handleSaveDeadlines} disabled={saving} className="bg-slate-900 text-white px-4 py-2 rounded-none font-black text-xs hover:bg-teal-600 transition-colors shadow-sm active:scale-95">
                {saving ? '저장 중...' : '마감일 저장 💾'}
              </button>
            </div>

            {/* 🌟 방학학기: 정규 / 평일세션 마감 탭 */}
            {semesterType === 'vacation' && (
              <div className="mb-4">
                <div className="flex border border-slate-300">
                  <button onClick={() => setDlTab('regular')} className={`flex-1 py-2 text-xs font-bold transition-colors ${dlTab === 'regular' ? 'bg-teal-800 text-white' : 'bg-white text-slate-500 hover:text-teal-800'}`}>📚 정규세션</button>
                  <button onClick={() => setDlTab('weekday')} className={`flex-1 py-2 text-xs font-bold border-l border-slate-300 transition-colors ${dlTab === 'weekday' ? 'bg-teal-800 text-white' : 'bg-white text-slate-500 hover:text-teal-800'}`}>🏖️ 평일세션</button>
                </div>
                <p className="text-[11px] font-medium text-slate-500 mt-2 break-keep">
                  {dlTab === 'weekday'
                    ? '회칙: 평일세션 불참 사유서는 세션 전주 일요일 자정까지 제출.'
                    : '회칙(제19조): 정규세션 사유서는 화요일 자정까지 제출.'}
                </p>
              </div>
            )}

            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 no-scrollbar">
              {weeks.map(w => (
                <div key={w} className="bg-slate-50 p-4 rounded-none border border-slate-100">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] font-black text-teal-600 uppercase tracking-widest bg-teal-100 px-2 py-0.5 rounded">
                      Week {w} {dlTab === 'weekday' ? '평일' : ''} 마감
                    </label>
                    <button 
                      onClick={() => handleDeadlineChange(w, '')} 
                      className="text-[9px] font-bold text-slate-400 hover:text-red-500 bg-white px-2 py-0.5 rounded-none border border-slate-200 transition-colors shadow-sm"
                      title="날짜 지우기"
                    >
                      초기화 ❌
                    </button>
                  </div>
                  <input 
                    type="datetime-local" 
                    value={(dlTab === 'weekday' ? weekdayDeadlines[w] : absenceDeadlines[w]) || ''}
                    onChange={(e) => handleDeadlineChange(w, e.target.value)}
                    className="w-full bg-white p-2.5 rounded-none font-bold text-sm text-slate-700 outline-none border border-slate-200 focus:border-teal-400 transition-colors cursor-pointer" 
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 우측: 사유서 결재 리스트 */}
          <div className="bg-white p-8 rounded-none shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-black text-slate-800">📬 사유서 결재함</h2>
              <span className="text-[10px] font-black bg-slate-100 text-slate-500 px-3 py-1 rounded-none">
                폴더 내 {filteredAbsences.length}건
              </span>
            </div>

            {/* 🌟 방학학기: 세션 유형 필터 */}
            {semesterType === 'vacation' && (
              <div className="flex border border-slate-300 mb-4 w-fit">
                {[['all', '전체'], ['regular', '📚 정규세션'], ['weekday', '🏖️ 평일세션']].map(([v, label], i) => (
                  <button key={v} onClick={() => setSessionFilter(v)} className={`px-5 py-2 text-xs font-bold transition-colors ${i > 0 ? 'border-l border-slate-300' : ''} ${sessionFilter === v ? 'bg-teal-800 text-white' : 'bg-white text-slate-500 hover:text-teal-800'}`}>{label}</button>
                ))}
              </div>
            )}

            <div className="flex gap-2 mb-6 overflow-x-auto pb-4 no-scrollbar border-b border-slate-100">
              <button
                onClick={() => setSelectedFolder('all')}
                className={`px-4 py-2.5 rounded-none text-xs font-black shrink-0 transition-all border ${selectedFolder === 'all' ? 'bg-slate-800 text-white border-slate-800 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
              >
                전체 보기 📂
              </button>
              {weeks.map(w => (
                <button 
                  key={w} 
                  onClick={() => setSelectedFolder(w)} 
                  className={`px-4 py-2.5 rounded-none text-xs font-black shrink-0 transition-all border ${selectedFolder === w ? 'bg-teal-600 text-white border-teal-600 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
                >
                  W{w} 사유서
                </button>
              ))}
              <button 
                onClick={() => setSelectedFolder('null')} 
                className={`px-4 py-2.5 rounded-none text-xs font-black shrink-0 transition-all border ${selectedFolder === 'null' ? 'bg-slate-400 text-white border-slate-400 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
              >
                미지정 (이전 데이터)
              </button>
            </div>

            <div className="space-y-6">
              {filteredAbsences.length === 0 ? (
                <p className="text-slate-400 font-bold text-center py-10 border-2 border-dashed border-slate-100 rounded-none">해당 폴더에 제출된 사유서가 없습니다. 👏</p>
              ) : filteredAbsences.map(abs => (
                <div key={abs.id} className={`p-6 rounded-none border transition-all ${abs.status === '대기' ? 'bg-slate-50 border-teal-200 shadow-sm' : 'bg-white border-slate-100 opacity-70 hover:opacity-100'} flex flex-col lg:flex-row justify-between gap-6`}>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${abs.status === '대기' ? 'bg-teal-600 text-white' : abs.status.includes('완전인정') ? 'bg-emerald-500 text-white' : abs.status.includes('부분인정') ? 'bg-teal-500 text-white' : 'bg-red-500 text-white'}`}>
                        {abs.status === '대기' ? '대기중' : abs.status}
                      </span>
                      <span className="bg-teal-100 text-teal-600 px-2 py-0.5 rounded text-[10px] font-black uppercase">
                        {abs.week !== null && abs.week !== undefined ? `W${abs.week}` : '미지정'}
                      </span>
                      {abs.session_type === 'weekday' && <span className="bg-teal-800 text-white px-2 py-0.5 rounded text-[10px] font-black uppercase">평일세션</span>}
                      <span className="bg-slate-800 text-white px-2 py-0.5 rounded text-[10px] font-black uppercase">{abs.type}</span>
                      <span className="text-xs font-black text-slate-500">{abs.user_name} | {abs.target_date}</span>
                      {isLateSubmit(abs) && <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded text-[10px] font-black uppercase">기한 초과 제출</span>}
                    </div>

                    {/* 🌟 출석·벌금 연동 상태 */}
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">연동</span>
                      {(() => { const at = attFor(abs); return (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${at ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                          출석: {at ? at.status : '기록 없음'}
                        </span>
                      )})()}
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        abs.status?.includes('완전인정') || abs.status?.includes('부분인정')
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : abs.status?.includes('불허') ? 'bg-red-50 text-red-600 border border-red-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                        벌금: {abs.status?.includes('완전인정') || abs.status?.includes('부분인정') ? '결석 벌금 면제' : abs.status?.includes('불허') ? `₩${absenceLateFine.toLocaleString()} 부과` : '결재 대기 (미적용)'}
                      </span>
                    </div>

                    <p className="text-sm font-bold text-slate-700 whitespace-pre-wrap leading-relaxed">{abs.reason}</p>
                    
                    {abs.proof_url && (
                      <a href={abs.proof_url} target="_blank" rel="noopener noreferrer" className="inline-block mt-3 px-3 py-1.5 bg-teal-50 text-teal-600 rounded-none text-[10px] font-black hover:bg-teal-100 transition-colors border border-teal-100">
                        🔗 첨부된 증빙자료 열람하기
                      </a>
                    )}

                    {abs.status !== '대기' && abs.admin_comment && (
                      <div className="mt-4 p-3 bg-slate-100 rounded-none border border-slate-200">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">운영진 코멘트 (결과)</p>
                        <p className="text-xs font-bold text-slate-600 whitespace-pre-wrap">{abs.admin_comment}</p>
                      </div>
                    )}
                  </div>
                  
                  {/* 🌟 결재 컨트롤 패널 */}
                  <div className="flex flex-col gap-2 min-w-[300px] shrink-0 bg-white p-4 rounded-none border border-slate-100 h-fit">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 text-center border-b border-slate-100 pb-2">결재 처리</p>
                    
                    <button onClick={() => handleAbsenceApproval(abs.id, abs.user_name, 'full', abs.week)} className="bg-emerald-500 text-white py-2.5 rounded-none font-black text-xs hover:bg-emerald-600 transition-colors shadow-sm">
                      완전 인정 (벌금 면제)
                    </button>
                    
                    {/* 🌟 부분 인정 패널 업그레이드 */}
                    <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-slate-100">
                      <div className="flex justify-between items-center bg-teal-50 px-3 py-2 rounded-none border border-teal-100">
                        <span className="text-[10px] font-black text-teal-700">대체 과제 부여</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={partialTasks[abs.id] || false} 
                            onChange={(e) => setPartialTasks(prev => ({...prev, [abs.id]: e.target.checked}))} 
                            className="sr-only peer" 
                          />
                          <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-none peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-none after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-500"></div>
                        </label>
                      </div>
                      
                      {/* 대체 과제 체크 시 활성화되는 상세 입력 칸 */}
                      <textarea 
                        disabled={!partialTasks[abs.id]}
                        placeholder={partialTasks[abs.id] ? "예) 1. 관련 아티클 3개 요약 (A4 1장)\n2. 다음 주 월요일 18:00까지 제출" : "대체 과제를 체크하면 입력할 수 있습니다."}
                        value={partialInputs[abs.id] || ''}
                        onChange={(e) => setPartialInputs(prev => ({...prev, [abs.id]: e.target.value}))}
                        className={`w-full border border-slate-200 rounded-none p-3 text-xs font-bold outline-none focus:border-teal-400 transition-colors resize-none h-20 ${!partialTasks[abs.id] ? 'bg-slate-100 text-slate-400 opacity-50' : 'bg-white'}`}
                      />
                      <button onClick={() => handleAbsenceApproval(abs.id, abs.user_name, 'partial', abs.week)} className="bg-teal-500 text-white py-2.5 rounded-none font-black text-xs hover:bg-teal-600 transition-colors shadow-sm mt-1">
                        부분 인정 처리하기
                      </button>
                    </div>
                    
                    <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-slate-100">
                      <input 
                        type="text" 
                        placeholder="불허(반려) 사유 입력..." 
                        value={rejectReasons[abs.id] || ''} 
                        onChange={e => setRejectReasons(prev => ({...prev, [abs.id]: e.target.value}))} 
                        className="w-full border border-slate-200 rounded-none p-2.5 text-xs font-bold outline-none focus:border-red-400 bg-slate-50 transition-colors" 
                      />
                      <button onClick={() => handleAbsenceApproval(abs.id, abs.user_name, 'reject', abs.week)} className="w-full bg-red-500 text-white py-2.5 rounded-none font-black text-xs hover:bg-red-600 transition-colors shadow-sm">
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