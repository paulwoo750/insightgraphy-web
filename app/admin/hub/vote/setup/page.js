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
  const [clusterCount, setClusterCount] = useState(1) 
  const [selectedMembers, setSelectedMembers] = useState([]) 
  
  // 🌟 실시간 채점 트래킹 상태
  const [currentPs, setCurrentPs] = useState([])
  const [currentScores, setCurrentScores] = useState([])

  useEffect(() => {
    const initPage = async () => {
      setLoading(true)
      
      // 채점표 버전 불러오기
      const { data: vData } = await supabase.from('pr_vote_criteria').select('version')
      if (vData && vData.length > 0) {
        setAvailableVersions(vData.map(v => v.version))
      }

      // 기본 환경 설정 (Config) 불러오기
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

      // 최근 주차 확인
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

  // 🌟 특정 주차의 데이터를 불러오고 정제하는 핵심 함수
  const loadWeekData = async (targetWeek, currentSem, wSetup, topics) => {
    setLoading(true)
    
    // 1. 대시보드에서 설정한 해당 주차 데이터 추출
    const setup = wSetup[targetWeek] || { clusterCount: 1, groupToCluster: {}, members: {} }
    const cCount = Number(setup.clusterCount) || 1
    setClusterCount(cCount)
    setTopic(topics[targetWeek] || '주제 미설정')

    // 2. '미정'이나 '결석'이 아닌, 실제 조에 배정된 멤버들만 필터링
    const assignedMembers = Object.keys(setup.members || {}).filter(name => 
      setup.members[name] !== '미정' && setup.members[name] !== '결석'
    )

    // 3. 기존 DB(presentations)에 저장된 발표 정보 가져오기 (순서 및 버전 유지 목적)
    const { data: pData } = await supabase.from('presentations').select('*').eq('week', targetWeek).eq('semester', currentSem).order('order_index', { ascending: true })
    const { data: sData } = await supabase.from('scores').select('*').eq('semester', currentSem) 
    
    setCurrentPs(pData || [])
    setCurrentScores(sData || [])

    if (pData && pData.length > 0) {
      setEvalVersion(pData[0].eval_version || 'v1')
    } else {
      setEvalVersion('v1') // DB에 없으면 기본값
    }

    // 4. 대시보드의 멤버 세팅과 기존 순서(order_index) 병합
    const mappedMembers = assignedMembers.map(name => {
      const gId = Number(setup.members[name])
      const cId = Number(setup.groupToCluster[gId]) || 1
      const existing = pData?.find(p => p.presenter_name === name)
      
      return {
        id: name, // Drag and drop을 위해 이름을 id로 사용
        name: name,
        group_id: gId,
        cluster_id: cId,
        order_index: existing ? existing.order_index : 999 // 기존 순서 유지, 없으면 뒤로
      }
    })

    // order_index 기준으로 정렬
    mappedMembers.sort((a, b) => a.order_index - b.order_index)
    setSelectedMembers(mappedMembers)
    
    setLoading(false)
  }

  // 🌟 클러스터별 셔플 (순서 랜덤 섞기)
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

  // 🌟 드래그 앤 드롭 순서 변경
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

  // 🌟 설정 최종 저장 (DB 반영)
  const handleSave = async () => {
    if (selectedMembers.length === 0) return alert("대시보드에 배정된 발표자가 없어! 👤")
    if (!evalVersion) return alert("채점표 버전을 선택해줘! 📝")
    
    if (!confirm(`[${semester}] 학기 ${week}주차 투표 순서를 확정하고 저장할까?`)) return
    setSaving(true)
    
    // 기존 순서 삭제 후 새 순서로 삽입
    await supabase.from('presentations').delete().eq('week', week).eq('semester', semester)
    
    const insertData = selectedMembers.map((m, idx) => ({
      presenter_name: m.name, 
      topic: topic, 
      week: week,
      eval_version: evalVersion, 
      order_index: idx, 
      group_id: m.group_id, 
      cluster_id: m.cluster_id,
      semester: semester
    }))
    
    const { error } = await supabase.from('presentations').insert(insertData)
    if (!error) { 
      alert(`순서 및 세팅 저장 완료! 🏁`)
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
        
        {/* 🌟 메인 세팅 영역 (순서 및 채점표 버전) */}
        <div className="lg:col-span-3 space-y-6">
          <header className="flex justify-between items-center px-2 mb-4">
            <h1 className="text-3xl font-black italic uppercase tracking-tighter">Vote & Order Setup ⚙️</h1>
            <Link href="/admin/hub/vote" className="bg-slate-200 text-slate-600 px-4 py-2 rounded-xl text-xs font-black hover:bg-slate-900 hover:text-white transition-all shadow-sm">
              ← Back to Vote Hub
            </Link>
          </header>

          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 space-y-10">
            
            {/* 기본 정보 뷰어 (수정 불가, 대시보드 연동) */}
            <div className="flex flex-col md:flex-row items-center bg-blue-50 p-6 rounded-2xl border border-blue-100 gap-6">
              <div className="shrink-0">
                <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest block mb-1">Week</label>
                <select value={week} onChange={(e)=>handleWeekChange(Number(e.target.value))} className="bg-white p-3 rounded-xl font-black text-xl text-blue-600 outline-none cursor-pointer border border-blue-200 shadow-sm">
                  {Array.from({ length: totalWeeks + 1 }, (_, i) => i).map(w => (
                    <option key={w} value={w}>{w}주차 세팅</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 w-full">
                <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest block mb-1">Topic (대시보드 연동)</label>
                <div className="bg-white/60 p-4 rounded-xl font-bold text-slate-700 border border-blue-100">
                  {topic}
                </div>
              </div>
            </div>

            {/* Step 1. 채점표 버전 선택 */}
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

            {/* Step 2. 드래그 앤 드롭 순서 변경 */}
            <div className="space-y-8 bg-slate-50 p-8 rounded-[3rem] border border-slate-100">
              <div className="flex justify-between items-end border-b border-slate-200 pb-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Step 2. Order Control by Cluster 🖐️</label>
                <span className="text-[9px] font-bold text-slate-400 bg-slate-200 px-2 py-1 rounded">조 편성은 Dashboard 관리자 메뉴를 이용하세요.</span>
              </div>
              
              <DragDropContext onDragEnd={onDragEnd}>
                {Array.from({length: clusterCount}, (_,i)=>i+1).map(cId => {
                  const clusterMembers = selectedMembers.filter(m => m.cluster_id === cId);
                  return (
                    <div key={cId} className="space-y-4">
                      <div className="flex justify-between items-center px-2">
                        <h3 className="font-black text-purple-600 text-sm italic">Score Cluster #{cId}</h3>
                        <button onClick={()=>randomizeOrderByCluster(cId)} className="bg-purple-600 text-white px-3 py-1.5 rounded-xl font-black text-[9px] uppercase shadow-lg hover:bg-purple-700 active:scale-90 transition-all">Shuffle 🎲</button>
                      </div>
                      <Droppable droppableId={`cluster-${cId}`}>
                        {(provided) => (
                          <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2 min-h-[80px] bg-slate-100/50 p-6 rounded-[2.5rem] max-w-xl mx-auto border-2 border-dashed border-slate-200 flex flex-col justify-center">
                            {clusterMembers.length === 0 && <p className="text-center text-[10px] font-bold text-slate-400">배정된 발표자가 없습니다.</p>}
                            {clusterMembers.map((m, idx) => (
                              <Draggable key={m.id} draggableId={String(m.id)} index={idx}>
                                {(provided, snapshot) => (
                                  <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className={`bg-white p-4 rounded-2xl flex items-center justify-between border shadow-sm transition-all ${snapshot.isDragging ? 'border-purple-500 scale-105 z-50 shadow-2xl' : 'border-slate-100 hover:border-blue-200'}`}>
                                    <div className="flex items-center gap-4">
                                      <span className="bg-slate-900 text-white w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black">{idx + 1}</span>
                                      <p className="font-black text-sm">{m.name}</p>
                                    </div>
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
                  )
                })}
              </DragDropContext>
            </div>
            
            <button onClick={handleSave} disabled={saving} className="w-full py-7 bg-slate-900 text-white rounded-[2.5rem] font-black text-xl shadow-2xl active:scale-95 transition-all hover:bg-blue-900">
              {saving ? '저장 중...' : '발표 순서 확정 🏁'}
            </button>
          </div>
        </div>

        {/* 🌟 실시간 채점 트래커 (우측 패널) */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900 p-8 rounded-[3rem] text-white shadow-2xl sticky top-8">
            <h3 className="text-xs font-black text-blue-400 uppercase tracking-[0.2em] mb-8 flex items-center gap-2">● 실시간 채점 현황</h3>
            <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-2 no-scrollbar">
              {currentPs.length === 0 ? (
                <p className="text-xs text-slate-400 font-bold text-center">등록된 발표자가 없습니다.</p>
              ) : currentPs.map(p => {
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