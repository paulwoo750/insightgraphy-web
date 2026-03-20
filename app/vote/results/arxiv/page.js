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

  // 🌟 핵심 로직: 무조건 file_comments(최종 영상 댓글)에서만 데이터를 가져옴!
  const fetchFeedbacks = async (presentation) => {
    setSelectedP(presentation)
    
    // 1. 해당 주차의 내 영상 파일(files_metadata) 찾기
    const { data: fileData } = await supabase
      .from('files_metadata')
      .select('id')
      .eq('uploader', presentation.presenter_name)
      .eq('week', presentation.week)
      .eq('semester', presentation.semester)
      .eq('file_category', 'video')
      .single()

    if (fileData) {
      // 2. 그 영상에 달린 모든 댓글(file_comments) 가져오기
      const { data: commentData } = await supabase
        .from('file_comments')
        .select('*')
        .eq('file_id', fileData.id)
        .order('created_at', { ascending: true })

      if (commentData) {
        // [조건 1] 셀프 피드백: 본인이 작성한 댓글
        const selfFbs = commentData.filter(c => c.user_name === presentation.presenter_name)
        setSelfFeedbacks(selfFbs)

        // [조건 2] 조원 피드백: 타인이 작성했고, 내가 '읽음(is_read: true)'을 누른 댓글만!
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
      // 영상 파일이 없으면 피드백도 없음
      setSelfFeedbacks([])
      setReceivedFeedbacks([])
    }
  }

  if (loading) return <div className="p-8 text-center font-black text-black">데이터 로딩 중... 🔄</div>

  return (
    <div className="p-6 bg-slate-50 min-h-screen text-black font-sans pb-32">
      <div className="max-w-[1400px] mx-auto">
        
        <header className="w-full mb-12 flex flex-col md:flex-row md:justify-between md:items-end border-b-2 border-slate-200 pb-6 gap-6">
          <div>
            <Link href="/vote" className="text-emerald-600 text-xs font-black hover:underline tracking-widest uppercase mb-4 block">← Back to Vote Hub</Link>
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter mb-2 uppercase italic">My Growth Record</h1>
            <p className="text-slate-400 font-bold text-sm">확인 완료된 조원 피드백 & 내 셀프 피드백 보관소 📂</p>
          </div>
          
          <div className="flex items-center gap-3 bg-white p-2 px-4 rounded-2xl shadow-sm border border-slate-200">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Target Semester:</label>
            <select 
              value={selectedSemester} 
              onChange={(e) => setSelectedSemester(e.target.value)}
              className="bg-transparent font-black text-sm outline-none cursor-pointer text-emerald-600"
            >
              <option value="all">전체 누적 기록</option>
              {semesters.map(s => <option key={s} value={s}>{s} 학기</option>)}
            </select>
          </div>
        </header>

        <div className="flex flex-col lg:flex-row justify-center items-start gap-10">
          
          <aside className="w-full lg:w-72 shrink-0">
            <div className="bg-slate-900 p-6 rounded-[2.5rem] text-white shadow-2xl sticky top-8 border border-slate-800">
              <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
                <span className="animate-pulse">●</span> My Presentations
              </h3>
              {myPresentations.length === 0 ? <p className="text-xs text-slate-500 text-center py-4">선택한 학기에 발표 기록이 없어요.</p> : (
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 no-scrollbar">
                  {myPresentations.map((p) => (
                    <button 
                      key={p.id} 
                      onClick={() => fetchFeedbacks(p)}
                      className={`w-full p-5 rounded-2xl text-left transition-all border-2 ${selectedP?.id === p.id ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg' : 'bg-transparent border-slate-800 text-slate-400 hover:border-slate-700'}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <p className="text-[10px] font-black opacity-60 uppercase">{p.semester} / W{p.week}</p>
                        <span className="text-[8px] bg-slate-800 px-1.5 py-0.5 rounded text-emerald-400 font-bold">Group {p.group_id}</span>
                      </div>
                      <p className="text-sm font-black leading-tight line-clamp-2">{p.topic}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>

          <main className="flex-1 w-full space-y-8 pb-32">
            {!selectedP ? (
              <div className="bg-white p-20 rounded-[3rem] text-center border-2 border-dashed border-slate-200">
                <p className="text-slate-400 font-bold font-sans">확인할 발표 주차를 왼쪽에서 선택해줘! 👈</p>
              </div>
            ) : (
              <>
                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                  <div>
                    <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-[9px] font-black uppercase mb-3 block w-fit">
                      {selectedP.semester} 학기 / {selectedP.week}주차 발표
                    </span>
                    <h2 className="text-2xl font-black text-slate-800">{selectedP.topic}</h2>
                  </div>
                  <div className="flex gap-4 text-right">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase">Self Feedback</p>
                      <p className="text-xl font-black text-blue-600">{selfFeedbacks.length} <span className="text-sm text-slate-300">건</span></p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase">Checked Peer Feedback</p>
                      <p className="text-xl font-black text-emerald-600">{receivedFeedbacks.length} <span className="text-sm text-slate-300">건</span></p>
                    </div>
                  </div>
                </div>

                <div className="space-y-12">
                  
                  <section>
                    <h3 className="text-sm font-black text-blue-600 mb-6 flex items-center gap-2 uppercase tracking-widest pl-2 border-l-4 border-blue-500">
                      📝 My Self-Feedback
                    </h3>
                    <div className="space-y-6">
                      {selfFeedbacks.length === 0 ? (
                        <div className="py-12 text-center bg-white rounded-[2rem] border border-dashed border-slate-200">
                          <p className="text-slate-400 font-bold text-sm">작성한 셀프 피드백이 없습니다.</p>
                        </div>
                      ) : (
                        selfFeedbacks.map((fb, idx) => (
                          <FeedbackCard 
                            key={fb.id} 
                            index={idx + 1} 
                            data={fb.details} 
                            isSelf={true}
                            date={fb.created_at}
                          />
                        ))
                      )}
                    </div>
                  </section>

                  <section>
                    <h3 className="text-sm font-black text-emerald-600 mb-6 flex items-center gap-2 uppercase tracking-widest pl-2 border-l-4 border-emerald-500">
                      🤝 Checked Peer Feedbacks
                    </h3>
                    <div className="space-y-6">
                      {receivedFeedbacks.length === 0 ? (
                        <div className="py-12 text-center bg-white rounded-[2.5rem] border border-slate-100">
                          <p className="text-slate-400 font-bold mb-1">아직 확인을 완료한 조원 피드백이 없어요! ✉️</p>
                          <p className="text-[10px] text-slate-300 font-bold">Video Room에서 조원이 남긴 피드백에 '읽음 확인'을 누르면 이곳으로 넘어옵니다.</p>
                        </div>
                      ) : (
                        receivedFeedbacks.map((fb, idx) => (
                          <FeedbackCard 
                            key={fb.id} 
                            index={idx + 1} 
                            data={fb.details} 
                            isSelf={false}
                            date={fb.created_at}
                          />
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

function FeedbackCard({ index, data, isSelf, date }) {
  if (!data) return null;
  const d = date ? new Date(date) : null;
  const dateStr = d ? `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';

  return (
    <div className={`bg-white p-8 rounded-[2.5rem] shadow-sm border space-y-6 relative overflow-hidden ${isSelf ? 'border-blue-100' : 'border-emerald-100'}`}>
      <div className="flex justify-between items-center border-b border-slate-50 pb-4">
        <div className="flex items-center gap-3">
          <span className={`${isSelf ? 'bg-blue-600' : 'bg-emerald-600'} text-white w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black`}>{index}</span>
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
            {isSelf ? 'My Reflection' : 'Group Member Feedback'}
          </p>
        </div>
        <span className="text-[9px] font-bold text-slate-300">{dateStr}</span>
      </div>

      <div className="space-y-6">
        {data.originalMessage && (
          <div>
            <label className={`text-[9px] font-black ${isSelf ? 'text-blue-500' : 'text-emerald-500'} uppercase tracking-tighter mb-1 block`}>● Original Message</label>
            <p className={`text-sm font-bold text-slate-700 ${isSelf ? 'bg-blue-50/30' : 'bg-emerald-50/30'} p-4 rounded-xl leading-relaxed`}>{data.originalMessage}</p>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FeedbackDetail title="Insight" plus={data.insightPlus} minus={data.insightMinus} />
          <FeedbackDetail title="Graphic" plus={data.graphicPlus} minus={data.graphicMinus} />
          <FeedbackDetail title="Delivery" plus={data.deliveryPlus} minus={data.deliveryMinus} />
        </div>
      </div>
    </div>
  )
}

function FeedbackDetail({ title, plus, minus }) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-black text-slate-800 border-l-2 border-slate-800 pl-2">{title}</p>
      <div className="space-y-2">
        {plus && (
          <div className="bg-emerald-50/50 p-3 rounded-xl">
            <p className="text-[10px] font-bold text-emerald-600 mb-1">(+)</p>
            <p className="text-[11px] font-medium text-slate-600 leading-snug whitespace-pre-wrap">{plus}</p>
          </div>
        )}
        {minus && (
          <div className="bg-red-50/50 p-3 rounded-xl">
            <p className="text-[10px] font-bold text-red-400 mb-1">(-)</p>
            <p className="text-[11px] font-medium text-slate-600 leading-snug whitespace-pre-wrap">{minus}</p>
          </div>
        )}
      </div>
    </div>
  )
}