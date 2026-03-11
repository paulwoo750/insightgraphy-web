'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function IntegratedActivitiesManager() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('regular')

  useEffect(() => {
    if (!sessionStorage.getItem('isIGAdmin')) router.push('/admin')
  }, [])

  const tabs = [
    { id: 'regular', name: '정규 세션', icon: '🗣️' },
    { id: 'education', name: '교육 세션', icon: '📚' },
    { id: 'union', name: '연합 세션', icon: '✨' },
    { id: 'corporate', name: '기업 세션', icon: '🤝' }
  ]

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-12 pb-32">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-end mb-12 border-b border-slate-200 pb-6">
          <div>
            <Link href="/admin/hub" className="text-xs font-black text-slate-400 hover:text-[#32a4a1] uppercase tracking-widest mb-2 block transition-colors">← Back to Hub</Link>
            <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-800 flex items-center gap-3">
              <span className="text-4xl">🎯</span> Activities Control Tower
            </h1>
          </div>
        </header>

        <div className="flex flex-col lg:flex-row gap-8">
          <aside className="w-full lg:w-64 shrink-0">
            <div className="bg-white p-4 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-col gap-2 sticky top-8">
              {tabs.map((tab) => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-3 w-full px-5 py-4 rounded-2xl font-black text-sm transition-all ${
                    activeTab === tab.id ? 'bg-slate-900 text-white shadow-lg' : 'bg-transparent text-slate-400 hover:bg-slate-50'
                  }`}>
                  <span className="text-xl">{tab.icon}</span> {tab.name}
                </button>
              ))}
            </div>
          </aside>

          <main className="flex-1 space-y-8">
            {activeTab === 'regular' && <RegularManager />}
            {activeTab === 'education' && <EducationManager />}
            {activeTab === 'union' && <UnionManager />}
            {activeTab === 'corporate' && <CorporateManager />}
          </main>
        </div>
      </div>
    </div>
  )
}

// ==========================================
// 🗣️ 1. 정규 세션 관리자 컴포넌트 (미리보기형 UI + 하드코딩 완벽 제거)
// ==========================================
function RegularManager() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  const [headerData, setHeaderData] = useState({ title: '', desc: '' })
  
  const defaultRoutines = Array.from({length: 7}, (_, i) => ({ order_num: i+1, day: ['월','화','수','목','금','토','일'][i]+'요일', action: '', detail: '', icon: '📌' }))
  const [routines, setRoutines] = useState(defaultRoutines)

  const [rulesData, setRulesData] = useState({
    planDeadline: '', planFiles: '', planNaming: '', planNamingEx: '',
    fbPolicy: '', fbDeadlineDay: '', fbDeadlineTime: '', fbDesc: ''
  })

  // 체크리스트 배열 추가
  const [feedbackData, setFeedbackData] = useState({
    quantDesc: '', quantImgUrl: '', quantList: ['', '', ''],
    qualDesc: '', qualInsight: '', qualGraphic: '', qualDelivery: '', qualList: ['', '', ''],
    selfDesc: '', selfKeep: '', selfProblem: '', selfTry: '', selfList: ['', '', '']
  })
  const [quantImageFile, setQuantImageFile] = useState(null)

  // 푸터(인스타그램) 상태 추가
  const [footerData, setFooterData] = useState({ text: '', link: '' })

  useEffect(() => {
    fetchRegularData()
  }, [])

  const fetchRegularData = async () => {
    setLoading(true)
    const { data: content } = await supabase.from('pr_activities_content').select('*').eq('id', 'regular').single()
    if (content) {
      setHeaderData({ title: content.header_title || '', desc: content.header_desc || '' })
      if (content.rules_json) setRulesData(prev => ({...prev, ...content.rules_json}))
      if (content.feedback_json) {
        setFeedbackData(prev => ({
          ...prev, ...content.feedback_json,
          // DB에 배열이 없으면 기본 빈 배열 3칸 세팅
          quantList: content.feedback_json.quantList || ['', '', ''],
          qualList: content.feedback_json.qualList || ['', '', ''],
          selfList: content.feedback_json.selfList || ['', '', '']
        }))
      }
      if (content.footer_json) setFooterData(prev => ({...prev, ...content.footer_json}))
    }

    const { data: routineData } = await supabase.from('pr_activities_regular_routine').select('*').order('order_num', { ascending: true })
    if (routineData && routineData.length > 0) setRoutines(routineData)
    
    setLoading(false)
  }

  const handleListChange = (type, index, value) => {
    const newList = [...feedbackData[type]]
    newList[index] = value
    setFeedbackData({...feedbackData, [type]: newList})
  }

  const handleSaveContent = async (sectionName) => {
    setSaving(true)
    
    let finalFeedbackData = { ...feedbackData }
    if (sectionName === 'feedback' && quantImageFile) {
      try {
        const ext = quantImageFile.name.split('.').pop()
        const path = `activities/quant_${Date.now()}.${ext}`
        await supabase.storage.from('showcase').upload(path, quantImageFile)
        finalFeedbackData.quantImgUrl = supabase.storage.from('showcase').getPublicUrl(path).data.publicUrl
        setFeedbackData(finalFeedbackData)
      } catch (imgError) {
        alert('이미지 업로드 실패: ' + imgError.message)
        setSaving(false)
        return
      }
    }

    const payload = {
      id: 'regular',
      header_title: headerData.title || 'Regular Session',
      header_desc: headerData.desc || '세션 설명이 없습니다.',
      rules_json: rulesData,
      feedback_json: finalFeedbackData,
      footer_json: footerData // 푸터 데이터 포함
    }

    const { error } = await supabase.from('pr_activities_content').upsert(payload)
    if (!error) alert(`${sectionName} 파트가 성공적으로 저장되었습니다! 💾`)
    else alert('저장 실패: ' + error.message)
    
    setSaving(false)
  }

  const handleSaveRoutines = async () => {
    setSaving(true)
    await supabase.from('pr_activities_regular_routine').delete().neq('id', 0) 
    const insertData = routines.map(r => ({ order_num: r.order_num, day: r.day, action: r.action, detail: r.detail, icon: r.icon }))
    const { error } = await supabase.from('pr_activities_regular_routine').insert(insertData)
    if (!error) alert('일주일 루틴이 저장되었습니다! 📅')
    setSaving(false)
  }

  if (loading) return <div className="p-10 text-center font-bold text-slate-400">데이터 불러오는 중... 🔄</div>

  return (
    <div className="space-y-8">
      
      {/* 파트 1. 헤더 수정 (실제 UI 톤 반영) */}
      <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black text-slate-800">1. 세션 소개 (Header)</h2>
          <button onClick={() => handleSaveContent('header')} className="bg-[#1a1a1a] text-white px-5 py-2 rounded-xl text-xs font-black">Save</button>
        </div>
        <div className="space-y-4 text-center p-8 bg-slate-50 rounded-[2rem]">
          <div className="inline-block bg-[#32a4a1]/10 text-[#32a4a1] px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-2">Activity 01</div>
          <input type="text" value={headerData.title} onChange={e => setHeaderData({...headerData, title: e.target.value})} className="w-full bg-transparent text-center text-3xl font-black outline-none border-b border-slate-200 focus:border-[#32a4a1] pb-2 mb-4" placeholder="메인 제목 (Regular Session)" />
          <textarea rows="3" value={headerData.desc} onChange={e => setHeaderData({...headerData, desc: e.target.value})} className="w-full bg-white p-4 rounded-xl font-medium text-slate-600 outline-none shadow-sm resize-none" placeholder="세션 상세 설명"></textarea>
        </div>
      </div>

      {/* 파트 2. 일주일 루틴 수정 */}
      <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black text-slate-800">2. IGer의 일주일 (Routine)</h2>
          <button onClick={handleSaveRoutines} className="bg-blue-600 text-white px-5 py-2 rounded-xl text-xs font-black">Save</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-50 p-6 rounded-[2rem]">
          {routines.map((routine, idx) => (
            <div key={idx} className={`bg-white p-4 rounded-2xl border-2 transition-all ${routine.day.includes("토") ? "border-[#32a4a1]" : "border-transparent shadow-sm"}`}>
              <div className="flex justify-between items-center mb-2">
                <input type="text" value={routine.icon} onChange={e => {let newR = [...routines]; newR[idx].icon = e.target.value; setRoutines(newR)}} className="w-10 h-10 text-center text-lg bg-slate-50 rounded-lg outline-none" />
                <span className={`text-xs font-black ${routine.day.includes("토") ? "text-[#32a4a1]" : "text-slate-400"}`}>{routine.day}</span>
              </div>
              <input type="text" value={routine.action} onChange={e => {let newR = [...routines]; newR[idx].action = e.target.value; setRoutines(newR)}} className="w-full mb-1 text-sm font-black outline-none border-b border-transparent focus:border-slate-300" placeholder="활동명" />
              <input type="text" value={routine.detail} onChange={e => {let newR = [...routines]; newR[idx].detail = e.target.value; setRoutines(newR)}} className="w-full text-[10px] text-slate-500 font-medium outline-none" placeholder="상세 설명" />
            </div>
          ))}
        </div>
      </div>

      {/* 파트 3. 세부 규정 수정 */}
      <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100 border-l-4 border-l-[#32a4a1]">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black text-slate-800">3. 기획서 & 피드백 규정 (Rules)</h2>
          <button onClick={() => handleSaveContent('rules')} className="bg-[#32a4a1] text-white px-5 py-2 rounded-xl text-xs font-black">Save</button>
        </div>
        {/* 기존 입력칸 유지 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-3 bg-slate-50 p-6 rounded-2xl">
            <h3 className="font-black text-[#32a4a1] mb-2">📝 기획서 업로드 규정</h3>
            <input type="text" value={rulesData.planDeadline} onChange={e => setRulesData({...rulesData, planDeadline: e.target.value})} placeholder="마감 기한 (예: 매주 수요일 23:59)" className="w-full p-3 rounded-xl text-sm" />
            <input type="text" value={rulesData.planFiles} onChange={e => setRulesData({...rulesData, planFiles: e.target.value})} placeholder="필수 파일 (예: .docx 및 캡처본)" className="w-full p-3 rounded-xl text-sm" />
            <input type="text" value={rulesData.planNaming} onChange={e => setRulesData({...rulesData, planNaming: e.target.value})} placeholder="파일명 양식 (예: [연도_학기_주차_이름])" className="w-full p-3 rounded-xl text-sm" />
            <input type="text" value={rulesData.planNamingEx} onChange={e => setRulesData({...rulesData, planNamingEx: e.target.value})} placeholder="파일명 예시" className="w-full p-3 rounded-xl text-xs text-slate-500" />
          </div>
          <div className="space-y-3 bg-slate-50 p-6 rounded-2xl">
            <h3 className="font-black text-slate-800 mb-2">💬 피드백 규정</h3>
            <input type="text" value={rulesData.fbDeadlineDay} onChange={e => setRulesData({...rulesData, fbDeadlineDay: e.target.value})} placeholder="마감 요일 (예: 매주 목요일)" className="w-full p-3 rounded-xl text-sm" />
            <input type="text" value={rulesData.fbDeadlineTime} onChange={e => setRulesData({...rulesData, fbDeadlineTime: e.target.value})} placeholder="마감 시간 (예: 23:59 PM)" className="w-full p-3 rounded-xl text-sm" />
            <input type="text" value={rulesData.fbPolicy} onChange={e => setRulesData({...rulesData, fbPolicy: e.target.value})} placeholder="정책 (예: 조원 기획서 댓글 피드백)" className="w-full p-3 rounded-xl text-sm" />
            <textarea value={rulesData.fbDesc} onChange={e => setRulesData({...rulesData, fbDesc: e.target.value})} placeholder="피드백 지향점 설명" className="w-full p-3 rounded-xl text-xs text-slate-500 resize-none"></textarea>
          </div>
        </div>
      </div>

      {/* 파트 4. 3-Way 피드백 시스템 수정 (미리보기 UI 적용) */}
      <div className="bg-[#1a1a1a] text-white p-8 rounded-[3rem] shadow-xl">
        <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-6">
          <h2 className="text-xl font-black text-[#a8d0cd]">4. 3-Way Feedback System</h2>
          <button onClick={() => handleSaveContent('feedback')} className="bg-white text-black px-5 py-2 rounded-xl text-xs font-black hover:bg-[#a8d0cd]">Save</button>
        </div>
        
        <div className="space-y-12">
          {/* 정량 */}
          <div>
            <span className="text-[#32a4a1] font-black tracking-[0.3em] uppercase text-xs mb-2 block">01. Quantitative</span>
            <textarea value={feedbackData.quantDesc} onChange={e => setFeedbackData({...feedbackData, quantDesc: e.target.value})} className="w-full bg-white/5 p-4 rounded-xl text-sm text-slate-300 mb-4 outline-none border border-transparent focus:border-[#32a4a1]" placeholder="정량 피드백 설명 본문"></textarea>
            <div className="bg-white/5 p-4 rounded-xl mb-4">
              <p className="text-xs font-black text-slate-400 mb-2">체크리스트 수정</p>
              {[0, 1, 2].map(i => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <span className="text-[#32a4a1]">✓</span>
                  <input type="text" value={feedbackData.quantList[i]} onChange={e => handleListChange('quantList', i, e.target.value)} className="bg-transparent border-b border-white/20 text-sm outline-none w-full focus:border-[#32a4a1]" placeholder={`항목 ${i+1}`} />
                </div>
              ))}
            </div>
            <div className="flex gap-4 items-center bg-white/5 p-4 rounded-xl">
              <span className="text-xs font-black text-slate-400">대표 이미지</span>
              <input type="file" accept="image/*" onChange={e => setQuantImageFile(e.target.files[0])} className="text-xs text-slate-400 file:rounded-full file:border-0 file:bg-white/10 file:text-white file:px-4 file:py-2" />
              {feedbackData.quantImgUrl && <span className="text-xs text-green-400 font-bold">✓ 업로드 완료</span>}
            </div>
          </div>

          {/* 정성 */}
          <div className="pt-8 border-t border-white/10">
            <span className="text-[#32a4a1] font-black tracking-[0.3em] uppercase text-xs mb-2 block">02. Qualitative</span>
            <textarea value={feedbackData.qualDesc} onChange={e => setFeedbackData({...feedbackData, qualDesc: e.target.value})} className="w-full bg-white/5 p-4 rounded-xl text-sm text-slate-300 mb-4 outline-none border border-transparent focus:border-[#32a4a1]" placeholder="정성 피드백 설명 본문"></textarea>
            <div className="bg-white/5 p-4 rounded-xl mb-6">
              <p className="text-xs font-black text-slate-400 mb-2">체크리스트 수정</p>
              {[0, 1, 2].map(i => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <span className="text-[#32a4a1]">✓</span>
                  <input type="text" value={feedbackData.qualList[i]} onChange={e => handleListChange('qualList', i, e.target.value)} className="bg-transparent border-b border-white/20 text-sm outline-none w-full focus:border-[#32a4a1]" placeholder={`항목 ${i+1}`} />
                </div>
              ))}
            </div>
            <p className="text-xs font-black text-slate-400 mb-3">화면 예시 코멘트 수정 (미리보기형)</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-[#f8f9fa] p-6 rounded-2xl">
              <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-[#32a4a1]">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Insight</p>
                <textarea value={feedbackData.qualInsight} onChange={e => setFeedbackData({...feedbackData, qualInsight: e.target.value})} className="w-full bg-transparent text-sm font-bold text-black outline-none resize-none" rows="3" placeholder="Insight 예시문"></textarea>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-[#1a1a1a]">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Graphic</p>
                <textarea value={feedbackData.qualGraphic} onChange={e => setFeedbackData({...feedbackData, qualGraphic: e.target.value})} className="w-full bg-transparent text-sm font-bold text-black outline-none resize-none" rows="3" placeholder="Graphic 예시문"></textarea>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-[#a8d0cd]">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Delivery</p>
                <textarea value={feedbackData.qualDelivery} onChange={e => setFeedbackData({...feedbackData, qualDelivery: e.target.value})} className="w-full bg-transparent text-sm font-bold text-black outline-none resize-none" rows="3" placeholder="Delivery 예시문"></textarea>
              </div>
            </div>
          </div>

          {/* 셀프 */}
          <div className="pt-8 border-t border-white/10">
            <span className="text-[#32a4a1] font-black tracking-[0.3em] uppercase text-xs mb-2 block">03. Self Feedback</span>
            <textarea value={feedbackData.selfDesc} onChange={e => setFeedbackData({...feedbackData, selfDesc: e.target.value})} className="w-full bg-white/5 p-4 rounded-xl text-sm text-slate-300 mb-4 outline-none border border-transparent focus:border-[#32a4a1]" placeholder="셀프 피드백 설명 본문"></textarea>
            <div className="bg-white/5 p-4 rounded-xl mb-6">
              <p className="text-xs font-black text-slate-400 mb-2">체크리스트 수정</p>
              {[0, 1, 2].map(i => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <span className="text-[#32a4a1]">✓</span>
                  <input type="text" value={feedbackData.selfList[i]} onChange={e => handleListChange('selfList', i, e.target.value)} className="bg-transparent border-b border-white/20 text-sm outline-none w-full focus:border-[#32a4a1]" placeholder={`항목 ${i+1}`} />
                </div>
              ))}
            </div>
            <p className="text-xs font-black text-slate-400 mb-3">KPT 회고 예시문 수정 (미리보기형)</p>
            <div className="bg-[#f8f9fa] p-6 rounded-2xl space-y-3">
              <div className="bg-slate-50 p-3 rounded-xl border-l-4 border-blue-400 flex flex-col">
                <span className="text-xs font-black text-slate-500 mb-1">잘한 점 (Keep)</span>
                <input type="text" value={feedbackData.selfKeep} onChange={e => setFeedbackData({...feedbackData, selfKeep: e.target.value})} className="w-full bg-transparent text-sm font-bold text-black outline-none" placeholder="Keep 예시" />
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border-l-4 border-red-400 flex flex-col">
                <span className="text-xs font-black text-slate-500 mb-1">아쉬운 점 (Problem)</span>
                <input type="text" value={feedbackData.selfProblem} onChange={e => setFeedbackData({...feedbackData, selfProblem: e.target.value})} className="w-full bg-transparent text-sm font-bold text-black outline-none" placeholder="Problem 예시" />
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border-l-4 border-green-400 flex flex-col">
                <span className="text-xs font-black text-slate-500 mb-1">개선 계획 (Try)</span>
                <input type="text" value={feedbackData.selfTry} onChange={e => setFeedbackData({...feedbackData, selfTry: e.target.value})} className="w-full bg-transparent text-sm font-bold text-black outline-none" placeholder="Try 예시" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 파트 5. 하단 안내 (Footer) 추가 */}
      <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black text-slate-800">5. 하단 안내 & 링크 (Footer)</h2>
          <button onClick={() => handleSaveContent('footer')} className="bg-[#1a1a1a] text-white px-5 py-2 rounded-xl text-xs font-black">Save</button>
        </div>
        <div className="space-y-4 bg-slate-50 p-6 rounded-2xl">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">안내 문구</label>
            <input type="text" value={footerData.text} onChange={e => setFooterData({...footerData, text: e.target.value})} className="w-full p-3 rounded-xl text-sm font-bold outline-none" placeholder="예: 발표 주제 예시는 인스타그램에서 확인하세요." />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block">버튼 이동 링크 (URL)</label>
            <input type="text" value={footerData.link} onChange={e => setFooterData({...footerData, link: e.target.value})} className="w-full p-3 rounded-xl text-sm text-blue-500 outline-none" placeholder="https://instagram.com/..." />
          </div>
        </div>
      </div>

    </div>
  )
}

// 나머지 뼈대들
// ==========================================
// 📚 2. 교육 세션 관리자 컴포넌트 (실제 작동 코드)
// ==========================================
function EducationManager() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 1. 헤더 데이터
  const [headerData, setHeaderData] = useState({ title: '', desc: '' })
  
  // 2. 커리큘럼 데이터 (Basic / Advanced)
  const defaultCurriculum = {
    insight_basic: { title: '', items: [] }, insight_advanced: { title: '', items: [] },
    graphic_basic: { title: '', items: [] }, graphic_advanced: { title: '', items: [] },
    delivery_basic: { title: '', items: [] }, delivery_advanced: { title: '', items: [] }
  }
  const [curriculum, setCurriculum] = useState(defaultCurriculum)

  // 3. 특강 강사 데이터
  const [speakers, setSpeakers] = useState([])

  // 4. 시스템 안내 데이터
  const [systemData, setSystemData] = useState({ mentoring_desc: '', alumni_desc: '' })

  useEffect(() => {
    fetchEducationData()
  }, [])

  const fetchEducationData = async () => {
    setLoading(true)
    
    // 1) 헤더 및 시스템 안내 (pr_activities_content)
    const { data: content } = await supabase.from('pr_activities_content').select('*').eq('id', 'education').single()
    if (content) {
      setHeaderData({ title: content.header_title || '', desc: content.header_desc || '' })
      if (content.rules_json) setSystemData(content.rules_json) // 시스템 안내를 rules_json에 저장
    }

    // 2) 커리큘럼 (pr_activities_edu_curriculum)
    const { data: curData } = await supabase.from('pr_activities_edu_curriculum').select('*')
    if (curData && curData.length > 0) {
      let curObj = { ...defaultCurriculum }
      curData.forEach(item => {
        const key = `${item.category}_${item.course_type}`
        curObj[key] = { title: item.title, items: item.items }
      })
      setCurriculum(curObj)
    }

    // 3) 특강 강사 (pr_activities_edu_speakers - 아직 테이블이 없다면 자동 무시됨)
    // *주의: speakers 관리는 JSON 주머니(feedback_json)를 활용해서 간편하게 처리
    if (content && content.feedback_json && content.feedback_json.speakers) {
      setSpeakers(content.feedback_json.speakers)
    }

    setLoading(false)
  }

  // --- 커리큘럼 핸들러 ---
  const handleCurriculumChange = (category, type, field, value) => {
    const key = `${category}_${type}`
    setCurriculum({ ...curriculum, [key]: { ...curriculum[key], [field]: value } })
  }

  const handleCurItemChange = (category, type, index, value) => {
    const key = `${category}_${type}`
    const newItems = [...curriculum[key].items]
    newItems[index] = value
    setCurriculum({ ...curriculum, [key]: { ...curriculum[key], items: newItems } })
  }

  const addCurItem = (category, type) => {
    const key = `${category}_${type}`
    setCurriculum({ ...curriculum, [key]: { ...curriculum[key], items: [...curriculum[key].items, ''] } })
  }

  const removeCurItem = (category, type, index) => {
    const key = `${category}_${type}`
    const newItems = curriculum[key].items.filter((_, i) => i !== index)
    setCurriculum({ ...curriculum, [key]: { ...curriculum[key], items: newItems } })
  }

  // --- 스피커 핸들러 ---
  const addSpeaker = () => setSpeakers([...speakers, { name: '', desc: '' }])
  const removeSpeaker = (index) => setSpeakers(speakers.filter((_, i) => i !== index))
  const handleSpeakerChange = (index, field, value) => {
    const newSpeakers = [...speakers]
    newSpeakers[index][field] = value
    setSpeakers(newSpeakers)
  }

  // --- 전체 저장 로직 ---
  const handleSaveAll = async () => {
    setSaving(true)

    // 1) 헤더, 시스템안내, 스피커 저장 (하나의 row 덮어쓰기)
    const contentPayload = {
      id: 'education',
      header_title: headerData.title || 'Education Session',
      header_desc: headerData.desc,
      rules_json: systemData,          // 멘토링/알럼나이 설명
      feedback_json: { speakers }      // 스피커 배열
    }
    const { error: err1 } = await supabase.from('pr_activities_content').upsert(contentPayload)

    // 2) 커리큘럼 데이터 정리 및 저장 (기존 데이터 삭제 후 새로 삽입)
    await supabase.from('pr_activities_edu_curriculum').delete().neq('id', 0)
    let curInsertData = []
    const categories = ['insight', 'graphic', 'delivery']
    const types = ['basic', 'advanced']
    
    categories.forEach(cat => {
      types.forEach(typ => {
        const key = `${cat}_${typ}`
        if (curriculum[key].title) {
          curInsertData.push({ category: cat, course_type: typ, title: curriculum[key].title, items: curriculum[key].items.filter(i => i.trim() !== '') })
        }
      })
    })
    
    if (curInsertData.length > 0) {
      await supabase.from('pr_activities_edu_curriculum').insert(curInsertData)
    }

    if (!err1) alert('교육 세션의 모든 정보가 저장되었습니다! 💾')
    setSaving(false)
  }

  if (loading) return <div className="p-10 text-center font-bold text-slate-400">데이터 불러오는 중... 🔄</div>

  return (
    <div className="space-y-8">
      {/* 1. 상단 컨트롤 바 */}
      <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex justify-between items-center sticky top-24 z-10">
        <div>
          <h2 className="text-xl font-black text-slate-800">📚 교육 세션 전체 관리</h2>
          <p className="text-xs font-bold text-slate-400 mt-1">수정 후 반드시 우측의 Save All 버튼을 눌러주세요.</p>
        </div>
        <button onClick={handleSaveAll} disabled={saving} className="bg-[#32a4a1] text-white px-8 py-3 rounded-xl font-black uppercase hover:bg-[#238986] transition-all shadow-lg hover:scale-105">
          {saving ? 'Saving...' : 'Save All 💾'}
        </button>
      </div>

      {/* 2. 헤더 소개 */}
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
        <h3 className="font-black text-[#32a4a1] mb-4 uppercase text-sm tracking-widest">01. Header Description</h3>
        <div className="space-y-4">
          <input type="text" value={headerData.title} onChange={e => setHeaderData({...headerData, title: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-2xl outline-none focus:border-[#32a4a1] border border-transparent" placeholder="제목 (Education Session)" />
          <textarea rows="3" value={headerData.desc} onChange={e => setHeaderData({...headerData, desc: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-medium text-slate-600 outline-none focus:border-[#32a4a1] border border-transparent resize-none" placeholder="세션 상세 설명"></textarea>
        </div>
      </div>

      {/* 3. 3대 커리큘럼 에디터 */}
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
        <h3 className="font-black text-[#32a4a1] mb-6 uppercase text-sm tracking-widest">02. IGD Curriculum</h3>
        
        {['insight', 'graphic', 'delivery'].map(category => (
          <div key={category} className="mb-8 pb-8 border-b border-slate-100 last:border-0 last:mb-0 last:pb-0">
            <h4 className="text-xl font-black uppercase mb-4 flex items-center gap-2">
              {category === 'insight' ? '💡' : category === 'graphic' ? '🎨' : '🎤'} {category}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Basic / Advanced 렌더링 */}
              {['basic', 'advanced'].map(type => (
                <div key={type} className={`p-6 rounded-2xl ${type === 'basic' ? 'bg-slate-50' : 'bg-slate-50 border-t-4 border-[#32a4a1]'}`}>
                  <p className="text-[#32a4a1] font-black text-[10px] uppercase tracking-widest mb-2">{type} Course</p>
                  <input type="text" value={curriculum[`${category}_${type}`].title} onChange={e => handleCurriculumChange(category, type, 'title', e.target.value)} className="w-full bg-transparent text-lg font-black outline-none border-b border-slate-200 focus:border-[#32a4a1] pb-1 mb-4" placeholder="과정 제목 (예: 기획의 원칙)" />
                  
                  {/* 동적 리스트 렌더링 */}
                  <div className="space-y-2">
                    {curriculum[`${category}_${type}`].items.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-slate-400 text-xs">•</span>
                        <input type="text" value={item} onChange={e => handleCurItemChange(category, type, idx, e.target.value)} className="flex-1 bg-white p-2 rounded-lg text-sm outline-none border border-slate-200 focus:border-[#32a4a1]" placeholder="세부 내용" />
                        <button onClick={() => removeCurItem(category, type, idx)} className="text-red-400 hover:text-red-600 text-xs font-black px-2">X</button>
                      </div>
                    ))}
                    <button onClick={() => addCurItem(category, type)} className="w-full py-2 border-2 border-dashed border-slate-200 text-slate-400 rounded-lg text-xs font-black hover:border-[#32a4a1] hover:text-[#32a4a1] transition-colors">+ 항목 추가</button>
                  </div>
                </div>
              ))}
              
            </div>
          </div>
        ))}
      </div>

      {/* 4. 전문가 특강 & 시스템 안내 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* 특강 관리 */}
        <div className="bg-[#1a1a1a] text-white p-8 rounded-[2rem] shadow-xl">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-black text-[#a8d0cd] uppercase text-sm tracking-widest">03. Guest Speakers</h3>
            <button onClick={addSpeaker} className="bg-white/10 px-3 py-1 rounded-lg text-xs font-black hover:bg-white/20 transition-all">+ 강사 추가</button>
          </div>
          <div className="space-y-4">
            {speakers.map((speaker, idx) => (
              <div key={idx} className="bg-white/5 p-4 rounded-xl border border-white/10 relative">
                <button onClick={() => removeSpeaker(idx)} className="absolute top-4 right-4 text-red-400 hover:text-red-600 text-xs font-black">X</button>
                <p className="text-[#32a4a1] font-black text-[10px] mb-2">Speaker {String(idx + 1).padStart(2, '0')}</p>
                <input type="text" value={speaker.name} onChange={e => handleSpeakerChange(idx, 'name', e.target.value)} className="w-full bg-transparent text-lg font-black outline-none border-b border-white/20 focus:border-[#32a4a1] pb-1 mb-2" placeholder="이름 및 소속" />
                <input type="text" value={speaker.desc} onChange={e => handleSpeakerChange(idx, 'desc', e.target.value)} className="w-full bg-transparent text-xs font-medium opacity-70 outline-none" placeholder="특강 주제" />
              </div>
            ))}
            {speakers.length === 0 && <p className="text-center text-xs text-white/50 py-4">등록된 강사가 없습니다.</p>}
          </div>
        </div>

        {/* 시스템 안내 관리 */}
        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
          <h3 className="font-black text-[#32a4a1] mb-6 uppercase text-sm tracking-widest">04. Systems</h3>
          <div className="space-y-6">
            <div className="bg-slate-50 p-6 rounded-2xl">
              <h4 className="font-black text-slate-800 mb-2">1:1 맞춤형 멘토링</h4>
              <textarea rows="3" value={systemData.mentoring_desc} onChange={e => setSystemData({...systemData, mentoring_desc: e.target.value})} className="w-full bg-white p-3 rounded-xl text-sm font-medium outline-none resize-none border border-slate-200 focus:border-[#32a4a1]" placeholder="멘토링 설명"></textarea>
            </div>
            <div className="bg-slate-50 p-6 rounded-2xl">
              <h4 className="font-black text-slate-800 mb-2">알럼나이 피드백</h4>
              <textarea rows="3" value={systemData.alumni_desc} onChange={e => setSystemData({...systemData, alumni_desc: e.target.value})} className="w-full bg-white p-3 rounded-xl text-sm font-medium outline-none resize-none border border-slate-200 focus:border-[#32a4a1]" placeholder="알럼나이 피드백 설명"></textarea>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}


// ==========================================
// ✨ 3. 연합 세션 관리자 컴포넌트 (갤러리 관리 추가 완결판)
// ==========================================
function UnionManager() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 1. 헤더 데이터
  const [headerData, setHeaderData] = useState({ title: '', desc: '' })
  
  // 2. 프로젝트 리스트 데이터
  const [projects, setProjects] = useState([])
  
  // 3. 갤러리 데이터 (Activity Sketch)
  const [galleryUrls, setGalleryUrls] = useState([])

  useEffect(() => {
    fetchUnionData()
  }, [])

  const fetchUnionData = async () => {
    setLoading(true)
    
    // 헤더 & 갤러리 불러오기
    const { data: content } = await supabase.from('pr_activities_content').select('*').eq('id', 'union').single()
    if (content) {
      setHeaderData({ title: content.header_title || '', desc: content.header_desc || '' })
      if (content.rules_json && content.rules_json.gallery) {
        setGalleryUrls(content.rules_json.gallery)
      }
    }

    // 프로젝트 목록 불러오기
    const { data: projectData } = await supabase.from('pr_activities_union_projects').select('*').order('order_num', { ascending: true })
    if (projectData && projectData.length > 0) {
      setProjects(projectData)
    } else {
      setProjects([{ semester: '2025 Autumn Semester', title: '', description: '', sub_items: [], image_url: '', theme: 'light', order_num: 1 }])
    }
    
    setLoading(false)
  }

  // --- 프로젝트 핸들러 ---
  const addProject = () => setProjects([{ semester: '', title: '', description: '', sub_items: [], image_url: '', theme: 'light', order_num: projects.length + 1 }, ...projects])
  const removeProject = (index) => { if (confirm('이 프로젝트를 삭제할까요?')) setProjects(projects.filter((_, i) => i !== index)) }
  const handleProjectChange = (index, field, value) => {
    const newProjects = [...projects]; newProjects[index][field] = value; setProjects(newProjects);
  }

  const handleSubItemChange = (projIndex, itemIndex, field, value) => {
    const newProjects = [...projects]
    if (!newProjects[projIndex].sub_items[itemIndex]) newProjects[projIndex].sub_items[itemIndex] = '{"t":"","d":""}'
    try {
      let itemObj = typeof newProjects[projIndex].sub_items[itemIndex] === 'string' ? JSON.parse(newProjects[projIndex].sub_items[itemIndex]) : newProjects[projIndex].sub_items[itemIndex]
      itemObj[field] = value
      newProjects[projIndex].sub_items[itemIndex] = JSON.stringify(itemObj)
      setProjects(newProjects)
    } catch(e) {}
  }
  const addSubItem = (projIndex) => { const newProjects = [...projects]; newProjects[projIndex].sub_items.push('{"t":"","d":""}'); setProjects(newProjects); }
  const removeSubItem = (projIndex, itemIndex) => { const newProjects = [...projects]; newProjects[projIndex].sub_items = newProjects[projIndex].sub_items.filter((_, i) => i !== itemIndex); setProjects(newProjects); }

  const handleProjectImageUpload = async (projIndex, file) => {
    if (!file) return
    setSaving(true)
    const ext = file.name.split('.').pop()
    const path = `activities/union_${Date.now()}.${ext}`
    await supabase.storage.from('showcase').upload(path, file)
    const publicUrl = supabase.storage.from('showcase').getPublicUrl(path).data.publicUrl
    const newProjects = [...projects]; newProjects[projIndex].image_url = publicUrl; setProjects(newProjects);
    setSaving(false)
  }

  // --- 📸 갤러리 다중 업로드 및 삭제 핸들러 ---
  const handleGalleryUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return
    setSaving(true)
    
    let newUrls = [...galleryUrls]
    // 여러 장을 순서대로 업로드
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `activities/gallery_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`
      await supabase.storage.from('showcase').upload(path, file)
      const publicUrl = supabase.storage.from('showcase').getPublicUrl(path).data.publicUrl
      newUrls.push(publicUrl)
    }
    
    setGalleryUrls(newUrls)
    setSaving(false)
  }

  const removeGalleryImage = (index) => {
    setGalleryUrls(galleryUrls.filter((_, i) => i !== index))
  }

  // --- 전체 저장 ---
  const handleSaveAll = async () => {
    setSaving(true)
    await supabase.from('pr_activities_content').upsert({
      id: 'union',
      header_title: headerData.title || 'Union Session',
      header_desc: headerData.desc,
      rules_json: { gallery: galleryUrls } // 갤러리 배열 저장
    })

    await supabase.from('pr_activities_union_projects').delete().neq('id', 0)
    if (projects.length > 0) {
      const insertData = projects.map((p, i) => ({ semester: p.semester, title: p.title, description: p.description, sub_items: p.sub_items, image_url: p.image_url, theme: p.theme, order_num: i + 1 }))
      await supabase.from('pr_activities_union_projects').insert(insertData)
    }
    alert('연합 세션 정보가 모두 저장되었습니다! ✨')
    setSaving(false)
  }

  if (loading) return <div className="p-10 text-center font-bold text-slate-400">데이터 불러오는 중... 🔄</div>

  return (
    <div className="space-y-8">
      {/* 1. 상단 컨트롤 바 */}
      <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex justify-between items-center sticky top-24 z-10">
        <div>
          <h2 className="text-xl font-black text-slate-800">✨ 연합 세션 전체 관리</h2>
          <p className="text-xs font-bold text-slate-400 mt-1">학기별 프로젝트와 활동 사진을 관리하세요.</p>
        </div>
        <button onClick={handleSaveAll} disabled={saving} className="bg-[#32a4a1] text-white px-8 py-3 rounded-xl font-black uppercase hover:bg-[#238986] transition-all shadow-lg hover:scale-105">
          {saving ? 'Saving...' : 'Save All 💾'}
        </button>
      </div>

      {/* 2. 헤더 소개 */}
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
        <h3 className="font-black text-[#32a4a1] mb-4 uppercase text-sm tracking-widest">01. Header Description</h3>
        <div className="space-y-4">
          <input type="text" value={headerData.title} onChange={e => setHeaderData({...headerData, title: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-2xl outline-none focus:border-[#32a4a1] border border-transparent" placeholder="제목 (Union Session)" />
          <textarea rows="3" value={headerData.desc} onChange={e => setHeaderData({...headerData, desc: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-medium text-slate-600 outline-none focus:border-[#32a4a1] border border-transparent resize-none" placeholder="세션 상세 설명 (서울대 C!SL 연합...)"></textarea>
        </div>
      </div>

      {/* 3. 프로젝트 아카이브 리스트 */}
      <div className="space-y-6">
        <div className="flex justify-between items-end mb-2 px-2">
          <h3 className="font-black text-slate-800 text-xl">02. Project Archives</h3>
          <button onClick={addProject} className="bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-black hover:bg-[#32a4a1] transition-colors">+ 새 프로젝트 추가</button>
        </div>

        {projects.map((proj, pIdx) => (
          <div key={pIdx} className={`p-8 rounded-[2.5rem] shadow-sm border-2 relative transition-all ${proj.theme === 'dark' ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-100'}`}>
            <button onClick={() => removeProject(pIdx)} className="absolute top-6 right-6 text-red-400 hover:text-red-600 font-black text-xl">✕</button>
            <div className="flex gap-4 mb-6">
              <label className="flex items-center gap-2 text-xs font-black cursor-pointer">
                <input type="radio" checked={proj.theme === 'light'} onChange={() => handleProjectChange(pIdx, 'theme', 'light')} /> 밝은 배경 (White)
              </label>
              <label className="flex items-center gap-2 text-xs font-black cursor-pointer">
                <input type="radio" checked={proj.theme === 'dark'} onChange={() => handleProjectChange(pIdx, 'theme', 'dark')} /> 어두운 배경 (Dark)
              </label>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="space-y-4">
                <input type="text" value={proj.semester} onChange={e => handleProjectChange(pIdx, 'semester', e.target.value)} className="w-full bg-transparent text-[#32a4a1] font-black text-sm uppercase tracking-widest outline-none border-b border-white/20 focus:border-[#32a4a1] pb-1" placeholder="학기명 (예: 2025 Autumn Semester)" />
                <input type="text" value={proj.title} onChange={e => handleProjectChange(pIdx, 'title', e.target.value)} className="w-full bg-transparent text-3xl font-black outline-none border-b border-white/20 focus:border-[#32a4a1] pb-1" placeholder="프로젝트 타이틀" />
                <textarea rows="3" value={proj.description} onChange={e => handleProjectChange(pIdx, 'description', e.target.value)} className="w-full bg-transparent text-sm font-medium opacity-80 outline-none border border-white/20 rounded-xl p-3 resize-none focus:border-[#32a4a1]" placeholder="프로젝트 상세 설명"></textarea>
                <div className="pt-4">
                  <p className="text-xs font-black opacity-50 mb-2">세부 키워드 리스트</p>
                  <div className="space-y-2">
                    {proj.sub_items.map((itemStr, iIdx) => {
                      let itemObj = {t:'', d:''};
                      try { itemObj = typeof itemStr === 'string' ? JSON.parse(itemStr) : itemStr } catch(e){}
                      return (
                        <div key={iIdx} className="flex items-start gap-2 bg-white/5 p-2 rounded-xl">
                          <span className="text-[#32a4a1] font-black mt-2">0{iIdx+1}</span>
                          <div className="flex-1 space-y-1">
                            <input type="text" value={itemObj.t} onChange={e => handleSubItemChange(pIdx, iIdx, 't', e.target.value)} className="w-full bg-transparent text-sm font-black outline-none" placeholder="소제목 (예: 세대 갈등)" />
                            <input type="text" value={itemObj.d} onChange={e => handleSubItemChange(pIdx, iIdx, 'd', e.target.value)} className="w-full bg-transparent text-xs font-medium opacity-50 outline-none" placeholder="짧은 설명 (선택)" />
                          </div>
                          <button onClick={() => removeSubItem(pIdx, iIdx)} className="text-red-400 px-2 py-1 hover:text-red-600 text-xs font-black">X</button>
                        </div>
                      )
                    })}
                    <button onClick={() => addSubItem(pIdx)} className="text-xs font-black text-slate-400 hover:text-[#32a4a1]">+ 키워드 추가</button>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-4">
                <div className="relative w-full aspect-video bg-white/5 rounded-2xl border-2 border-dashed border-white/20 flex flex-col items-center justify-center overflow-hidden">
                  {proj.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proj.image_url} alt="preview" className="w-full h-full object-cover" />
                  ) : <span className="text-sm font-bold opacity-50">대표 이미지를 업로드하세요</span>}
                </div>
                <input type="file" accept="image/*" onChange={e => handleProjectImageUpload(pIdx, e.target.files[0])} className="text-xs file:rounded-full file:border-0 file:bg-[#32a4a1]/10 file:text-[#32a4a1] file:px-4 file:py-2 file:font-black" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 4. 📸 활동 스케치 (갤러리) 관리 파트 신규 추가 */}
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-black text-[#32a4a1] uppercase text-sm tracking-widest">03. Activity Sketch (Gallery)</h3>
          
          {/* 다중 업로드 지원 버튼 */}
          <label className="bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-black cursor-pointer hover:bg-[#32a4a1] transition-colors shadow-md">
            + 사진 추가 (여러 장 가능)
            <input type="file" multiple accept="image/*" className="hidden" onChange={handleGalleryUpload} disabled={saving} />
          </label>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-6 rounded-2xl">
          {galleryUrls.map((url, idx) => (
            <div key={idx} className="relative aspect-video rounded-xl overflow-hidden shadow-sm group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`gallery-${idx}`} className="w-full h-full object-cover" />
              {/* 호버 시 나타나는 X 삭제 버튼 */}
              <button 
                onClick={() => removeGalleryImage(idx)} 
                className="absolute top-2 right-2 bg-red-500/80 hover:bg-red-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-sm opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm"
              >
                X
              </button>
            </div>
          ))}
          
          {galleryUrls.length === 0 && (
            <div className="col-span-full py-12 text-center flex flex-col items-center">
              <span className="text-4xl mb-2">📸</span>
              <p className="text-sm font-bold text-slate-400">등록된 활동 사진이 없습니다.<br/>우측 상단의 버튼을 눌러 사진을 추가해 주세요.</p>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}

// ==========================================
// 🤝 4. 기업 세션 관리자 컴포넌트 (실제 작동 코드)
// ==========================================
function CorporateManager() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 1. 헤더 데이터
  const [headerData, setHeaderData] = useState({ title: '', desc: '' })
  
  // 2. 파트너 로고 (pr_activities_corp_partners)
  const [partners, setPartners] = useState([])

  // 3. 메인 케이스 스터디 (pr_activities_corp_projects)
  // 단일 프로젝트를 가정하고 상태를 짭니다.
  const [caseStudy, setCaseStudy] = useState({
    title: '', corp_name: '', corp_logo_url: '',
    sections: [{ title: '', content: '', color: '#2d3d33', icon: '♻️' }],
    gallery_urls: []
  })
  const [logoFile, setLogoFile] = useState(null)

  // 4. 포스트 액티비티 (연계 활동)
  const [postActivities, setPostActivities] = useState([])

  useEffect(() => {
    fetchCorporateData()
  }, [])

  const fetchCorporateData = async () => {
    setLoading(true)
    
    // 1) 헤더 및 연계 활동 불러오기 (pr_activities_content 재활용)
    const { data: content } = await supabase.from('pr_activities_content').select('*').eq('id', 'corporate').single()
    if (content) {
      setHeaderData({ title: content.header_title || '', desc: content.header_desc || '' })
      if (content.rules_json && content.rules_json.postActivities) {
        setPostActivities(content.rules_json.postActivities)
      }
    }

    // 2) 파트너 로고
    const { data: partnerData } = await supabase.from('pr_activities_corp_partners').select('*').order('order_num', { ascending: true })
    if (partnerData) setPartners(partnerData)

    // 3) 케이스 스터디
    const { data: caseData } = await supabase.from('pr_activities_corp_projects').select('*').limit(1).single()
    if (caseData) {
      setCaseStudy({
        id: caseData.id,
        title: caseData.title,
        corp_name: caseData.corp_name,
        corp_logo_url: caseData.corp_logo_url,
        sections: caseData.content_json || [],
        gallery_urls: caseData.gallery_urls || []
      })
    }
    
    setLoading(false)
  }

  // --- 파트너 로고 업로드 핸들러 ---
  const handlePartnerUpload = async (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return
    setSaving(true)
    
    let newPartners = [...partners]
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `activities/partner_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`
      await supabase.storage.from('showcase').upload(path, file)
      const publicUrl = supabase.storage.from('showcase').getPublicUrl(path).data.publicUrl
      newPartners.push({ name: file.name.split('.')[0], image_url: publicUrl, order_num: newPartners.length + 1 })
    }
    setPartners(newPartners)
    setSaving(false)
  }
  const removePartner = (index) => setPartners(partners.filter((_, i) => i !== index))

  // --- 케이스 스터디 섹션 핸들러 ---
  const addSection = () => setCaseStudy({...caseStudy, sections: [...caseStudy.sections, { title: '', content: '', color: '#2d3d33', icon: '📝' }]})
  const removeSection = (index) => setCaseStudy({...caseStudy, sections: caseStudy.sections.filter((_, i) => i !== index)})
  const handleSectionChange = (index, field, value) => {
    const newSections = [...caseStudy.sections]
    newSections[index][field] = value
    setCaseStudy({...caseStudy, sections: newSections})
  }

  // --- 포스트 액티비티 핸들러 ---
  const addPostActivity = () => setPostActivities([...postActivities, { title: '', desc: '', image_urls: [], bg_color: '#3e2d35', icon: '🌲' }])
  const removePostActivity = (index) => setPostActivities(postActivities.filter((_, i) => i !== index))
  const handlePostChange = (index, field, value) => {
    const newPosts = [...postActivities]
    newPosts[index][field] = value
    setPostActivities(newPosts)
  }
  const handlePostImageUpload = async (index, e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return
    setSaving(true)
    let newUrls = [...postActivities[index].image_urls || []]
    for (const file of files) {
      const ext = file.name.split('.').pop()
      const path = `activities/post_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`
      await supabase.storage.from('showcase').upload(path, file)
      newUrls.push(supabase.storage.from('showcase').getPublicUrl(path).data.publicUrl)
    }
    handlePostChange(index, 'image_urls', newUrls)
    setSaving(false)
  }

  // --- 전체 저장 로직 ---
  const handleSaveAll = async () => {
    setSaving(true)

    // 1. 헤더 및 포스트 액티비티 저장
    await supabase.from('pr_activities_content').upsert({
      id: 'corporate',
      header_title: headerData.title || 'Corporate Session',
      header_desc: headerData.desc,
      rules_json: { postActivities }
    })

    // 2. 파트너 로고 저장
    await supabase.from('pr_activities_corp_partners').delete().neq('id', 0)
    if (partners.length > 0) {
      const insertPartners = partners.map((p, i) => ({ name: p.name, image_url: p.image_url, order_num: i + 1 }))
      await supabase.from('pr_activities_corp_partners').insert(insertPartners)
    }

    // 3. 케이스 스터디 저장
    let finalLogoUrl = caseStudy.corp_logo_url
    if (logoFile) {
      const ext = logoFile.name.split('.').pop()
      const path = `activities/corp_logo_${Date.now()}.${ext}`
      await supabase.storage.from('showcase').upload(path, logoFile)
      finalLogoUrl = supabase.storage.from('showcase').getPublicUrl(path).data.publicUrl
    }

    await supabase.from('pr_activities_corp_projects').delete().neq('id', 0)
    await supabase.from('pr_activities_corp_projects').insert([{
      title: caseStudy.title,
      corp_name: caseStudy.corp_name,
      corp_logo_url: finalLogoUrl,
      content_json: caseStudy.sections,
      gallery_urls: caseStudy.gallery_urls // (추후 다중 이미지 업로더 추가 가능)
    }])

    alert('기업 세션 정보가 모두 저장되었습니다! 🤝')
    setSaving(false)
  }

  if (loading) return <div className="p-10 text-center font-bold text-slate-400">데이터 불러오는 중... 🔄</div>

  return (
    <div className="space-y-8">
      {/* 1. 상단 컨트롤 바 */}
      <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex justify-between items-center sticky top-24 z-10">
        <div>
          <h2 className="text-xl font-black text-slate-800">🤝 기업 세션 전체 관리</h2>
          <p className="text-xs font-bold text-slate-400 mt-1">파트너사와 케이스 스터디를 관리하세요.</p>
        </div>
        <button onClick={handleSaveAll} disabled={saving} className="bg-[#32a4a1] text-white px-8 py-3 rounded-xl font-black uppercase hover:bg-[#238986] transition-all shadow-lg hover:scale-105">
          {saving ? 'Saving...' : 'Save All 💾'}
        </button>
      </div>

      {/* 2. 헤더 소개 */}
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
        <h3 className="font-black text-[#32a4a1] mb-4 uppercase text-sm tracking-widest">01. Header Description</h3>
        <div className="space-y-4">
          <input type="text" value={headerData.title} onChange={e => setHeaderData({...headerData, title: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-black text-2xl outline-none focus:border-[#32a4a1] border border-transparent" placeholder="제목 (Corporate Session)" />
          <textarea rows="3" value={headerData.desc} onChange={e => setHeaderData({...headerData, desc: e.target.value})} className="w-full bg-slate-50 p-4 rounded-xl font-medium text-slate-600 outline-none focus:border-[#32a4a1] border border-transparent resize-none" placeholder="세션 상세 설명"></textarea>
        </div>
      </div>

      {/* 3. 파트너사 로고 관리 */}
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-black text-[#32a4a1] uppercase text-sm tracking-widest">02. Partner Logos</h3>
          <label className="bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-black cursor-pointer hover:bg-[#32a4a1] transition-colors">
            + 로고 업로드 (다중 선택)
            <input type="file" multiple accept="image/*" className="hidden" onChange={handlePartnerUpload} />
          </label>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-4 bg-slate-50 p-6 rounded-2xl">
          {partners.map((partner, idx) => (
            <div key={idx} className="relative h-20 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center p-2 group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={partner.image_url} alt={partner.name} className="max-w-full max-h-full object-contain" />
              <button onClick={() => removePartner(idx)} className="absolute -top-2 -right-2 bg-red-500 text-white w-6 h-6 rounded-full font-black text-xs opacity-0 group-hover:opacity-100 transition-opacity">X</button>
            </div>
          ))}
          {partners.length === 0 && <p className="col-span-full text-center text-xs text-slate-400 py-4">등록된 파트너 로고가 없습니다.</p>}
        </div>
      </div>

      {/* 4. 메인 케이스 스터디 (트리플래닛) */}
      <div className="bg-[#1a1a1a] text-white p-8 rounded-[2.5rem] shadow-xl">
        <h3 className="font-black text-[#a8d0cd] mb-6 uppercase text-sm tracking-widest">03. Special Case Study</h3>
        
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1 space-y-4">
              <input type="text" value={caseStudy.title} onChange={e => setCaseStudy({...caseStudy, title: e.target.value})} className="w-full bg-white/5 p-4 rounded-xl font-black text-xl outline-none focus:border-[#32a4a1] border border-white/10" placeholder="메인 타이틀 (예: 26기 & 27기 기업세션)" />
              <input type="text" value={caseStudy.corp_name} onChange={e => setCaseStudy({...caseStudy, corp_name: e.target.value})} className="w-full bg-white/5 p-4 rounded-xl font-black text-xl outline-none focus:border-[#32a4a1] border border-white/10" placeholder="기업명 (예: 트리플래닛 X IG)" />
            </div>
            <div className="w-48 bg-white/5 rounded-xl border border-white/10 flex flex-col items-center justify-center p-4">
              <span className="text-xs font-bold text-slate-400 mb-2">기업 로고 업로드</span>
              <input type="file" accept="image/*" onChange={e => setLogoFile(e.target.files[0])} className="text-[10px] w-full" />
              {caseStudy.corp_logo_url && <span className="text-[10px] text-green-400 mt-2">✓ 기존 로고 있음</span>}
            </div>
          </div>

          <div className="pt-6 border-t border-white/10">
            <div className="flex justify-between items-center mb-4">
              <h4 className="font-bold text-slate-300">상세 설명 블록</h4>
              <button onClick={addSection} className="text-[#32a4a1] font-black text-xs">+ 블록 추가</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {caseStudy.sections.map((sec, idx) => (
                <div key={idx} className="bg-white/5 p-4 rounded-2xl relative" style={{ borderLeft: `4px solid ${sec.color}` }}>
                  <button onClick={() => removeSection(idx)} className="absolute top-4 right-4 text-red-400 hover:text-red-500 font-black text-xs">X</button>
                  <div className="flex gap-2 mb-3">
                    <input type="text" value={sec.icon} onChange={e => handleSectionChange(idx, 'icon', e.target.value)} className="w-10 bg-transparent text-center outline-none border-b border-white/20" placeholder="♻️" />
                    <input type="text" value={sec.title} onChange={e => handleSectionChange(idx, 'title', e.target.value)} className="flex-1 bg-transparent font-black outline-none border-b border-white/20" placeholder="블록 제목 (예: 트리플래닛이란?)" />
                  </div>
                  <textarea rows="3" value={sec.content} onChange={e => handleSectionChange(idx, 'content', e.target.value)} className="w-full bg-transparent text-sm font-medium opacity-80 outline-none resize-none" placeholder="내용 (줄바꿈 허용)"></textarea>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px] text-slate-500">배경색 코드:</span>
                    <input type="text" value={sec.color} onChange={e => handleSectionChange(idx, 'color', e.target.value)} className="w-20 bg-transparent text-xs outline-none border-b border-white/20" placeholder="#2d3d33" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 5. 연계 활동 (Post Activities) */}
      <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-black text-[#32a4a1] uppercase text-sm tracking-widest">04. Post-Session Activities</h3>
          <button onClick={addPostActivity} className="bg-slate-900 text-white px-3 py-1 rounded-lg text-xs font-black hover:bg-[#32a4a1] transition-colors">+ 활동 추가</button>
        </div>
        
        <div className="space-y-6">
          {postActivities.map((post, idx) => (
            <div key={idx} className="bg-slate-50 p-6 rounded-2xl border border-slate-200 relative">
              <button onClick={() => removePostActivity(idx)} className="absolute top-4 right-4 text-red-400 hover:text-red-600 font-black text-xs">X 삭제</button>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input type="text" value={post.icon} onChange={e => handlePostChange(idx, 'icon', e.target.value)} className="w-10 text-center bg-white rounded-lg border border-slate-200" placeholder="🌲" />
                    <input type="text" value={post.title} onChange={e => handlePostChange(idx, 'title', e.target.value)} className="flex-1 bg-white p-2 rounded-lg font-black border border-slate-200" placeholder="활동 제목 (예: 안동 현장 답사)" />
                  </div>
                  <textarea rows="4" value={post.desc} onChange={e => handlePostChange(idx, 'desc', e.target.value)} className="w-full bg-white p-3 rounded-lg text-sm border border-slate-200 resize-none" placeholder="활동 상세 설명"></textarea>
                  <div className="flex items-center gap-2">
                     <span className="text-[10px] font-black text-slate-400">포인트 컬러:</span>
                     <input type="color" value={post.bg_color} onChange={e => handlePostChange(idx, 'bg_color', e.target.value)} className="w-8 h-8 rounded cursor-pointer" />
                  </div>
                </div>

                <div>
                  <p className="text-xs font-black text-slate-400 mb-2">관련 사진 업로드 (여러 장 가능)</p>
                  <input type="file" multiple accept="image/*" onChange={(e) => handlePostImageUpload(idx, e)} className="text-xs w-full mb-3" />
                  <div className="grid grid-cols-2 gap-2">
                    {(post.image_urls || []).map((url, imgIdx) => (
                      <div key={imgIdx} className="relative aspect-video rounded-lg overflow-hidden bg-slate-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="post-img" className="w-full h-full object-cover" />
                        <button onClick={() => {
                          const newUrls = post.image_urls.filter((_, i) => i !== imgIdx);
                          handlePostChange(idx, 'image_urls', newUrls);
                        }} className="absolute top-1 right-1 bg-red-500 text-white w-5 h-5 rounded-full text-[10px] font-black">X</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {postActivities.length === 0 && <p className="text-center text-xs text-slate-400 py-4">등록된 연계 활동이 없습니다.</p>}
        </div>
      </div>

    </div>
  )
}