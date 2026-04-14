'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ScorePage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [version, setVersion] = useState('v1') 
  const [semester, setSemester] = useState('') 
  const [presentations, setPresentations] = useState([]) 
  const [votedPids, setVotedPids] = useState([]) 
  const [selectedPid, setSelectedPid] = useState('')
  const [week, setWeek] = useState(1) 
  const [submitting, setSubmitting] = useState(false)
  const [myInfo, setMyInfo] = useState({ cluster_id: null, group_id: null })

  const [dynamicRubric, setDynamicRubric] = useState([])
  const [scores, setScores] = useState({})
  const [feedback, setFeedback] = useState({ originalMessage: '', insightPlus: '', insightMinus: '', graphicPlus: '', graphicMinus: '', deliveryPlus: '', deliveryMinus: '', memo: '' })
  const weeks = Array.from({ length: 12 }, (_, i) => i + 1);

  const getColorTheme = (colorName) => {
    const mapping = {
      blue: { text: 'text-teal-800', border: 'border-teal-800', lightBg: 'bg-teal-50', lightBorder: 'border-teal-200' },
      purple: { text: 'text-purple-800', border: 'border-purple-800', lightBg: 'bg-purple-50', lightBorder: 'border-purple-200' },
      pink: { text: 'text-pink-800', border: 'border-pink-800', lightBg: 'bg-pink-50', lightBorder: 'border-pink-200' },
      emerald: { text: 'text-emerald-800', border: 'border-emerald-800', lightBg: 'bg-emerald-50', lightBorder: 'border-emerald-200' },
      amber: { text: 'text-amber-700', border: 'border-amber-700', lightBg: 'bg-amber-50', lightBorder: 'border-amber-200' },
    }
    return mapping[colorName] || mapping.blue;
  }

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login') } 
      else { 
        setUser(session.user); 
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
      setMyInfo({ cluster_id: myCluster, group_id: me?.group_id || 1 })
      const filtered = pAll.filter(p => p.cluster_id === myCluster) 
      setPresentations(filtered)
      const currentVersion = pAll[0].eval_version || 'v1'
      setVersion(currentVersion) 

      const { data: rubricData } = await supabase.from('pr_vote_criteria').select('criteria_data').eq('version', currentVersion).single()
      if (rubricData && rubricData.criteria_data) {
        setDynamicRubric(rubricData.criteria_data)
        const initialScores = {}
        rubricData.criteria_data.forEach(cat => cat.items.forEach(item => { initialScores[item.id] = null }))
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

  const calculateCategoryTotal = (cat) => cat.items.reduce((sum, item) => sum + (scores[item.id] || 0), 0)
  const grandTotal = dynamicRubric.reduce((sum, cat) => sum + calculateCategoryTotal(cat), 0)
  const maxPossibleScore = dynamicRubric.reduce((sum, cat) => sum + cat.items.reduce((itemSum, item) => itemSum + Math.max(...item.criteria.map(c => c.s), 0), 0), 0)

  const handleSubmit = async () => {
    if (!selectedPid) return alert("채점 대상이 없습니다.")
    if (!Object.values(scores).every(v => v !== null)) return alert("모든 항목을 평가해 주세요.")
    setSubmitting(true)
    const { error } = await supabase.from('scores').insert([{ presentation_id: selectedPid, voter_name: user.user_metadata.name, total_score: grandTotal, semester, details: { scores, version, qualitative: feedback } }])
    if (!error) { alert("채점 완료!"); window.location.reload(); }
    else { alert("오류 발생: " + error.message) }
    setSubmitting(false)
  }

  if (!user) return <div className="p-8 text-center font-bold text-slate-400">데이터 로딩 중...</div>
  const currentPresenter = presentations.find(p => p.id === selectedPid)
  const targetsToScore = presentations.filter(p => p.presenter_name !== user.user_metadata.name);
  const allEvaluated = targetsToScore.length > 0 && targetsToScore.every(p => votedPids.includes(p.id));
  const isSameGroup = currentPresenter?.group_id === myInfo.group_id;

  return (
    <div className="bg-slate-50 min-h-screen text-slate-900 font-sans pb-32">
      {/* 🌟 GNB (가로 1600px로 확장) */}
      <header className="border-b border-slate-300 bg-slate-50 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto flex items-end px-6 pt-4 overflow-x-auto no-scrollbar">
          <Link href="/home" className="pb-4 pr-6 text-sm font-extrabold text-slate-400 hover:text-teal-800 transition-colors flex items-center shrink-0">HOME</Link>
          <div className="w-px h-4 bg-slate-300 mx-2 mb-4 shrink-0"></div>
          <Link href="/vote/score" className="pb-4 px-6 text-sm font-extrabold text-teal-800 border-b-[3px] border-teal-800 transition-colors shrink-0">발표 채점 📝</Link>
          <Link href="/vote/feedback" className="pb-4 px-6 text-sm font-semibold text-slate-400 hover:text-slate-800 transition-colors shrink-0">임시저장 피드백 ✍️</Link>
          <Link href="/vote/results/my" className="pb-4 px-6 text-sm font-semibold text-slate-400 hover:text-slate-800 transition-colors shrink-0">결과 확인 📊</Link>
          <Link href="/vote/results/arxiv" className="pb-4 px-6 text-sm font-semibold text-slate-400 hover:text-slate-800 transition-colors shrink-0">피드백 확인 💬</Link>
          <Link href="/vote/results/ranking" className="pb-4 px-6 text-sm font-semibold text-slate-400 hover:text-slate-800 transition-colors shrink-0">베스트 프레젠터 🏆</Link>
        </div>
      </header>

      {/* 🌟 메인 컨테이너 폭 1600px 확장 */}
      <div className="max-w-[1600px] mx-auto px-6 mt-12">
        {/* 타이틀 구역 */}
        <header className="w-full mb-16 flex flex-col items-center">
          <div className="w-full flex justify-end items-center mb-6">
            <div className="flex items-center gap-3">
              {semester && <span className="text-[11px] font-black text-teal-800 uppercase">{semester}</span>}
              <span className="w-px h-3 bg-slate-400"></span>
              <span className="text-[11px] font-black text-slate-500 uppercase">{version} VER</span>
              <span className="w-px h-3 bg-slate-400"></span>
              <span className="text-[11px] font-black text-teal-600 uppercase tracking-widest">C#{myInfo.cluster_id} / G#{myInfo.group_id}</span>
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold uppercase text-teal-900 tracking-tight mb-12 text-center">Evaluation System</h1>
          <div className="w-full border-y-2 border-teal-800 py-10 flex flex-col items-center">
            <span className="text-xs font-extrabold text-teal-700 uppercase tracking-widest mb-6">Select Active Week</span>
            <div className="flex flex-wrap justify-center gap-4 md:gap-6 mb-10 w-full max-w-4xl">
              {weeks.map((w) => (
                <button key={w} onClick={() => setWeek(w)} className={`pb-1 text-base md:text-lg font-black transition-all ${week === w ? 'text-teal-800 border-b-[3px] border-teal-800 scale-110' : 'text-slate-400 border-b-[3px] border-transparent hover:text-slate-700 hover:scale-105'}`}>W{w}</button>
              ))}
            </div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Target Topic</span>
            <p className="text-2xl font-extrabold text-slate-900">{presentations[0]?.topic || "등록된 주제 없음"}</p>
          </div>
        </header>

        {/* 🌟 사이드바는 적당히 고정, 중앙 1fr을 극대화 */}
        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_300px] xl:grid-cols-[240px_1fr_380px] gap-10 xl:gap-16 items-start">
          
          {/* [좌] 클러스터 순서 사이드바 */}
          <aside className="w-full lg:justify-self-end">
            <div className="sticky top-24 pt-2">
              <h3 className="text-[10px] font-black text-slate-400 uppercase mb-6 border-b border-slate-300 pb-3 tracking-widest">Cluster Flow</h3>
              <div className="space-y-1">
                {presentations.map((p, idx) => (
                  <div key={p.id} className="flex items-center gap-4 py-3 border-b border-slate-200 last:border-0">
                    <span className={`text-xs font-black w-4 ${p.id === selectedPid ? 'text-teal-700' : votedPids.includes(p.id) ? 'text-slate-300' : 'text-slate-400'}`}>{String(idx + 1).padStart(2, '0')}</span>
                    <p className={`text-base font-extrabold truncate ${p.id === selectedPid ? 'text-teal-800' : votedPids.includes(p.id) ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{p.presenter_name} {p.group_id === myInfo.group_id && <span className="text-[10px] text-teal-500 ml-1">★</span>}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* [중] 동적 정량 평가창 (가로폭 엄청 넓어짐) */}
          <div className="w-full space-y-16">
            <div className="text-center pb-8 border-b-[3px] border-slate-900">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-4">Active Target</label>
              <div className="font-black text-teal-800 text-4xl tracking-tight">{allEvaluated ? "평가 완료" : currentPresenter ? `${currentPresenter.presenter_name} 님` : "대상 없음"}</div>
            </div>

            {!allEvaluated ? (
              <>
                {dynamicRubric.map((cat, idx) => {
                  const theme = getColorTheme(cat.color);
                  return (
                    <CategoryCard key={cat.id || idx} title={cat.title} icon={cat.icon} total={calculateCategoryTotal(cat)} max={cat.items.reduce((sum, item) => sum + Math.max(...item.criteria.map(c=>c.s), 0), 0)} theme={theme}>
                      {cat.items.map(item => (
                        <EvaluationItem key={item.id} itemData={item} val={scores[item.id]} onChange={(v)=>handleScoreChange(item.id, v)} theme={theme} />
                      ))}
                    </CategoryCard>
                  )
                })}
                <div className="py-16 border-t-[3px] border-b-[3px] border-slate-900 text-center space-y-10">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-4">Total Score</span>
                  <h2 className="text-7xl font-black text-teal-800">{grandTotal}<span className="text-3xl text-slate-400 ml-3">/ {maxPossibleScore}</span></h2>
                  <button onClick={handleSubmit} disabled={submitting} className="w-full max-w-sm mx-auto block py-5 border-[3px] border-teal-800 text-teal-900 font-black text-xl uppercase tracking-widest hover:bg-teal-800 hover:text-white transition-all active:scale-95">제출하기</button>
                </div>
              </>
            ) : (
              <div className="py-24 text-center border-y border-slate-300">
                <span className="text-6xl mb-8 block grayscale opacity-50">🏆</span>
                <h3 className="text-3xl font-black text-slate-800 mb-12 uppercase">모든 평가가 완료되었습니다</h3>
                <div className="flex flex-col sm:flex-row gap-6 justify-center">
                  <Link href="/vote/results/my" className="border-b-[3px] border-slate-900 text-slate-900 px-6 py-3 font-black text-sm uppercase transition-colors hover:text-teal-700 hover:border-teal-700">결과 확인하기 ↗</Link>
                </div>
              </div>
            )}
          </div>

          {/* [우] 정성 피드백 영역 */}
          {!allEvaluated && (
            <aside className="w-full lg:justify-self-start h-fit sticky top-24 pt-2">
              <div className="flex justify-between items-end border-b-2 border-slate-300 pb-3 mb-8">
                <h3 className="text-lg font-extrabold text-slate-900">{currentPresenter?.presenter_name} {isSameGroup ? '피드백' : '메모장'}</h3>
                <p className={`text-[10px] font-black uppercase ${isSameGroup ? 'text-teal-700' : 'text-slate-400'}`}>{isSameGroup ? 'Detail' : 'Simple'}</p>
              </div>
              {isSameGroup ? (
                <div className="space-y-10">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-3">Original Message</label>
                    <input type="text" value={feedback.originalMessage} onChange={(e)=>handleFeedbackChange('originalMessage', e.target.value)} className="w-full border-b-[3px] border-slate-300 py-2.5 text-base font-bold outline-none focus:border-teal-700 bg-transparent placeholder:text-slate-300" placeholder="메시지 기록" />
                  </div>
                  <FeedbackSection title="1. Insight" subtitle="독창성" plusVal={feedback.insightPlus} minusVal={feedback.insightMinus} onPlusChange={(v)=>handleFeedbackChange('insightPlus', v)} onMinusChange={(v)=>handleFeedbackChange('insightMinus', v)} />
                  <FeedbackSection title="2. Graphic" subtitle="가독성" plusVal={feedback.graphicPlus} minusVal={feedback.graphicMinus} onPlusChange={(v)=>handleFeedbackChange('graphicPlus', v)} onMinusChange={(v)=>handleFeedbackChange('graphicMinus', v)} />
                  <FeedbackSection title="3. Delivery" subtitle="전달력" plusVal={feedback.deliveryPlus} minusVal={feedback.deliveryMinus} onPlusChange={(v)=>handleFeedbackChange('deliveryPlus', v)} onMinusChange={(v)=>handleFeedbackChange('deliveryMinus', v)} />
                </div>
              ) : (
                <textarea value={feedback.memo} onChange={(e)=>handleFeedbackChange('memo', e.target.value)} className="w-full border-y-[3px] border-slate-200 py-6 text-base font-medium min-h-[500px] outline-none focus:border-slate-400 bg-transparent resize-none leading-relaxed" placeholder="자유로운 메모..." />
              )}
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}

function CategoryCard({ title, icon, total, max, theme, children }) {
  return (
    <div className="pb-16 border-b-2 border-slate-300 last:border-0">
      <div className={`flex justify-between items-end mb-10 pb-4 border-b ${theme.border}`}>
        <h3 className={`text-3xl font-black ${theme.text} flex items-center gap-3 tracking-tight`}>
          <span className="grayscale-0">{icon}</span> {title}
        </h3>
        <p className="font-black text-slate-400 text-xs tracking-widest uppercase">
          Score <span className={`text-2xl ${theme.text} ml-2`}>{total}</span><span className="text-sm">/{max}</span>
        </p>
      </div>
      <div className="space-y-16">{children}</div>
    </div>
  )
}

// 🌟 기준표 줄바꿈 방지 (break-keep) 적용 완료
function EvaluationItem({ itemData, val, onChange, theme }) {
  const points = [];
  const maxScore = Math.max(...itemData.criteria.map(c => c.s), 0);
  const minScore = Math.min(...itemData.criteria.map(c => c.s), 0);
  for (let i = maxScore; i >= minScore; i--) points.push(i);
  
  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-end">
        <span className="text-lg font-extrabold text-slate-900 tracking-tight">{itemData.label}</span>
        <span className={`text-sm font-black ${theme.text} ${theme.lightBg} px-3 py-1 rounded-none border-b-2 ${theme.lightBorder}`}>{val === null ? '?' : val} pt</span>
      </div>
      
      {/* 🌟 텍스트 크기 상향 및 break-keep 추가로 줄바꿈 최소화 */}
      <div className="border-y-2 border-slate-300 py-3">
        <table className="w-full text-left">
          <tbody>
            {[...itemData.criteria].sort((a,b) => b.s - a.s).map((item, idx) => (
              <tr key={idx} className="border-b border-slate-100 last:border-0">
                <td className={`py-3 text-[13px] font-medium leading-relaxed break-keep transition-colors pr-4 ${val === item.s ? `${theme.text} font-extrabold` : 'text-slate-600'}`}>{item.t}</td>
                <td className={`w-12 py-3 text-right text-xs font-black transition-colors ${val === item.s ? theme.text : 'text-slate-400'}`}>{item.s}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2 pt-2">
        {points.map((p) => (
          <button key={p} onClick={() => onChange(p)} className={`flex-1 pb-3 text-lg transition-all border-b-[3px] ${val === p ? `${theme.border} ${theme.text} font-black` : 'border-transparent text-slate-400 font-bold hover:border-slate-300'}`}>{p}</button>
        ))}
      </div>
    </div>
  )
}

function FeedbackSection({ title, subtitle, plusVal, minusVal, onPlusChange, onMinusChange }) {
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3"><p className="text-sm font-black text-slate-800 uppercase">{title}</p><p className="text-[10px] font-bold text-slate-400 mb-0.5">{subtitle}</p></div>
      <div className="flex flex-col gap-4">
        <textarea value={plusVal} onChange={(e)=>onPlusChange(e.target.value)} className="w-full border-b-[3px] border-emerald-400 py-2 px-1 text-sm font-bold min-h-[50px] outline-none focus:border-emerald-700 bg-transparent resize-none placeholder:text-slate-300" placeholder="(+) 장점" />
        <textarea value={minusVal} onChange={(e)=>onMinusChange(e.target.value)} className="w-full border-b-[3px] border-red-400 py-2 px-1 text-sm font-bold min-h-[50px] outline-none focus:border-red-700 bg-transparent resize-none placeholder:text-slate-300" placeholder="(-) 개선" />
      </div>
    </div>
  )
}