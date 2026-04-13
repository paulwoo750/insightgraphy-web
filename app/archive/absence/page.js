'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function AbsencePage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // 시스템 설정 상태
  const [currentSemester, setCurrentSemester] = useState('')
  const [displayWeek, setDisplayWeek] = useState(1) // 🌟 화면에 안내할 타겟 주차
  const [totalWeeks, setTotalWeeks] = useState(12)
  const [absenceDeadline, setAbsenceDeadline] = useState(null)
  const [isLate, setIsLate] = useState(false)

  // 모든 사유서 데이터 및 필터 상태
  const [allAbsences, setAllAbsences] = useState([])
  const [selectedFolder, setSelectedFolder] = useState('all') 

  // 제출 폼 상태
  const [absenceForm, setAbsenceForm] = useState({ week: 1, date: '', type: '결석', time: '', reason: '', proofUrl: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const weeks = Array.from({ length: totalWeeks + 1 }, (_, i) => i)
  const GOOGLE_DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/1kXKB1l3O9vIhCjdhINzRic_Gn6IKtZlw"

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      setUser(session.user)
      await fetchData()
    }
    init()
  }, [router])

  const fetchData = async () => {
    setLoading(true)

    // 1. 대시보드 설정값 불러오기
    const { data: configData } = await supabase.from('pr_config').select('*')
    if (configData) {
      const sem = configData.find(c => c.key === 'current_semester')?.value || ''
      const tWks = configData.find(c => c.key === 'total_weeks')?.value
      setCurrentSemester(sem)
      if (tWks) setTotalWeeks(Number(tWks))
    }

    // 🌟 2. 스마트 마감일 자동 탐색 (현재 시간과 가장 가까운 주차 찾기)
    const { data: dlData } = await supabase.from('pr_deadlines')
      .select('*')
      .eq('category', 'absence')
      .order('deadline_time', { ascending: true })

    let targetW = 1
    let targetDL = null
    const now = new Date()

    if (dlData && dlData.length > 0) {
      // 1순위: 아직 지나지 않은 마감일 중 가장 빠른 것
      const upcoming = dlData.find(d => new Date(d.deadline_time) > now)
      if (upcoming) {
        targetW = upcoming.week
        targetDL = upcoming.deadline_time
      } else {
        // 2순위: 모두 지났다면 가장 마지막 주차
        const last = dlData[dlData.length - 1]
        targetW = last.week
        targetDL = last.deadline_time
      }
    }

    setDisplayWeek(targetW)
    setAbsenceDeadline(targetDL)
    setIsLate(targetDL ? now > new Date(targetDL) : false)
    
    // 기본 제출 주차도 탐색된 주차로 세팅
    setAbsenceForm(prev => ({ ...prev, week: targetW }))

    // 3. 모든 학회원의 사유서 제출 내역 불러오기
    const { data: absData } = await supabase.from('absence_forms').select('*').order('created_at', { ascending: false })
    if (absData) setAllAbsences(absData)
    
    setLoading(false)
  }

  const formatTime = (dateStr) => {
    if(!dateStr) return ''
    const d = new Date(dateStr)
    return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const handleSubmitAbsence = async () => {
    if (!absenceForm.date || !absenceForm.reason) return alert("날짜와 사유는 필수 입력이야! ✍️")
    if (absenceForm.type !== '결석' && !absenceForm.time) return alert("조퇴나 지각은 시간을 꼭 적어 줘! ⏰")
    if (absenceForm.proofUrl.trim() && !absenceForm.proofUrl.includes("drive.google.com") && !absenceForm.proofUrl.includes("docs.google.com")) {
      return alert("증빙 자료는 구글 드라이브 링크로 제출해 줘! 🤔")
    }

    setIsSubmitting(true)
    const fullReason = absenceForm.type !== '결석' ? `[${absenceForm.time}] ${absenceForm.reason}` : absenceForm.reason

    const { error } = await supabase.from('absence_forms').insert([{
      user_name: user.user_metadata.name,
      week: absenceForm.week,
      target_date: absenceForm.date,
      type: absenceForm.type,
      reason: fullReason,
      proof_url: absenceForm.proofUrl.trim(),
      status: '대기'
    }])

    if (!error) {
      alert("사유서 제출 완료! 게시판에 등록되었습니다. 📝")
      setAbsenceForm(prev => ({ ...prev, date: '', time: '', reason: '', proofUrl: '' }))
      fetchData()
    } else {
      alert("제출 실패: " + error.message)
    }
    setIsSubmitting(false)
  }

  if (loading || !user) return <div className="min-h-screen flex items-center justify-center font-black text-slate-400 bg-slate-50">데이터 불러오는 중... 🔄</div>

  const myAbsences = allAbsences.filter(abs => abs.user_name === user.user_metadata.name)
  const myStats = {
    total: myAbsences.length,
    full: myAbsences.filter(a => a.status.includes('완전인정')).length,
    partial: myAbsences.filter(a => a.status.includes('부분인정')).length,
    reject: myAbsences.filter(a => a.status.includes('불허')).length,
    pending: myAbsences.filter(a => a.status === '대기').length,
  }

  const filteredAbsences = allAbsences.filter(abs => {
    if (selectedFolder === 'all') return true;
    if (selectedFolder === 'null') return abs.week === null || abs.week === undefined;
    return abs.week === selectedFolder;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-12 pb-32">
      <div className="max-w-5xl mx-auto space-y-10">
        
        <header className="mb-6 border-b border-slate-200 pb-6 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            {/* 🌟 뒤로가기 시 홈으로 바로 이동 */}
            <Link href="/home" className="text-xs font-black text-purple-600 hover:underline uppercase tracking-widest mb-3 block">
              ← Back to Hub
            </Link>
            <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter text-slate-800 flex items-center gap-4">
              <span className="text-4xl md:text-5xl">📝</span> Absence Board
            </h1>
            <p className="text-sm font-bold text-slate-500 mt-3">결석, 지각, 조퇴 사유서를 공개 제출하고 모두의 내역을 확인합니다.</p>
          </div>
        </header>

        {/* 1. 나의 사유서 결재 현황 요약 */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
          <h2 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
            <span>👤</span> 내 사유서 결재 현황
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-slate-50 p-4 rounded-2xl flex flex-col items-center justify-center border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">총 제출</p>
              <p className="text-2xl font-black text-slate-700">{myStats.total}건</p>
            </div>
            <div className="bg-emerald-50 p-4 rounded-2xl flex flex-col items-center justify-center border border-emerald-100">
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">완전 인정</p>
              <p className="text-2xl font-black text-emerald-600">{myStats.full}건</p>
            </div>
            <div className="bg-teal-50 p-4 rounded-2xl flex flex-col items-center justify-center border border-teal-100">
              <p className="text-[10px] font-black text-teal-600 uppercase tracking-widest mb-1">부분 인정</p>
              <p className="text-2xl font-black text-teal-600">{myStats.partial}건</p>
            </div>
            <div className="bg-red-50 p-4 rounded-2xl flex flex-col items-center justify-center border border-red-100">
              <p className="text-[10px] font-black text-red-600 uppercase tracking-widest mb-1">불허 (반려)</p>
              <p className="text-2xl font-black text-red-600">{myStats.reject}건</p>
            </div>
            <div className="bg-blue-50 p-4 rounded-2xl flex flex-col items-center justify-center border border-blue-100">
              <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">결재 대기</p>
              <p className="text-2xl font-black text-blue-600">{myStats.pending}건</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 items-start">
          
          {/* 2. 사유서 게시판 */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-slate-800">📋 전체 사유서 게시판</h2>
            </div>

            <div className="flex gap-2 mb-6 overflow-x-auto pb-4 no-scrollbar border-b border-slate-100">
              <button onClick={() => setSelectedFolder('all')} className={`px-4 py-2.5 rounded-xl text-xs font-black shrink-0 transition-all border ${selectedFolder === 'all' ? 'bg-slate-800 text-white shadow-md border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>전체 보기 📂</button>
              {weeks.map(w => (
                <button key={w} onClick={() => setSelectedFolder(w)} className={`px-4 py-2.5 rounded-xl text-xs font-black shrink-0 transition-all border ${selectedFolder === w ? 'bg-purple-600 text-white shadow-md border-purple-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>W{w} 사유서</button>
              ))}
            </div>

            <div className="space-y-4 max-h-[800px] overflow-y-auto pr-2 no-scrollbar">
              {filteredAbsences.length === 0 ? (
                <p className="text-slate-400 font-bold text-center py-12 border-2 border-dashed border-slate-100 rounded-3xl">해당 폴더에 제출된 사유서가 없습니다.</p>
              ) : filteredAbsences.map(abs => {
                const isMine = abs.user_name === user.user_metadata.name;
                const isPartial = abs.status?.includes('부분인정');
                return (
                  <div key={abs.id} className={`p-6 rounded-3xl border transition-all relative ${isMine ? 'bg-blue-50/50 border-blue-200' : 'bg-white border-slate-100 hover:border-slate-300'}`}>
                    {isMine && <span className="absolute -top-3 -right-3 bg-blue-500 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-sm">MY</span>}

                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-4 border-b border-slate-100/50 pb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${abs.status === '대기' ? 'bg-slate-200 text-slate-500' : abs.status.includes('완전인정') ? 'bg-emerald-100 text-emerald-600' : abs.status.includes('부분인정') ? 'bg-teal-100 text-teal-600' : 'bg-red-100 text-red-600'}`}>
                            {abs.status === '대기' ? '결재 대기중' : abs.status}
                          </span>
                          <span className="bg-purple-100 text-purple-600 px-2 py-0.5 rounded text-[9px] font-black uppercase">W{abs.week || '?'}</span>
                          <span className="bg-slate-800 text-white px-2 py-0.5 rounded text-[9px] font-black uppercase">{abs.type}</span>
                        </div>
                        <p className="font-black text-slate-800 flex items-center gap-2 text-lg">
                          👤 {abs.user_name}
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">{abs.target_date} 해당</span>
                        </p>
                      </div>
                      <span className="text-[9px] font-bold text-slate-400">제출: {formatTime(abs.created_at)}</span>
                    </div>
                    
                    <p className="text-sm font-bold text-slate-600 whitespace-pre-wrap leading-relaxed mb-4">{abs.reason}</p>
                    
                    {abs.proof_url && (
                      <a href={abs.proof_url} target="_blank" rel="noopener noreferrer" className="inline-block px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black hover:bg-slate-200 transition-colors">🔗 증빙자료 보기</a>
                    )}

                    {/* 🌟 부분 인정일 경우 대체 과제 내용 표시 */}
                    {abs.status !== '대기' && abs.admin_comment && (
                      <div className={`mt-4 p-4 rounded-2xl border flex gap-3 items-start ${isPartial ? 'bg-teal-50 border-teal-100' : 'bg-slate-50 border-slate-100'}`}>
                        <span className="text-base">{isPartial ? '📌' : '💬'}</span>
                        <div>
                          <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${isPartial ? 'text-teal-500' : 'text-slate-400'}`}>
                            {isPartial ? '대체 과제 및 안내 사항' : '운영진 결재 코멘트'}
                          </p>
                          <p className={`text-xs font-bold whitespace-pre-wrap leading-relaxed ${isPartial ? 'text-teal-700' : 'text-slate-600'}`}>{abs.admin_comment}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* 3. 사유서 제출 폼 */}
          <div className="space-y-6 sticky top-8">
            <div className={`p-6 rounded-[2.5rem] shadow-sm border transition-all ${isLate ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
              <span className="text-[10px] font-black bg-slate-800 text-white px-3 py-1 rounded-md uppercase tracking-widest">{currentSemester || '학기 미설정'}</span>
              <h2 className="text-lg font-black text-slate-800 mt-3 flex items-center gap-2 mb-4">
                <span className="bg-blue-100 text-blue-600 w-6 h-6 flex items-center justify-center rounded-full text-xs">W{displayWeek}</span>
                마감 임박 사유서
              </h2>
              <div className="bg-white/60 p-4 rounded-xl border border-white/80">
                {absenceDeadline ? (
                  <p className={`font-black text-lg flex flex-col gap-1 ${isLate ? 'text-red-500' : 'text-emerald-600'}`}>
                    {formatTime(absenceDeadline)} 
                    {isLate && <span className="text-[9px] font-black uppercase tracking-widest text-red-400">제출 기한이 지났습니다 🚨</span>}
                  </p>
                ) : <p className="font-black text-sm text-slate-400">마감일 미설정</p>}
              </div>
            </div>

            <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-xl border border-slate-800">
              <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-6"><h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2"><span>✍️</span> 새 사유서 작성</h3></div>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">해당 주차</label>
                  <select value={absenceForm.week} onChange={e => setAbsenceForm({...absenceForm, week: Number(e.target.value)})} className="w-full bg-slate-800 text-white p-3 rounded-xl font-bold text-sm outline-none border border-slate-700 focus:border-blue-500 cursor-pointer">
                    {weeks.map(w => <option key={w} value={w}>{w}주차 사유서</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">날짜</label><input type="date" value={absenceForm.date} onChange={e => setAbsenceForm({...absenceForm, date: e.target.value})} className="w-full bg-slate-800 text-white p-3 rounded-xl font-bold text-sm outline-none border border-slate-700" /></div>
                  <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">구분</label><select value={absenceForm.type} onChange={e => setAbsenceForm({...absenceForm, type: e.target.value})} className="w-full bg-slate-800 text-white p-3 rounded-xl font-bold text-sm outline-none border border-slate-700 cursor-pointer"><option value="결석">결석</option><option value="지각">지각</option><option value="조퇴">조퇴</option></select></div>
                </div>
                {absenceForm.type !== '결석' && (
                  <div className="animate-in slide-in-from-top-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">예상 시간 (필수)</label><input type="time" value={absenceForm.time} onChange={e => setAbsenceForm({...absenceForm, time: e.target.value})} className="w-full bg-slate-800 text-white p-3 rounded-xl font-bold text-sm outline-none border border-slate-700" /></div>
                )}
                <div><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">상세 사유</label><textarea value={absenceForm.reason} onChange={e => setAbsenceForm({...absenceForm, reason: e.target.value})} className="w-full bg-slate-800 text-white p-4 rounded-xl font-bold text-sm outline-none border border-slate-700 focus:border-blue-500 min-h-[100px]" placeholder="구체적인 사유를 작성해 주세요." /></div>
                <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3">증빙 자료 링크 (선택)</label>
                  <div className="flex flex-col gap-2">
                    <a href={GOOGLE_DRIVE_FOLDER_URL} target="_blank" rel="noopener noreferrer" className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-4 py-2.5 rounded-xl font-black text-[10px] transition-all flex items-center justify-center gap-2"><span className="text-base">📁</span> Step 1. 드라이브 업로드</a>
                    <input type="text" value={absenceForm.proofUrl} onChange={e => setAbsenceForm({...absenceForm, proofUrl: e.target.value})} className="w-full bg-slate-900 text-white p-3 rounded-xl font-bold text-xs outline-none border border-slate-600" placeholder="Step 2. 공유 링크 붙여넣기" />
                  </div>
                </div>
                <button onClick={handleSubmitAbsence} disabled={isSubmitting} className={`w-full py-4 text-white rounded-xl font-black text-sm transition-all shadow-lg mt-2 active:scale-95 ${isLate && absenceForm.week === displayWeek ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                  {isSubmitting ? '제출 중...' : isLate && absenceForm.week === displayWeek ? '지각 제출하기 🚨' : '게시판에 등록하기 🚀'}
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}