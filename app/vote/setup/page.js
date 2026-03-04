'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'

export default function VoteSetup() {
  const [members, setMembers] = useState([]) 
  const [filteredMembers, setFilteredMembers] = useState([]) 
  const [generations, setGenerations] = useState([]) 
  const [selectedGens, setSelectedGens] = useState([]) 
  
  const [selectedMembers, setSelectedMembers] = useState([]) 
  const [week, setWeek] = useState(1)
  const [topic, setTopic] = useState('') 
  const [evalVersion, setEvalVersion] = useState('v1') // ★ 기획서 버전 상태
  const [groupCount, setGroupCount] = useState(1) 
  const [clusterCount, setClusterCount] = useState(1) 
  
  const [groupToCluster, setGroupToCluster] = useState({ 1: 1 })
  const [loading, setLoading] = useState(true)
  const [currentPs, setCurrentPs] = useState([])
  const [currentScores, setCurrentScores] = useState([])
  const router = useRouter()

  useEffect(() => {
    const initPage = async () => {
      setLoading(true)
      const { data: latestP } = await supabase.from('presentations').select('week').order('created_at', { ascending: false }).limit(1);
      if (latestP && latestP.length > 0) setWeek(latestP[0].week);
      else fetchInitialData(1);
    }
    initPage();
  }, [])

  useEffect(() => { if (week) fetchInitialData(week); }, [week])

  useEffect(() => {
    if (selectedGens.length === 0) setFilteredMembers(members)
    else {
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
    setMembers(mData || [])
    const gens = [...new Set((mData || []).map(m => m.student_id?.split('-')[0]))].filter(Boolean).sort()
    setGenerations(gens)

    const { data: pData } = await supabase.from('presentations').select('*').eq('week', targetWeek).order('order_index', { ascending: true })
    const { data: sData } = await supabase.from('scores').select('*') 
    
    if (pData && pData.length > 0) {
      setTopic(pData[0].topic || '')
      setEvalVersion(pData[0].eval_version || 'v1') // ★ 기존 저장된 버전 로드
      const maxG = Math.max(...pData.map(p => p.group_id || 1))
      const maxC = Math.max(...pData.map(p => p.cluster_id || 1))
      setGroupCount(maxG); setClusterCount(maxC);
      const mapping = {}; pData.forEach(p => { mapping[p.group_id] = p.cluster_id });
      setGroupToCluster(mapping)
    }
    setCurrentPs(pData || []); setCurrentScores(sData || []); setLoading(false)
  }

  const toggleGen = (gen) => setSelectedGens(prev => prev.includes(gen) ? prev.filter(g => g !== gen) : [...prev, gen])

  const toggleMember = (member) => {
    setSelectedMembers(prev => {
      if (prev.find(m => m.id === member.id)) return prev.filter(m => m.id !== member.id)
      const gId = 1
      return [...prev, { ...member, group_id: gId, cluster_id: groupToCluster[gId] || 1 }]
    })
  }

  const handleMappingChange = (gId, cId) => {
    const newMapping = { ...groupToCluster, [gId]: Number(cId) }
    setGroupToCluster(newMapping)
    setSelectedMembers(prev => prev.map(m => m.group_id === Number(gId) ? { ...m, cluster_id: Number(cId) } : m))
  }

  const updateMemberGroup = (memberId, gId) => {
    const selectedGId = Number(gId)
    setSelectedMembers(prev => prev.map(m => m.id === memberId ? { ...m, group_id: selectedGId, cluster_id: groupToCluster[selectedGId] || 1 } : m))
  }

  const randomizeOrderByCluster = (cId) => {
    setSelectedMembers(prev => {
      const others = prev.filter(m => m.cluster_id !== cId);
      const targets = prev.filter(m => m.cluster_id === cId).sort(() => Math.random() - 0.5);
      return [...others, ...targets];
    })
  }

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const items = [...selectedMembers];
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setSelectedMembers(items);
  };

  const handleSave = async () => {
    if (selectedMembers.length === 0) return alert("발표자를 선택해줘! 👤")
    if (!confirm(`${week}주차 정보를 저장할까?`)) return
    await supabase.from('presentations').delete().eq('week', week)
    const insertData = selectedMembers.map((m, idx) => ({
      presenter_name: m.name, topic: topic, week: week,
      eval_version: evalVersion, order_index: idx, 
      group_id: m.group_id, cluster_id: m.cluster_id
    }))
    const { error } = await supabase.from('presentations').insert(insertData)
    if (!error) { alert(`모든 설정 저장 완료! 🏁`); fetchInitialData(week); setSelectedMembers([]); }
    else alert("오류: " + error.message)
  }

  const getVoterStatus = (voterName) => {
    const myScores = currentScores.filter(s => s.voter_name === voterName)
    const myVotedPIds = myScores.map(s => s.presentation_id)
    const myInfo = currentPs.find(p => p.presenter_name === voterName)
    const myClusterMembers = currentPs.filter(p => p.cluster_id === myInfo?.cluster_id && p.presenter_name !== voterName)
    const missingScores = myClusterMembers.filter(p => !myVotedPIds.includes(p.id))
    const myGroupMembers = currentPs.filter(p => p.group_id === myInfo?.group_id && p.presenter_name !== voterName)
    const missingQuals = myGroupMembers.filter(p => !myScores.find(s => s.presentation_id === p.id)?.details?.qualitative?.originalMessage)
    return { scoreDone: missingScores.length === 0, scoreRemainNames: missingScores.map(p => p.presenter_name), qualDone: missingQuals.length === 0, qualRemainNames: missingQuals.map(p => p.presenter_name) }
  }

  return (
    <div className="p-8 bg-slate-50 min-h-screen text-black font-sans">
      <div className="max-w-[1550px] mx-auto grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3 space-y-6">
          <header className="flex justify-between items-center px-2">
            <h1 className="text-3xl font-black italic uppercase tracking-tighter">Smart Admin Setup ⚙️</h1>
            <Link href="/vote" className="bg-slate-200 text-slate-600 px-4 py-2 rounded-xl text-xs font-black hover:bg-black hover:text-white transition-all shadow-sm">← VOTE HUB</Link>
          </header>

          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 space-y-10">
            {/* 기본 주차/주제/카운트 설정 */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="col-span-1"><label className="text-[9px] font-black text-slate-300 block mb-1 uppercase">Week</label><input type="number" value={week} onChange={(e)=>setWeek(Number(e.target.value))} className="w-full bg-slate-50 p-4 rounded-2xl font-black text-xl text-blue-600 outline-none" /></div>
              <div className="col-span-2"><label className="text-[9px] font-black text-slate-300 block mb-1 uppercase">Topic</label><input type="text" value={topic} onChange={(e)=>setTopic(e.target.value)} className="w-full bg-slate-50 p-4 rounded-2xl font-bold outline-none" /></div>
              <div className="col-span-1"><label className="text-[9px] font-black text-slate-300 block mb-1 uppercase">Groups</label><input type="number" value={groupCount} onChange={(e)=>setGroupCount(Number(e.target.value))} className="w-full bg-slate-50 p-4 rounded-2xl font-black text-xl text-emerald-600 outline-none" /></div>
              <div className="col-span-1"><label className="text-[9px] font-black text-slate-300 block mb-1 uppercase">Clusters</label><input type="number" value={clusterCount} onChange={(e)=>setClusterCount(Number(e.target.value))} className="w-full bg-slate-50 p-4 rounded-2xl font-black text-xl text-purple-600 outline-none" /></div>
            </div>

            {/* Step 1. 기수 필터링 */}
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest block">Step 1. Filter by Generation</label>
              <div className="flex flex-wrap gap-2">
                {generations.map(gen => (
                  <button key={gen} onClick={() => toggleGen(gen)} className={`px-5 py-2 rounded-xl font-black text-xs border-2 transition-all ${selectedGens.includes(gen) ? 'bg-black text-white border-black shadow-md' : 'bg-white text-slate-300 border-slate-100'}`}>{gen}</button>
                ))}
              </div>
            </div>

            {/* ★ Step 1.5. 기획서 버전 선택 (부활!) */}
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest block">Step 1.5. Scoreboard Version</label>
              <div className="grid grid-cols-2 gap-4">
                {['v1', 'v2'].map(v => (
                  <button 
                    key={v} 
                    onClick={()=>setEvalVersion(v)} 
                    className={`py-5 rounded-[2rem] font-black transition-all border-2 ${evalVersion === v ? 'bg-blue-600 text-white border-blue-600 shadow-xl' : 'bg-white text-slate-300 border-slate-100 hover:border-slate-200'}`}
                  >
                    {v === 'v1' ? '기획서 4-1 (V1)' : '기획서 4-2 (V2)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2. 조별 클러스터 매핑 */}
            <div className="bg-slate-900 p-8 rounded-[2.5rem] space-y-4 shadow-xl">
              <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest block">• Step 2. Group to Cluster Mapping</label>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {Array.from({length: groupCount}, (_,i)=>i+1).map(gId => (
                  <div key={gId} className="bg-slate-800 p-3 rounded-2xl flex flex-col gap-2 border border-slate-700">
                    <span className="text-[10px] font-black text-white">{gId}조 소속:</span>
                    <select value={groupToCluster[gId] || 1} onChange={(e)=>handleMappingChange(gId, e.target.value)} className="bg-purple-600 text-white text-[10px] font-black p-1.5 rounded-lg border-none outline-none cursor-pointer">
                      {Array.from({length: clusterCount}, (_,i)=>i+1).map(c => <option key={c} value={c}>{c}그룹</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Step 3. 멤버 선택 */}
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-300 uppercase tracking-widest block">Step 3. Select Members & Assign Group</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {filteredMembers.map(m => {
                  const isSel = selectedMembers.find(sm => sm.id === m.id)
                  return (
                    <div key={m.id} onClick={() => toggleMember(m)} className={`p-4 rounded-[1.5rem] border-2 transition-all flex flex-col gap-2 cursor-pointer ${isSel ? 'border-blue-600 bg-white shadow-md' : 'bg-slate-50 border-transparent hover:bg-slate-100'}`}>
                      <span className={`font-black text-sm ${isSel ? 'text-blue-600' : 'text-slate-400'}`}>{m.name}</span>
                      {isSel && (
                        <select value={isSel.group_id} onClick={(e)=>e.stopPropagation()} onChange={(e)=>updateMemberGroup(m.id, e.target.value)} className="bg-emerald-50 text-emerald-600 text-[9px] font-black p-1.5 rounded-lg border-none">
                          {Array.from({length: groupCount}, (_,i)=>i+1).map(g => <option key={g} value={g}>{g}조</option>)}
                        </select>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Step 4. 클러스터별 순서 조정 */}
            <div className="space-y-8 bg-slate-50 p-8 rounded-[3rem] border border-slate-100">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block border-b border-slate-200 pb-4">Step 4. Order Control by Cluster 🖐️</label>
              <DragDropContext onDragEnd={onDragEnd}>
                {Array.from({length: clusterCount}, (_,i)=>i+1).map(cId => (
                  <div key={cId} className="space-y-4">
                    <div className="flex justify-between items-center px-2">
                      <h3 className="font-black text-purple-600 text-sm italic">Score Cluster #{cId}</h3>
                      <button onClick={()=>randomizeOrderByCluster(cId)} className="bg-purple-600 text-white px-3 py-1.5 rounded-xl font-black text-[9px] uppercase shadow-lg hover:bg-purple-700 active:scale-90 transition-all">Shuffle 🎲</button>
                    </div>
                    <Droppable droppableId={`cluster-${cId}`}>
                      {(provided) => (
                        <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2 min-h-[50px] bg-slate-100/50 p-6 rounded-[2.5rem] max-w-xl mx-auto border-2 border-dashed border-slate-200">
                          {selectedMembers.filter(m => m.cluster_id === cId).map((m, idx) => (
                            <Draggable key={m.id} draggableId={String(m.id)} index={selectedMembers.findIndex(sm => sm.id === m.id)}>
                              {(provided, snapshot) => (
                                <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className={`bg-white p-4 rounded-2xl flex items-center justify-between border shadow-sm transition-all ${snapshot.isDragging ? 'border-purple-500 scale-105 z-50 shadow-2xl' : 'border-slate-100'}`}>
                                  <div className="flex items-center gap-4"><span className="bg-slate-900 text-white w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black">{idx + 1}</span><p className="font-black text-sm">{m.name}</p></div>
                                  <span className="bg-emerald-50 text-emerald-600 text-[9px] px-3 py-1 rounded-full font-black uppercase">{m.group_id}조</span>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                ))}
              </DragDropContext>
            </div>
            <button onClick={handleSave} className="w-full py-7 bg-slate-900 text-white rounded-[2.5rem] font-black text-xl shadow-2xl active:scale-95 transition-all hover:bg-blue-900">최종 시스템 확정 🏁</button>
          </div>
        </div>

        {/* 우측 현황판 */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900 p-8 rounded-[3rem] text-white shadow-2xl sticky top-8">
            <h3 className="text-xs font-black text-purple-400 uppercase tracking-[0.2em] mb-8 flex items-center gap-2">● 클러스터 현황</h3>
            <div className="space-y-8 max-h-[75vh] overflow-y-auto pr-2 no-scrollbar">
              {currentPs.map(p => {
                const s = getVoterStatus(p.presenter_name)
                return (
                  <div key={p.id} className="border-b border-slate-800 pb-6 last:border-0">
                    <p className="text-sm font-black mb-2">{p.presenter_name}</p>
                    <div className="flex gap-2 mb-3"><span className="text-[8px] bg-purple-900 px-2 py-0.5 rounded font-black text-purple-200">G{p.cluster_id}</span><span className="text-[8px] bg-emerald-900 px-2 py-0.5 rounded font-black text-emerald-200">{p.group_id}조</span></div>
                    <div className="space-y-4">
                      <DetailStatusLine label="Score" done={s.scoreDone} names={s.scoreRemainNames} />
                      <DetailStatusLine label="Feedback" done={s.qualDone} names={s.qualRemainNames} color="emerald" />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailStatusLine({ label, done, names, color = "purple" }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><div className={`w-1.5 h-1.5 rounded-full ${done ? `bg-${color}-400` : 'bg-red-500 animate-pulse'}`}></div><span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">{label}</span></div>
        <span className={`text-[10px] font-black ${done ? `text-${color}-400` : 'text-red-400'}`}>{done ? 'DONE' : 'WAIT'}</span>
      </div>
      {!done && <p className="text-[9px] font-bold text-red-900/60 pl-3 leading-tight">미완료: {names.join(', ')}</p>}
    </div>
  )
}