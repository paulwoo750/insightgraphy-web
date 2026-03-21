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
  const [weekTopics, setWeekTopics] = useState({}) // 🌟 주차별 주제 저장용 상태

  // 2. 마감 시간 & 파일 현황 상태
  const [deadlines, setDeadlines] = useState({})
  const [recentFiles, setRecentFiles] = useState([])

  // 3. 파일 수정 모달 상태 (🌟 관리자 파일 관리용)
  const [editFile, setEditFile] = useState(null)
  const [newFileName, setNewFileName] = useState('')

  const deadlineCategories = ['proposal', 'slide', 'video', 'proposal_comment', 'vote_feedback', 'video_comment']

  useEffect(() => {
    if (!sessionStorage.getItem('isIGAdmin')) {
      router.push('/admin')
      return
    }
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    setLoading(true)
    
    // 1. 설정값 불러오기 (주차별 주제 포함)
    const { data: configData } = await supabase.from('pr_config').select('*')
    if (configData) {
      const sem = configData.find(c => c.key === 'current_semester')?.value
      const wks = configData.find(c => c.key === 'total_weeks')?.value
      const topics = configData.find(c => c.key === 'week_topics')?.value

      if (sem) setSemester(sem)
      if (wks) setTotalWeeks(Number(wks))
      if (topics) setWeekTopics(JSON.parse(topics))
    }

    // 2. 마감 시간 불러오기
    const { data: dlData } = await supabase.from('pr_deadlines').select('*')
    const dlState = {}
    if (dlData) {
      dlData.forEach(d => {
        if (!dlState[d.week]) {
          dlState[d.week] = { proposal: '', slide: '', video: '', proposal_comment: '', video_comment: '', vote_feedback: '' }
        }
        if (d.deadline_time) {
          const date = new Date(d.deadline_time)
          const localString = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16)
          dlState[d.week][d.category] = localString
        }
      })
    }
    setDeadlines(dlState)

    // 3. 이번 학기 제출 파일 불러오기
    const currentSem = configData?.find(c => c.key === 'current_semester')?.value || '2026-1'
    const { data: filesData } = await supabase
      .from('files_metadata')
      .select('*')
      .eq('semester', currentSem)
      .eq('is_archive', false)
      .order('created_at', { ascending: false })
      .limit(30) // 넉넉하게 30개 표시
    if (filesData) setRecentFiles(filesData)

    setLoading(false)
  }

  // 전체 저장 로직
  const handleSaveAll = async () => {
    setSaving(true)

    // 설정 및 주차별 주제(JSON) 저장
    await supabase.from('pr_config').upsert([
      { key: 'current_semester', value: semester },
      { key: 'total_weeks', value: String(totalWeeks) },
      { key: 'week_topics', value: JSON.stringify(weekTopics) } 
    ])

    // 마감 시간 저장 (🌟 빈 값 처리 보강)
    const deadlineUpserts = []
    const deadlineDeletes = [] // 빈 값을 저장할 때는 지워야 함

    for (let w = 0; w <= totalWeeks; w++) {
      deadlineCategories.forEach(cat => {
        if (deadlines[w]?.[cat]) {
          deadlineUpserts.push({ week: w, category: cat, deadline_time: new Date(deadlines[w][cat]).toISOString() })
        } else {
          // 마감 기한이 비워진 경우 기존 DB에서 삭제 처리
          deadlineDeletes.push({ week: w, category: cat })
        }
      })
    }
    
    if (deadlineUpserts.length > 0) {
      const { error } = await supabase.from('pr_deadlines').upsert(deadlineUpserts, { onConflict: 'week, category' })
      if (error) alert('마감 시간 저장 오류: ' + error.message)
    }

    // 빈 값으로 설정된 항목들을 실제 DB에서 지우기
    if (deadlineDeletes.length > 0) {
      for (const item of deadlineDeletes) {
        await supabase.from('pr_deadlines').delete().eq('week', item.week).eq('category', item.category)
      }
    }

    alert('모든 대시보드 설정이 성공적으로 저장되었습니다! 💾')
    setSaving(false)
  }

  // 🌟 관리자 파일 삭제 기능
  const handleDeleteFile = async (id, filePath) => {
    if (!confirm('이 파일을 완전히 삭제하시겠습니까? (Storage에서도 영구 삭제됩니다)')) return
    
    if (filePath && filePath !== 'youtube') {
      await supabase.storage.from('ig-files').remove([filePath])
    }
    
    await supabase.from('files_metadata').delete().eq('id', id)
    fetchDashboardData() 
  }

  // 🌟 관리자 파일 이름 수정 기능
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
    const { error } = await supabase
      .from('files_metadata')
      .update({ is_archive: true, category: '과거 자료실' })
      .eq('semester', semester)
      .eq('is_archive', false)

    if (!error) {
      alert('성공적으로 모든 자료가 아카이브로 넘어갔습니다! 📦')
      fetchDashboardData()
    } else alert('오류 발생: ' + error.message)
    setSaving(false)
  }

  if (loading) return <div className="min-h-screen flex justify-center items-center font-bold text-slate-400">데이터를 불러오는 중입니다... 🔄</div>

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-12 pb-32">
      <div className="max-w-[1400px] mx-auto space-y-12">
        
        {/* 상단 헤더 & 컨트롤 바 */}
        <header className="flex flex-col md:flex-row md:justify-between md:items-end gap-6 mb-8 border-b border-slate-200 pb-6 sticky top-0 bg-slate-50/90 backdrop-blur-md z-20 pt-4">
          <div>
            <Link href="/admin/hub" className="text-xs font-black text-slate-400 hover:text-blue-600 uppercase tracking-widest mb-2 block transition-colors">← Back to Hub</Link>
            <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-800 flex items-center gap-3">
              <span className="text-4xl">📂</span> Dashboard Manager
            </h1>
            <p className="text-xs font-bold text-slate-500 mt-2">학기 설정, 주차별 주제 및 마감 시간, 제출 현황을 완벽하게 통제하세요.</p>
          </div>
          <button onClick={handleSaveAll} disabled={saving} className="bg-blue-600 text-white px-10 py-3.5 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg active:scale-95 whitespace-nowrap">
            {saving ? 'Saving...' : 'Save All Settings 💾'}
          </button>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-8">
          
          {/* [좌측] 1. 학기 설정 및 세밀한 마감 시간 셋업 */}
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
                  🚨 학기 마감 (아카이브로 전체 이관)
                </button>
                <p className="text-[10px] text-slate-400 mt-3 font-bold whitespace-nowrap">이번 학기 대시보드 자료를 모두 과거 자료실로 보냅니다.</p>
              </div>
            </section>

            <section className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
              <div className="flex justify-between items-end mb-6 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-xl font-black text-slate-800">⏰ Topics & Deadlines Setup</h2>
                  <p className="text-xs font-bold text-slate-400 mt-1">주차별 주제(Topic)와 마감 시간을 지정하세요. (0주차 포함)</p>
                </div>
              </div>

              <div className="space-y-6 max-h-[700px] overflow-y-auto pr-4 no-scrollbar">
                {Array.from({ length: totalWeeks + 1 }, (_, i) => i).map(w => (
                  <div key={w} className="bg-slate-50 p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group">
                    
                    <div className="flex flex-col md:flex-row md:items-center gap-4 mb-5 border-b border-slate-200/60 pb-4">
                      <div className="font-black text-slate-800 text-xl flex items-center gap-3 shrink-0">
                        <span className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center text-xs shadow-md">{w}</span>
                        Week {w}
                      </div>
                      <input
                        type="text"
                        value={weekTopics[w] || ''}
                        onChange={(e) => setWeekTopics({...weekTopics, [w]: e.target.value})}
                        placeholder={w === 0 ? "OT 등 특별 주제를 입력하세요" : "이 주차의 주제를 입력하세요 (예: 웹3.0과 블록체인)"}
                        className="flex-1 bg-white p-3 rounded-xl text-sm font-bold text-slate-700 outline-none border border-slate-200 focus:border-blue-400 transition-colors"
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3 bg-white p-4 rounded-2xl border border-slate-100">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">📁 1. 자료 제출 마감</span>
                        <DeadlineInput w={w} cat="proposal" label="📝 기획서 제출" theme="text-emerald-600 bg-emerald-50 focus:border-emerald-400" deadlines={deadlines} onChange={(w, cat, val) => setDeadlines(prev => ({...prev, [w]: {...prev[w], [cat]: val}}))} />
                        <DeadlineInput w={w} cat="slide" label="📊 슬라이드 제출" theme="text-purple-600 bg-purple-50 focus:border-purple-400" deadlines={deadlines} onChange={(w, cat, val) => setDeadlines(prev => ({...prev, [w]: {...prev[w], [cat]: val}}))} />
                        <DeadlineInput w={w} cat="video" label="🎬 발표영상 등록" theme="text-red-600 bg-red-50 focus:border-red-400" deadlines={deadlines} onChange={(w, cat, val) => setDeadlines(prev => ({...prev, [w]: {...prev[w], [cat]: val}}))} />
                      </div>

                      <div className="space-y-3 bg-white p-4 rounded-2xl border border-slate-100">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">💬 2. 피드백 작성 마감</span>
                        <DeadlineInput w={w} cat="proposal_comment" label="📝 기획서 댓글" theme="text-teal-600 bg-teal-50 focus:border-teal-400" deadlines={deadlines} onChange={(w, cat, val) => setDeadlines(prev => ({...prev, [w]: {...prev[w], [cat]: val}}))} />
                        <DeadlineInput w={w} cat="vote_feedback" label="✅ 정성 피드백 (타인 평가)" theme="text-blue-600 bg-blue-50 focus:border-blue-400" deadlines={deadlines} onChange={(w, cat, val) => setDeadlines(prev => ({...prev, [w]: {...prev[w], [cat]: val}}))} />
                        <DeadlineInput w={w} cat="video_comment" label="🎬 셀프 피드백 (본인 영상)" theme="text-orange-600 bg-orange-50 focus:border-orange-400" deadlines={deadlines} onChange={(w, cat, val) => setDeadlines(prev => ({...prev, [w]: {...prev[w], [cat]: val}}))} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* [우측] 3. 제출 현황판 (Submission Tracker) - 🌟 수정/삭제 기능 추가 */}
          <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl h-fit sticky top-8">
            <h2 className="text-lg font-black uppercase mb-2 text-blue-400">Submission Tracker 👀</h2>
            <p className="text-[10px] font-bold text-slate-400 mb-6 pb-4 border-b border-slate-800">대시보드 제출 현황 (관리자 권한)</p>
            
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 no-scrollbar">
              {recentFiles.length > 0 ? recentFiles.map(file => (
                <div key={file.id} className="bg-slate-800 p-4 rounded-2xl flex flex-col gap-2 relative overflow-hidden group hover:border-blue-500 border border-transparent transition-all">
                  
                  {file.is_late && (
                    <div className="absolute -right-6 top-3 bg-red-600 text-white text-[8px] font-black px-8 py-1 rotate-45 shadow-md">LATE</div>
                  )}

                  {/* 🌟 관리자 전용 호버 메뉴 (수정/삭제) */}
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

      {/* 🌟 관리자용 파일명 수정 모달창 */}
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
        {/* 🌟 엑스(삭제) 버튼 추가 */}
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