'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'

export default function VoteSetup() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 🌟 글로벌 설정 상태
  const [semester, setSemester] = useState('2026-1')
  const [totalWeeks, setTotalWeeks] = useState(12)
  const [week, setWeek] = useState(1)
  const [topic, setTopic] = useState('') 
  
  // 🌟 대시보드 연동 데이터
  const [weeklySetup, setWeeklySetup] = useState({})
  const [weekTopics, setWeekTopics] = useState({})
  
  // 🌟 투표 및 순서 세팅 상태
  const [availableVersions, setAvailableVersions] = useState(['v1']) 
  const [evalVersion, setEvalVersion] = useState('v1') 
  
  // 🌟 위계 설정 상태 (대시보드에서 받아온 읽기 전용 상태)
  const [clusterCount, setClusterCount] = useState(1) 
  const [evalMode, setEvalMode] = useState('individual') 
  
  // 드래그 앤 드롭용 상태
  const [selectedItems, setSelectedItems] = useState([]) 
  
  // 실시간 채점 현황용 상태
  const [currentPs, setCurrentPs] = useState([])
  const [currentScores, setCurrentScores] = useState([])

  useEffect(() => {
    const initPage = async () => {
      setLoading(true)
      
      const { data: vData } = await supabase.from('pr_vote_criteria').select('version')
      if (vData && vData.length > 0) {
        setAvailableVersions(vData.map(v => v.version))
      }

      const { data: configData } = await supabase.from('pr_config').select('*')
      let currentSem = '2026-1'
      let wSetup = {}
      let topics = {}

      if (configData) {
        const sem = configData.find(c => c.key === 'current_semester')?.value
        const wks = configData.find(c => c.key === 'total_weeks')?.value
        const setupStr = configData.find(c => c.key === 'weekly_setup')?.value
        const topicStr = configData.find(c => c.key === 'week_topics')?.value

        if (sem) { currentSem = sem; setSemester(sem); }
        if (wks) setTotalWeeks(Number(wks))
        if (setupStr) wSetup = JSON.parse(setupStr)
        if (topicStr) topics = JSON.parse(topicStr)
        
        setWeeklySetup(wSetup)
        setWeekTopics(topics)
      }

      let currentWeek = 1
      const { data: latestP } = await supabase.from('presentations').select('week').eq('semester', currentSem).order('created_at', { ascending: false }).limit(1)
      if (latestP && latestP.length > 0) {
        currentWeek = latestP[0].week
      }
      setWeek(currentWeek)

      await loadWeekData(currentWeek, currentSem, wSetup, topics)
    }
    
    initPage()
  }, [])

  const handleWeekChange = (newWeek) => {
    setWeek(newWeek)
    loadWeekData(newWeek, semester, weeklySetup, weekTopics)
  }

  // 🌟 대시보드 데이터를 기반으로 DND 아이템 생성 (수정 기능 걷어냄)
  const loadWeekData = async (targetWeek, currentSem, wSetup, topics) => {
    setLoading(true)
    
    const setup = wSetup[targetWeek] || {}
    
    const mode = setup.evalMode || 'individual';
    setEvalMode(mode);

    // 맵핑 데이터 로드 (안전장치 적용)
    const mTeams = setup.memberTeams || setup.members || {}
    const tGroups = setup.teamGroups || {}
    const gClusters = setup.groupClusters || setup.groupToCluster || {}
    
    const cCount = Number(setup.clusterCount) || 1
    setClusterCount(cCount)
    setTopic(topics[targetWeek] || '')

    const { data: pData } = await supabase.from('presentations').select('*').eq('week', targetWeek).eq('semester', currentSem).order('order_index', { ascending: true })
    const { data: sData } = await supabase.from('scores').select('*').eq('semester', currentSem) 
    
    setCurrentPs(pData || [])
    setCurrentScores(sData || [])

    if (pData && pData.length > 0) {
      setEvalVersion(pData[0].eval_version || 'v1')
    } else {
      setEvalVersion('v1')
    }

    let items = [];
    if (mode === 'team') {
       const activeTeams = [...new Set(Object.values(mTeams))].filter(v => v !== '미정' && v !== '결석' && !isNaN(Number(v))).map(Number);
       items = activeTeams.map(tId => {
           const gId = Number(tGroups[tId]) || 1;
           const cId = Number(gClusters[gId]) || 1;
           const members = Object.keys(mTeams).filter(m => Number(mTeams[m]) === tId);
           const dbExisting = pData?.find(p => p.team_id === tId || p.group_id === tId); 
           return { id: `team-${tId}`, type: 'team', team_id: tId, group_id: gId, cluster_id: cId, members, order_index: dbExisting ? dbExisting.order_index : 999 }
       });
    } else {
       const activeMembers = Object.keys(mTeams).filter(m => {
           const t = mTeams[m];
           return t !== '미정' && t !== '결석' && !isNaN(Number(t));
       });
       items = activeMembers.map(name => {
           const gId = Number(mTeams[name]); // 개인모드에선 멤버 값이 곧 조(Group) 번호
           const cId = Number(gClusters[gId]) || 1;
           const dbExisting = pData?.find(p => p.presenter_name === name);
           return { id: `ind-${name}`, type: 'individual', name: name, group_id: gId, cluster_id: cId, order_index: dbExisting ? dbExisting.order_index : 999 }
       });
    }
    
    items.sort((a,b) => a.order_index - b.order_index);
    setSelectedItems(items);
    setLoading(false)
  }

  const handleResetWeek = async () => {
    if(!confirm(`[${week}주차]에 설정된 발표 데이터와 순서를 삭제하고 초기화할까요?`)) return;
    setLoading(true);
    await supabase.from('presentations').delete().eq('week', week).eq('semester', semester);
    alert('해당 주차 발표 데이터가 초기화되었습니다. 🔄');
    loadWeekData(week, semester, weeklySetup, weekTopics);
  }

  const randomizeOrderByCluster = (cId) => {
    setSelectedItems(prev => {
      const newItems = [];
      const clusters = [...new Set(prev.map(g => g.cluster_id))].sort((a,b)=>a-b)
      
      clusters.forEach(id => {
        let clusterList = prev.filter(m => m.cluster_id === id);
        if (id === cId) clusterList = clusterList.sort(() => Math.random() - 0.5);
        newItems.push(...clusterList);
      });
      return newItems;
    })
  }

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const { source, destination } = result;
    if (source.droppableId !== destination.droppableId) return; 

    const cId = Number(source.droppableId.split('-')[1]);
    
    setSelectedItems(prev => {
      const clusterItems = prev.filter(g => g.cluster_id === cId);
      const otherItems = prev.filter(g => g.cluster_id !== cId);

      const [moved] = clusterItems.splice(source.index, 1);
      clusterItems.splice(destination.index, 0, moved);

      return [...clusterItems, ...otherItems];
    });
  };

  const handleSave = async () => {
    if (selectedItems.length === 0) return alert("대시보드에서 배정된 발표자가 없습니다. Dashboard를 확인하세요. 👤")
    if (!evalVersion) return alert("채점표 버전을 선택해줘! 📝")
    
    const modeName = evalMode === 'team' ? '팀 단위' : '개인 단위';
    if (!confirm(`[${semester}] 학기 ${week}주차를 [${modeName}] 평가로 확정하고 저장할까?`)) return
    setSaving(true)
    
    await supabase.from('presentations').delete().eq('week', week).eq('semester', semester)
    
    const insertData = [];
    let globalIndex = 0;
    
    const uniqueClusters = [...new Set(selectedItems.map(g => g.cluster_id))].sort((a,b) => a - b);
    
    uniqueClusters.forEach(cId => {
      const cItems = selectedItems.filter(g => g.cluster_id === cId);
      cItems.forEach(item => {
        if (item.type === 'team') {
            item.members.forEach(memberName => {
              insertData.push({ presenter_name: memberName, topic: topic, week: week, eval_version: evalVersion, order_index: globalIndex, team_id: item.team_id, group_id: item.group_id, cluster_id: item.cluster_id, semester: semester });
            });
        } else {
            insertData.push({ presenter_name: item.name, topic: topic, week: week, eval_version: evalVersion, order_index: globalIndex, group_id: item.group_id, cluster_id: item.cluster_id, semester: semester });
        }
        globalIndex++;
      });
    });
    
    const { error } = await supabase.from('presentations').insert(insertData)
    if (!error) { 
      alert(`저장 완료! 🏁`)
      loadWeekData(week, semester, weeklySetup, weekTopics)
    } else {
      alert("오류: " + error.message)
    }
    setSaving(false)
  }

  const getVoterStatus = (presenterName) => {
    const myScores = currentScores.filter(s => s.voter_name === presenterName)
    const myVotedPIds = myScores.map(s => s.presentation_id)
    const myInfo = currentPs.find(p => p.presenter_name === presenterName)
    
    if (!myInfo) return { scoreDone: false, scoreRemainNames: [] }

    let missingScores = []
    
    if (evalMode === 'team') {
        const myTargets = currentPs.filter(p => p.cluster_id === myInfo.cluster_id && p.team_id !== myInfo.team_id);
        missingScores = myTargets.filter(p => !myVotedPIds.includes(p.id));
    } else {
        const myTargets = currentPs.filter(p => p.cluster_id === myInfo.cluster_id && p.presenter_name !== presenterName);
        missingScores = myTargets.filter(p => !myVotedPIds.includes(p.id));
    }
    
    const remainNames = [...new Set(missingScores.map(p => evalMode === 'team' ? `${p.team_id}팀(${p.presenter_name})` : p.presenter_name))]
    
    return { scoreDone: missingScores.length === 0, scoreRemainNames: remainNames }
  }

  if (loading) return <div className="p-10 text-center font-black text-slate-500 min-h-screen flex items-center justify-center">시스템 세팅 불러오는 중... 🔄</div>

  const uniqueClusters = [...new Set(selectedItems.map(g => g.cluster_id))].sort((a,b) => a - b);

  return (
    <div className="p-8 bg-slate-50 min-h-screen text-slate-900 font-sans pb-32">
      <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-4 gap-12">
        
        {/* 🌟 메인 세팅 영역 */}
        <div className="lg:col-span-3 space-y-12">
          
          <header className="flex justify-between items-end border-b-2 border-slate-900 pb-4">
            <h1 className="text-4xl font-extrabold uppercase tracking-tight text-teal-900">Vote & Order Setup ⚙️</h1>
            <div className="flex gap-4">
              <button onClick={handleResetWeek} className="text-[11px] font-black text-red-500 hover:text-red-700 uppercase tracking-widest transition-colors border-b-2 border-transparent hover:border-red-700 pb-1">
                현재 주차 초기화 🔄
              </button>
              <Link href="/admin/hub/vote" className="text-[11px] font-black text-slate-500 hover:text-teal-800 uppercase tracking-widest transition-colors border-b-2 border-transparent hover:border-teal-800 pb-1">
                ← Vote Hub
              </Link>
            </div>
          </header>

          <div className="space-y-16">
            
            {/* Step 1. Info Viewer */}
            <div className="border-t-[3px] border-teal-800 pt-6">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-widest mb-6 flex items-center gap-2">
                Step 1. Weekly Target <span className="text-[9px] font-bold bg-slate-200 text-slate-500 px-2 py-0.5 rounded">대시보드 연동됨</span>
              </h3>
              <div className="flex flex-col md:flex-row gap-6">
                <div className="w-full md:w-[15%]">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Target Week</label>
                  <select value={week} onChange={(e)=>handleWeekChange(Number(e.target.value))} className="w-full border-b-[3px] border-slate-300 py-2 text-lg font-black text-teal-800 outline-none cursor-pointer bg-transparent focus:border-teal-700 transition-colors">
                    {Array.from({ length: totalWeeks + 1 }, (_, i) => i).map(w => (
                      <option key={w} value={w}>Week {w}</option>
                    ))}
                  </select>
                </div>
                <div className="w-full md:w-[20%]">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Eval Mode</label>
                  <div className={`w-full border-b-[3px] py-2 text-lg font-black bg-transparent outline-none cursor-default ${evalMode === 'team' ? 'border-teal-800 text-teal-800' : 'border-blue-800 text-blue-800'}`}>
                    {evalMode === 'team' ? '👥 팀 단위 평가' : '👤 개인 단위 평가'}
                  </div>
                </div>
                <div className="flex-1 w-full">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Topic (주제)</label>
                  <div className="w-full border-b-[3px] border-slate-300 py-2 text-lg font-black text-slate-800 outline-none bg-transparent cursor-default">
                    {topic || "등록된 주제 없음"}
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2. 채점표 버전 */}
            <div className="border-t-[3px] border-teal-800 pt-6">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-widest mb-6">Step 2. Scoreboard Version</h3>
              <div className="flex flex-wrap gap-4">
                {availableVersions.map(v => (
                  <button key={v} onClick={()=>setEvalVersion(v)} className={`px-10 py-4 font-black uppercase tracking-widest transition-all border-b-[3px] ${evalVersion === v ? 'text-teal-800 border-teal-800 scale-[1.02]' : 'text-slate-400 border-transparent hover:text-slate-600 hover:border-slate-300'}`}>
                    {v} 버전
                  </button>
                ))}
              </div>
            </div>

            {/* Step 3. 드래그 앤 드롭 순서 변경 */}
            <div className="border-t-[3px] border-teal-800 pt-6">
              <div className="flex justify-between items-end mb-8">
                <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-widest">Step 3. Order Control 🖐️</h3>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">드래그하여 발표 순서를 조정하세요</span>
              </div>
              
              <DragDropContext onDragEnd={onDragEnd}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  {uniqueClusters.length === 0 && <p className="col-span-full text-sm font-bold text-slate-400 py-6 border-y border-slate-200 text-center">배정된 발표자가 없습니다. 대시보드를 확인하세요.</p>}
                  
                  {uniqueClusters.map(cId => {
                    const clusterItems = selectedItems.filter(item => item.cluster_id === cId);
                    return (
                      <div key={cId} className="space-y-4">
                        <div className="border-b border-slate-300 pb-3 px-1 flex justify-between items-center">
                          <h3 className="font-extrabold text-teal-800 uppercase tracking-widest">Score Cluster #{cId}</h3>
                          <button onClick={()=>randomizeOrderByCluster(cId)} className="text-[10px] text-teal-700 font-black border border-teal-200 px-3 py-1 bg-teal-50 hover:bg-teal-100 transition-colors uppercase tracking-widest">Shuffle 🎲</button>
                        </div>
                        <Droppable droppableId={`cluster-${cId}`}>
                          {(provided) => (
                            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-3 min-h-[120px] bg-slate-50 border border-slate-200 p-6 flex flex-col justify-start">
                              {clusterItems.length === 0 && <p className="text-center text-xs font-bold text-slate-400 mt-4">배정된 인원/팀이 없습니다.</p>}
                              
                              {clusterItems.map((item, idx) => (
                                <Draggable key={item.id} draggableId={String(item.id)} index={idx}>
                                  {(provided, snapshot) => (
                                    <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className={`bg-white p-4 flex flex-col gap-3 transition-all border-l-4 ${snapshot.isDragging ? 'border border-teal-600 shadow-xl scale-105 z-50 border-l-teal-600' : 'border border-slate-200 hover:border-slate-300 shadow-sm border-l-teal-800'}`}>
                                      
                                      {/* 개인 모드 */}
                                      {item.type === 'individual' && (
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-4">
                                            <span className="text-[10px] font-black text-slate-400 w-4">{idx + 1}</span>
                                            <p className="font-extrabold text-sm text-slate-900">{item.name}</p>
                                          </div>
                                          <div className="flex gap-1">
                                            <span className="text-[9px] font-bold text-blue-600 border border-blue-200 bg-blue-50 px-1.5 py-0.5 rounded uppercase">G#{item.group_id}</span>
                                          </div>
                                        </div>
                                      )}

                                      {/* 팀 모드 */}
                                      {item.type === 'team' && (
                                        <>
                                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                            <div className="flex items-center gap-3">
                                              <span className="text-[10px] font-black text-slate-400 w-4">{idx + 1}</span>
                                              <p className="font-extrabold text-sm text-teal-900">Team {item.team_id}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <span className="text-[9px] font-bold text-blue-600 border border-blue-200 bg-blue-50 px-1.5 py-0.5 rounded uppercase">G#{item.group_id}</span>
                                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{item.members.length}명</span>
                                            </div>
                                          </div>
                                          <div className="flex flex-wrap gap-2 pl-7">
                                            {item.members.map(mName => (
                                              <span key={mName} className="text-[11px] font-bold text-slate-600">{mName}</span>
                                            ))}
                                          </div>
                                        </>
                                      )}
                                      
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      </div>
                    )
                  })}
                </div>
              </DragDropContext>
            </div>
            
            <button onClick={handleSave} disabled={saving} className="w-full py-6 border-[3px] border-slate-900 text-slate-900 font-black text-xl uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all active:scale-95 mt-10">
              {saving ? '저장 중...' : '최종 확정 및 저장 🏁'}
            </button>
          </div>
        </div>

        {/* 🌟 실시간 채점 트래커 */}
        <div className="lg:col-span-1 space-y-6">
          <div className="border-t-[3px] border-slate-900 pt-6 sticky top-8">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-8 border-b border-slate-200 pb-4">Live Tracking</h3>
            <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-2 no-scrollbar">
              {currentPs.length === 0 ? (
                <p className="text-xs text-slate-400 font-bold">확정된 발표자가 없습니다.</p>
              ) : currentPs.map(p => {
                const s = getVoterStatus(p.presenter_name)
                return (
                  <div key={p.id} className="border-b border-slate-200 pb-4 last:border-0">
                    <p className="text-sm font-extrabold text-slate-800 mb-2">{p.presenter_name}</p>
                    <div className="flex gap-2 mb-3">
                      <span className="text-[9px] font-bold text-slate-500 border border-slate-300 px-1.5 py-0.5 uppercase tracking-widest">C#{p.cluster_id}</span>
                      <span className="text-[9px] font-bold text-blue-600 border border-blue-200 bg-blue-50 px-1.5 py-0.5 uppercase tracking-widest">G#{p.group_id}</span>
                      {evalMode === 'team' && (
                        <span className="text-[9px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.5 uppercase tracking-widest">T#{p.team_id}</span>
                      )}
                    </div>
                    <DetailStatusLine label="평가 상태" done={s.scoreDone} names={s.scoreRemainNames} />
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

function DetailStatusLine({ label, done, names }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${done ? 'bg-teal-500' : 'bg-red-500 animate-pulse'}`}></div>
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{label}</span>
        </div>
        <span className={`text-[10px] font-black tracking-widest ${done ? 'text-teal-600' : 'text-red-500'}`}>{done ? 'DONE' : 'WAIT'}</span>
      </div>
      {!done && <p className="text-[10px] font-medium text-red-400 pl-3 leading-tight mt-1 border-l-2 border-red-200">미완료: {names.join(', ')}</p>}
    </div>
  )
}