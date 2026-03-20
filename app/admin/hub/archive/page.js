'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function ArchiveAdmin() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [currentSemester, setCurrentSemester] = useState('2026-1')

  // 1. 회칙 데이터 상태 (장별 배열 구조)
  const [rules, setRules] = useState([{ id: Date.now(), chapter: '제 1장 총칙', content: '' }])

  // 2. 자료 상태
  const [archiveFiles, setArchiveFiles] = useState([]) // 교육, 특별 (archive_files)
  const [pastFiles, setPastFiles] = useState([])       // 과거 자료 (files_metadata)
  const [pastSemestersCount, setPastSemestersCount] = useState(0)

  // 3. 이름 수정 모달 상태
  const [editTarget, setEditTarget] = useState(null) // { table: 'archive_files' | 'files_metadata', id: '', title: '' }
  const [newTitle, setNewTitle] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    
    // 1. 현재 학기 로드
    const { data: configData } = await supabase.from('pr_config').select('value').eq('key', 'current_semester').single()
    const sem = configData?.value || '2026-1'
    setCurrentSemester(sem)

    // 2. 회칙 로드 (JSON 배열 복원)
    const { data: rulesData } = await supabase.from('club_rules').select('content').order('updated_at', { ascending: false }).limit(1)
    if (rulesData && rulesData.length > 0) {
      try {
        const parsed = JSON.parse(rulesData[0].content)
        if (Array.isArray(parsed)) setRules(parsed)
        else setRules([{ id: Date.now(), chapter: '제 1장', content: rulesData[0].content }])
      } catch(e) {
        setRules([{ id: Date.now(), chapter: '제 1장', content: rulesData[0].content }])
      }
    }

    // 3. 교육 & 특별세션 자료 로드
    const { data: aFiles } = await supabase.from('archive_files').select('*').order('created_at', { ascending: false })
    if (aFiles) setArchiveFiles(aFiles)

    // 4. 대시보드 과거 자료 로드 (is_archive = true)
    const { data: pFiles } = await supabase.from('files_metadata').select('*').eq('is_archive', true).order('created_at', { ascending: false })
    if (pFiles) {
      setPastFiles(pFiles)
      const uniqueSems = new Set(pFiles.map(f => f.semester).filter(Boolean))
      setPastSemestersCount(uniqueSems.size)
    }

    setLoading(false)
  }

  // --- 회칙 관리 로직 ---
  const addRuleChapter = () => {
    setRules([...rules, { id: Date.now(), chapter: `제 ${rules.length + 1}장`, content: '' }])
  }
  
  const removeRuleChapter = (id) => {
    if(!confirm('이 장을 삭제할까요?')) return
    setRules(rules.filter(r => r.id !== id))
  }

  const updateRule = (id, field, value) => {
    setRules(rules.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  const handleSaveRules = async () => {
    setSaving(true)
    const { error } = await supabase.from('club_rules').insert([{ content: JSON.stringify(rules), last_editor: 'Admin' }])
    if (!error) alert('회칙이 성공적으로 업데이트되었습니다! 📜')
    else alert('회칙 저장 실패: ' + error.message)
    setSaving(false)
  }

  // --- 파일 관리 로직 ---
  const handleDeleteFile = async (table, id) => {
    if (!confirm('이 자료를 목록에서 삭제할까요? (DB에서 영구 삭제됨)')) return
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (!error) fetchData()
  }

  const handleSaveEditName = async () => {
    if (!newTitle.trim()) return alert("이름을 입력해 주세요.")
    
    const updateData = editTarget.table === 'archive_files' ? { title: newTitle } : { file_name: newTitle }
    const { error } = await supabase.from(editTarget.table).update(updateData).eq('id', editTarget.id)
    
    if (!error) {
      alert('이름이 성공적으로 수정되었습니다! ✨')
      setEditTarget(null)
      fetchData()
    } else alert('수정 실패: ' + error.message)
  }

  if (loading) return <div className="p-10 text-center font-black text-slate-500 min-h-screen flex items-center justify-center">아카이브 관리소 여는 중... 🔄</div>

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-12 pb-32">
      <div className="max-w-[1500px] mx-auto space-y-12">
        
        {/* 상단 헤더 */}
        <header className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 border-b border-slate-200 pb-6">
          <div>
            <Link href="/admin/hub" className="text-xs font-black text-slate-400 hover:text-blue-600 uppercase tracking-widest mb-2 block transition-colors">← Back to Hub</Link>
            <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-800 flex items-center gap-3">
              <span className="text-4xl">🗄️</span> Archive Manager
            </h1>
            <p className="text-xs font-bold text-slate-500 mt-2">교육 자료 관리, 과거 기록 보존, 회칙 에디터를 통합 관리하세요.</p>
          </div>
          <div className="bg-blue-100 text-blue-700 px-6 py-3 rounded-2xl font-black text-sm uppercase shadow-sm">
            현재 학기: {currentSemester}
          </div>
        </header>

        {/* 🌟 2단 레이아웃 구성 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          
          {/* [좌측 열] 자료 관리 섹션 */}
          <div className="flex flex-col gap-8">
            
            {/* 1. 현재 교육/특별세션 자료실 관리 */}
            <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl border border-slate-800 flex flex-col min-h-[400px] max-h-[500px]">
              <div className="border-b border-slate-700 pb-4 mb-6">
                <h2 className="text-xl font-black text-white flex items-center gap-2">📘 교육 및 특별세션 자료 관리</h2>
                <p className="text-[10px] text-slate-400 font-bold mt-2 leading-tight">유저 아카이브 페이지에서 업로드된 자료들의 이름을 수정하거나 삭제할 수 있습니다.</p>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto pr-2 no-scrollbar">
                {archiveFiles.length === 0 ? <p className="text-slate-500 font-bold text-sm text-center py-10">등록된 자료가 없습니다.</p> : archiveFiles.map(f => (
                  <div key={f.id} className="bg-slate-800 p-4 rounded-2xl flex flex-col gap-2 group border border-slate-700 hover:border-blue-500 transition-all">
                    <div className="flex justify-between items-start">
                      <div className="flex gap-2">
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase ${f.category === 'edu' ? 'bg-blue-900 text-blue-300' : 'bg-yellow-900 text-yellow-300'}`}>
                          {f.category === 'edu' ? '교육' : '특별'}
                        </span>
                        <span className="text-[9px] font-black text-slate-400 bg-slate-900 px-2 py-0.5 rounded">W{f.week}</span>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditTarget({ table: 'archive_files', id: f.id, title: f.title }); setNewTitle(f.title); }} className="text-[9px] font-black bg-blue-900/50 text-blue-300 px-2 py-1 rounded hover:bg-blue-500 hover:text-white">수정</button>
                        <button onClick={() => handleDeleteFile('archive_files', f.id)} className="text-[9px] font-black bg-red-900/50 text-red-400 px-2 py-1 rounded hover:bg-red-500 hover:text-white">삭제</button>
                      </div>
                    </div>
                    <p className="text-sm font-black text-white truncate pr-2">{f.title}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. 과거 자료 보관소 관리 */}
            <div className="bg-slate-800 p-8 rounded-[2.5rem] shadow-2xl border border-slate-700 flex flex-col min-h-[400px] max-h-[600px]">
              <div className="border-b border-slate-600 pb-6 mb-6">
                <h2 className="text-xl font-black text-white flex items-center gap-2">📦 과거 자료 보관소</h2>
                <div className="flex items-center gap-3 mt-3">
                  <span className="text-[10px] font-black bg-slate-900 text-emerald-400 px-3 py-1 rounded-lg">보관 중인 학기: {pastSemestersCount}개</span>
                  <span className="text-[10px] font-black bg-slate-900 text-blue-400 px-3 py-1 rounded-lg">총 보관 파일: {pastFiles.length}개</span>
                </div>
                <p className="text-[10px] text-slate-400 font-bold mt-2 leading-tight">대시보드에서 학기 마감 시 넘어온 자료들입니다. 유튜브 링크나 파일 이름을 수정할 수 있습니다.</p>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto pr-2 no-scrollbar">
                {pastFiles.length === 0 ? <p className="text-slate-500 font-bold text-sm text-center py-10">보관된 과거 자료가 없습니다.</p> : pastFiles.map(f => (
                  <div key={f.id} className="bg-slate-900 p-4 rounded-2xl flex flex-col gap-2 group border border-slate-700 hover:border-emerald-500 transition-all">
                    <div className="flex justify-between items-start">
                      <div className="flex gap-2">
                        <span className="text-[9px] font-black bg-emerald-900/50 text-emerald-300 px-2 py-0.5 rounded">{f.semester}</span>
                        <span className="text-[9px] font-black text-slate-400 bg-slate-800 px-2 py-0.5 rounded uppercase">{f.file_category} / W{f.week}</span>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditTarget({ table: 'files_metadata', id: f.id, title: f.file_name }); setNewTitle(f.file_name); }} className="text-[9px] font-black bg-blue-900/50 text-blue-300 px-2 py-1 rounded hover:bg-blue-500 hover:text-white">이름수정</button>
                        <button onClick={() => handleDeleteFile('files_metadata', f.id)} className="text-[9px] font-black bg-red-900/50 text-red-400 px-2 py-1 rounded hover:bg-red-500 hover:text-white">삭제</button>
                      </div>
                    </div>
                    <p className="text-xs font-black text-slate-200 truncate pr-2">{f.file_name}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* [우측 열] 회칙 에디터 (화면 전체 높이 활용) */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col h-full sticky top-8 min-h-[85vh]">
            <div className="flex justify-between items-end mb-6 border-b border-slate-100 pb-4 shrink-0">
              <div>
                <h2 className="text-2xl font-black text-slate-800">📜 회칙 에디터</h2>
                <p className="text-[10px] font-bold text-slate-400 mt-1">장을 추가하여 구조적으로 작성하세요.</p>
              </div>
              <button onClick={handleSaveRules} disabled={saving} className="bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-600 transition-colors shadow-md">
                {saving ? '저장 중...' : '전체 저장 💾'}
              </button>
            </div>
            
            <div className="flex-1 space-y-6 overflow-y-auto pr-2 no-scrollbar">
              {rules.map((rule) => (
                <div key={rule.id} className="bg-slate-50 p-5 rounded-2xl border border-slate-100 relative group">
                  <button onClick={() => removeRuleChapter(rule.id)} className="absolute top-4 right-4 text-red-400 hover:text-red-600 text-xs font-black opacity-0 group-hover:opacity-100 transition-opacity">✕ 삭제</button>
                  <input 
                    type="text" 
                    value={rule.chapter} 
                    onChange={e => updateRule(rule.id, 'chapter', e.target.value)} 
                    className="w-3/4 bg-transparent text-lg font-black text-emerald-600 outline-none mb-3 border-b border-transparent focus:border-emerald-200 pb-1"
                    placeholder="제 1장 총칙"
                  />
                  <textarea 
                    value={rule.content} 
                    onChange={e => updateRule(rule.id, 'content', e.target.value)} 
                    className="w-full bg-white p-4 rounded-xl font-medium text-slate-600 text-sm outline-none border border-slate-200 focus:border-emerald-400 leading-relaxed min-h-[120px] resize-y" 
                    placeholder="해당 장의 상세 회칙 내용을 적어주세요."
                  />
                </div>
              ))}
              <button onClick={addRuleChapter} className="w-full py-4 border-2 border-dashed border-emerald-200 text-emerald-500 font-black text-xs rounded-2xl hover:bg-emerald-50 transition-colors">
                + 새로운 장(Chapter) 추가
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* 🌟 파일명 수정 모달창 */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 z-50">
          <div className="bg-white p-8 rounded-[2.5rem] w-full max-w-sm shadow-2xl">
            <h2 className="font-black mb-2 text-xl text-slate-800">자료 이름 수정 ✏️</h2>
            <p className="text-[10px] font-bold text-slate-400 mb-6 uppercase">파일 제목을 변경합니다.</p>
            <input 
              type="text" 
              value={newTitle} 
              onChange={(e) => setNewTitle(e.target.value)} 
              className="w-full border-2 border-slate-200 p-4 rounded-xl mb-6 font-bold text-sm outline-none focus:border-blue-500 bg-slate-50" 
              placeholder="새로운 이름 입력"
            />
            <div className="flex gap-3">
              <button onClick={handleSaveEditName} className="flex-1 py-3.5 bg-blue-600 text-white rounded-xl font-black text-sm hover:bg-blue-700 shadow-md">저장 완료</button>
              <button onClick={() => setEditTarget(null)} className="flex-1 py-3.5 bg-slate-100 text-slate-500 rounded-xl font-black text-sm hover:bg-slate-200">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}