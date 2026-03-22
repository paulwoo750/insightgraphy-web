'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function FineAdmin() {
  const [loading, setLoading] = useState(true)
  
  const [fines, setFines] = useState([])
  const [penalties, setPenalties] = useState({})
  const [deadlines, setDeadlines] = useState([])
  
  const [scanWeek, setScanWeek] = useState(1)
  const [scannedResults, setScannedResults] = useState([])

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)

    const { data: configData } = await supabase.from('pr_config').select('value').eq('key', 'penalty_rules').single()
    if (configData) setPenalties(JSON.parse(configData.value))

    const { data: dlData } = await supabase.from('pr_deadlines').select('*')
    if (dlData) setDeadlines(dlData)

    const { data: fineData } = await supabase.from('pr_fines').select('*').eq('is_paid', false).order('week', { ascending: true })
    if (fineData) setFines(fineData)

    setLoading(false)
  }

  // ==========================================
  // 🧮 제출 시간 기반 벌금 자동 스캐너
  // ==========================================
  const handleRunScanner = async () => {
    const weekDeadlines = deadlines.filter(d => d.week === scanWeek)
    const { data: files } = await supabase.from('files_metadata').select('*').eq('week', scanWeek)
    
    if (!files || files.length === 0) return alert('이번 주차에 등록된 파일이 없어! 🤷‍♂️')

    const results = []
    
    files.forEach(file => {
      const category = file.file_category
      const deadlineObj = weekDeadlines.find(d => d.category === category)
      
      if (!deadlineObj || !deadlineObj.deadline_time) return

      const submitTime = new Date(file.created_at).getTime()
      const dueTime = new Date(deadlineObj.deadline_time).getTime()
      
      let fine = 0
      let reason = ''

      if (submitTime > dueTime) {
        const diffMinutes = Math.floor((submitTime - dueTime) / 60000)
        const diffHours = Math.floor(diffMinutes / 60)
        
        if (category === 'proposal' || category === 'plan') { // 🌟 plan과 proposal 둘 다 커버!
          fine = penalties.proposalInitial + (diffHours * penalties.proposalHourly)
          if (fine > penalties.proposalMax) fine = penalties.proposalMax
          reason = `기획서 ${diffMinutes}분 지각`
        } else if (category === 'slide') {
          fine = penalties.slideInitial + (diffHours * penalties.slideHourly)
          if (fine > penalties.slideMax) fine = penalties.slideMax
          reason = `슬라이드 ${diffMinutes}분 지각`
        } else {
          const diff10Mins = Math.floor(diffMinutes / 10)
          fine = penalties.fbInitial + (diff10Mins * penalties.fbPer10Min)
          reason = `피드백 ${diffMinutes}분 지각`
          
          if (diffMinutes >= 60) {
            fine = penalties.fbMiss || 3000
            reason = '피드백 1시간 이상 지각 (미제출 처리)'
          }
        }

        if (fine > 0) {
          results.push({ user: file.uploader || file.user_name || '익명', file: category, fine, reason })
        }
      }
    })

    if (results.length === 0) return alert('이번 주차 지각자 없음! 모두 제시간에 제출 완료 🎉')
    setScannedResults(results)
  }

  const handleConfirmFines = async () => {
    if (scannedResults.length === 0) return
    const inserts = scannedResults.map(r => ({
      user_name: r.user,
      week: scanWeek,
      category: (r.file === 'proposal' || r.file === 'plan') ? '기획서 지각' : r.file === 'slide' ? '슬라이드 지각' : '피드백 지각',
      amount: r.fine,
      reason: r.reason,
      is_paid: false
    }))

    const { error } = await supabase.from('pr_fines').insert(inserts)
    
    if (error) {
      alert("벌금 부과 실패! DB를 확인해 봐: " + error.message)
    } else {
      alert('스캔된 벌금 부과 완료! 💾')
      setScannedResults([])
      fetchData()
    }
  }

  // ==========================================
  // 💸 누적 정산 관리
  // ==========================================
  const handleMarkAsPaid = async (id) => {
    await supabase.from('pr_fines').update({ is_paid: true }).eq('id', id)
    fetchData()
  }

  const handlePayAll = async (userName) => {
    if (!confirm(`${userName}님의 누적 벌금을 모두 납부 처리할까? 💰`)) return
    await supabase.from('pr_fines').update({ is_paid: true }).eq('user_name', userName).eq('is_paid', false)
    fetchData()
  }

  if (loading) return <div className="p-10 text-center font-black text-slate-500">벌금 관리 시스템 불러오는 중... 🔄</div>

  const userFines = fines.reduce((acc, curr) => {
    if (!acc[curr.user_name]) acc[curr.user_name] = { total: 0, details: [] }
    acc[curr.user_name].total += curr.amount
    acc[curr.user_name].details.push(curr)
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-12 pb-32">
      <div className="max-w-[1400px] mx-auto space-y-12">
        
        <header className="border-b border-slate-200 pb-6 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <Link href="/admin/hub" className="text-xs font-black text-slate-400 hover:text-blue-600 uppercase tracking-widest mb-2 block transition-colors">← Back to Hub</Link>
            <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-800">
              📊 Attendance & Fines
            </h1>
            <p className="text-xs font-bold text-slate-500 mt-2">과제 제출 시간 기반 벌금 스캔 및 학회원별 누적 벌금 정산소입니다.</p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          
          {/* 🌟 1. 자동 정산 스캐너 */}
          <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl border border-slate-800">
            <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
              <h2 className="text-xl font-black text-white">🧮 벌금 자동 스캐너</h2>
              <div className="flex gap-2">
                <select value={scanWeek} onChange={e => setScanWeek(Number(e.target.value))} className="bg-slate-800 text-white rounded-xl px-4 text-xs font-black outline-none border border-slate-600 cursor-pointer">
                  {Array.from({length: 12}, (_, i) => <option key={i+1} value={i+1}>{i+1}주차</option>)}
                </select>
                <button onClick={handleRunScanner} className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-black text-xs hover:bg-blue-700 transition-colors">
                  스캔 시작 🔍
                </button>
              </div>
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 no-scrollbar">
              {scannedResults.length === 0 ? <p className="text-slate-500 font-bold text-sm text-center py-6">주차를 선택하고 스캔 버튼 클릭!</p> : scannedResults.map((res, idx) => (
                <div key={idx} className="bg-slate-800 p-4 rounded-xl flex justify-between items-center border border-slate-700">
                  <div>
                    <p className="font-black text-white text-sm">{res.user} <span className="text-[10px] text-slate-400 ml-2 uppercase">{res.file}</span></p>
                    <p className="text-[10px] font-bold mt-1 text-red-400">{res.reason}</p>
                  </div>
                  <p className="font-black text-lg text-red-500">₩{res.fine.toLocaleString()}</p>
                </div>
              ))}
            </div>

            {scannedResults.length > 0 && (
              <button onClick={handleConfirmFines} className="w-full mt-6 py-4 bg-red-600 text-white rounded-xl font-black text-sm hover:bg-red-700 active:scale-95 transition-transform shadow-lg">
                벌금 확정 및 부과 💥
              </button>
            )}
          </div>

          {/* 🌟 2. 개인별 누적 정산 현황 */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
            <h2 className="text-xl font-black text-slate-800 mb-6 border-b border-slate-100 pb-4">💸 누적 벌금 정산소</h2>
            <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2 no-scrollbar">
              {Object.keys(userFines).length === 0 ? <p className="text-slate-400 font-bold text-center py-6">미납된 벌금 없음 🎉</p> : Object.keys(userFines).map(user => (
                <div key={user} className="bg-slate-50 p-6 rounded-[2rem] border border-slate-200 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                    <div>
                      <p className="font-black text-xl text-slate-800 mb-1">{user}</p>
                      <p className="font-black text-red-600 text-2xl tracking-tight">누적 미납액: ₩{userFines[user].total.toLocaleString()}</p>
                    </div>
                    <button onClick={() => handlePayAll(user)} className="bg-slate-900 text-white px-5 py-3 rounded-xl text-xs font-black hover:bg-emerald-600 transition-colors shadow-md">
                      전액 납부 처리 💰
                    </button>
                  </div>
                  
                  <div className="space-y-2 pt-4">
                    {userFines[user].details.map(f => (
                      <div key={f.id} className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-100 gap-3">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase">{f.week}주차 | {f.category}</p>
                          <p className="text-xs font-bold text-slate-600 mt-0.5">{f.reason}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="font-black text-sm text-red-500">₩{f.amount.toLocaleString()}</p>
                          <button onClick={() => handleMarkAsPaid(f.id)} className="bg-slate-100 text-slate-500 px-3 py-1.5 rounded-lg text-[10px] font-black hover:bg-emerald-500 hover:text-white transition-colors border border-slate-200 hover:border-emerald-500">
                            건별 납부 ✓
                          </button>
                        </div>
                      </div>
                    ))}
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