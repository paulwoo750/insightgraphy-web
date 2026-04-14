'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function FeedbackArxiv() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  
  const [allPresentations, setAllPresentations] = useState([]) 
  const [myPresentations, setMyPresentations] = useState([]) 
  const [selectedP, setSelectedP] = useState(null) 
  
  const [receivedFeedbacks, setReceivedFeedbacks] = useState([]) 
  const [selfFeedbacks, setSelfFeedbacks] = useState([]) 
  
  const [semesters, setSemesters] = useState([])
  const [selectedSemester, setSelectedSemester] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }
      setUser(session.user)
      const userName = session.user.user_metadata.name

      const [pRes, configRes] = await Promise.all([
        supabase.from('presentations').select('*').eq('presenter_name', userName).order('week', { ascending: false }),
        supabase.from('pr_config').select('*').eq('key', 'current_semester').single()
      ])

      const pData = pRes.data || []
      const adminCurrentSemester = configRes.data?.value

      setAllPresentations(pData)

      let uniqueSemesters = [...new Set(pData.map(p => p.semester).filter(Boolean))]
      if (adminCurrentSemester && !uniqueSemesters.includes(adminCurrentSemester)) {
        uniqueSemesters.push(adminCurrentSemester)
      }
      uniqueSemesters = uniqueSemesters.sort().reverse()
      setSemesters(uniqueSemesters)

      let initialSem = 'all'
      if (adminCurrentSemester && uniqueSemesters.includes(adminCurrentSemester)) {
        initialSem = adminCurrentSemester
      } else if (uniqueSemesters.length > 0) {
        initialSem = uniqueSemesters[0]
      }
      
      setSelectedSemester(initialSem)
      setLoading(false)
    }
    init()
  }, [router])

  useEffect(() => {
    if (allPresentations.length === 0) return

    const filtered = selectedSemester === 'all' 
      ? allPresentations 
      : allPresentations.filter(p => p.semester === selectedSemester)
    
    setMyPresentations(filtered)
    
    if (filtered.length > 0) {
      fetchFeedbacks(filtered[0])
    } else {
      setSelectedP(null)
      setReceivedFeedbacks([])
      setSelfFeedbacks([])
    }
  }, [selectedSemester, allPresentations])

  const fetchFeedbacks = async (presentation) => {
    setSelectedP(presentation)
    
    const { data: fileData } = await supabase
      .from('files_metadata')
      .select('id')
      .eq('uploader', presentation.presenter_name)
      .eq('week', presentation.week)
      .eq('semester', presentation.semester)
      .eq('file_category', 'video')
      .single()

    if (fileData) {
      const { data: commentData } = await supabase
        .from('file_comments')
        .select('*')
        .eq('file_id', fileData.id)
        .order('created_at', { ascending: true })

      if (commentData) {
        const selfFbs = commentData.filter(c => c.user_name === presentation.presenter_name)
        setSelfFeedbacks(selfFbs)

        const peerFbs = commentData.filter(c => 
          c.user_name !== presentation.presenter_name && 
          c.details?.is_read === true
        )
        setReceivedFeedbacks(peerFbs)
      } else {
        setSelfFeedbacks([])
        setReceivedFeedbacks([])
      }
    } else {
      setSelfFeedbacks([])
      setReceivedFeedbacks([])
    }
  }

  if (loading) return <div className="p-8 text-center font-black text-black">데이터 로딩 중... 🔄</div>

  return (
    <div className="bg-slate-50 min-h-screen text-slate-900 font-sans pb-32">
      
      {/* 투표 전용 가로형 탭 네비게이션 */}
      <header className="border-b border-slate-300 bg-slate-50 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto flex items-end px-6 pt-4 overflow-x-auto no-scrollbar">
          <Link href="/home" className="pb-4 pr-6 text-sm font-extrabold text-slate-400 hover:text-teal-800 transition-colors flex items-center shrink-0">HOME</Link>
          <div className="w-px h-4 bg-slate-300 mx-2 mb-4 shrink-0"></div>
          <Link href="/vote/score" className="pb-4 px-6 text-sm font-semibold text-slate-400 hover:text-slate-800 transition-colors shrink-0">발표 채점 📝</Link>
          <Link href="/vote/feedback" className="pb-4 px-6 text-sm font-semibold text-slate-400 hover:text-slate-800 transition-colors shrink-0">임시저장 피드백 ✍️</Link>
          <Link href="/vote/results/my" className="pb-4 px-6 text-sm font-semibold text-slate-400 hover:text-slate-800 transition-colors shrink-0">결과 확인 📊</Link>
          <Link href="/vote/results/arxiv" className="pb-4 px-6 text-sm font-extrabold text-teal-800 border-b-[3px] border-teal-800 transition-colors shrink-0">피드백 확인 💬</Link>
          <Link href="/vote/results/ranking" className="pb-4 px-6 text-sm font-semibold text-slate-400 hover:text-slate-800 transition-colors shrink-0">베스트 프레젠터 🏆</Link>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-6 mt-12">
        
        {/* 🌟 헤더 (중앙 정렬, 선 기반) */}
        <header className="w-full flex flex-col items-center mb-16">
          <div className="w-full flex justify-end items-center mb-6">
            <div className="flex items-center gap-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Target Semester:</label>
              <select 
                value={selectedSemester} 
                onChange={(e) => setSelectedSemester(e.target.value)}
                className="bg-transparent font-black text-sm outline-none cursor-pointer text-teal-800 border-b-2 border-teal-800 pb-1"
              >
                <option value="all">전체 누적 기록</option>
                {semesters.map(s => <option key={s} value={s}>{s} 학기</option>)}
              </select>
            </div>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-extrabold uppercase tracking-tight text-teal-900 mb-2">MY GROWTH RECORD</h1>
          <p className="text-[11px] font-black text-slate-400 mt-4 tracking-widest uppercase">확인 완료된 조원 피드백 & 내 셀프 피드백 보관소</p>
        </header>

        <div className="flex flex-col lg:flex-row justify-center items-start gap-12">
          
          {/* [좌] 발표 리스트 사이드바 (상자 제거, 선 리스트) */}
          <aside className="w-full lg:w-72 shrink-0">
            <div className="sticky top-24 pt-2">
              <h3 className="text-xs font-black text-slate-400 uppercase mb-6 border-b border-slate-300 pb-3 tracking-widest">
                My Presentations
              </h3>
              {myPresentations.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 border-b border-slate-200 font-bold">선택한 학기에 발표 기록이 없습니다.</p>
              ) : (
                <div className="space-y-1">
                  {myPresentations.map((p) => (
                    <button 
                      key={p.id} 
                      onClick={() => fetchFeedbacks(p)}
                      className="w-full flex items-center justify-between py-4 border-b border-slate-200 last:border-0 group transition-colors px-1"
                    >
                      <div className="flex flex-col items-start gap-1 text-left">
                        <span className="text-[10px] font-bold opacity-60 uppercase text-slate-500 tracking-wider">{p.semester} / W{p.week}</span>
                        <p className={`text-sm font-extrabold truncate w-48 ${selectedP?.id === p.id ? 'text-teal-800' : 'text-slate-600 group-hover:text-slate-900'}`}>{p.topic}</p>
                      </div>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 border ${selectedP?.id === p.id ? 'border-teal-800 text-teal-800 bg-teal-50' : 'border-slate-300 text-slate-400'}`}>G{p.group_id}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>

          {/* [우] 피드백 본문 영역 */}
          <main className="flex-1 w-full space-y-12 pb-32 max-w-4xl">
            {!selectedP ? (
              <div className="py-24 text-center border-y border-slate-300 font-bold text-slate-400 text-xl tracking-widest uppercase">
                좌측에서 발표 주차를 선택해 주세요.
              </div>
            ) : (
              <>
                {/* 선택된 발표 정보 (상단 박스 제거, 선 기반) */}
                <div className="border-b-[3px] border-slate-900 pb-6 flex flex-col sm:flex-row justify-between sm:items-end gap-6">
                  <div>
                    <span className="text-[10px] font-black text-teal-700 uppercase tracking-widest block mb-2">
                      {selectedP.semester} / W{selectedP.week}
                    </span>
                    <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">{selectedP.topic}</h2>
                  </div>
                  <div className="flex gap-6 text-right pb-1">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Self Feedback</p>
                      <p className="text-2xl font-black text-teal-800">{selfFeedbacks.length} <span className="text-sm text-slate-400">건</span></p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Peer Feedback</p>
                      <p className="text-2xl font-black text-slate-700">{receivedFeedbacks.length} <span className="text-sm text-slate-400">건</span></p>
                    </div>
                  </div>
                </div>

                <div className="space-y-16">
                  
                  {/* 셀프 피드백 섹션 */}
                  <section>
                    <h3 className="text-sm font-extrabold text-teal-800 mb-6 uppercase tracking-widest">
                      📝 My Self-Feedback
                    </h3>
                    <div className="space-y-8">
                      {selfFeedbacks.length === 0 ? (
                        <div className="py-12 border-y border-slate-200">
                          <p className="text-slate-400 font-bold text-sm">작성한 셀프 피드백이 없습니다.</p>
                        </div>
                      ) : (
                        selfFeedbacks.map((fb, idx) => (
                          <FeedbackCard key={fb.id} index={idx + 1} data={fb.details} isSelf={true} date={fb.created_at} />
                        ))
                      )}
                    </div>
                  </section>

                  {/* 조원 피드백 섹션 */}
                  <section>
                    <h3 className="text-sm font-extrabold text-slate-800 mb-6 uppercase tracking-widest">
                      🤝 Checked Peer Feedbacks
                    </h3>
                    <div className="space-y-8">
                      {receivedFeedbacks.length === 0 ? (
                        <div className="py-12 border-y border-slate-200 space-y-2">
                          <p className="text-slate-500 font-bold">아직 확인을 완료한 조원 피드백이 없습니다.</p>
                          <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">※ Video Room 영상에 달린 댓글을 '읽음' 처리하면 이곳으로 이관됩니다.</p>
                        </div>
                      ) : (
                        receivedFeedbacks.map((fb, idx) => (
                          <FeedbackCard key={fb.id} index={idx + 1} data={fb.details} isSelf={false} date={fb.created_at} />
                        ))
                      )}
                    </div>
                  </section>

                </div>
              </>
            )}
          </main>

        </div>
      </div>
    </div>
  )
}

// 🌟 피드백 카드 (박스 제거, 굵은 윗선과 얇은 밑선으로 영역 구분)
function FeedbackCard({ index, data, isSelf, date }) {
  if (!data) return null;
  const d = date ? new Date(date) : null;
  const dateStr = d ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';

  return (
    <div className={`border-t-[3px] pt-6 pb-10 ${isSelf ? 'border-teal-700' : 'border-slate-800'}`}>
      
      <div className="flex justify-between items-end border-b border-slate-200 pb-4 mb-6">
        <div className="flex items-center gap-3">
          <span className={`text-[11px] font-black w-5 h-5 flex items-center justify-center rounded-sm text-white ${isSelf ? 'bg-teal-700' : 'bg-slate-800'}`}>{index}</span>
          <p className={`text-xs font-black uppercase tracking-widest ${isSelf ? 'text-teal-800' : 'text-slate-700'}`}>
            {isSelf ? 'My Reflection' : 'Peer Feedback'}
          </p>
        </div>
        <span className="text-[10px] font-bold text-slate-400 tracking-wider">{dateStr}</span>
      </div>

      <div className="space-y-8">
        {data.originalMessage && (
          <div>
            <label className={`text-[10px] font-black uppercase tracking-widest mb-2 block ${isSelf ? 'text-teal-700' : 'text-slate-500'}`}>Original Message</label>
            <p className="text-[13px] font-medium text-slate-800 bg-white border border-slate-200 p-5 rounded-sm leading-relaxed shadow-sm">{data.originalMessage}</p>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6 pt-2 border-t border-slate-100">
          <FeedbackDetail title="Insight" plus={data.insightPlus} minus={data.insightMinus} />
          <FeedbackDetail title="Graphic" plus={data.graphicPlus} minus={data.graphicMinus} />
          <FeedbackDetail title="Delivery" plus={data.deliveryPlus} minus={data.deliveryMinus} />
        </div>
      </div>
    </div>
  )
}

// 🌟 디테일 섹션 (심플한 선과 라벨 위주)
function FeedbackDetail({ title, plus, minus }) {
  return (
    <div className="space-y-4">
      <p className="text-[11px] font-extrabold text-slate-900 border-l-2 border-slate-900 pl-2 uppercase tracking-widest">{title}</p>
      <div className="space-y-3">
        {plus && (
          <div className="border-l border-emerald-300 pl-3">
            <p className="text-[10px] font-black text-emerald-600 mb-1">(+)</p>
            <p className="text-[11px] font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">{plus}</p>
          </div>
        )}
        {minus && (
          <div className="border-l border-red-300 pl-3">
            <p className="text-[10px] font-black text-red-500 mb-1">(-)</p>
            <p className="text-[11px] font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">{minus}</p>
          </div>
        )}
      </div>
    </div>
  )
}