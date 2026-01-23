'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function VoteSetup() {
  const [members, setMembers] = useState([]) 
  const [filteredMembers, setFilteredMembers] = useState([]) 
  const [generations, setGenerations] = useState([]) 
  const [selectedGens, setSelectedGens] = useState([]) 
  
  const [selectedMembers, setSelectedMembers] = useState([]) 
  const [week, setWeek] = useState(1)
  const [topic, setTopic] = useState('') 
  const [evalVersion, setEvalVersion] = useState('v1') 
  const [loading, setLoading] = useState(true)
  
  const [currentPs, setCurrentPs] = useState([])
  const [currentScores, setCurrentScores] = useState([])
  
  const router = useRouter()

  // 1. 초기화: 접속 시 가장 최근 등록된 주차 감지
  useEffect(() => {
    const initPage = async () => {
      setLoading(true)
      const { data: latestP } = await supabase
        .from('presentations')
        .select('week')
        .order('created_at', { ascending: false })
        .limit(1);

      if (latestP && latestP.length > 0) {
        const lastWeek = latestP[0].week;
        setWeek(lastWeek);
      } else {
        fetchInitialData(1);
      }
    }
    initPage();
  }, [])

  // 주차 변경 시 데이터 다시 로드
  useEffect(() => {
    if (week) fetchInitialData(week);
  }, [week])

  // 기수 선택 필터링 로직
  useEffect(() => {
    if (selectedGens.length === 0) {
      setFilteredMembers(members)
    } else {
      const filtered = members.filter(m => {
        const gen = m.student_id?.split('-')[0]
        return selectedGens.includes(gen)
      })
      setFilteredMembers(filtered)
    }
  }, [selectedGens, members])

  const fetchInitialData = async (targetWeek = week) => {
    setLoading(true)
    const { data: mData } = await supabase.from('profiles').select('*').order('name', { ascending: true })
    const allMembers = mData || []
    setMembers(allMembers)

    const gens = [...new Set(allMembers.map(m => m.student_id?.split('-')[0]))].filter(Boolean).sort()
    setGenerations(gens)

    const { data: pData } = await supabase.from('presentations').select('*').eq('week', targetWeek).order('order_index', { ascending: true })
    const { data: sData } = await supabase.from('scores').select('voter_name, presentation_id')
    
    if (pData && pData.length > 0) {
      setTopic(pData[0].topic || '')
      setEvalVersion(pData[0].eval_version || 'v1')
    }

    setCurrentPs(pData || [])
    setCurrentScores(sData || [])
    setLoading(false)
  }

  const toggleGen = (gen) => {
    setSelectedGens(prev => prev.includes(gen) ? prev.filter(g => g !== gen) : [...prev, gen])
  }

  const toggleMember = (member) => {
    if (selectedMembers.find(m => m.id === member.id)) {
      setSelectedMembers(selectedMembers.filter(m => m.id !== member.id))
    } else {
      setSelectedMembers([...selectedMembers, { ...member, order_index: selectedMembers.length }])
    }
  }

  const randomizeOrder = () => {
    if (selectedMembers.length === 0) return alert("발표자를 먼저 선택해줘! 👤")
    const shuffled = [...selectedMembers].sort(() => Math.random() - 0.5)
    const ordered = shuffled.map((m, idx) => ({ ...m, order_index: idx }))
    setSelectedMembers(ordered)
  }

  const handleSave = async () => {
    if (selectedMembers.length === 0) return alert("발표자를 선택해줘! 👤")
    if (!topic.trim()) return alert("이번 주 발표 주제를 적어줘! 📝")

    const confirmSave = confirm(`${week}주차 발표 명단을 업데이트할까?`)
    if (!confirmSave) return

    await supabase.from('presentations').delete().eq('week', week)

    const insertData = selectedMembers.map((m, idx) => ({
      presenter_name: m.name,
      topic: topic,
      week: week,
      eval_version: evalVersion,
      order_index: idx 
    }))

    const { error } = await supabase.from('presentations').insert(insertData)
    
    if (!error) {
      alert(`셋업 완료! ${evalVersion === 'v1' ? '기획서 4-1' : '기획서 4-2'} 버전이 적용됐어. 🚀`)
      setSelectedMembers([])
      fetchInitialData(week)
    } else {
      alert("오류: " + error.message)
    }
  }

  const getVoterStatus = (voterName) => {
    const myScores = currentScores.filter(s => s.voter_name === voterName)
    const myVotedIds = myScores.map(s => s.presentation_id)
    const missing = currentPs.filter(p => p.presenter_name !== voterName && !myVotedIds.includes(p.id))
    
    return {
      missingNames: missing.map(p => p.presenter_name),
      isDone: missing.length === 0,
      remainingCount: missing.length
    }
  }

  return (
    <div className="p-8 bg-slate-50 min-h-screen text-black font-sans">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        <div className="lg:col-span-3 space-y-6">
          <header className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-black italic tracking-tighter">ADMIN SETUP ⚙️</h1>
            <Link href="/vote" className="text-[10px] font-black text-slate-400 hover:text-black uppercase tracking-widest transition-all">← Back</Link>
          </header>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-8">
            {/* Step 1. 주차 및 주제 */}
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

            {/* ★ 추가: 채점표 버전 선택 (기존 로직 복구) */}
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1 block">Step 1.5. Scoreboard Version</label>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setEvalVersion('v1')} 
                  className={`p-4 rounded-2xl font-black transition-all border-2 ${evalVersion === 'v1' ? 'bg-black text-white border-black shadow-lg' : 'bg-white text-slate-300 border-slate-100'}`}
                >
                  기획서 4-1 (V1)
                </button>
                <button 
                  onClick={() => setEvalVersion('v2')} 
                  className={`p-4 rounded-2xl font-black transition-all border-2 ${evalVersion === 'v2' ? 'bg-black text-white border-black shadow-lg' : 'bg-white text-slate-300 border-slate-100'}`}
                >
                  기획서 4-2 (V2)
                </button>
              </div>
            </div>

            {/* Step 2. 기수 선택 필터 */}
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1 block">Step 2. Filter by Gen</label>
              <div className="flex flex-wrap gap-2">
                {generations.map(gen => (
                  <button key={gen} onClick={() => toggleGen(gen)} className={`px-4 py-2 rounded-xl font-black text-xs transition-all border-2 ${selectedGens.includes(gen) ? 'bg-black text-white border-black' : 'bg-white text-slate-300 border-slate-100'}`}>
                    {gen}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 3. 발표자 선택 */}
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest ml-1 block">Step 3. Select Presenters ({filteredMembers.length} members)</label>
              <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                {filteredMembers.map(m => (
                  <button key={m.id} onClick={() => toggleMember(m)} className={`p-4 rounded-2xl border-2 transition-all font-black text-xs ${selectedMembers.find(sm => sm.id === m.id) ? 'border-blue-600 bg-blue-600 text-white shadow-lg' : 'bg-slate-50 border-transparent text-slate-400'}`}>
                    {m.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 4. 순서 정하기 */}
            <div className="bg-blue-50 p-8 rounded-[2.5rem] border-2 border-blue-100 space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest ml-1">Step 4. Presentation Order</label>
                <button onClick={randomizeOrder} className="bg-blue-600 text-white px-4 py-2 rounded-xl font-black text-xs hover:bg-blue-700 transition-all">순서 랜덤 셔플 🎲</button>
              </div>
              <div className="flex flex-col gap-2">
                {selectedMembers.length === 0 ? (
                  <p className="text-blue-200 text-xs italic text-center py-4">발표자를 먼저 선택해줘!</p>
                ) : (
                  selectedMembers.map((m, idx) => (
                    <div key={m.id} className="bg-white p-4 rounded-xl flex justify-between items-center shadow-sm">
                      <span className="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black">{idx + 1}</span>
                      <span className="font-black text-sm">{m.name}</span>
                      <span className="text-[10px] text-slate-300 font-bold">{m.student_id}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <button onClick={handleSave} className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black text-xl shadow-2xl active:scale-95 transition-all">
              최종 순서 및 명단 확정하기 🏁
            </button>
          </div>
        </div>

        {/* 사이드바: 평가 현황 */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900 p-6 rounded-[2.5rem] text-white shadow-2xl sticky top-8">
            <h3 className="text-xs font-black text-blue-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
              <span className="animate-pulse">●</span> 평가 진행 현황
            </h3>
            <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 no-scrollbar">
              {currentPs.length === 0 ? (
                <p className="text-slate-500 text-xs italic">등록된 발표자가 없습니다.</p>
              ) : (
                currentPs.map(p => {
                  const status = getVoterStatus(p.presenter_name)
                  return (
                    <div key={p.id} className="border-b border-slate-800 pb-4 last:border-0">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-black">{p.presenter_name}</span>
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded ${status.isDone ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                          {status.isDone ? 'DONE' : `${status.remainingCount}명 남음`}
                        </span>
                      </div>
                      {!status.isDone && (
                        <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                          미평가: <span className="text-red-400/80">{status.missingNames.join(', ')}</span>
                        </p>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}