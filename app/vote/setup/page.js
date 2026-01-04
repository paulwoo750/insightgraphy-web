'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function VoteSetup() {
  const [members, setMembers] = useState([]) // 전체 학회원
  const [selectedMembers, setSelectedMembers] = useState([]) // 선택된 발표자
  const [week, setWeek] = useState(1)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  // 1. 학회원 명부 및 본인 정보 불러오기
  useEffect(() => {
    const fetchMembers = async () => {
      setLoading(true)
      // profiles 테이블에서 모든 학회원 정보를 가져옴
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('name', { ascending: true })

      if (error) {
        console.error("명단 로드 에러:", error.message)
      } else {
        setMembers(data || [])
      }
      setLoading(false)
    }
    fetchMembers()
  }, [])

  const toggleMember = (member) => {
    if (selectedMembers.find(m => m.id === member.id)) {
      setSelectedMembers(selectedMembers.filter(m => m.id !== member.id))
    } else {
      setSelectedMembers([...selectedMembers, { ...member, topic: '' }])
    }
  }

  const handleSave = async () => {
    if (selectedMembers.length === 0) return alert("발표자를 한 명 이상 선택해줘! 👤")

    const insertData = selectedMembers.map(m => ({
      presenter_name: m.name,
      topic: m.topic || '오늘의 주제',
      week: week
    }))

    const { error } = await supabase.from('presentations').insert(insertData)
    if (!error) {
      alert("오늘의 발표자 명단 등록 완료! 📋")
      router.push('/vote')
    } else {
      alert("등록 실패: " + error.message)
    }
  }

  return (
    <div className="p-8 bg-slate-50 min-h-screen text-slate-900 font-sans">
      <div className="max-w-2xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-black text-slate-900">발표 세팅하기 🛠️</h1>
          <Link href="/vote" className="text-sm font-bold text-blue-600 hover:underline">← 돌아가기</Link>
        </header>
        
        {/* 1. 주차 선택 */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 mb-6">
          <label className="block text-sm font-black text-slate-900 mb-4 uppercase tracking-widest">1. 발표 주차 선택</label>
          <input 
            type="number" 
            value={week} 
            onChange={(e)=>setWeek(e.target.value)} 
            className="border-2 border-slate-100 p-4 rounded-2xl w-full text-lg font-bold focus:border-blue-500 outline-none transition-all" 
          />
        </div>

        {/* 2. 학회원 명단 체크 */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 mb-8">
          <label className="block text-sm font-black text-slate-900 mb-4 uppercase tracking-widest">2. 발표자 체크 (학회원 명단)</label>
          
          {loading ? (
            <div className="text-center py-10 font-bold text-slate-400">명단을 불러오는 중... 🔄</div>
          ) : members.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {members.map(m => (
                <button 
                  key={m.id} 
                  onClick={() => toggleMember(m)}
                  className={`p-4 rounded-2xl border-2 transition-all font-black text-sm ${
                    selectedMembers.find(sm => sm.id === m.id) 
                    ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-100' 
                    : 'border-slate-100 bg-slate-50 text-slate-900 hover:border-slate-300'
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
              <p className="text-slate-900 font-bold mb-2">등록된 학회원이 없어! 🧐</p>
              <p className="text-xs text-slate-400 font-medium">Supabase profiles 테이블에 데이터가 있는지 확인해봐.</p>
            </div>
          )}
        </div>

        {/* 3. 발표 주제 입력 */}
        {selectedMembers.length > 0 && (
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 mb-8 animate-in fade-in slide-in-from-bottom-4">
            <label className="block text-sm font-black text-slate-900 mb-4 uppercase tracking-widest">3. 발표 주제 입력</label>
            <div className="space-y-4">
              {selectedMembers.map((m, idx) => (
                <div key={m.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-xs font-black text-blue-600 uppercase mb-2 block">{m.name} 님의 발표 주제</span>
                  <input 
                    type="text" 
                    placeholder="예: AI 서비스 기획안 발표"
                    className="w-full bg-white border-2 border-white p-3 rounded-xl font-bold text-slate-900 focus:border-blue-500 outline-none transition-all"
                    onChange={(e) => {
                      const newMembers = [...selectedMembers];
                      newMembers[idx].topic = e.target.value;
                      setSelectedMembers(newMembers);
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 확정 버튼 */}
        <button 
          onClick={handleSave} 
          className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black text-lg shadow-2xl shadow-slate-200 active:scale-95 transition-all sticky bottom-8"
        >
          명단 확정하고 투표 시작하기 🚀
        </button>
      </div>
    </div>
  )
}