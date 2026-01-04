'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function VoteSetup() {
  const [members, setMembers] = useState([]) // 전체 학회원
  const [selectedMembers, setSelectedMembers] = useState([]) // 선택된 발표자
  const [week, setWeek] = useState(1)
  const [topic, setTopic] = useState('') // 통합 주제 상태 추가
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const fetchMembers = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('name', { ascending: true })

      if (error) console.error("명단 로드 에러:", error.message)
      else setMembers(data || [])
      setLoading(false)
    }
    fetchMembers()
  }, [])

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

    const confirmSave = confirm(`해당 주차(${week}주차)의 기존 명단은 삭제되고 새 명단으로 교체돼. 계속할까?`)
    if (!confirmSave) return

    // 1. 해당 주차의 기존 발표자 명단 삭제 (초기화)
    const { error: deleteError } = await supabase
      .from('presentations')
      .delete()
      .eq('week', week)

    if (deleteError) {
      return alert("기존 명단 초기화 실패: " + deleteError.message)
    }

    // 2. 선택한 발표자들 새로운 데이터로 삽입 (통합 주제 적용)
    const insertData = selectedMembers.map(m => ({
      presenter_name: m.name,
      topic: topic, // 입력한 하나의 주제를 모두에게 적용
      week: week
    }))

    const { error: insertError } = await supabase.from('presentations').insert(insertData)
    
    if (!insertError) {
      alert(`${week}주차 발표 명단 업데이트 완료! 🚀`)
      router.push('/vote')
    } else {
      alert("등록 실패: " + insertError.message)
    }
  }

  return (
    <div className="p-8 bg-slate-50 min-h-screen text-slate-900 font-sans">
      <div className="max-w-2xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-black text-slate-900 italic tracking-tighter">VOTE SETUP ⚙️</h1>
          <Link href="/vote" className="text-xs font-black text-slate-400 hover:text-blue-600 uppercase tracking-widest transition-all">← Back</Link>
        </header>
        
        {/* 1. 주차 및 주제 입력 */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 mb-8 space-y-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-[10px] font-black text-slate-300 mb-2 uppercase tracking-widest ml-1">Step 1. Week</label>
              <input type="number" value={week} onChange={(e)=>setWeek(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-50 p-4 rounded-2xl font-bold text-lg focus:border-blue-500 outline-none transition-all" />
            </div>
            <div className="flex-[2]">
              <label className="block text-[10px] font-black text-slate-300 mb-2 uppercase tracking-widest ml-1">Step 2. Common Topic</label>
              <input type="text" placeholder="오늘의 공통 주제 입력" value={topic} onChange={(e)=>setTopic(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-50 p-4 rounded-2xl font-bold focus:border-blue-500 outline-none transition-all" />
            </div>
          </div>
        </div>

        {/* 2. 학회원 선택 */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 mb-8">
          <label className="block text-[10px] font-black text-slate-300 mb-4 uppercase tracking-widest ml-1">Step 3. Select Presenters</label>
          
          {loading ? (
            <div className="text-center py-10 font-bold text-slate-200 italic">Loading Members... 🔄</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {members.map(m => (
                <button 
                  key={m.id} 
                  onClick={() => toggleMember(m)}
                  className={`p-4 rounded-2xl border-2 transition-all font-black text-sm ${
                    selectedMembers.find(sm => sm.id === m.id) 
                    ? 'border-blue-600 bg-blue-600 text-white shadow-xl shadow-blue-100 scale-105' 
                    : 'border-slate-50 bg-slate-50 text-slate-400 hover:border-slate-200'
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 3. 선택된 인원 요약 */}
        {selectedMembers.length > 0 && (
          <div className="mb-8 px-4 py-2 bg-blue-50 rounded-2xl border border-blue-100">
            <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">
              Selected: <span className="text-blue-700">{selectedMembers.map(m => m.name).join(', ')}</span>
            </p>
          </div>
        )}

        <button onClick={handleSave} className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black text-lg shadow-2xl shadow-slate-200 active:scale-95 transition-all sticky bottom-8">
          오늘의 발표 시작하기 🏁
        </button>
      </div>
    </div>
  )
}