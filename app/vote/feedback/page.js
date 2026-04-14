'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function FeedbackPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [week, setWeek] = useState(1)
  
  const [currentSemester, setCurrentSemester] = useState('2026-1')
  const [weekTopics, setWeekTopics] = useState({})

  const [evaluatedScores, setEvaluatedScores] = useState([]) 
  const [selectedItem, setSelectedItem] = useState(null) 
  const [myInfo, setMyInfo] = useState({ cluster_id: null, group_id: null })
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  const [editFeedback, setEditFeedback] = useState({
    originalMessage: '',
    insightPlus: '', insightMinus: '',
    graphicPlus: '', graphicMinus: '',
    deliveryPlus: '', deliveryMinus: '',
    memo: ''
  })

  const weeks = Array.from({ length: 12 }, (_, i) => i + 1);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login') } 
      else { 
        const currentUser = session.user;
        setUser(currentUser);
        
        await fetchSystemData();

        const { data: lastScore } = await supabase.from('scores').select('presentation_id').eq('voter_name', currentUser.user_metadata.name).order('created_at', { ascending: false }).limit(1);
        if (lastScore && lastScore.length > 0) {
          const { data: p } = await supabase.from('presentations').select('week').eq('id', lastScore[0].presentation_id).single();
          if (p) setWeek(p.week);
        } else {
          const { data: latestP } = await supabase.from('presentations').select('week').order('created_at', { ascending: false }).limit(1);
          if (latestP && latestP.length > 0) setWeek(latestP[0].week);
        }
      }
    }
    init()
  }, [])

  const fetchSystemData = async () => {
    const { data: configData } = await supabase.from('pr_config').select('*')
    if (configData) {
      const sem = configData.find(c => c.key === 'current_semester')?.value
      const topics = configData.find(c => c.key === 'week_topics')?.value
      if (sem) setCurrentSemester(sem)
      if (topics) setWeekTopics(JSON.parse(topics))
    }
  }

  useEffect(() => { if (user?.user_metadata?.name) fetchMyData() }, [user, week])

  const fetchMyData = async () => {
    setLoading(true)
    const userName = user.user_metadata.name;
    const { data: pAll } = await supabase.from('presentations').select('*').eq('week', week).order('order_index', { ascending: true });
    if (!pAll || pAll.length === 0) { setEvaluatedScores([]); setLoading(false); return; }

    const me = pAll.find(p => p.presenter_name === userName);
    setMyInfo({ cluster_id: me?.cluster_id, group_id: me?.group_id });

    const { data: sData } = await supabase.from('scores').select('*').eq('voter_name', userName);
    const clusterMembers = pAll.filter(p => p.cluster_id === me?.cluster_id && p.presenter_name !== userName);
    
    const combined = clusterMembers.map(p => {
      const scoreRecord = sData?.find(s => s.presentation_id === p.id);
      return {
        id: scoreRecord?.id || null, 
        presentation_id: p.id,
        presenter_info: p,
        is_submitted: scoreRecord?.is_submitted || false,
        total_score: scoreRecord?.total_score || 0,
        details: scoreRecord?.details || {}
      };
    });
    setEvaluatedScores(combined);

    if (selectedItem) {
      const current = combined.find(c => c.presentation_id === selectedItem.presentation_id);
      if (current) setSelectedItem(current);
    } else if (combined.length > 0) {
      selectRecord(combined[0]);
    }
    setLoading(false)
  }

  const selectRecord = (item) => {
    setSelectedItem(item)
    const qual = item.details?.qualitative || {}
    setEditFeedback({
      originalMessage: qual.originalMessage || '',
      insightPlus: qual.insightPlus || '', insightMinus: qual.insightMinus || '',
      graphicPlus: qual.graphicPlus || '', graphicMinus: qual.graphicMinus || '',
      deliveryPlus: qual.deliveryPlus || '', deliveryMinus: qual.deliveryMinus || '',
      memo: qual.memo || ''
    })
  }

  const handleUpdate = async () => {
    if (!selectedItem) return
    
    setUpdating(true)
    const updatedDetails = { ...selectedItem.details, qualitative: editFeedback }

    try {
      if (selectedItem.id) {
        const { error } = await supabase.from('scores').update({ is_submitted: false, details: updatedDetails }).eq('id', selectedItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('scores').insert([{
            presentation_id: selectedItem.presentation_id,
            voter_name: user.user_metadata.name,
            total_score: 0,
            is_submitted: false,
            details: { version: 'v1', qualitative: editFeedback }
          }]);
        if (error) throw error;
      }
      alert("영상 댓글용 피드백이 안전하게 저장됐어! 📝✨");
      await fetchMyData(); 
    } catch (err) {
      alert("저장 실패: " + err.message);
    } finally {
      setUpdating(false);
    }
  }

  const handleAutoSaveMemo = async (newMemo) => {
    if (!selectedItem) return;
    const updatedDetails = { ...selectedItem.details, qualitative: { ...editFeedback, memo: newMemo } };
    if (selectedItem.id) {
      await supabase.from('scores').update({ details: updatedDetails, is_submitted: false }).eq('id', selectedItem.id);
    } else {
      await supabase.from('scores').insert([{
        presentation_id: selectedItem.presentation_id,
        voter_name: user.user_metadata.name,
        total_score: 0,
        is_submitted: false,
        details: { version: 'v1', qualitative: { ...editFeedback, memo: newMemo } }
      }]);
    }
  }

  if (!user) return <div className="p-8 text-center font-bold text-slate-400">데이터 로딩 중...</div>
  const isSameGroup = selectedItem?.presenter_info?.group_id === myInfo.group_id;

  return (
    <div className="bg-slate-50 min-h-screen text-slate-900 font-sans pb-32">
      
      {/* 🌟 1. 투표 전용 가로형 탭 네비게이션 (1600px) */}
      <header className="border-b border-slate-300 bg-slate-50 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto flex items-end px-6 pt-4 overflow-x-auto no-scrollbar">
          <Link href="/home" className="pb-4 pr-6 text-sm font-extrabold text-slate-400 hover:text-teal-800 transition-colors flex items-center shrink-0">
            HOME
          </Link>
          <div className="w-px h-4 bg-slate-300 mx-2 mb-4 shrink-0"></div>
          <Link href="/vote/score" className="pb-4 px-6 text-sm font-semibold text-slate-400 hover:text-slate-800 transition-colors shrink-0">
            발표 채점 📝
          </Link>
          <Link href="/vote/feedback" className="pb-4 px-6 text-sm font-extrabold text-teal-800 border-b-[3px] border-teal-800 transition-colors shrink-0">
            임시저장 피드백 ✍️
          </Link>
          <Link href="/vote/results/my" className="pb-4 px-6 text-sm font-semibold text-slate-400 hover:text-slate-800 transition-colors shrink-0">
            결과 확인 📊
          </Link>
          <Link href="/vote/results/arxiv" className="pb-4 px-6 text-sm font-semibold text-slate-400 hover:text-slate-800 transition-colors shrink-0">
            피드백 확인 💬
          </Link>
          <Link href="/vote/results/ranking" className="pb-4 px-6 text-sm font-semibold text-slate-400 hover:text-slate-800 transition-colors shrink-0">
            베스트 프레젠터 🏆
          </Link>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-6 mt-12">
        
        {/* 🌟 2. 헤더 구역 (중앙 정렬, 선 기반) */}
        <header className="w-full mb-16 flex flex-col items-center">
          
          <div className="w-full flex justify-end items-center mb-6">
            <div className="flex items-center gap-3">
              {currentSemester && <span className="text-[11px] font-black text-teal-800 uppercase tracking-widest">{currentSemester}</span>}
              <span className="w-px h-3 bg-slate-400"></span>
              <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">DRAFT ROOM</span>
              <span className="w-px h-3 bg-slate-400"></span>
              <span className="text-[11px] font-black text-teal-600 uppercase tracking-widest">C#{myInfo.cluster_id} / G#{myInfo.group_id}</span>
            </div>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-extrabold uppercase text-teal-900 tracking-tight mb-12 text-center">Feedback Draft Room</h1>
          
          <div className="w-full border-y-2 border-teal-800 py-10 flex flex-col items-center">
            <span className="text-xs font-extrabold text-teal-700 uppercase tracking-widest mb-6">Select Active Week</span>
            
            <div className="flex flex-wrap justify-center gap-4 md:gap-6 mb-10 w-full max-w-4xl">
              {weeks.map((w) => (
                <button 
                  key={w} 
                  onClick={() => setWeek(w)} 
                  className={`pb-1 text-base md:text-lg font-black transition-all ${week === w ? 'text-teal-800 border-b-[3px] border-teal-800 scale-110' : 'text-slate-400 border-b-[3px] border-transparent hover:text-slate-700 hover:scale-105'}`}
                >
                  W{w}
                </button>
              ))}
            </div>
            
            <div className="flex flex-col items-center">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Target Topic</span>
              <p className="text-2xl font-extrabold text-slate-900">{weekTopics[week] || "자유 주제"}</p>
            </div>
          </div>
        </header>

        {/* 🌟 3. 레이아웃: [좌] 명단 사이드바 / [우] 작성 폼 */}
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] xl:grid-cols-[350px_1fr] gap-12 items-start">
          
          {/* [좌] 대상 명단 사이드바 (상자 제거, 선 기반) */}
          <aside className="w-full sticky top-24 pt-2">
            <h3 className="text-xs font-black text-slate-400 uppercase mb-6 border-b border-slate-300 pb-3 tracking-widest">My Target List</h3>
            <div className="space-y-1">
              {evaluatedScores.map((item) => (
                <button 
                  key={item.presentation_id} 
                  onClick={() => selectRecord(item)} 
                  className="w-full flex items-center justify-between py-4 border-b border-slate-200 last:border-0 group transition-colors hover:bg-slate-50 px-2"
                >
                  <div className="flex items-center gap-4">
                    <span className={`text-base font-extrabold truncate transition-colors ${selectedItem?.presentation_id === item.presentation_id ? 'text-teal-800' : 'text-slate-500 group-hover:text-slate-800'}`}>
                      {item.presenter_info?.presenter_name}
                    </span>
                    {item.presenter_info?.group_id === myInfo.group_id && <span className="text-[10px] text-teal-500">★</span>}
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">W{item.presenter_info?.week}</span>
                </button>
              ))}
              {evaluatedScores.length === 0 && <p className="text-xs text-slate-400 font-bold text-center py-6 border-b border-slate-200">이번 주차 평가 대상이 없습니다.</p>}
            </div>
          </aside>

          {/* [우] 피드백 폼 (상자 제거, 선 기반) */}
          <div className="w-full space-y-12 max-w-4xl mx-auto">
            {!selectedItem ? (
              <div className="text-center py-24 border-y border-slate-300 font-bold text-slate-400 text-xl tracking-widest uppercase">
                좌측에서 대상을 선택해 주세요.
              </div>
            ) : (
              <div className="space-y-12 relative">
                
                <div className="flex justify-between items-end border-b-[3px] border-slate-900 pb-6 mb-12">
                  <div>
                    <h2 className="text-4xl font-black text-teal-800 tracking-tight">{selectedItem.presenter_info?.presenter_name} 님</h2>
                    <p className="text-sm text-slate-500 font-bold mt-2">Topic: {selectedItem.presenter_info?.topic}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-[10px] font-black uppercase mb-1.5 tracking-widest ${isSameGroup ? 'text-teal-600' : 'text-slate-400'}`}>
                      {isSameGroup ? 'Detail Feedback' : 'Simple Memo'}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-1 inline-block">Draft Box</p>
                  </div>
                </div>

                <div className="space-y-10">
                  {isSameGroup ? (
                    <>
                      <div>
                        <label className="text-xs font-black text-slate-500 uppercase tracking-widest block mb-3">Original Message</label>
                        <input 
                          type="text" 
                          value={editFeedback.originalMessage} 
                          onChange={(e)=>setEditFeedback({...editFeedback, originalMessage: e.target.value})} 
                          className="w-full border-b-[3px] border-slate-300 py-3 text-base font-bold outline-none focus:border-teal-700 bg-transparent placeholder:text-slate-300 transition-colors" 
                          placeholder="발표를 들으며 핵심 메시지를 미리 기록해 보세요." 
                        />
                      </div>
                      <FeedbackSection title="1. Insight" subtitle="독창성, 적합성" plusVal={editFeedback.insightPlus} minusVal={editFeedback.insightMinus} onPlusChange={(v)=>setEditFeedback({...editFeedback, insightPlus: v})} onMinusChange={(v)=>setEditFeedback({...editFeedback, insightMinus: v})} />
                      <FeedbackSection title="2. Graphic" subtitle="가독성, 가시성" plusVal={editFeedback.graphicPlus} minusVal={editFeedback.graphicMinus} onPlusChange={(v)=>setEditFeedback({...editFeedback, graphicPlus: v})} onMinusChange={(v)=>setEditFeedback({...editFeedback, graphicMinus: v})} />
                      <FeedbackSection title="3. Delivery" subtitle="목소리, 흐름" plusVal={editFeedback.deliveryPlus} minusVal={editFeedback.deliveryMinus} onPlusChange={(v)=>setEditFeedback({...editFeedback, deliveryPlus: v})} onMinusChange={(v)=>setEditFeedback({...editFeedback, deliveryMinus: v})} />
                      
                      <div className="pt-12 border-t-[3px] border-slate-900 mt-16">
                        <button 
                          onClick={handleUpdate} 
                          disabled={updating} 
                          className="w-full max-w-sm mx-auto block py-5 border-[3px] border-teal-800 text-teal-900 font-black text-xl uppercase tracking-widest hover:bg-teal-800 hover:text-white transition-all active:scale-95"
                        >
                          {updating ? '저장 중...' : '임시 저장하기 💾'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div>
                      <label className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 block">Evaluation Memo</label>
                      <textarea 
                        value={editFeedback.memo || ''} 
                        onChange={(e)=>setEditFeedback({...editFeedback, memo: e.target.value})} 
                        onBlur={(e)=>handleAutoSaveMemo(e.target.value)}
                        className="w-full border-y-[3px] border-slate-200 py-6 text-base font-medium min-h-[500px] outline-none focus:border-slate-400 transition-colors placeholder:text-slate-300 resize-none bg-transparent leading-relaxed" 
                        placeholder="이 발표자에 대해 자유롭게 메모를 남겨주세요. (입력 시 자동 저장됩니다)" 
                      />
                    </div>
                  )}
                </div>
                
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// 🌟 얇은 컬러 밑줄 기반 텍스트 에어리어 (score 탭 완벽 동기화)
function FeedbackSection({ title, subtitle, plusVal, minusVal, onPlusChange, onMinusChange }) {
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <p className="text-sm font-black text-slate-800 uppercase tracking-widest">{title}</p>
        <p className="text-[10px] font-bold text-slate-400 mb-0.5">{subtitle}</p>
      </div>
      <div className="flex flex-col gap-4">
        <textarea 
          value={plusVal} 
          onChange={(e)=>onPlusChange(e.target.value)} 
          className="w-full border-b-[3px] border-emerald-400 py-2 px-1 text-sm font-bold min-h-[50px] outline-none focus:border-emerald-700 transition-colors bg-transparent placeholder:text-slate-300 placeholder:font-medium resize-none" 
          placeholder="(+) 장점 및 인상 깊었던 점" 
        />
        <textarea 
          value={minusVal} 
          onChange={(e)=>onMinusChange(e.target.value)} 
          className="w-full border-b-[3px] border-red-400 py-2 px-1 text-sm font-bold min-h-[50px] outline-none focus:border-red-700 transition-colors bg-transparent placeholder:text-slate-300 placeholder:font-medium resize-none" 
          placeholder="(-) 아쉬운 점 및 개선 아이디어" 
        />
      </div>
    </div>
  )
}