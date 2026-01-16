'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function VoteSetup() {
  const [members, setMembers] = useState([]) 
  const [selectedMembers, setSelectedMembers] = useState([]) 
  const [week, setWeek] = useState(1)
  const [topic, setTopic] = useState('') 
  const [evalVersion, setEvalVersion] = useState('v1') 
  const [loading, setLoading] = useState(true)
  
  const [currentPs, setCurrentPs] = useState([])
  const [currentScores, setCurrentScores] = useState([])
  
  const router = useRouter()

  useEffect(() => {
    fetchInitialData()
  }, [week])

  const fetchInitialData = async () => {
    setLoading(true)
    // 1. 전체 회원 명단 (선택용)
    const { data: mData } = await supabase.from('profiles').select('*').order('name', { ascending: true })
    setMembers(mData || [])

    // 2. 현재 설정된 주차의 발표자 명단 가져오기
    const { data: pData } = await supabase.from('presentations').select('*').eq('week', week)
    // 3. 전체 투표 기록 가져오기
    const { data: sData } = await supabase.from('scores').select('voter_name, presentation_id')
    
    setCurrentPs(pData || [])
    setCurrentScores(sData || [])
    setLoading(false)
  }

  const toggleMember = (member) => {
    if (selectedMembers.find(m => m.id === member.id)) {
      setSelectedMembers(selectedMembers.filter(m => m.id !== member.id))
    } else {
      setSelectedMembers([...selectedMembers, member])
    }
  }

  const handleSave = async () => {
    if (selectedMembers.length === 0) return alert("발표자를 선택해줘! 👤")
    if (!topic.trim()) return alert("이번 주 발표 주제를 적어줘! 📝")

    const confirmSave = confirm(`${week}주차 발표 명단을 업데이트할까?`)
    if (!confirmSave) return

    await supabase.from('presentations').delete().eq('week', week)

    const insertData = selectedMembers.map(m => ({
      presenter_name: m.name,
      topic: topic,
      week: week,
      eval_version: evalVersion 
    }))

    const { error } = await supabase.from('presentations').insert(insertData)
    
    if (!error) {
      alert(`셋업 완료! ${evalVersion === 'v1' ? '기획서 4-1' : '기획서 4-2'} 버전이 적용됐어. 🚀`)
      fetchInitialData() // 현황판 업데이트를 위해 다시 불러오기
    } else {
      alert("오류: " + error.message)
    }
  }

  // ★ 미완료 평가자 계산 로직 수정: 참여 인원(currentPs)만 대상 ★
  const getMissingEvaluations = () => {
    if (currentPs.length === 0) return []
    
    // 이번 주 발표자로 등록된 사람들만 필터링해서 확인
    return currentPs.map(presenter => {
      const name = presenter.presenter_name;
      
      // 이 사람이 제출한 점수들
      const myScores = currentScores.filter(s => s.voter_name === name)
      const myVotedIds = myScores.map(s => s.presentation_id)
      
      // 나를 제외한 이번 주 다른 발표자들 중 투표 안 한 사람 찾기
      const missing = currentPs.filter(p => 
        !myVotedIds.includes(p.id) && 
        p.presenter_name !== name
      )
      
      return { name, missing: missing.map(p => p.presenter_name) }
    }).filter(res => res.missing.length > 0) // 아직 다 안 한 사람만 남기기
  }

  const missingList = getMissingEvaluations()

  return (
    <div className="p-8 bg-slate-50 min-h-screen text-black font-sans">
      <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        <div className="lg:col-span-2 space-y-6">
          <header className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-black italic tracking-tighter">VOTE SETUP ⚙️</h1>
            <Link href="/vote" className="text-[10px] font-black text-slate-400 hover:text-black uppercase tracking-widest transition-all">← Back</Link>
          </header>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-6">
            <div className="flex gap-4">
              <div className="w-24">
                <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1">Week</label>
                <input type="number" value={week} onChange={(e)=>setWeek(Number(e.target.value))} className="w-full bg-slate-50 p-4 rounded-2xl font-black text-2xl text-blue-600 outline-none" />
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1">Topic</label>
                <input type="text" placeholder="주제 입력" value={topic} onChange={(e)=>setTopic(e.target.value)} className="w-full bg-slate-50 p-4 rounded-2xl font-bold text-black outline-none" />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1 mb-2 block">Step 3. Scoreboard Version</label>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setEvalVersion('v1')} className={`p-4 rounded-2xl font-black transition-all border-2 ${evalVersion === 'v1' ? 'bg-black text-white border-black shadow-lg' : 'bg-white text-slate-300 border-slate-100'}`}>
                  기획서 4-1 (V1)
                </button>
                <button onClick={() => setEvalVersion('v2')} className={`p-4 rounded-2xl font-black transition-all border-2 ${evalVersion === 'v2' ? 'bg-black text-white border-black shadow-lg' : 'bg-white text-slate-300 border-slate-100'}`}>
                  기획서 4-2 (V2)
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
            <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1 mb-4 block">Step 4. Select Presenters</label>
            <div className="grid grid-cols-3 gap-3">
              {members.map(m => (
                <button key={m.id} onClick={() => toggleMember(m)} className={`p-4 rounded-2xl border-2 transition-all font-black text-xs ${selectedMembers.find(sm => sm.id === m.id) ? 'border-blue-600 bg-blue-600 text-white shadow-lg' : 'bg-slate-50 border-transparent text-slate-400'}`}>
                  {m.name}
                </button>
              ))}
            </div>
          </div>

          <button onClick={handleSave} className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black text-xl shadow-2xl active:scale-95 transition-all">
            오늘의 발표 명단 업데이트 🏁
          </button>
        </div>

        {/* 미완료 평가 현황창 (참여 인원만 표시) */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900 p-6 rounded-[2.5rem] text-white shadow-2xl sticky top-8">
            <h3 className="text-xs font-black text-blue-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
              <span className="animate-pulse">●</span> 참여자 평가 현황
            </h3>
            
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
              {currentPs.length === 0 ? (
                <p className="text-slate-500 text-xs italic">등록된 발표자가 없습니다.</p>
              ) : missingList.length === 0 ? (
                <p className="text-green-400 text-xs font-black">모든 발표자가 평가를 마쳤습니다! 🎉</p>
              ) : (
                missingList.map(res => (
                  <div key={res.name} className="border-b border-slate-800 pb-3">
                    <p className="text-sm font-black text-white mb-1">{res.name}</p>
                    <p className="text-[10px] text-slate-500 font-bold leading-relaxed">
                      미평가: <span className="text-red-400">{res.missing.join(', ')}</span>
                    </p>
                  </div>
                ))
              )}
            </div>
            
            <div className="mt-8 pt-6 border-t border-slate-800">
              <p className="text-[9px] font-black text-slate-600 uppercase tracking-tighter">Only weekly presenters are tracked.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}