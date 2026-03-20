'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'

export default function VoteSetup() {
  const [members, setMembers] = useState([]) 
  const [filteredMembers, setFilteredMembers] = useState([]) 
  const [activeGenerations, setActiveGenerations] = useState([]) 
  
  const [selectedMembers, setSelectedMembers] = useState([]) 
  
  const [semester, setSemester] = useState('2026-1')
  const [totalWeeks, setTotalWeeks] = useState(12)
  const [week, setWeek] = useState(1)
  
  const [topic, setTopic] = useState('') 
  
  const [availableVersions, setAvailableVersions] = useState(['v1']) 
  const [evalVersion, setEvalVersion] = useState('v1') 
  
  const [groupCount, setGroupCount] = useState(1) 
  const [clusterCount, setClusterCount] = useState(1) 
  
  const [groupToCluster, setGroupToCluster] = useState({ 1: 1 })
  const [loading, setLoading] = useState(true)
  const [archiving, setArchiving] = useState(false)
  const [currentPs, setCurrentPs] = useState([])
  const [currentScores, setCurrentScores] = useState([])
  const router = useRouter()

  useEffect(() => {
    const initPage = async () => {
      setLoading(true)
      
      const { data: vData } = await supabase.from('pr_vote_criteria').select('version')
      if (vData && vData.length > 0) {
        const vList = vData.map(v => v.version)
        setAvailableVersions(vList)
      }

      let currentActiveGens = []
      const { data: mConfig } = await supabase.from('pr_members_config').select('active_generations').eq('id', 'main').single()
      if (mConfig && mConfig.active_generations) {
        currentActiveGens = mConfig.active_generations
        setActiveGenerations(currentActiveGens)
      }

      const { data: configData } = await supabase.from('pr_config').select('*')
      let currentSem = '2026-1'
      if (configData) {
        const sem = configData.find(c => c.key === 'current_semester')?.value
        const wks = configData.find(c => c.key === 'total_weeks')?.value
        if (sem) { currentSem = sem; setSemester(sem); }
        if (wks) setTotalWeeks(Number(wks))
      }

      let currentWeek = 1
      // 🌟 최근 주차를 가져올 때도 현재 학기 기준으로 가져오기
      const { data: latestP } = await supabase.from('presentations').select('week').eq('semester', currentSem).order('created_at', { ascending: false }).limit(1)
      if (latestP && latestP.length > 0) {
        currentWeek = latestP[0].week
        setWeek(currentWeek)
      }

      await fetchInitialData(currentWeek, currentActiveGens, currentSem)
    }
    
    initPage()
  }, [])

  const handleWeekChange = (newWeek) => {
    setWeek(newWeek)
    fetchInitialData(newWeek, activeGenerations, semester)
  }

  const fetchInitialData = async (targetWeek, activeGens, currentSem) => {
    setLoading(true)
    
    const { data: mData } = await supabase.from('pr_members').select('*').order('name', { ascending: true })
    
    const validMembers = activeGens.length > 0 
      ? (mData || []).filter(m => {
          if (!m.generation) return false;
          const genNum = String(m.generation).replace(/[^0-9]/g, '');
          return activeGens.includes(genNum);
        })
      : (mData || [])
    
    setMembers(validMembers)
    setFilteredMembers(validMembers) 

    // 🌟 핵심: 명단을 불러올 때 반드시 `semester` 조건 포함!
    const { data: pData } = await supabase.from('presentations').select('*').eq('week', targetWeek).eq('semester', currentSem).order('order_index', { ascending: true })
    const { data: sData } = await supabase.from('scores').select('*').eq('semester', currentSem) 
    
    if (pData && pData.length > 0) {
      setTopic(pData[0].topic || '')
      const savedVersion = pData[0].eval_version
      setEvalVersion(savedVersion || 'v1')
      
      const maxG = Math.max(...pData.map(p => p.group_id || 1))
      const maxC = Math.max(...pData.map(p => p.cluster_id || 1))
      setGroupCount(maxG); setClusterCount(maxC);
      const mapping = {}; pData.forEach(p => { mapping[p.group_id] = p.cluster_id });
      setGroupToCluster(mapping)
      
      const savedMembers = pData.map(p => {
        const originalMember = validMembers.find(m => m.name === p.presenter_name)
        return originalMember ? { ...originalMember, group_id: p.group_id, cluster_id: p.cluster_id } : null
      }).filter(Boolean)
      setSelectedMembers(savedMembers)
    } else {
      // 새 주차, 새 학기면 완전 빈 껍데기로 시작!
      setSelectedMembers([])
      setTopic('')
    }
    setCurrentPs(pData || []); setCurrentScores(sData || []); 
    
    setLoading(false)
  }

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
      const newMembers = [];
      for (let i = 1; i <= clusterCount; i++) {
        let clusterList = prev.filter(m => m.cluster_id === i);
        if (i === cId) {
          clusterList = clusterList.sort(() => Math.random() - 0.5);
        }
        newMembers.push(...clusterList);
      }
      return newMembers;
    })
  }

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const { source, destination } = result;
    
    if (source.droppableId !== destination.droppableId) return; 

    const cId = Number(source.droppableId.split('-')[1]);
    
    setSelectedMembers(prev => {
      const newMembers = [];
      for (let i = 1; i <= clusterCount; i++) {
        let clusterList = prev.filter(m => m.cluster_id === i);
        if (i === cId) {
          const [moved] = clusterList.splice(source.index, 1);
          clusterList.splice(destination.index, 0, moved);
        }
        newMembers.push(...clusterList);
      }
      return newMembers;
    });
  };

  const handleSave = async () => {
    if (selectedMembers.length === 0) return alert("발표자를 선택해줘! 👤")
    if (!evalVersion) return alert("채점표 버전을 선택해줘! 📝")
    
    if (!confirm(`${semester} 학기 ${week}주차 투표 정보를 저장할까?`)) return
    
    // 🌟 덮어쓰기 할 때 반드시 '해당 학기'의 주차만 지우도록 안전장치!
    await supabase.from('presentations').delete().eq('week', week).eq('semester', semester)
    
    const insertData = selectedMembers.map((m, idx) => ({
      presenter_name: m.name, 
      topic: topic, 
      week: week,
      eval_version: evalVersion, 
      order_index: idx, 
      group_id: m.group_id, 
      cluster_id: m.cluster_id,
      semester: semester // 🌟 꼬리표 부착!
    }))
    
    const { error } = await supabase.from('presentations').insert(insertData)
    if (!error) { alert(`모든 설정 저장 완료! 🏁`); fetchInitialData(week, activeGenerations, semester); }
    else alert("오류: " + error.message)
  }

  // 🌟 핵심: 데이터를 지우지 않고, 새로운 학기를 시작하도록 로직 전면 변경!
  const handleArchiveTransfer = async () => {
    const nextSem = prompt(`현재 [${semester}] 학기를 마감합니다.\n새롭게 시작할 학기 이름을 입력해주세요. (예: 2026-2)`)
    if (!nextSem) return;

    const confirmMsg = `정말 [${nextSem}] 학기로 새로 시작하시겠습니까?\n기존 데이터는 보관소(Arxiv, My Analytics)에 안전하게 유지되며, 세팅 화면만 1주차 빈 화면으로 초기화됩니다.`
    if (!confirm(confirmMsg)) return

    setArchiving(true)
    try {
      // 삭제 쿼리(DELETE)는 모두 버리고, pr_config의 현재 학기값만 업데이트함.
      const { error } = await supabase.from('pr_config')
        .upsert({ key: 'current_semester', value: nextSem })

      if (error) throw new Error("새 학기 적용 중 오류가 발생했습니다.")

      alert(`성공적으로 [${nextSem}] 학기가 시작되었습니다! 새 학기 세팅을 진행하세요. ✨`)
      
      // 상태 업데이트 및 새 학기 1주차 빈 도화지 로드
      setSemester(nextSem)
      setWeek(1)
      fetchInitialData(1, activeGenerations, nextSem) 

    } catch (error) {
      alert(error.message)
    } finally {
      setArchiving(false)
    }
  }

  const getVoterStatus = (presenterName) => {
    const myScores = currentScores.filter(s => s.voter_name === presenterName)
    const myVotedPIds = myScores.map(s => s.presentation_id)
    const myInfo = currentPs.find(p => p.presenter_name === presenterName)
    const myClusterMembers = currentPs.filter(p => p.cluster_id === myInfo?.cluster_id && p.presenter_name !== presenterName)
    const missingScores = myClusterMembers.filter(p => !myVotedPIds.includes(p.id))
    
    return { 
      scoreDone: missingScores.length === 0, 
      scoreRemainNames: missingScores.map(p => p.presenter_name) 
    }
  }

  if (loading) return <div className="p-10 text-center font-black text-slate-500 min-h-screen flex items-center justify-center">시스템 세팅 불러오는 중... 🔄</div>

  return (
    <div className="p-8 bg-slate-50 min-h-screen text-black font-sans pb-32">
      <div className="max-w-[1550px] mx-auto grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3 space-y-6">
          <header className="flex justify-between items-center px-2 mb-4">
            <h1 className="text-3xl font-black italic uppercase tracking-tighter">Session Setup ⚙️</h1>
            <Link href="/admin/hub/vote" className="bg-slate-200 text-slate-600 px-4 py-2 rounded-xl text-xs font-black hover:bg-slate-900 hover:text-white transition-all shadow-sm">
              ← Back to Vote Hub
            </Link>
          </header>

          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 space-y-10">
            
            <div className="flex flex-col md:flex-row justify-between items-center bg-red-50 p-6 rounded-2xl border border-red-100 gap-4">
              <div>
                <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Global Semester Setting</p>
                <p className="text-xl font-black text-red-900">현재 <span className="underline">{semester}</span> 학기 진행 중 (총 {totalWeeks}주차)</p>
              </div>
              <button 
                onClick={handleArchiveTransfer} 
                disabled={archiving}
                className="bg-red-600 text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-red-700 transition-colors shadow-md disabled:opacity-50 whitespace-nowrap"
              >
                {archiving ? '학기 전환 중...' : '🎓 새 학기 시작하기 (과거 데이터 보존)'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="col-span-1">
                <label className="text-[9px] font-black text-slate-400 block mb-1 uppercase">Week</label>
                <select value={week} onChange={(e)=>handleWeekChange(Number(e.target.value))} className="w-full bg-slate-50 p-4 rounded-2xl font-black text-xl text-blue-600 outline-none border-r-[16px] border-transparent cursor-pointer">
                  {Array.from({ length: totalWeeks }, (_, i) => i + 1).map(w => (
                    <option key={w} value={w}>{w}주차</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-[9px] font-black text-slate-400 block mb-1 uppercase">Topic</label>
                <input type="text" value={topic} onChange={(e)=>setTopic(e.target.value)} className="w-full bg-slate-50 p-4 rounded-2xl font-bold outline-none" />
              </div>
              <div className="col-span-1">
                <label className="text-[9px] font-black text-slate-400 block mb-1 uppercase">Groups</label>
                <input type="number" value={groupCount} onChange={(e)=>setGroupCount(Number(e.target.value))} className="w-full bg-slate-50 p-4 rounded-2xl font-black text-xl text-emerald-600 outline-none" />
              </div>
              <div className="col-span-1">
                <label className="text-[9px] font-black text-slate-400 block mb-1 uppercase">Clusters</label>
                <input type="number" value={clusterCount} onChange={(e)=>setClusterCount(Number(e.target.value))} className="w-full bg-slate-50 p-4 rounded-2xl font-black text-xl text-purple-600 outline-none" />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-end border-b border-slate-100 pb-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Step 1. Scoreboard Version</label>
                <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">
                  Content 관리자에서 등록한 버전만 표시됨
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {availableVersions.map(v => (
                  <button 
                    key={v} 
                    onClick={()=>setEvalVersion(v)} 
                    className={`py-5 rounded-[2rem] font-black uppercase tracking-wider transition-all border-2 ${evalVersion === v ? 'bg-blue-600 text-white border-blue-600 shadow-xl scale-[1.02]' : 'bg-white text-slate-400 border-slate-200 hover:border-blue-300'}`}
                  >
                    {v} 버전
                  </button>
                ))}
                {availableVersions.length === 0 && <p className="col-span-full text-xs text-red-500 font-bold py-4">사용 가능한 채점표 버전이 없습니다.</p>}
              </div>
            </div>

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

            <div className="space-y-4">
              <div className="flex justify-between items-end border-b border-slate-100 pb-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Step 3. Select Presenters</label>
                <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">
                  {activeGenerations.length > 0 ? `${activeGenerations.join(', ')}기 표시중` : '전체 학회원 표시중'}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {filteredMembers.map(m => {
                  const isSel = selectedMembers.find(sm => sm.id === m.id)
                  return (
                    <div key={m.id} onClick={() => toggleMember(m)} className={`p-4 rounded-[1.5rem] border-2 transition-all flex flex-col gap-2 cursor-pointer ${isSel ? 'border-blue-600 bg-white shadow-md' : 'bg-slate-50 border-transparent hover:bg-slate-100'}`}>
                      <span className={`font-black text-sm ${isSel ? 'text-blue-600' : 'text-slate-500'}`}>{m.name} <span className="text-[9px] opacity-50 ml-1">{m.generation}</span></span>
                      {isSel && (
                        <select value={isSel.group_id} onClick={(e)=>e.stopPropagation()} onChange={(e)=>updateMemberGroup(m.id, e.target.value)} className="bg-emerald-50 text-emerald-600 text-[9px] font-black p-1.5 rounded-lg border-none outline-none">
                          {Array.from({length: groupCount}, (_,i)=>i+1).map(g => <option key={g} value={g}>{g}조</option>)}
                        </select>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

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
                            <Draggable key={m.id} draggableId={String(m.id)} index={idx}>
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

        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900 p-8 rounded-[3rem] text-white shadow-2xl sticky top-8">
            <h3 className="text-xs font-black text-blue-400 uppercase tracking-[0.2em] mb-8 flex items-center gap-2">● 실시간 채점 현황</h3>
            <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-2 no-scrollbar">
              {currentPs.map(p => {
                const s = getVoterStatus(p.presenter_name)
                return (
                  <div key={p.id} className="border-b border-slate-800 pb-5 last:border-0">
                    <p className="text-sm font-black mb-2">{p.presenter_name}</p>
                    <div className="flex gap-2 mb-3">
                      <span className="text-[8px] bg-purple-900 px-2 py-0.5 rounded font-black text-purple-200">G{p.cluster_id}</span>
                      <span className="text-[8px] bg-emerald-900 px-2 py-0.5 rounded font-black text-emerald-200">{p.group_id}조</span>
                    </div>
                    <DetailStatusLine label="정량평가 완료" done={s.scoreDone} names={s.scoreRemainNames} color="blue" />
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

function DetailStatusLine({ label, done, names, color = "blue" }) {
  return (
    <div className="space-y-1.5 bg-slate-800 p-3 rounded-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${done ? `bg-${color}-400` : 'bg-red-500 animate-pulse'}`}></div>
          <span className="text-[10px] font-black text-slate-300 uppercase tracking-tighter">{label}</span>
        </div>
        <span className={`text-[10px] font-black ${done ? `text-${color}-400` : 'text-red-400'}`}>{done ? 'DONE' : 'WAIT'}</span>
      </div>
      {!done && <p className="text-[9px] font-bold text-red-300 pl-3 leading-tight mt-1 border-t border-slate-700 pt-1.5">미완료: {names.join(', ')}</p>}
    </div>
  )
}