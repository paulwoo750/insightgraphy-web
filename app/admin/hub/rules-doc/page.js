'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { CLUB_RULES } from '@/lib/clubRules'

export default function RulesDocAdmin() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rowId, setRowId] = useState(null)
  const [chapters, setChapters] = useState([])

  useEffect(() => {
    if (!sessionStorage.getItem('isIGAdmin')) { router.push('/admin'); return }
    fetchRules()
  }, [])

  const fetchRules = async () => {
    setLoading(true)
    const { data } = await supabase.from('club_rules').select('*').order('updated_at', { ascending: false }).limit(1)
    if (data && data.length > 0) {
      setRowId(data[0].id ?? null)
      try {
        const parsed = JSON.parse(data[0].content)
        setChapters(Array.isArray(parsed) ? parsed : [{ id: 1, chapter: '회칙', content: data[0].content }])
      } catch {
        setChapters([{ id: 1, chapter: '회칙', content: data[0].content || '' }])
      }
    } else {
      setChapters([])
    }
    setLoading(false)
  }

  const loadBundle = () => {
    if (chapters.length > 0 && !confirm('현재 편집 중인 내용을 번들 회칙(26.07.04)으로 덮어쓸까요?')) return
    setChapters(CLUB_RULES.map(c => ({ ...c })))
  }

  const updateChapter = (idx, field, val) => {
    setChapters(prev => prev.map((c, i) => i === idx ? { ...c, [field]: val } : c))
  }
  const addChapter = () => setChapters(prev => [...prev, { id: Date.now(), chapter: '', content: '' }])
  const removeChapter = (idx) => {
    if (!confirm('이 장을 삭제할까요?')) return
    setChapters(prev => prev.filter((_, i) => i !== idx))
  }
  const move = (idx, dir) => {
    setChapters(prev => {
      const arr = [...prev]
      const j = idx + dir
      if (j < 0 || j >= arr.length) return prev
      ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
      return arr
    })
  }

  const handleSave = async () => {
    if (chapters.some(c => !c.chapter.trim())) return alert('장(章) 제목을 모두 입력해주세요.')
    setSaving(true)
    const payload = chapters.map((c, i) => ({ id: c.id ?? i + 1, chapter: c.chapter, content: c.content }))
    const content = JSON.stringify(payload)
    const updated_at = new Date().toISOString()

    let error
    if (rowId != null) {
      ({ error } = await supabase.from('club_rules').update({ content, updated_at }).eq('id', rowId))
    } else {
      const res = await supabase.from('club_rules').insert([{ content, updated_at }]).select()
      error = res.error
      if (!error && res.data?.[0]?.id != null) setRowId(res.data[0].id)
    }

    if (error) alert('저장 실패: ' + error.message)
    else alert('회칙이 저장되었습니다! 아카이브 회칙 열람실에 반영됩니다. 💾')
    setSaving(false)
  }

  if (loading) return <div className="min-h-screen bg-white flex items-center justify-center font-bold text-slate-400">회칙 불러오는 중... 🔄</div>

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans p-6 md:p-12 pb-32">
      <div className="max-w-3xl mx-auto">

        <header className="mb-8 border-b border-slate-200 pb-6 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
          <div>
            <Link href="/admin/hub" className="text-xs font-black text-slate-400 hover:text-teal-800 uppercase tracking-widest mb-3 block transition-colors">← Back to Hub</Link>
            <h1 className="text-3xl md:text-4xl font-extrabold text-teal-800 tracking-tight">회칙 편집</h1>
            <p className="text-sm font-medium text-slate-500 mt-2">장(章)별로 회칙 조항을 편집합니다. 저장 시 아카이브 회칙 열람실에 즉시 반영됩니다.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={loadBundle} className="px-4 py-2.5 border border-slate-300 text-slate-600 text-xs font-bold hover:border-teal-700 hover:text-teal-800 transition-colors">번들 회칙 불러오기</button>
            <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 bg-teal-800 text-white text-xs font-bold hover:bg-teal-900 transition-colors disabled:bg-slate-300">{saving ? '저장 중...' : '저장 💾'}</button>
          </div>
        </header>

        <div className="space-y-6">
          {chapters.length === 0 && (
            <p className="text-slate-400 font-medium text-center py-12 border border-dashed border-slate-200">
              등록된 회칙이 없습니다. <button onClick={loadBundle} className="text-teal-800 font-bold underline">번들 회칙 불러오기</button> 로 시작하세요.
            </p>
          )}
          {chapters.map((c, idx) => (
            <div key={idx} className="border border-slate-200 border-t-[3px] border-t-teal-800 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest w-14 shrink-0">CH.{idx + 1}</span>
                <input value={c.chapter} onChange={e => updateChapter(idx, 'chapter', e.target.value)} placeholder="장 제목 (예: 제 1 장 총칙)" className="flex-1 border-b border-slate-300 py-1.5 text-sm font-extrabold text-teal-800 outline-none focus:border-teal-700 bg-transparent" />
                <button onClick={() => move(idx, -1)} className="text-slate-400 hover:text-teal-800 font-black text-sm px-1" title="위로">▲</button>
                <button onClick={() => move(idx, 1)} className="text-slate-400 hover:text-teal-800 font-black text-sm px-1" title="아래로">▼</button>
                <button onClick={() => removeChapter(idx)} className="text-slate-400 hover:text-red-600 font-bold text-xs px-1" title="삭제">삭제</button>
              </div>
              <textarea value={c.content} onChange={e => updateChapter(idx, 'content', e.target.value)} placeholder="조항 내용을 입력하세요." className="w-full border border-slate-200 p-3 text-sm font-medium text-slate-700 outline-none focus:border-teal-600 leading-loose min-h-[180px] resize-y" />
            </div>
          ))}
        </div>

        <button onClick={addChapter} className="mt-6 w-full py-4 border-2 border-dashed border-slate-300 text-slate-500 font-bold text-sm hover:border-teal-700 hover:text-teal-800 transition-colors">+ 장(章) 추가</button>
      </div>
    </div>
  )
}
