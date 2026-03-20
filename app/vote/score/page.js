'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ScorePage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [version, setVersion] = useState('v1') 
  const [semester, setSemester] = useState('') // 🌟 현재 학기 상태 추가
  const [presentations, setPresentations] = useState([]) 
  const [votedPids, setVotedPids] = useState([]) 
  const [selectedPid, setSelectedPid] = useState('')
  const [week, setWeek] = useState(1) 
  const [submitting, setSubmitting] = useState(false)
  const [myInfo, setMyInfo] = useState({ cluster_id: null, group_id: null })

  // DB에서 불러올 다이내믹 루브릭(채점 기준표) 상태
  const [dynamicRubric, setDynamicRubric] = useState([])
  const [scores, setScores] = useState({})
  const [feedback, setFeedback] = useState({ originalMessage: '', insightPlus: '', insightMinus: '', graphicPlus: '', graphicMinus: '', deliveryPlus: '', deliveryMinus: '', memo: '' })
  const weeks = Array.from({ length: 12 }, (_, i) => i + 1);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login') } 
      else { 
        setUser(session.user); 
        
        // 🌟 현재 학기(semester) 정보 불러오기
        const { data: configData } = await supabase.from('pr_config').select('value').eq('key', 'current_semester').single();
        if (configData) setSemester(configData.value);

        const { data: latestP } = await supabase.from('presentations').select('week').order('created_at', { ascending: false }).limit(1);
        if (latestP && latestP.length > 0) setWeek(latestP[0].week);
      }
    }
    init()
  }, [router])

  useEffect(() => {
    if (user?.id) fetchData(user.user_metadata.name, week);
  }, [week, user?.id]);

  const fetchData = async (userName, targetWeek) => {
    const { data: pAll } = await supabase.from('presentations').select('*').eq('week', targetWeek).order('order_index', { ascending: true }) 
    if (pAll && pAll.length > 0) {
      const me = pAll.find(p => p.presenter_name === userName)
      const myCluster = me?.cluster_id || 1
      const myGroup = me?.group_id || 1
      setMyInfo({ cluster_id: myCluster, group_id: myGroup })

      const filtered = pAll.filter(p => p.cluster_id === myCluster) 
      setPresentations(filtered)
      
      const currentVersion = pAll[0].eval_version || 'v1'
      setVersion(currentVersion) 

      const { data: rubricData } = await supabase.from('pr_vote_criteria').select('criteria_data').eq('version', currentVersion).single()
      
      if (rubricData && rubricData.criteria_data) {
        setDynamicRubric(rubricData.criteria_data)
        const initialScores = {}
        rubricData.criteria_data.forEach(cat => {
          cat.items.forEach(item => {
            initialScores[item.id] = null
          })
        })
        setScores(initialScores)
      }

      const { data: sData } = await supabase.from('scores').select('presentation_id').eq('voter_name', userName)
      const votedIds = sData ? sData.map(s => s.presentation_id) : []
      setVotedPids(votedIds)
      
      const nextToScore = filtered.find(p => p.presenter_name !== userName && !votedIds.includes(p.id))
      if (nextToScore) setSelectedPid(nextToScore.id)
    }
    setFeedback({ originalMessage: '', insightPlus: '', insightMinus: '', graphicPlus: '', graphicMinus: '', deliveryPlus: '', deliveryMinus: '', memo: '' })
  }

  const handleScoreChange = (key, val) => setScores(prev => ({ ...prev, [key]: Number(val) }))
  const handleFeedbackChange = (key, val) => setFeedback(prev => ({ ...prev, [key]: val }))

  const calculateCategoryTotal = (cat) => {
    return cat.items.reduce((sum, item) => sum + (scores[item.id] || 0), 0)
  }
  
  const grandTotal = dynamicRubric.reduce((sum, cat) => sum + calculateCategoryTotal(cat), 0)

  const maxPossibleScore = dynamicRubric.reduce((sum, cat) => {
    return sum + cat.items.reduce((itemSum, item) => {
      const maxScore = Math.max(...item.criteria.map(c => c.s), 0)
      return itemSum + maxScore
    }, 0)
  }, 0)

  const handleSubmit = async () => {
    if (!selectedPid) return alert("채점 대상이 없어! 👤")
    if (!Object.values(scores).every(v => v !== null)) return alert("모든 항목을 평가해줘! ✍️")
    
    setSubmitting(true)
    
    // 🌟 INSERT 구문에 semester 컬럼 추가
    const { error } = await supabase.from('scores').insert([{
        presentation_id: selectedPid, 
        voter_name: user.user_metadata.name,
        total_score: grandTotal, 
        semester: semester, // 현재 진행 중인 학기 기록
        details: { scores, version, qualitative: feedback } 
    }])
    if (!error) { alert("채점 완료! 👏"); window.location.reload(); }
    else { alert("오류 발생: " + error.message) }
    setSubmitting(false)
  }

  if (!user) return <div className="p-8 text-center font-black text-slate-500">데이터 로딩 중... 🔄</div>
  const currentPresenter = presentations.find(p => p.id === selectedPid)
  const targetsToScore = presentations.filter(p => p.presenter_name !== user.user_metadata.name);
  const allEvaluated = targetsToScore.length > 0 && targetsToScore.every(p => votedPids.includes(p.id));
  const isSameGroup = currentPresenter?.group_id === myInfo.group_id;

  return (
    <div className="p-6 bg-slate-50 min-h-screen text-black font-sans pb-32">
      <div className="max-w-[1800px] mx-auto">
        
        {/* 헤더 구역 */}
        <header className="w-full text-center mb-12">
          <div className="flex justify-between items-center mb-6 max-w-2xl mx-auto">
            <Link href="/vote" className="text-blue-600 text-xs font-black hover:underline uppercase tracking-widest">← Vote Hub</Link>
            <div className="flex gap-2">
              {/* 🌟 학기 표시 뱃지 추가 */}
              {semester && <div className="bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-full shadow-sm font-black text-[10px] uppercase tracking-wider">{semester} 학기</div>}
              <div className="bg-slate-900 text-white px-4 py-1.5 rounded-full shadow-lg font-black text-[10px] uppercase">{version.toUpperCase()} VERSION</div>
            </div>
          </div>
          <h1 className="text-4xl font-black mb-8 uppercase italic">Evaluation System</h1>
          
          <div className="bg-slate-900 text-white p-6 rounded-[2.5rem] shadow-xl space-y-6 max-w-2xl mx-auto border border-slate-800">
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-black text-slate-500 uppercase block mb-3 tracking-widest">Select Active Week</span>
              <div className="flex flex-wrap justify-center gap-2">
                {weeks.map((w) => (
                  <button key={w} onClick={() => setWeek(w)} className={`w-10 h-10 rounded-xl font-black text-sm transition-all ${week === w ? 'bg-blue-500 text-white shadow-lg scale-110' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}>{w}</button>
                ))}
              </div>
            </div>
            <div className="flex justify-around items-center pt-4 border-t border-slate-800">
              <div className="px-6 flex-1 text-left">
                <span className="text-[10px] font-black text-slate-500 block mb-1 uppercase">Topic</span>
                <p className="text-xl font-black">{presentations[0]?.topic || "주제 없음"}</p>
                <p className="text-[9px] font-bold text-blue-400 mt-1 uppercase tracking-tighter">C#{myInfo.cluster_id} / G#{myInfo.group_id}</p>
              </div>
              <div className="px-4 text-right">
                <span className="text-[10px] font-black text-slate-500 block mb-1 uppercase">Evaluator</span>
                <p className="text-lg font-black text-blue-400">{user.user_metadata.name}</p>
              </div>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_672px_1fr] gap-8 items-start">
          
          {/* [좌] 클러스터 순서 사이드바 */}
          <aside className="w-full lg:w-64 lg:justify-self-end">
            <div className="bg-slate-900 p-6 rounded-[2.5rem] text-white shadow-2xl sticky top-8 border border-slate-800">
              <h3 className="text-[10px] font-black text-blue-400 uppercase mb-8 flex items-center gap-2">● Cluster Flow</h3>
              <div className="space-y-4">
                {presentations.map((p, idx) => (
                  <div key={p.id} className="flex items-center gap-4">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-black border transition-all ${p.id === selectedPid ? 'bg-blue-500 border-blue-400 text-white shadow-lg scale-110' : votedPids.includes(p.id) ? 'bg-slate-800 border-slate-700 text-slate-500' : 'bg-transparent border-slate-700 text-slate-400'}`}>{idx + 1}</div>
                    <p className={`text-xs font-black ${p.id === selectedPid ? 'text-blue-400' : votedPids.includes(p.id) ? 'text-slate-600 line-through' : 'text-slate-300'}`}>{p.presenter_name} {p.group_id === myInfo.group_id && <span className="text-[8px] text-emerald-400 ml-1">★</span>}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* [중] 동적 정량 평가창 */}
          <div className="w-full space-y-8">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <label className="text-xs font-black text-black uppercase tracking-widest mb-4 block text-center">Active Target</label>
              <div className="w-full p-4 bg-slate-50 border-none rounded-xl font-black text-black text-2xl text-center">
                {allEvaluated ? "🎉 채점 완료" : currentPresenter ? `${currentPresenter.presenter_name} 님 채점 중` : "대상 없음"}
              </div>
            </div>

            {!allEvaluated ? (
              <>
                {dynamicRubric.map((cat, idx) => {
                  const catTotal = calculateCategoryTotal(cat)
                  const catMax = cat.items.reduce((sum, item) => sum + Math.max(...item.criteria.map(c=>c.s), 0), 0)
                  
                  return (
                    <CategoryCard key={cat.id || idx} title={cat.title} icon={cat.icon} total={catTotal} max={catMax} color={`text-${cat.color || 'blue'}-600`}>
                      {cat.items.map(item => (
                        <EvaluationItem 
                          key={item.id} 
                          itemData={item} 
                          val={scores[item.id]} 
                          onChange={(v)=>handleScoreChange(item.id, v)} 
                        />
                      ))}
                    </CategoryCard>
                  )
                })}

                <div className="bg-slate-900 p-8 rounded-[3rem] shadow-2xl text-center space-y-6 border border-slate-800">
                  <h2 className="text-6xl font-black text-blue-500">{grandTotal}<span className="text-2xl text-slate-700 ml-1">/ {maxPossibleScore}</span></h2>
                  <button onClick={handleSubmit} disabled={submitting} className="w-full py-6 bg-blue-600 rounded-2xl font-black text-xl text-white hover:bg-blue-500 transition-all shadow-xl active:scale-95">{submitting ? "제출 중..." : "이 평가 최종 제출하기 🚀"}</button>
                </div>
              </>
            ) : (
              <div className="bg-white p-20 rounded-[3rem] text-center border-2 border-dashed border-slate-200">
                <span className="text-6xl mb-6 block">🏆</span>
                <h3 className="text-3xl font-black text-black mb-10 uppercase italic">채점 완료!</h3>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link href="/vote/results" className="bg-blue-600 text-white px-8 py-5 rounded-2xl font-black text-sm uppercase shadow-xl hover:bg-blue-700 transition-colors">📊 결과 확인</Link>
                  <Link href="/vote/feedback" className="bg-emerald-600 text-white px-8 py-5 rounded-2xl font-black text-sm uppercase shadow-xl hover:bg-emerald-700 transition-colors">✍️ 임시저장 피드백 작성</Link>
                </div>
              </div>
            )}
          </div>

          {/* [우] 정성 피드백 영역 */}
          {!allEvaluated && (
            <aside className="w-full lg:w-[480px] lg:justify-self-start h-fit sticky top-8">
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 space-y-8">
                <div className="flex flex-col border-b border-slate-100 pb-4">
                  <h3 className="text-xl font-black text-black">✍️ {currentPresenter?.presenter_name} {isSameGroup ? '피드백' : '메모장'}</h3>
                  <p className={`text-[9px] font-black mt-1 ${isSameGroup ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {isSameGroup ? '● 우리 조원 (상세 피드백)' : '○ 같은 방 구성원 (간편 메모)'}
                  </p>
                </div>
                {isSameGroup ? (
                  <div className="space-y-6">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 block mb-2">• 원메세지</label>
                      <textarea value={feedback.originalMessage} onChange={(e)=>handleFeedbackChange('originalMessage', e.target.value)} className="w-full bg-slate-50 p-4 rounded-2xl text-xs font-bold min-h-[40px] h-[50px] outline-none border border-transparent focus:border-blue-100 transition-colors" placeholder="메시지 기록" />
                    </div>
                    <FeedbackSection title="1. Insight" subtitle="독창성, 적합성" plusVal={feedback.insightPlus} minusVal={feedback.insightMinus} onPlusChange={(v)=>handleFeedbackChange('insightPlus', v)} onMinusChange={(v)=>handleFeedbackChange('insightMinus', v)} />
                    <FeedbackSection title="2. Graphic" subtitle="가독성, 가시성" plusVal={feedback.graphicPlus} minusVal={feedback.graphicMinus} onPlusChange={(v)=>handleFeedbackChange('graphicPlus', v)} onMinusChange={(v)=>handleFeedbackChange('graphicMinus', v)} />
                    <FeedbackSection title="3. Delivery" subtitle="목소리, 흐름" plusVal={feedback.deliveryPlus} minusVal={feedback.deliveryMinus} onPlusChange={(v)=>handleFeedbackChange('deliveryPlus', v)} onMinusChange={(v)=>handleFeedbackChange('deliveryMinus', v)} />
                  </div>
                ) : (
                  <div className="animate-in fade-in duration-500">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">● Evaluation Memo</label>
                    <textarea value={feedback.memo} onChange={(e)=>handleFeedbackChange('memo', e.target.value)} className="w-full bg-slate-50 p-6 rounded-[2rem] text-sm font-bold min-h-[450px] outline-none border-2 border-dashed border-slate-100 focus:border-amber-200 transition-colors" placeholder="발표를 보며 자유롭게 메모해줘!" />
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}

function CategoryCard({ title, icon, total, max, color, children }) {
  return (
    <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
      <div className="flex justify-between items-center mb-8 border-b-2 border-slate-50 pb-4">
        <h3 className={`text-2xl font-black ${color}`}>{icon} {title}</h3>
        <p className="font-black text-black text-center text-sm">Score: <span className={`text-3xl ${color}`}>{total}</span> / {max}</p>
      </div>
      <div className="space-y-12">{children}</div>
    </div>
  )
}

function EvaluationItem({ itemData, val, onChange }) {
  const scoresList = itemData.criteria.map(c => c.s);
  const maxScore = scoresList.length > 0 ? Math.max(...scoresList) : 10;
  const minScore = scoresList.length > 0 ? Math.min(...scoresList) : 0;
  
  const points = [];
  for (let i = maxScore; i >= minScore; i--) {
    points.push(i);
  }
  
  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between px-1 items-end">
        <span className="text-xl font-black text-black">{itemData.label}</span>
        <span className="text-xl font-black text-blue-600 bg-blue-50 px-4 py-1 rounded-full border border-blue-100">{val === null ? '?' : val}점</span>
      </div>
      <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden shadow-inner">
        <table className="w-full text-left border-collapse">
          <tbody>
            {[...itemData.criteria].sort((a,b) => b.s - a.s).map((item, idx) => (
              <tr key={idx} className={`border-b border-slate-200 last:border-0 ${val === item.s ? 'bg-blue-100/50' : ''}`}>
                <td className="p-3 text-[12px] font-bold text-slate-700 border-r border-slate-200 leading-tight">{item.t}</td>
                <td className="w-12 p-3 text-center text-xs font-black text-blue-600 bg-white/50">{item.s}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {points.map((p) => (
          <button 
            key={p} 
            onClick={() => onChange(p)} 
            className={`flex-1 min-w-[32px] h-11 rounded-xl font-black text-sm border-2 transition-all active:scale-95 ${val === p ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-slate-200 hover:border-blue-400 text-slate-600'}`}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}

function FeedbackSection({ title, subtitle, plusVal, minusVal, onPlusChange, onMinusChange }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-end"><p className="text-sm font-black text-black">{title}</p><p className="text-[9px] text-slate-400 font-bold mb-1">- {subtitle}</p></div>
      <div className="flex flex-col gap-3">
        <textarea value={plusVal} onChange={(e)=>onPlusChange(e.target.value)} className="w-full bg-blue-50/50 p-4 rounded-xl text-xs font-bold min-h-[60px] h-[70px] outline-none border border-transparent focus:border-blue-200 transition-colors" placeholder="(+) 장점 및 인상 깊었던 점" />
        <textarea value={minusVal} onChange={(e)=>onMinusChange(e.target.value)} className="w-full bg-red-50/50 p-4 rounded-xl text-xs font-bold min-h-[60px] h-[70px] outline-none border border-transparent focus:border-red-200 transition-colors" placeholder="(-) 아쉬운 점 및 개선 아이디어" />
      </div>
    </div>
  )
}