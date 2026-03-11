'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function AboutManager() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 1. 비전 섹션
  const [vision, setVision] = useState({
    subtitle: "Precision in Vision,\nValue in Insight.",
    desc: "InsightGraphy는 2012년 설립된...\n\n현대 사회에서는...\n\n노력의 결실도..."
  })

  // 2. 3대 핵심 가치
  const [coreValues, setCoreValues] = useState([
    { icon: '📄', title: '기획', desc: '매주 시의적인 주제에 대해 창의적으로 문제 정의 및 해결', color: 'border-[#3b82f6]', bg: 'bg-[#2d3e50]' },
    { icon: '📢', title: '발표', desc: '도출한 해결책을 자신만의 컨텐츠로 공유', color: 'border-[#22c55e]', bg: 'bg-[#2d3d33]' },
    { icon: '👯', title: '소통', desc: '피드백을 통해 성숙한 기획자 및 프레젠터로 성장', color: 'border-[#eab308]', bg: 'bg-[#4d452e]' }
  ])

  // 3. IGD 역량
  const [igdValues, setIgdValues] = useState([
    { icon: '💡', title: 'Insight', desc: '깊은 생각으로 끌어내는 통찰력', bg: 'bg-[#2d3e50]' },
    { icon: '🪜', title: 'Graphic', desc: '효과적인 표현을 위한 시각화 능력', bg: 'bg-[#2d3d33]' },
    { icon: '🗣️', title: 'Delivery', desc: '명확하고 자신 있는 전달력', bg: 'bg-[#4d452e]' }
  ])

  // 4. 환영 문구
  const [welcomeMsg, setWelcomeMsg] = useState("자신의 창의적인 아이디어를 당당하게 말하며 성장할\n스스로를 마주하게 될 IGer들을 환영합니다 🖐️")

  // 5. 알럼나이 리스트
  const [alumni, setAlumni] = useState([])
  
  // Q&A 모달창 상태 관리
  const [editingAlumniIdx, setEditingAlumniIdx] = useState(null)

  useEffect(() => {
    if (!sessionStorage.getItem('isIGAdmin')) router.push('/admin')
    else fetchAboutData()
  }, [])

  const fetchAboutData = async () => {
    setLoading(true)
    
    // 기본 콘텐츠 불러오기
    const { data: content } = await supabase.from('pr_about_content').select('*').eq('id', 'main').single()
    if (content) {
      setVision({ subtitle: content.vision_subtitle, desc: content.vision_desc })
      setWelcomeMsg(content.welcome_msg)
      if (content.core_values?.length > 0) setCoreValues(content.core_values)
      if (content.igd_values?.length > 0) setIgdValues(content.igd_values)
    }

    // 알럼나이 데이터 불러오기
    const { data: alumniData } = await supabase.from('pr_about_alumni').select('*').order('order_num', { ascending: true })
    if (alumniData && alumniData.length > 0) setAlumni(alumniData)

    setLoading(false)
  }

  // --- 알럼나이 카드 핸들러 ---
  const addAlumnus = () => setAlumni([...alumni, { generation: '', name: '', university: '', dept: '', short_quote: '', qna_json: [], order_num: alumni.length + 1 }])
  const removeAlumnus = (index) => { if(confirm('이 선배님의 정보를 삭제할까요?')) setAlumni(alumni.filter((_, i) => i !== index)) }
  
  const handleAlumniChange = (index, field, value) => {
    const newAlumni = [...alumni]
    newAlumni[index][field] = value
    setAlumni(newAlumni)
  }

  // 🌟 순서 변경 로직 (Up/Down, 혹은 Left/Right)
  const moveAlumnus = (index, direction) => {
    const newAlumni = [...alumni]
    if (direction === 'up' && index > 0) {
      // 이전 항목과 자리 바꾸기
      const temp = newAlumni[index]
      newAlumni[index] = newAlumni[index - 1]
      newAlumni[index - 1] = temp
    } else if (direction === 'down' && index < newAlumni.length - 1) {
      // 다음 항목과 자리 바꾸기
      const temp = newAlumni[index]
      newAlumni[index] = newAlumni[index + 1]
      newAlumni[index + 1] = temp
    }
    setAlumni(newAlumni)
  }

  // --- Q&A 모달창 핸들러 ---
  const addQnA = () => {
    const newAlumni = [...alumni]
    if (!newAlumni[editingAlumniIdx].qna_json) newAlumni[editingAlumniIdx].qna_json = []
    newAlumni[editingAlumniIdx].qna_json.push({ question: '', answer: '' })
    setAlumni(newAlumni)
  }
  const removeQnA = (qIdx) => {
    const newAlumni = [...alumni]
    newAlumni[editingAlumniIdx].qna_json = newAlumni[editingAlumniIdx].qna_json.filter((_, i) => i !== qIdx)
    setAlumni(newAlumni)
  }
  const handleQnAChange = (qIdx, field, value) => {
    const newAlumni = [...alumni]
    newAlumni[editingAlumniIdx].qna_json[qIdx][field] = value
    setAlumni(newAlumni)
  }

  // --- 배열 상태 업데이트 핸들러 ---
  const updateArrayItem = (setter, state, index, field, value) => {
    const newState = [...state]
    newState[index][field] = value
    setter(newState)
  }

  // --- 전체 저장 ---
  const handleSaveAll = async () => {
    setSaving(true)

    // 1. Content 저장
    await supabase.from('pr_about_content').upsert({
      id: 'main',
      vision_subtitle: vision.subtitle,
      vision_desc: vision.desc,
      core_values: coreValues,
      igd_values: igdValues,
      welcome_msg: welcomeMsg
    })

    // 2. 알럼나이 저장 (배열 순서대로 order_num 재부여)
    await supabase.from('pr_about_alumni').delete().neq('id', 0)
    if (alumni.length > 0) {
      const insertData = alumni.map((a, i) => ({ 
        generation: a.generation, 
        name: a.name,
        university: a.university,
        dept: a.dept, 
        short_quote: a.short_quote, 
        qna_json: a.qna_json || [],
        order_num: i + 1 // 🌟 화면에 보이는 순서대로 1번부터 새롭게 번호 쾅!
      }))
      await supabase.from('pr_about_alumni').insert(insertData)
    }

    alert('About 페이지 정보와 인터뷰가 모두 저장되었습니다! 🏛️')
    setSaving(false)
  }

  if (loading) return <div className="p-10 text-center font-bold text-slate-400 min-h-screen flex items-center justify-center">데이터 불러오는 중... 🔄</div>

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-12 pb-32 relative">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* 헤더 & 저장 버튼 */}
        <header className="flex justify-between items-end mb-12 border-b border-slate-200 pb-6 sticky top-0 bg-slate-50/90 backdrop-blur-md z-20 pt-4">
          <div>
            <Link href="/admin/hub" className="text-xs font-black text-slate-400 hover:text-[#32a4a1] uppercase tracking-widest mb-2 block transition-colors">← Back to Hub</Link>
            <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-800 flex items-center gap-3">
              <span className="text-4xl">🏛️</span> About Manager
            </h1>
          </div>
          <button onClick={handleSaveAll} disabled={saving} className="bg-[#32a4a1] text-white px-8 py-3 rounded-xl font-black uppercase tracking-widest hover:bg-[#238986] transition-all shadow-lg hover:scale-105">
            {saving ? 'Saving...' : 'Save All 💾'}
          </button>
        </header>

        {/* 1. 비전 관리 */}
        <section className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <h2 className="text-[#32a4a1] font-black uppercase tracking-widest text-sm mb-6">01. Our Vision</h2>
          <div className="space-y-6">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">슬로건 (줄바꿈 허용)</label>
              <textarea rows="2" value={vision.subtitle} onChange={e => setVision({...vision, subtitle: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-2xl text-center outline-none focus:border-[#32a4a1] border border-transparent resize-none leading-tight" placeholder="Precision in Vision..."></textarea>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">상세 설명 (줄바꿈 허용)</label>
              <textarea rows="6" value={vision.desc} onChange={e => setVision({...vision, desc: e.target.value})} className="w-full bg-slate-50 p-5 rounded-xl font-medium text-slate-600 outline-none focus:border-[#32a4a1] border border-transparent resize-y leading-relaxed" placeholder="InsightGraphy는 2012년 설립된..."></textarea>
            </div>
          </div>
        </section>

        {/* 2. 3대 핵심 가치 관리 */}
        <section className="bg-[#111111] p-8 rounded-[2rem] shadow-xl text-white">
          <h2 className="text-slate-500 font-black uppercase tracking-widest text-sm mb-6">02. 3 Core Values</h2>
          <div className="space-y-4">
            {coreValues.map((val, idx) => (
              <div key={idx} className={`${val.bg} p-6 rounded-2xl flex items-center gap-4 ${val.color} border-l-8`}>
                <input type="text" value={val.icon} onChange={e => updateArrayItem(setCoreValues, coreValues, idx, 'icon', e.target.value)} className="w-12 h-12 bg-black/20 text-center text-2xl rounded-xl outline-none" />
                <div className="flex-1 space-y-2">
                  <input type="text" value={val.title} onChange={e => updateArrayItem(setCoreValues, coreValues, idx, 'title', e.target.value)} className="w-full bg-transparent font-black text-xl outline-none" placeholder="타이틀 (기획)" />
                  <input type="text" value={val.desc} onChange={e => updateArrayItem(setCoreValues, coreValues, idx, 'desc', e.target.value)} className="w-full bg-transparent font-medium text-sm opacity-80 outline-none" placeholder="설명 (매주 시의적인 주제에 대해...)" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 3. IGD 역량 관리 */}
        <section className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <h2 className="text-[#32a4a1] font-black uppercase tracking-widest text-sm mb-6">03. IGD Core Competency</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {igdValues.map((igd, idx) => (
              <div key={idx} className={`${igd.bg} p-6 rounded-[2rem] text-white flex flex-col items-center text-center shadow-lg`}>
                <input type="text" value={igd.icon} onChange={e => updateArrayItem(setIgdValues, igdValues, idx, 'icon', e.target.value)} className="w-12 h-12 bg-white/10 text-center text-2xl rounded-xl mb-4 outline-none" />
                <input type="text" value={igd.title} onChange={e => updateArrayItem(setIgdValues, igdValues, idx, 'title', e.target.value)} className="w-full bg-transparent font-black text-xl text-[#a8d0cd] uppercase text-center mb-2 outline-none" placeholder="Insight" />
                <textarea rows="2" value={igd.desc} onChange={e => updateArrayItem(setIgdValues, igdValues, idx, 'desc', e.target.value)} className="w-full bg-transparent font-bold text-sm opacity-90 text-center resize-none outline-none" placeholder="설명문"></textarea>
              </div>
            ))}
          </div>
        </section>

        {/* 🌟 4. 알럼나이 관리 (순서 변경 기능 추가) 🌟 */}
        <section className="bg-slate-50 p-8 rounded-[2rem] border border-slate-200">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-[#32a4a1] font-black uppercase tracking-widest text-sm">04. Alumni Interview</h2>
            <button onClick={addAlumnus} className="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-[10px] font-black hover:bg-[#32a4a1] transition-colors">+ 선배님 추가</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {alumni.map((alum, idx) => (
              <div key={idx} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative group flex flex-col justify-between hover:border-[#32a4a1] transition-colors">
                
                {/* 🌟 순서 변경 및 삭제 컨트롤 패널 */}
                <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white p-1 rounded-lg shadow-sm border border-slate-100">
                  <button onClick={() => moveAlumnus(idx, 'up')} disabled={idx === 0} className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-[#32a4a1] hover:bg-slate-50 rounded disabled:opacity-20 transition-colors">◀</button>
                  <button onClick={() => moveAlumnus(idx, 'down')} disabled={idx === alumni.length - 1} className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-[#32a4a1] hover:bg-slate-50 rounded disabled:opacity-20 transition-colors">▶</button>
                  <div className="w-[1px] h-4 bg-slate-200 mx-1"></div>
                  <button onClick={() => removeAlumnus(idx)} className="w-6 h-6 flex items-center justify-center text-red-300 hover:text-red-500 hover:bg-red-50 rounded font-black text-xs transition-colors">X</button>
                </div>
                
                <div className="space-y-3 mb-4 mt-2">
                  <div className="flex gap-2">
                    <input type="text" value={alum.generation} onChange={e => handleAlumniChange(idx, 'generation', e.target.value)} className="w-14 bg-slate-50 text-[#32a4a1] font-black text-xs p-2 rounded-lg outline-none text-center" placeholder="기수" />
                    <input type="text" value={alum.name} onChange={e => handleAlumniChange(idx, 'name', e.target.value)} className="flex-1 bg-slate-50 text-slate-800 font-black text-xs p-2 rounded-lg outline-none pr-20" placeholder="이름 (예: 홍길동)" />
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={alum.university} onChange={e => handleAlumniChange(idx, 'university', e.target.value)} className="w-24 bg-slate-50 text-slate-500 font-bold text-xs p-2 rounded-lg outline-none" placeholder="대학 (예: 서울대)" />
                    <input type="text" value={alum.dept} onChange={e => handleAlumniChange(idx, 'dept', e.target.value)} className="flex-1 bg-slate-50 text-slate-500 font-bold text-xs p-2 rounded-lg outline-none" placeholder="소속 (예: 산업공학과)" />
                  </div>
                  <textarea rows="2" value={alum.short_quote} onChange={e => handleAlumniChange(idx, 'short_quote', e.target.value)} className="w-full bg-slate-50 font-medium text-xs text-slate-600 p-3 rounded-xl outline-none resize-none" placeholder="인용구 한 줄"></textarea>
                </div>

                <button 
                  onClick={() => setEditingAlumniIdx(idx)}
                  className="w-full bg-[#32a4a1]/10 text-[#32a4a1] py-2 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-[#32a4a1] hover:text-white transition-colors"
                >
                  인터뷰 내용 편집 ✏️ ({(alum.qna_json || []).length}개 문답)
                </button>
              </div>
            ))}
            {alumni.length === 0 && <div className="col-span-full text-center text-xs text-slate-400 py-8 font-bold">등록된 선배님이 없습니다.</div>}
          </div>
        </section>

        {/* 5. 하단 환영 문구 */}
        <section className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <h2 className="text-[#32a4a1] font-black uppercase tracking-widest text-sm mb-6">05. Welcome Message</h2>
          <textarea rows="2" value={welcomeMsg} onChange={e => setWelcomeMsg(e.target.value)} className="w-full bg-slate-50 p-6 rounded-2xl font-black text-xl text-center text-slate-800 outline-none focus:border-[#32a4a1] border border-transparent resize-none leading-relaxed" placeholder="자신의 창의적인 아이디어를..."></textarea>
        </section>

      </div>

      {/* Q&A 편집 모달 (팝업창) */}
      {editingAlumniIdx !== null && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-8">
          <div className="bg-white w-full max-w-4xl h-[90vh] rounded-[3rem] shadow-2xl flex flex-col overflow-hidden border border-slate-200">
            
            <div className="bg-slate-50 px-10 py-6 border-b border-slate-200 flex justify-between items-center shrink-0">
              <div>
                <p className="text-[#32a4a1] font-black text-[10px] uppercase tracking-widest mb-1">Interview Editor</p>
                <h2 className="text-2xl font-black text-slate-800">{alumni[editingAlumniIdx].name || '이름 없음'} 선배님 인터뷰</h2>
              </div>
              <button onClick={() => setEditingAlumniIdx(null)} className="bg-slate-900 text-white px-6 py-2.5 rounded-xl text-sm font-black hover:bg-slate-800 transition-colors">
                완료 및 닫기
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-10 space-y-8 bg-[#f8f9fa]">
              {(alumni[editingAlumniIdx].qna_json || []).map((qna, qIdx) => (
                <div key={qIdx} className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 relative group">
                  <button onClick={() => removeQnA(qIdx)} className="absolute top-6 right-6 text-red-400 hover:text-red-600 font-black text-sm">삭제 X</button>
                  <div className="flex gap-4 mb-6">
                    <span className="text-2xl font-black text-[#32a4a1] opacity-50 mt-1">Q.</span>
                    <textarea rows="2" value={qna.question} onChange={e => handleQnAChange(qIdx, 'question', e.target.value)} className="flex-1 bg-slate-50 p-4 rounded-2xl font-black text-lg outline-none focus:border-[#32a4a1] border border-transparent resize-none" placeholder="질문을 입력하세요."></textarea>
                  </div>
                  <div className="flex gap-4 pl-10">
                    <span className="text-2xl font-black text-slate-300 mt-1">A.</span>
                    <textarea rows="5" value={qna.answer} onChange={e => handleQnAChange(qIdx, 'answer', e.target.value)} className="flex-1 bg-white p-4 rounded-2xl font-medium text-slate-600 outline-none border border-slate-200 focus:border-[#32a4a1] resize-y leading-loose" placeholder="답변을 입력하세요. (줄바꿈 허용)"></textarea>
                  </div>
                </div>
              ))}
              <button onClick={addQnA} className="w-full py-6 border-2 border-dashed border-[#32a4a1]/30 text-[#32a4a1] rounded-[2rem] font-black hover:bg-[#32a4a1]/5 transition-colors">
                + 새로운 질문 & 답변 추가하기
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}