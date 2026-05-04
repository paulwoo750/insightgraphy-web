'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function DashboardManager() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 1. 기본 설정 상태
  const [semester, setSemester] = useState('2026-1')
  const [totalWeeks, setTotalWeeks] = useState(12)
  const [weekTopics, setWeekTopics] = useState({}) 

  // 2. 장소 즐겨찾기 관리 상태
  const [favoriteLocs, setFavoriteLocs] = useState([]) 

  // 3. 마감 시간 & 파일 현황 상태
  const [deadlines, setDeadlines] = useState({})
  const [recentFiles, setRecentFiles] = useState([])

  // 4. 파일 수정 모달 상태 
  const [editFile, setEditFile] = useState(null)
  const [newFileName, setNewFileName] = useState('')

  // 5. 통합 주차별 세팅 상태
  const [activeMembers, setActiveMembers] = useState([])
  const [setupWeek, setSetupWeek] = useState(1) 
  const [weeklySetup, setWeeklySetup] = useState({}) 

  const deadlineCategories = [
    'proposal', 'slide', 'video', 'proposal_comment', 'vote_feedback', 'video_comment',
    'attendance_start', 'session_start', 'attendance_end'
  ]
  const weeks = Array.from({ length: totalWeeks + 1 }, (_, i) => i)

  useEffect(() => {
    if (!sessionStorage.getItem('isIGAdmin')) {
      router.push('/admin')
      return
    }
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    setLoading(true)
    
    // 멤버 리스트 불러오기
    let currentActiveGens = []
    const { data: genData } = await supabase.from('pr_members_config').select('active_generations').eq('id', 'main').single()
    if (genData && genData.active_generations) {
      currentActiveGens = genData.active_generations
    }

    const { data: memData } = await supabase.from('pr_members').select('*').order('name', { ascending: true })
    if (memData) {
      const validMembers = memData.filter(m => {
        if (!m.is_active) return false; 
        if (currentActiveGens.length > 0 && m.generation) {
          const genNum = String(m.generation).replace(/[^0-9]/g, '');
          return currentActiveGens.includes(genNum); 
        }
        return true;
      });
      setActiveMembers(validMembers)
    } else {
      setActiveMembers([])
    }

    // 설정값 불러오기
    const { data: configData } = await supabase.from('pr_config').select('*')
    if (configData) {
      const sem = configData.find(c => c.key === 'current_semester')?.value
      const wks = configData.find(c => c.key === 'total_weeks')?.value
      const topics = configData.find(c => c.key === 'week_topics')?.value
      const wSetup = configData.find(c => c.key === 'weekly_setup')?.value 
      const favLocs = configData.find(c => c.key === 'favorite_locations')?.value 

      if (sem) setSemester(sem)
      if (wks) setTotalWeeks(Number(wks))
      if (topics) setWeekTopics(JSON.parse(topics))
      if (wSetup) setWeeklySetup(JSON.parse(wSetup))
      if (favLocs) setFavoriteLocs(JSON.parse(favLocs))
    }

    // 마감 시간 불러오기
    const { data: dlData } = await supabase.from('pr_deadlines').select('*')
    const dlState = {}
    if (dlData) {
      dlData.forEach(d => {
        if (!dlState[d.week]) {
          dlState[d.week] = { 
            proposal: '', slide: '', video: '', proposal_comment: '', vote_feedback: '', video_comment: '',
            attendance_start: '', session_start: '', attendance_end: '' 
          }
        }
        if (d.deadline_time) {
          const date = new Date(d.deadline_time)
          const localString = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16)
          dlState[d.week][d.category] = localString
        }
      })
    }
    setDeadlines(dlState)

    // 이번 학기 제출 파일 불러오기
    const currentSem = configData?.find(c => c.key === 'current_semester')?.value || '2026-1'
    const { data: filesData } = await supabase
      .from('files_metadata')
      .select('*')
      .eq('semester', currentSem)
      .eq('is_archive', false)
      .order('created_at', { ascending: false })
      .limit(30)
    if (filesData) setRecentFiles(filesData)

    setLoading(false)
  }

  // 🌟 주차별 설정 업데이트 핸들러
  const handleUpdateSetup = (key, val) => {
    setWeeklySetup(prev => {
      const current = prev[setupWeek] || {}
      return { ...prev, [setupWeek]: { ...current, [key]: val } }
    })
  }

  // 🌟 이중 객체 (Mapping, Members) 범용 업데이트 핸들러
  const handleUpdateSetupDeep = (mappingKey, id, val) => {
    setWeeklySetup(prev => {
      const current = prev[setupWeek] || {}
      const currentMapping = current[mappingKey] || {}
      return { ...prev, [setupWeek]: { ...current, [mappingKey]: { ...currentMapping, [id]: val } } }
    })
  }

  // 🌟 즐겨찾기 핸들러
  const handleSaveFavorite = () => {
    const loc = weeklySetup[setupWeek]?.location || {};
    if (!loc.lat || !loc.lng) return alert('좌표를 먼저 올바르게 입력해주세요! 😅');
    
    const name = prompt('이 장소의 즐겨찾기 이름을 입력하세요.\n(예: 경영대 58동 101호)');
    if (!name) return;
    
    setFavoriteLocs([...favoriteLocs, { id: Date.now(), name, lat: loc.lat, lng: loc.lng, radius: loc.radius || 100 }]);
  }

  const handleDeleteFavorite = (id) => {
    if(!confirm("이 즐겨찾기를 삭제할까요?")) return;
    setFavoriteLocs(favoriteLocs.filter(f => f.id !== id));
  }

  const handleSelectFavorite = (e) => {
    const id = e.target.value;
    if (id === 'manual') return; 
    
    const fav = favoriteLocs.find(f => f.id == id);
    if (fav) {
      handleUpdateSetup('location', { lat: fav.lat, lng: fav.lng, radius: fav.radius });
    }
    e.target.value = 'manual'; 
  }

  // 전체 저장 로직
  const handleSaveAll = async () => {
    setSaving(true)

    await supabase.from('pr_config').upsert([
      { key: 'current_semester', value: semester },
      { key: 'total_weeks', value: String(totalWeeks) },
      { key: 'week_topics', value: JSON.stringify(weekTopics) },
      { key: 'weekly_setup', value: JSON.stringify(weeklySetup) },
      { key: 'favorite_locations', value: JSON.stringify(favoriteLocs) } 
    ])

    const deadlineUpserts = []
    const deadlineDeletes = []

    for (let w = 0; w <= totalWeeks; w++) {
      deadlineCategories.forEach(cat => {
        if (deadlines[w]?.[cat]) {
          deadlineUpserts.push({ week: w, category: cat, deadline_time: new Date(deadlines[w][cat]).toISOString() })
        } else {
          deadlineDeletes.push({ week: w, category: cat })
        }
      })
    }
    
    if (deadlineUpserts.length > 0) {
      const { error } = await supabase.from('pr_deadlines').upsert(deadlineUpserts, { onConflict: 'week, category' })
      if (error) alert('마감 시간 저장 오류: ' + error.message)
    }

    if (deadlineDeletes.length > 0) {
      for (const item of deadlineDeletes) {
        await supabase.from('pr_deadlines').delete().eq('week', item.week).eq('category', item.category)
      }
    }

    alert('모든 대시보드 설정이 성공적으로 저장되었습니다! 💾')
    setSaving(false)
  }

  const handleDeleteFile = async (id, filePath) => {
    if (!confirm('이 파일을 완전히 삭제하시겠습니까? (Storage에서도 영구 삭제됩니다)')) return
    if (filePath && filePath !== 'youtube') await supabase.storage.from('ig-files').remove([filePath])
    await supabase.from('files_metadata').delete().eq('id', id)
    fetchDashboardData() 
  }

  const handleUpdateFileName = async () => {
    if (!newFileName) return
    await supabase.from('files_metadata').update({ file_name: newFileName }).eq('id', editFile.id)
    alert('파일 이름이 수정되었습니다! ✨')
    setEditFile(null)
    fetchDashboardData()
  }

  const handleArchiveTransfer = async () => {
    const confirmMsg = `정말 [${semester}] 학기의 모든 대시보드 자료를 '과거 자료실'로 이관하시겠습니까?\n이 작업은 되돌리기 어렵습니다!`
    if (!confirm(confirmMsg)) return

    setSaving(true)
    const { error } = await supabase.from('files_metadata').update({ is_archive: true, category: '과거 자료실' }).eq('semester', semester).eq('is_archive', false)
    if (!error) {
      alert('성공적으로 모든 자료가 아카이브로 넘어갔습니다! 📦')
      fetchDashboardData()
    } else alert('오류 발생: ' + error.message)
    setSaving(false)
  }

  if (loading) return <div className="min-h-screen flex justify-center items-center font-bold text-slate-400">데이터를 불러오는 중입니다... 🔄</div>

  // 🌟 완벽한 Fallback 객체 생성 (개인/팀 모드 호환)
  const rawSetup = weeklySetup[setupWeek] || {};
  const currentSetup = {
    evalMode: rawSetup.evalMode || 'individual', // 개인 단위가 기본값
    
    // 카운트
    teamCount: rawSetup.teamCount || rawSetup.groupCount || 1,
    groupCount: rawSetup.groupCount || 1,
    clusterCount: rawSetup.clusterCount || 1,
    
    // 개인 단위일 때 쓰는 맵핑
    members: rawSetup.members || {}, 
    groupToCluster: rawSetup.groupToCluster || rawSetup.groupClusters || {},
    
    // 팀 단위일 때 쓰는 맵핑
    memberTeams: rawSetup.memberTeams || rawSetup.members || {}, 
    teamGroups: rawSetup.teamGroups || {}, 
    groupClusters: rawSetup.groupClusters || rawSetup.groupToCluster || {},
    
    location: rawSetup.location || { lat: '', lng: '', radius: 100 }
  };
  
  // 레거시 팀 매핑 마이그레이션 방어
  if (currentSetup.evalMode === 'team' && Object.keys(currentSetup.teamGroups).length === 0 && rawSetup.members) {
    Object.values(rawSetup.members).forEach(g => {
      if(!isNaN(Number(g))) currentSetup.teamGroups[g] = g;
    });
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-12 pb-32">
      <div className="max-w-[1500px] mx-auto space-y-12">
        
        <header className="flex flex-col md:flex-row md:justify-between md:items-end gap-6 mb-8 border-b border-slate-200 pb-6 sticky top-0 bg-slate-50/90 backdrop-blur-md z-20 pt-4">
          <div>
            <Link href="/admin/hub" className="text-xs font-black text-slate-400 hover:text-blue-600 uppercase tracking-widest mb-2 block transition-colors">← Back to Hub</Link>
            <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-800 flex items-center gap-3">
              <span className="text-4xl">📂</span> Dashboard Manager
            </h1>
            <p className="text-xs font-bold text-slate-500 mt-2">학기 설정 및 주차별 출석, 주제, 마감 시간, 투표 조 편성을 통제하세요.</p>
          </div>
          <button onClick={handleSaveAll} disabled={saving} className="bg-blue-600 text-white px-10 py-3.5 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg active:scale-95 whitespace-nowrap">
            {saving ? 'Saving...' : 'Save All Settings 💾'}
          </button>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-8">
          
          <div className="space-y-8">
            <section className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col md:flex-row gap-8 justify-between items-center">
              <div className="flex gap-6 w-full md:flex-1">
                <div className="space-y-2 flex-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Current Semester</label>
                  <input type="text" value={semester} onChange={e => setSemester(e.target.value)} className="w-full bg-slate-50 p-4 rounded-xl font-black text-xl text-blue-600 outline-none border border-transparent focus:border-blue-200" placeholder="예: 2026-1" />
                </div>
                <div className="space-y-2 flex-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Total Weeks</label>
                  <input type="number" value={totalWeeks} onChange={e => setTotalWeeks(Number(e.target.value))} className="w-full bg-slate-50 p-4 rounded-xl font-black text-xl text-blue-600 outline-none border border-transparent focus:border-blue-200" />
                </div>
              </div>
              <div className="w-full md:w-auto text-right shrink-0 flex flex-col items-end">
                <button onClick={handleArchiveTransfer} className="w-full md:w-auto bg-slate-900 text-white px-8 py-4 rounded-xl font-black text-sm hover:bg-red-600 transition-colors shadow-md whitespace-nowrap">
                  🚨 학기 마감 (아카이브로 이관)
                </button>
                <p className="text-[10px] text-slate-400 mt-3 font-bold whitespace-nowrap">이번 학기 대시보드 자료를 모두 과거 자료실로 보냅니다.</p>
              </div>
            </section>

            {/* 주차별 통합 세팅 보드 */}
            <section className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
              <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><span>📅</span> 주차별 통합 세팅 (Weekly Setup)</h2>
                  <p className="text-xs font-bold text-slate-400 mt-1">상단에서 주차를 선택하고 장소, 시간, 조 편성을 한 번에 세팅하세요.</p>
                </div>
              </div>

              <div className="flex gap-2 mb-8 overflow-x-auto pb-4 no-scrollbar border-b border-slate-100">
                {weeks.map(w => (
                  <button 
                    key={w} 
                    onClick={() => setSetupWeek(w)} 
                    className={`px-5 py-3 rounded-2xl text-xs font-black shrink-0 transition-all border ${setupWeek === w ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-[1.02]' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-blue-300'}`}
                  >
                    W{w} 세팅
                  </button>
                ))}
              </div>

              <div className="space-y-12 animate-in fade-in duration-300">
                
                {/* [A] 주제 설정 */}
                <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100">
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    <div className="font-black text-blue-900 text-xl flex items-center gap-3 shrink-0">
                      <span className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-xs shadow-md">{setupWeek}</span>
                      Week {setupWeek} 주제
                    </div>
                    <input
                      type="text"
                      value={weekTopics[setupWeek] || ''}
                      onChange={(e) => setWeekTopics({...weekTopics, [setupWeek]: e.target.value})}
                      placeholder={setupWeek === 0 ? "OT 등 특별 주제를 입력하세요" : "이 주차의 주제를 입력하세요 (예: 웹3.0과 블록체인)"}
                      className="flex-1 bg-white p-3 rounded-xl text-sm font-bold text-slate-700 outline-none border border-slate-200 focus:border-blue-400 transition-colors shadow-sm"
                    />
                  </div>
                </div>

                {/* [B] 오프라인 출석 및 장소 세팅 */}
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-2"><span>📍</span> 출석 장소 및 시간 세팅</h3>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* 장소 & 즐겨찾기 설정 */}
                    <div className="space-y-4 bg-slate-50 p-5 rounded-2xl border border-slate-100">
                      <div className="flex justify-between items-end border-b border-slate-200 pb-2">
                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest block">장소 좌표 설정</span>
                        <div className="flex items-center gap-2">
                          <select onChange={handleSelectFavorite} className="text-[9px] font-bold text-slate-500 p-1.5 rounded-lg border border-slate-200 outline-none cursor-pointer bg-white">
                            <option value="manual">자주 쓰는 장소 불러오기...</option>
                            {favoriteLocs.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                          </select>
                          <button onClick={handleSaveFavorite} className="text-[9px] bg-yellow-100 text-yellow-700 px-2 py-1.5 rounded-lg font-black hover:bg-yellow-200 transition-colors">
                            + 즐겨찾기 추가
                          </button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400">위도 (Lat)</label>
                          <input type="number" value={currentSetup.location.lat || ''} onChange={e => handleUpdateSetup('location', {...currentSetup.location, lat: e.target.value})} className="w-full p-2.5 rounded-xl text-xs font-bold outline-none border border-slate-200 focus:border-blue-400" placeholder="예: 37.456" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400">경도 (Lng)</label>
                          <input type="number" value={currentSetup.location.lng || ''} onChange={e => handleUpdateSetup('location', {...currentSetup.location, lng: e.target.value})} className="w-full p-2.5 rounded-xl text-xs font-bold outline-none border border-slate-200 focus:border-blue-400" placeholder="예: 126.953" />
                        </div>
                        <div className="space-y-1.5 col-span-2">
                          <label className="text-[9px] font-black text-slate-400">허용 반경 (m)</label>
                          <input type="number" value={currentSetup.location.radius || 100} onChange={e => handleUpdateSetup('location', {...currentSetup.location, radius: Number(e.target.value)})} className="w-full p-2.5 rounded-xl text-xs font-bold outline-none border border-slate-200 focus:border-blue-400" />
                        </div>
                      </div>

                      {favoriteLocs.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-200 flex flex-wrap gap-1.5">
                          {favoriteLocs.map(f => (
                            <span key={f.id} className="text-[9px] bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded-md flex items-center gap-1 font-bold shadow-sm">
                              {f.name} <button onClick={() => handleDeleteFavorite(f.id)} className="text-slate-300 hover:text-red-500 font-black ml-1 transition-colors">✕</button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 출석 시간 설정 */}
                    <div className="space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-100">
                      <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest block mb-2 border-b border-slate-200 pb-2">출석 시간 세팅</span>
                      <DeadlineInput w={setupWeek} cat="attendance_start" label="🟢 출석체크 오픈" theme="text-emerald-600 bg-emerald-50 focus:border-emerald-400" deadlines={deadlines} onChange={(w, cat, val) => setDeadlines(prev => ({...prev, [w]: {...prev[w], [cat]: val}}))} />
                      <DeadlineInput w={setupWeek} cat="session_start" label="⚠️ 세션 시작 (지각 기준)" theme="text-orange-600 bg-orange-50 focus:border-orange-400" deadlines={deadlines} onChange={(w, cat, val) => setDeadlines(prev => ({...prev, [w]: {...prev[w], [cat]: val}}))} />
                      <DeadlineInput w={setupWeek} cat="attendance_end" label="🔴 출석체크 종료 (결석)" theme="text-red-600 bg-red-50 focus:border-red-400" deadlines={deadlines} onChange={(w, cat, val) => setDeadlines(prev => ({...prev, [w]: {...prev[w], [cat]: val}}))} />
                    </div>
                  </div>
                </div>

                {/* [C] 과제 마감 시간 설정 */}
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-2"><span>⏰</span> 과제 데드라인 설정</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-100">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">📁 1. 자료 제출 마감</span>
                      <DeadlineInput w={setupWeek} cat="proposal" label="📝 기획서 제출" theme="text-blue-600 bg-blue-50 focus:border-blue-400" deadlines={deadlines} onChange={(w, cat, val) => setDeadlines(prev => ({...prev, [w]: {...prev[w], [cat]: val}}))} />
                      <DeadlineInput w={setupWeek} cat="slide" label="📊 슬라이드 제출" theme="text-indigo-600 bg-indigo-50 focus:border-indigo-400" deadlines={deadlines} onChange={(w, cat, val) => setDeadlines(prev => ({...prev, [w]: {...prev[w], [cat]: val}}))} />
                      <DeadlineInput w={setupWeek} cat="video" label="🎬 발표영상 등록" theme="text-purple-600 bg-purple-50 focus:border-purple-400" deadlines={deadlines} onChange={(w, cat, val) => setDeadlines(prev => ({...prev, [w]: {...prev[w], [cat]: val}}))} />
                    </div>
                    <div className="space-y-3 bg-slate-50 p-5 rounded-2xl border border-slate-100">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">💬 2. 피드백 작성 마감</span>
                      <DeadlineInput w={setupWeek} cat="proposal_comment" label="📝 기획서 댓글" theme="text-teal-600 bg-teal-50 focus:border-teal-400" deadlines={deadlines} onChange={(w, cat, val) => setDeadlines(prev => ({...prev, [w]: {...prev[w], [cat]: val}}))} />
                      <DeadlineInput w={setupWeek} cat="vote_feedback" label="✅ 정성 피드백 (조원 평가)" theme="text-sky-600 bg-sky-50 focus:border-sky-400" deadlines={deadlines} onChange={(w, cat, val) => setDeadlines(prev => ({...prev, [w]: {...prev[w], [cat]: val}}))} />
                      <DeadlineInput w={setupWeek} cat="video_comment" label="🎬 셀프 피드백 (본인 평가)" theme="text-slate-600 bg-slate-200 focus:border-slate-400" deadlines={deadlines} onChange={(w, cat, val) => setDeadlines(prev => ({...prev, [w]: {...prev[w], [cat]: val}}))} />
                    </div>
                  </div>
                </div>

                {/* 🌟 [D] 동적 조원 및 클러스터 편성 (개인 vs 팀 전환 토글) */}
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2"><span>👥</span> 조원 및 클러스터 편성</h3>
                    
                    {/* 평가 모드 선택 토글 */}
                    <div className="flex gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200 shadow-inner w-fit">
                      <button 
                        onClick={() => handleUpdateSetup('evalMode', 'individual')} 
                        className={`px-5 py-2 rounded-lg text-xs font-black transition-all ${currentSetup.evalMode === 'individual' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        👤 개인 단위 발표
                      </button>
                      <button 
                        onClick={() => handleUpdateSetup('evalMode', 'team')} 
                        className={`px-5 py-2 rounded-lg text-xs font-black transition-all ${currentSetup.evalMode === 'team' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                      >
                        👥 팀 단위 발표
                      </button>
                    </div>
                  </div>
                  
                  {/* 동적 카운트 입력부 */}
                  <div className="flex flex-col md:flex-row gap-6 bg-slate-50 p-5 rounded-2xl border border-slate-100">
                    {currentSetup.evalMode === 'team' && (
                      <div className="flex-1 space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">총 팀 (Team) 개수</label>
                        <input type="number" value={currentSetup.teamCount} onChange={e => handleUpdateSetup('teamCount', Number(e.target.value))} className="w-full bg-white p-3 rounded-xl font-black text-lg text-emerald-600 outline-none border border-slate-200 focus:border-emerald-400" />
                      </div>
                    )}
                    <div className="flex-1 space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">총 조 (Group) 개수</label>
                      <input type="number" value={currentSetup.groupCount} onChange={e => handleUpdateSetup('groupCount', Number(e.target.value))} className="w-full bg-white p-3 rounded-xl font-black text-lg text-blue-600 outline-none border border-slate-200 focus:border-blue-400" />
                    </div>
                    <div className="flex-1 space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">평가 클러스터 개수</label>
                      <input type="number" value={currentSetup.clusterCount} onChange={e => handleUpdateSetup('clusterCount', Number(e.target.value))} className="w-full bg-white p-3 rounded-xl font-black text-lg text-purple-600 outline-none border border-slate-200 focus:border-purple-400" />
                    </div>
                  </div>

                  {/* 동적 맵핑부 */}
                  {currentSetup.evalMode === 'team' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in">
                      {/* 팀 -> 그룹 매핑 */}
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                        <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest block border-b border-slate-100 pb-2">팀 ➡️ 그룹 매핑</label>
                        <div className="grid grid-cols-2 gap-3">
                          {Array.from({length: currentSetup.teamCount}, (_,i)=>i+1).map(tId => (
                            <div key={`t-${tId}`} className="bg-slate-50 p-2.5 rounded-xl flex justify-between items-center border border-slate-100">
                              <span className="text-xs font-black text-slate-700">{tId}팀 ➡️</span>
                              <select value={currentSetup.teamGroups[tId] || 1} onChange={(e) => handleUpdateSetupDeep('teamGroups', tId, Number(e.target.value))} className="bg-blue-100 text-blue-700 text-xs font-black p-1.5 rounded-lg outline-none cursor-pointer border-none">
                                {Array.from({length: currentSetup.groupCount}, (_,i)=>i+1).map(g => <option key={g} value={g}>{g}그룹</option>)}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 그룹 -> 클러스터 매핑 */}
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                        <label className="text-[10px] font-black text-purple-500 uppercase tracking-widest block border-b border-slate-100 pb-2">그룹 ➡️ 클러스터 매핑</label>
                        <div className="grid grid-cols-2 gap-3">
                          {Array.from({length: currentSetup.groupCount}, (_,i)=>i+1).map(gId => (
                            <div key={`g-${gId}`} className="bg-slate-50 p-2.5 rounded-xl flex justify-between items-center border border-slate-100">
                              <span className="text-xs font-black text-slate-700">{gId}그룹 ➡️</span>
                              <select value={currentSetup.groupClusters[gId] || 1} onChange={(e) => handleUpdateSetupDeep('groupClusters', gId, Number(e.target.value))} className="bg-purple-100 text-purple-700 text-xs font-black p-1.5 rounded-lg outline-none cursor-pointer border-none">
                                {Array.from({length: currentSetup.clusterCount}, (_,i)=>i+1).map(c => <option key={c} value={c}>{c}클러스터</option>)}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3 animate-in fade-in">
                      <label className="text-[10px] font-black text-purple-500 uppercase tracking-widest block border-b border-slate-100 pb-2">조 ➡️ 클러스터 매핑</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {Array.from({length: currentSetup.groupCount}, (_,i)=>i+1).map(gId => (
                          <div key={`g-${gId}`} className="bg-slate-50 p-2.5 rounded-xl flex justify-between items-center border border-slate-100">
                            <span className="text-xs font-black text-slate-700">{gId}조 ➡️</span>
                            <select value={currentSetup.groupToCluster[gId] || 1} onChange={(e) => handleUpdateSetupDeep('groupToCluster', gId, Number(e.target.value))} className="bg-purple-100 text-purple-700 text-xs font-black p-1.5 rounded-lg outline-none cursor-pointer border-none">
                              {Array.from({length: currentSetup.clusterCount}, (_,i)=>i+1).map(c => <option key={c} value={c}>{c}클러스터</option>)}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 동적 멤버 소속 설정 */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">멤버 소속 설정 (결석 처리 포함)</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[350px] overflow-y-auto pr-2 no-scrollbar p-2 bg-slate-50 rounded-2xl border border-slate-100">
                      {activeMembers.map(m => {
                        const targetKey = currentSetup.evalMode === 'team' ? 'memberTeams' : 'members';
                        const assignedVal = currentSetup[targetKey][m.name] || '미정';
                        
                        return (
                          <div key={m.id} className={`p-3 rounded-xl border flex flex-col gap-2 transition-all ${assignedVal === '미정' ? 'bg-white border-slate-200' : assignedVal === '결석' ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200 shadow-sm'}`}>
                            <span className="font-black text-sm text-slate-800 truncate">
                              {m.name} <span className="text-[9px] font-bold text-slate-400">({m.generation})</span>
                            </span>
                            <select 
                              value={assignedVal} 
                              onChange={(e) => handleUpdateSetupDeep(targetKey, m.name, e.target.value)} 
                              className={`w-full text-xs font-bold p-1.5 rounded-lg outline-none cursor-pointer shadow-sm ${assignedVal === '미정' ? 'bg-slate-100 text-slate-500' : assignedVal === '결석' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'}`}
                            >
                              <option value="미정">미정</option>
                              <option value="결석">결석 🚨</option>
                              {currentSetup.evalMode === 'team' 
                                ? Array.from({length: currentSetup.teamCount}, (_,i)=>i+1).map(t => <option key={t} value={t}>{t}팀 배정</option>)
                                : Array.from({length: currentSetup.groupCount}, (_,i)=>i+1).map(g => <option key={g} value={g}>{g}조 배정</option>)
                              }
                            </select>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* 🌟 동적 요약 현황판 */}
                  <div className="bg-slate-900 p-6 rounded-3xl space-y-4">
                    <h3 className="text-xs font-black text-white uppercase tracking-widest border-b border-slate-700 pb-2 flex items-center gap-2"><span>📊</span> 요약: {setupWeek}주차 조직도 현황판</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      
                      {currentSetup.evalMode === 'team' ? (
                        Array.from({length: currentSetup.groupCount}, (_,i)=>i+1).map(g => {
                          const clusterNum = currentSetup.groupClusters[g] || 1;
                          const teamsInGroup = Array.from({length: currentSetup.teamCount}, (_,i)=>i+1).filter(t => (currentSetup.teamGroups[t] || 1) === g);

                          return (
                            <div key={`summary-g-${g}`} className="bg-slate-800 p-4 rounded-2xl border border-slate-700 hover:border-blue-500 transition-colors">
                              <div className="flex justify-between items-center mb-4">
                                <span className="text-sm font-black text-blue-400">{g}그룹</span>
                                <span className="text-[10px] font-black bg-purple-900 text-purple-300 px-2 py-0.5 rounded">클러스터 #{clusterNum}</span>
                              </div>
                              
                              <div className="space-y-3">
                                {teamsInGroup.length === 0 ? (
                                  <p className="text-xs font-bold text-slate-500">배정된 팀 없음</p>
                                ) : (
                                  teamsInGroup.map(t => {
                                    const tMembers = activeMembers.filter(m => String(currentSetup.memberTeams[m.name]) === String(t)).map(m => m.name);
                                    return (
                                      <div key={`summary-t-${t}`} className="pl-3 border-l-2 border-slate-600 flex flex-col gap-1">
                                        <span className="text-xs font-black text-emerald-400">Team {t}</span>
                                        <p className="text-[10px] font-bold text-slate-300 leading-tight">
                                          {tMembers.length > 0 ? tMembers.join(', ') : '인원 없음'}
                                        </p>
                                      </div>
                                    )
                                  })
                                )}
                              </div>
                            </div>
                          )
                        })
                      ) : (
                        Array.from({length: currentSetup.groupCount}, (_,i)=>i+1).map(g => {
                          const clusterNum = currentSetup.groupToCluster[g] || 1;
                          const gMembers = activeMembers.filter(m => String(currentSetup.members[m.name]) === String(g)).map(m => m.name);
                          
                          return (
                            <div key={`summary-ind-g-${g}`} className="bg-slate-800 p-4 rounded-2xl border border-slate-700 hover:border-emerald-500 transition-colors">
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-black text-emerald-400">{g}조</span>
                                <span className="text-[10px] font-black bg-purple-900 text-purple-300 px-2 py-0.5 rounded">클러스터 #{clusterNum}</span>
                              </div>
                              <p className="text-xs font-bold text-slate-300 leading-relaxed">
                                {gMembers.length > 0 ? gMembers.join(', ') : '배정된 인원 없음'}
                              </p>
                            </div>
                          )
                        })
                      )}
                      
                      <div className="bg-red-900/30 p-4 rounded-2xl border border-red-900/50 hover:border-red-500/50 transition-colors">
                        <span className="text-sm font-black text-red-400 block mb-3">🚨 결석 및 미정 현황</span>
                        <div className="space-y-3">
                          <div className="pl-3 border-l-2 border-red-800 flex flex-col gap-1">
                            <span className="text-[10px] font-black text-red-300">결석 인원</span>
                            <p className="text-[10px] font-bold text-slate-300 leading-tight">
                              {activeMembers.filter(m => currentSetup[currentSetup.evalMode === 'team' ? 'memberTeams' : 'members'][m.name] === '결석').map(m=>m.name).join(', ') || '없음'}
                            </p>
                          </div>
                          <div className="pl-3 border-l-2 border-slate-700 flex flex-col gap-1">
                            <span className="text-[10px] font-black text-slate-400">미정 인원</span>
                            <p className="text-[10px] font-bold text-slate-400 leading-tight">
                              {activeMembers.filter(m => !currentSetup[currentSetup.evalMode === 'team' ? 'memberTeams' : 'members'][m.name] || currentSetup[currentSetup.evalMode === 'team' ? 'memberTeams' : 'members'][m.name] === '미정').map(m=>m.name).join(', ') || '없음'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </section>

          </div>

          {/* [우측] 제출 현황판 (Submission Tracker) */}
          <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl h-fit sticky top-8">
            <h2 className="text-lg font-black uppercase mb-2 text-blue-400">Submission Tracker 👀</h2>
            <p className="text-[10px] font-bold text-slate-400 mb-6 pb-4 border-b border-slate-800">대시보드 과제 제출 현황</p>
            
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 no-scrollbar">
              {recentFiles.length > 0 ? recentFiles.map(file => (
                <div key={file.id} className="bg-slate-800 p-4 rounded-2xl flex flex-col gap-2 relative overflow-hidden group hover:border-blue-500 border border-transparent transition-all">
                  
                  {file.is_late && (
                    <div className="absolute -right-6 top-3 bg-red-600 text-white text-[8px] font-black px-8 py-1 rotate-45 shadow-md">LATE</div>
                  )}

                  <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-slate-800/90 p-1 rounded-lg backdrop-blur-sm">
                    <button onClick={() => { setEditFile(file); setNewFileName(file.file_name); }} className="text-[9px] font-black bg-slate-700 text-white px-2 py-1 rounded hover:bg-blue-600">EDIT</button>
                    <button onClick={() => handleDeleteFile(file.id, file.storage_path)} className="text-[9px] font-black bg-red-900/50 text-red-300 px-2 py-1 rounded hover:bg-red-600 hover:text-white">DEL</button>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${file.file_category === 'proposal' ? 'bg-emerald-900 text-emerald-300' : file.file_category === 'slide' ? 'bg-purple-900 text-purple-300' : 'bg-red-900 text-red-300'}`}>
                      {file.file_category === 'proposal' ? '기획서' : file.file_category === 'slide' ? '슬라이드' : '영상'}
                    </span>
                    <span className="text-[10px] font-black text-slate-400 bg-slate-700 px-2 py-0.5 rounded">W{file.week}</span>
                  </div>
                  
                  <p className="text-sm font-black truncate pr-16">{file.file_name}</p>
                  
                  <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 mt-1">
                    <span className="text-slate-300">👤 {file.uploader}</span>
                    <span>{new Date(file.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              )) : (
                <div className="py-10 text-center text-slate-500 font-bold border-2 border-dashed border-slate-700 rounded-2xl">
                  아직 제출된 과제가 없습니다.
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* 파일명 수정 모달창 */}
      {editFile && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <div className="bg-white p-8 rounded-[2rem] w-full max-w-sm shadow-2xl">
            <h2 className="font-black mb-2 text-xl text-slate-800">파일명 강제 수정 🛠️</h2>
            <p className="text-[10px] font-bold text-slate-400 mb-6 uppercase">Admin Control Panel</p>
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              className="w-full border-2 border-slate-200 p-3 rounded-xl mb-6 font-bold outline-none focus:border-blue-500"
            />
            <div className="flex gap-3">
              <button onClick={handleUpdateFileName} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-black hover:bg-blue-700 shadow-md">저장</button>
              <button onClick={() => setEditFile(null)} className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-xl font-black hover:bg-slate-200">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DeadlineInput({ w, cat, label, theme, deadlines, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-end">
        <span className={`text-[10px] font-black w-fit px-2 py-0.5 rounded uppercase tracking-tighter ${theme.split('focus')[0]}`}>
          {label}
        </span>
        <button 
          onClick={() => onChange(w, cat, '')} 
          className="text-[9px] font-bold text-slate-400 hover:text-red-500 bg-white px-2 py-0.5 rounded-md border border-slate-200 transition-colors"
          title="날짜 지우기"
        >
          초기화 ❌
        </button>
      </div>
      <input
        type="datetime-local"
        value={deadlines[w]?.[cat] || ''}
        onChange={(e) => onChange(w, cat, e.target.value)}
        className={`w-full bg-slate-50 p-2.5 rounded-xl text-xs font-bold text-slate-700 outline-none border border-transparent transition-all cursor-pointer ${theme.split(' ')[2]}`}
      />
    </div>
  )
}