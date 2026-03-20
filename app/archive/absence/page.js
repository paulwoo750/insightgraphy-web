'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function AbsencePage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // 🌟 DB에서 불러올 학기, 주차, 마감 기한 상태
  const [currentSemester, setCurrentSemester] = useState('')
  const [currentWeek, setCurrentWeek] = useState(1)
  const [absenceDeadline, setAbsenceDeadline] = useState(null)
  const [isLate, setIsLate] = useState(false)

  const [myAbsences, setMyAbsences] = useState([])
  const [absenceForm, setAbsenceForm] = useState({ date: '', type: '결석', time: '', reason: '', proofUrl: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const GOOGLE_DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/1kXKB1l3O9vIhCjdhINzRic_Gn6IKtZlw"

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      setUser(session.user)
      await fetchData(session.user.user_metadata.name)
    }
    init()
  }, [router])

  const fetchData = async (userName) => {
    setLoading(true)

    // 1. 대시보드 설정값 (학기, 주차) 불러오기
    const { data: configData } = await supabase.from('pr_config').select('*')
    let week = 1
    if (configData) {
      const sem = configData.find(c => c.key === 'current_semester')?.value || ''
      const wks = configData.find(c => c.key === 'current_week')?.value
      setCurrentSemester(sem)
      if (wks) week = Number(wks)
      setCurrentWeek(week)
    }

    // 2. 해당 주차의 '사유서' 마감 기한 불러오기
    const { data: dlData } = await supabase
      .from('pr_deadlines')
      .select('deadline_time')
      .eq('week', week)
      .eq('category', 'absence')
      .single()
    
    if (dlData && dlData.deadline_time) {
      setAbsenceDeadline(dlData.deadline_time)
      // 🌟 현재 시간과 마감 기한 비교해서 지각 여부(isLate) 설정
      setIsLate(new Date() > new Date(dlData.deadline_time))
    } else {
      setAbsenceDeadline(null)
      setIsLate(false)
    }

    // 3. 내 사유서 제출 내역 불러오기
    if (userName) {
      const { data: absData } = await supabase
        .from('absence_forms')
        .select('*')
        .eq('user_name', userName)
        .order('created_at', { ascending: false })
      if (absData) setMyAbsences(absData)
    }
    
    setLoading(false)
  }

  // 시간 포맷팅 함수 (예: 3/15 23:59)
  const formatTime = (dateStr) => {
    if(!dateStr) return ''
    const d = new Date(dateStr)
    return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  // ==========================================
  // 🌟 기능: 사유서 제출 (링크 복붙 방식)
  // ==========================================
  const handleSubmitAbsence = async () => {
    if (!absenceForm.date || !absenceForm.reason) return alert("날짜와 사유는 필수 입력이야! ✍️")
    if (absenceForm.type !== '결석' && !absenceForm.time) return alert("조퇴나 지각은 시간을 꼭 적어 줘! ⏰")
    
    if (absenceForm.proofUrl.trim() && !absenceForm.proofUrl.includes("drive.google.com") && !absenceForm.proofUrl.includes("docs.google.com")) {
      return alert("증빙 자료는 구글 드라이브 링크로 제출해 줘! 🤔")
    }

    setIsSubmitting(true)
    
    const fullReason = absenceForm.type !== '결석' 
      ? `[${absenceForm.time}] ${absenceForm.reason}` 
      : absenceForm.reason

    const { error } = await supabase.from('absence_forms').insert([{
      user_name: user.user_metadata.name,
      target_date: absenceForm.date,
      type: absenceForm.type,
      reason: fullReason,
      proof_url: absenceForm.proofUrl.trim(),
      status: '대기'
    }])

    if (!error) {
      alert("사유서 제출 완료! 관리자 승인을 기다려 줘. 📝")
      setAbsenceForm({ date: '', type: '결석', time: '', reason: '', proofUrl: '' })
      fetchData(user.user_metadata.name)
    } else {
      alert("제출 실패: " + error.message)
    }
    setIsSubmitting(false)
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center font-black text-slate-400 bg-slate-50">데이터 불러오는 중... 🔄</div>

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-12 pb-32">
      <div className="max-w-4xl mx-auto space-y-10">
        
        {/* 상단 헤더 */}
        <header className="mb-6">
          <Link href="/archive" className="text-xs font-black text-purple-600 hover:underline uppercase tracking-widest mb-3 block">
            ← Back to Archive
          </Link>
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter text-slate-800 flex items-center gap-4">
            <span className="text-4xl md:text-5xl">📝</span> Absence Form
          </h1>
          <p className="text-sm font-bold text-slate-500 mt-3">결석, 지각, 조퇴 사유서를 제출하고 승인 결과를 확인하세요.</p>
        </header>

        {/* 🌟 학기 & 주차 마감일 알림 보드 (새로 추가됨) */}
        <div className={`p-6 rounded-[2rem] shadow-sm border flex flex-col md:flex-row justify-between md:items-center gap-4 transition-all ${isLate ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
          <div>
            <span className="text-[10px] font-black bg-slate-800 text-white px-3 py-1 rounded-md uppercase tracking-widest">
              {currentSemester}
            </span>
            <h2 className="text-xl font-black text-slate-800 mt-3 flex items-center gap-2">
              <span className="bg-blue-100 text-blue-600 w-7 h-7 flex items-center justify-center rounded-full text-sm">W{currentWeek}</span>
              {currentWeek}주차 사유서 제출 기한
            </h2>
          </div>
          <div className="text-left md:text-right bg-white/50 p-4 rounded-xl border border-white">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">제출 마감 일시</p>
            {absenceDeadline ? (
              <p className={`font-black text-xl flex items-center gap-3 ${isLate ? 'text-red-500' : 'text-emerald-500'}`}>
                {formatTime(absenceDeadline)} 
                {isLate && <span className="bg-red-500 text-white px-2 py-0.5 rounded text-[10px] uppercase tracking-widest shadow-sm animate-pulse">지각 🚨</span>}
              </p>
            ) : (
               <p className="font-black text-sm text-slate-400">이번 주 마감일 미설정</p>
            )}
          </div>
        </div>

        {/* 사유서 작성 폼 */}
        <main className="space-y-10">
          <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-800 pb-4 mb-2">
              <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2"><span>✍️</span> 신규 사유서 작성</h3>
              {isLate && <span className="text-[10px] font-black text-red-400">지각 제출 시 무단결석 처리될 수 있습니다.</span>}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">해당 날짜</label>
                <input 
                  type="date" 
                  value={absenceForm.date} 
                  onChange={e => setAbsenceForm({...absenceForm, date: e.target.value})} 
                  className="w-full bg-slate-800 text-white p-3 rounded-xl font-bold text-sm outline-none border border-slate-700 focus:border-blue-500 transition-colors" 
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">구분</label>
                <div className="flex gap-2">
                  {['결석', '조퇴', '지각'].map(t => (
                    <button 
                      key={t} 
                      onClick={() => setAbsenceForm({...absenceForm, type: t})} 
                      className={`flex-1 py-3 rounded-xl font-black text-xs transition-all ${absenceForm.type === t ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            {absenceForm.type !== '결석' && (
              <div className="animate-in slide-in-from-top-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">예상 시간 (필수)</label>
                <input 
                  type="time" 
                  value={absenceForm.time} 
                  onChange={e => setAbsenceForm({...absenceForm, time: e.target.value})} 
                  className="w-full md:w-1/2 bg-slate-800 text-white p-3 rounded-xl font-bold text-sm outline-none border border-slate-700 focus:border-blue-500 transition-colors" 
                />
              </div>
            )}

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">상세 사유</label>
              <textarea 
                value={absenceForm.reason} 
                onChange={e => setAbsenceForm({...absenceForm, reason: e.target.value})} 
                className="w-full bg-slate-800 text-white p-4 rounded-xl font-bold text-sm outline-none border border-slate-700 focus:border-blue-500 transition-colors min-h-[100px]" 
                placeholder="구체적인 사유를 작성해 주세요." 
              />
            </div>

            {/* 2-Step 증빙 자료 링크 제출 */}
            <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-3">증빙 자료 링크 첨부 (선택)</label>
              <div className="flex flex-col sm:flex-row gap-3">
                <a href={GOOGLE_DRIVE_FOLDER_URL} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 bg-slate-700 hover:bg-slate-600 text-slate-300 px-4 py-3 rounded-xl font-black text-[10px] transition-all flex items-center justify-center gap-2 shadow-sm">
                  <span className="text-lg">📁</span> Step 1. 드라이브에 업로드
                </a>
                <input 
                  type="text" 
                  value={absenceForm.proofUrl} 
                  onChange={e => setAbsenceForm({...absenceForm, proofUrl: e.target.value})} 
                  className="flex-1 bg-slate-900 text-white p-3 rounded-xl font-bold text-sm outline-none border border-slate-600 focus:border-blue-500 transition-colors" 
                  placeholder="Step 2. 공유 링크를 여기에 붙여넣어!" 
                />
              </div>
            </div>

            <button 
              onClick={handleSubmitAbsence} 
              disabled={isSubmitting} 
              className={`w-full py-4 text-white rounded-xl font-black text-sm transition-all shadow-lg mt-2 active:scale-95 ${isLate ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              {isSubmitting ? '제출 중...' : isLate ? '지각 제출하기 🚨' : '사유서 제출하기 🚀'}
            </button>
          </div>

          {/* 🌟 2. 나의 제출 내역 및 승인 상태 */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
            <h3 className="text-lg font-black text-slate-800 mb-6 border-b border-slate-100 pb-4">나의 제출 내역 및 승인 상태</h3>
            <div className="space-y-4">
              {myAbsences.length === 0 ? (
                <p className="text-slate-400 font-bold text-sm text-center py-10 border-2 border-dashed border-slate-100 rounded-3xl">제출한 사유서가 없습니다.</p>
              ) : myAbsences.map(abs => (
                <div key={abs.id} className="bg-slate-50 p-6 rounded-3xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-md transition-shadow">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="bg-slate-800 text-white px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-wider">{abs.type}</span>
                      <span className="text-xs font-black text-slate-500">{abs.target_date}</span>
                    </div>
                    <p className="text-sm font-bold text-slate-700 whitespace-pre-wrap leading-relaxed">{abs.reason}</p>
                    {abs.proof_url && (
                      <a href={abs.proof_url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-black text-blue-500 hover:text-blue-700 hover:underline mt-3 inline-flex items-center gap-1 transition-colors">
                        🔗 제출한 증빙자료 링크 열기
                      </a>
                    )}
                  </div>
                  
                  <div className="shrink-0 text-right bg-white p-4 rounded-2xl border border-slate-100 min-w-[160px] shadow-sm">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">관리자 승인 상태</p>
                    <p className={`font-black text-lg ${
                      abs.status === '대기' ? 'text-slate-400' :
                      abs.status.includes('완전인정') ? 'text-emerald-500' :
                      abs.status.includes('부분인정') ? 'text-blue-500' : 'text-red-500'
                    }`}>
                      {abs.status === '대기' ? '⏳ 대기중' : abs.status}
                    </p>
                    {abs.admin_comment && (
                      <p className="text-[10px] font-bold text-slate-600 mt-3 bg-slate-50 p-2.5 rounded-lg text-left leading-tight border border-slate-100">
                        💬 {abs.admin_comment}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>

      </div>
    </div>
  )
}