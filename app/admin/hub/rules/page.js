'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function RulesAdmin() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 🌟 대시보드 연동 상태 (보여주기용)
  const [currentSemester, setCurrentSemester] = useState('2026-1')
  const [totalWeeks, setTotalWeeks] = useState(12)

  // 🌟 벌금 규정 상태
  const [penalties, setPenalties] = useState({
    absenceLate: 20000,
    sessionLatePerMin: 200,
    sessionLatePer10Min: 2000,
    sessionLateMax: 12000,
    sessionLeaveUnder1h: 8000,
    sessionLeaveOver1h: 15000,
    proposalInitial: 1000,
    proposalHourly: 500,
    proposalMax: 3000,
    proposalMiss: 10000,
    proposalFake: 20000,
    slideInitial: 1000,
    slideHourly: 500,
    slideMax: 3000,
    slideMiss: 10000,
    slideFake: 20000,
    fbInitial: 1000,
    fbPer10Min: 300,
    fbMiss: 3000,
    fbFake: 6000
  })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)

    const { data: configData } = await supabase.from('pr_config').select('*')
    
    let sem = '2026-1'
    let wks = 12

    if (configData) {
      const semConfig = configData.find(c => c.key === 'current_semester')
      const wksConfig = configData.find(c => c.key === 'total_weeks')
      const penConfig = configData.find(c => c.key === 'penalty_rules')
      
      if (semConfig) sem = semConfig.value
      if (wksConfig) wks = Number(wksConfig.value)
      if (penConfig && penConfig.value) {
        const parsed = JSON.parse(penConfig.value)
        // 하위 호환성 유지: 기존 plan 데이터가 있으면 proposal로 이름 교체
        if (parsed.planInitial !== undefined) {
          parsed.proposalInitial = parsed.planInitial
          parsed.proposalHourly = parsed.planHourly
          parsed.proposalMax = parsed.planMax
          parsed.proposalMiss = parsed.planMiss
          parsed.proposalFake = parsed.planFake
          delete parsed.planInitial
          delete parsed.planHourly
          delete parsed.planMax
          delete parsed.planMiss
          delete parsed.planFake
        }
        setPenalties(parsed)
      }
    }

    setCurrentSemester(sem)
    setTotalWeeks(wks)

    setLoading(false)
  }

  const handlePenaltyChange = (key, value) => {
    const numericValue = value.replace(/[^0-9]/g, '')
    setPenalties(prev => ({ ...prev, [key]: Number(numericValue) }))
  }

  const handleSave = async () => {
    setSaving(true)

    const { error: configErr } = await supabase.from('pr_config').upsert({ 
      key: 'penalty_rules', 
      value: JSON.stringify(penalties) 
    })

    if (!configErr) alert('벌금 세부 규정 저장 완료! 💾✨')
    else alert('저장 중 오류 발생 ㅠㅠ: ' + configErr.message)
    
    setSaving(false)
  }

  if (loading) return <div className="p-10 text-center font-black text-slate-500 min-h-screen flex items-center justify-center">규정집 불러오는 중... 🔄</div>

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-12 pb-32">
      <div className="max-w-[1400px] mx-auto space-y-10">
        
        <header className="flex flex-col md:flex-row md:justify-between md:items-end border-b border-slate-200 pb-6 gap-4">
          <div>
            <Link href="/admin/hub" className="text-xs font-black text-slate-400 hover:text-purple-600 uppercase tracking-widest mb-2 block transition-colors">← Back to Hub</Link>
            <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-800 flex items-center gap-3">
              <span className="text-4xl">📜</span> Society Rules
            </h1>
            <p className="text-xs font-bold text-slate-500 mt-2">각 과제별 상세 지각/미제출 벌금 규정을 설정합니다.</p>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-3">
            <div className="bg-purple-50 text-purple-700 px-6 py-3 rounded-xl font-black text-sm uppercase shadow-sm border border-purple-100">
              현재 학기: {currentSemester} ({totalWeeks}주)
            </div>
            <button onClick={handleSave} disabled={saving} className="bg-purple-600 text-white px-8 py-3 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-purple-700 transition-colors shadow-lg active:scale-95">
              {saving ? '저장 중...' : '규정 저장하기 💾'}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
          
          {/* 🌟 좌측: 세션 규정 */}
          <div className="space-y-8">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
              <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-6">
                <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><span>🏫</span> 세션 출결 규정</h2>
              </div>
              
              <div className="space-y-6">
                <div className="bg-red-50 p-5 rounded-2xl border border-red-100">
                  <h3 className="text-xs font-black text-red-600 uppercase tracking-widest mb-3 flex justify-between">
                    <span>• 사유서 지각 (사전 공지 미준수)</span>
                    <span className="text-[9px] bg-red-200 text-red-700 px-2 py-0.5 rounded">무단결석 자동 처리</span>
                  </h3>
                  <div className="flex items-center gap-3">
                    <input 
                      type="text" 
                      value={penalties.absenceLate ? penalties.absenceLate.toLocaleString() : ''} 
                      onChange={(e) => handlePenaltyChange('absenceLate', e.target.value)} 
                      className="flex-1 p-3 rounded-xl font-black text-lg text-red-600 outline-none focus:ring-2 ring-red-200 bg-white text-right shadow-sm" 
                      placeholder="0"
                    />
                    <span className="font-black text-slate-400">원</span>
                  </div>
                </div>

                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4">
                  <h3 className="text-xs font-black text-slate-600 uppercase tracking-widest border-b border-slate-200 pb-2">세션 지각 벌금</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <PenaltyInput title="13:20 이전 (1분당)" val={penalties.sessionLatePerMin} onChange={(v) => handlePenaltyChange('sessionLatePerMin', v)} />
                    <PenaltyInput title="13:20 이후 (10분당)" val={penalties.sessionLatePer10Min} onChange={(v) => handlePenaltyChange('sessionLatePer10Min', v)} />
                    <PenaltyInput title="최대 한도 (이후 무단결석)" val={penalties.sessionLateMax} onChange={(v) => handlePenaltyChange('sessionLateMax', v)} />
                  </div>
                </div>

                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4">
                  <h3 className="text-xs font-black text-slate-600 uppercase tracking-widest border-b border-slate-200 pb-2">세션 조퇴 벌금</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <PenaltyInput title="1시간 이하 조퇴" val={penalties.sessionLeaveUnder1h} onChange={(v) => handlePenaltyChange('sessionLeaveUnder1h', v)} />
                    <PenaltyInput title="1시간 초과 조퇴" val={penalties.sessionLeaveOver1h} onChange={(v) => handlePenaltyChange('sessionLeaveOver1h', v)} highlight />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 🌟 우측: 과제 및 피드백 지각 규정 */}
          <div className="space-y-8">
            
            <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-xl border border-slate-800">
              <h2 className="text-xl font-black text-white mb-6 border-b border-slate-700 pb-4 flex items-center gap-2"><span>📄</span> 기획서 제출 규정</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <PenaltyInput title="최초 지각" val={penalties.proposalInitial} onChange={(v) => handlePenaltyChange('proposalInitial', v)} isDark />
                <PenaltyInput title="1시간당 부과" val={penalties.proposalHourly} onChange={(v) => handlePenaltyChange('proposalHourly', v)} isDark />
                <PenaltyInput title="최대 한도" val={penalties.proposalMax} onChange={(v) => handlePenaltyChange('proposalMax', v)} isDark />
                <PenaltyInput title="미제출 시" val={penalties.proposalMiss} onChange={(v) => handlePenaltyChange('proposalMiss', v)} isDark highlight />
                <PenaltyInput title="허위보고" val={penalties.proposalFake} onChange={(v) => handlePenaltyChange('proposalFake', v)} isDark highlight />
              </div>
            </div>

            <div className="bg-slate-800 p-8 rounded-[2.5rem] shadow-xl border border-slate-700">
              <h2 className="text-xl font-black text-white mb-6 border-b border-slate-600 pb-4 flex items-center gap-2"><span>🖼️</span> 발표 슬라이드 제출 규정</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <PenaltyInput title="최초 지각" val={penalties.slideInitial} onChange={(v) => handlePenaltyChange('slideInitial', v)} isDark />
                <PenaltyInput title="1시간당 부과" val={penalties.slideHourly} onChange={(v) => handlePenaltyChange('slideHourly', v)} isDark />
                <PenaltyInput title="최대 한도" val={penalties.slideMax} onChange={(v) => handlePenaltyChange('slideMax', v)} isDark />
                <PenaltyInput title="미제출 시" val={penalties.slideMiss} onChange={(v) => handlePenaltyChange('slideMiss', v)} isDark highlight />
                <PenaltyInput title="허위보고" val={penalties.slideFake} onChange={(v) => handlePenaltyChange('slideFake', v)} isDark highlight />
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
              <div className="mb-6 border-b border-slate-100 pb-4">
                <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><span>💬</span> 각종 피드백 제출 규정</h2>
                <p className="text-[10px] font-bold text-slate-400 mt-2">기획서 피드백, 카톡 피드백, 영상 정성 피드백, 영상 셀프 피드백에 공통 적용됩니다.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <PenaltyInput title="최초 지각" val={penalties.fbInitial} onChange={(v) => handlePenaltyChange('fbInitial', v)} />
                <PenaltyInput title="10분당 부과" val={penalties.fbPer10Min} onChange={(v) => handlePenaltyChange('fbPer10Min', v)} />
                <PenaltyInput title="미제출 시 (1시간 이상)" val={penalties.fbMiss} onChange={(v) => handlePenaltyChange('fbMiss', v)} highlight />
                <PenaltyInput title="허위보고" val={penalties.fbFake} onChange={(v) => handlePenaltyChange('fbFake', v)} highlight />
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}

function PenaltyInput({ title, val, onChange, isDark = false, highlight = false }) {
  return (
    <div className={`${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100'} p-4 rounded-2xl border flex flex-col gap-2 shadow-sm`}>
      <label className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-500'} ${highlight ? 'text-red-400' : ''}`}>
        • {title}
      </label>
      <div className="flex items-center gap-2">
        <input 
          type="text" 
          value={val ? Number(val).toLocaleString() : ''} 
          onChange={(e) => onChange(e.target.value)} 
          placeholder="0"
          className={`w-full p-2.5 rounded-xl font-black text-sm outline-none transition-all text-right ${
            isDark 
              ? 'bg-slate-900 text-white border border-slate-600 focus:border-blue-500' 
              : 'bg-white text-slate-800 border border-slate-200 focus:border-blue-400'
          } ${highlight ? 'text-red-400 border-red-500/50' : ''}`} 
        />
        <span className={`font-black text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>원</span>
      </div>
    </div>
  )
}