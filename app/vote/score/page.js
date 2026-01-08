'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const CRITERIA_DATA = {
  // 1. 인사이트 세부 기준
  i1: [
    { s: 10, t: "원메시지가 하나로 명확하고 타겟된 청중이 일관되며 발표 목적이 완벽하다." },
    { s: 8, t: "발표의 일부 내용이 주제와 직접적인 관련성이 다소 떨어진다." },
    { s: 6, t: "전체 주제는 파악이 되나, 원메시지가 모호하거나 명확하지 않다." },
    { s: 4, t: "전체 주제가 파악이 어려워지며 메시지를 알 수 없다." },
    { s: 2, t: "내용이 광범위하여 여러 주제가 나열되어 원메시지가 무엇인지 파악하기 어렵다." },
    { s: 0, t: "발표의 주제가 무엇인지 알 수 없고 주제와 동떨어진 발표를 한다." }
  ],
  i2: [ 
    { s: 10, t: "구조가 명확하며 주장에 대한 근거가 구체적이어서 반박의 여지가 없다." },
    { s: 8, t: "전체 구조는 논리적이나 일부 주장에 대한 근거가 부족하거나 연결이 부자연스럽다." },
    { s: 6, t: "주장을 제시하나 근거가 불충분하거나 주장과 근거 사이의 논리적 연결성이 떨어진다." },
    { s: 4, t: "이야기의 흐름이 자주 끊기고 근거가 불충분하다." },
    { s: 2, t: "전체 내용이 순서가 뒤섞여 있으며 주장만 있고 근거가 미흡하다." },
    { s: 0, t: "일관된 구조가 없고, 생각의 나열일 뿐이다." } 
  ],
  i3: [ 
    { s: 10, t: "문제의 원인, 구조, 맥락을 다각적으로 심층 분석하여 새로운 시각을 제공한다." },
    { s: 8, t: "주제에 대해 깊이 고민하였으며, 다각적이지는 않지만 이면에 있는 의미를 분석하려고 한다." },
    { s: 6, t: "주제를 하나의 시선으로 보며 의미를 분석하고 있다." },
    { s: 4, t: "주제와 관련된 사실과 데이터를 제시하나 대부분 이미 알려진 정보의 재구성한 수준이다." },
    { s: 2, t: "주제의 표면적인 정보만 다루며 대부분이 개인의 추측이나 의견에 불과하다." },
    { s: 0, t: "주제에 대한 이해가 부족해 보이며, 내용의 깊이가 느껴지지 않는다." } 
  ],
  i4: [ 
    { s: 10, t: "기존의 틀을 깨는 참신한 관점 혹은 문제에 대한 현실적이고 창의적인 해결책을 제안한다." },
    { s: 8, t: "기존의 관점을 자신만의 방식으로 재해석하거나 여러 아이디어를 융합하였다." },
    { s: 6, t: "새로운 관점 혹은 해결책을 제시하였으나 원래 있던 아이디어를 응용한 수준에 불과하다." },
    { s: 4, t: "제시된 관점이나 주장이 일반적이거나 예측 가능한 범위이다." },
    { s: 2, t: "다른 사람의 의견이나 기존 자료를 그대로 반복하는 수준이다." },
    { s: 0, t: "자신만의 생각이나 관점을 찾을 수 없다." } 
  ],
  
  // 2. 그래픽 세부 기준
  g1: [ 
    { s: 10, t: "모든 슬라이드가 쉽게 읽힐 만큼 명확하며, 배경과 요소가 뚜렷하게 대비된다." },
    { s: 8, t: "전반적으로 내용을 식별 가능하나, 일부 슬라이드에서 폰트나 이미지의 해상도가 다소 낮다." },
    { s: 6, t: "글자가 너무 많거나 요소들이 겹쳐 있어 한눈에 파악하기에는 다소 노력이 필요하다." },
    { s: 4, t: "글자 크기가 작거나 색상 대비가 낮아 상당수의 텍스트나 차트의 내용을 알아보기 힘들다." },
    { s: 2, t: "이미지 품질이 매우 낮거나, 전반적으로 너무 어둡거나 복잡하여 내용을 식별하기 어렵다." },
    { s: 0, t: "눈이 아플 정도로 슬라이드가 어지럽거나 배치 및 구조가 엉망이다." } 
  ],
  g2: [ 
    { s: 10, t: "자료 전체에서 색상, 글꼴, 로고, 레이아웃 등이 일관되어 전문적이고 통일감 있다." },
    { s: 8, t: "정해진 디자인을 사용하나, 일부 슬라이드에서 글꼴이나 색상의 일관성이 깨진다." },
    { s: 6, t: "통일감은 있으나, 슬라이드마다 레이아웃 혹은 디자인 요소가 조금씩 달라 산만하다." },
    { s: 4, t: "슬라이드마다 사용된 색상, 글꼴, 스타일이 제각각이라 통일성이 없으며, 디자인이 조잡하다." },
    { s: 2, t: "부적절한 색 조합, 너무 많은 종류의 글꼴 사용 등 디자인 요소들이 내용 전달을 방해한다." },
    { s: 0, t: "디자인에 대한 고려가 전혀 없다." } 
  ],
  g3: [ 
    { s: 10, t: "복잡한 데이터나 추상적 개념을 독창적인 시각자료로 시각화하며, 모든 이미지가 메세지를 뒷받침한다." },
    { s: 8, t: "내용과 관련된 시각 자료를 적절히 사용하였으며, 발표 내용 이해에 실질적인 도움을 준다." },
    { s: 6, t: "시각 자료가 쓰였으나, 내용과 직접적이지 않은 장식용 이미지이거나, 차트가 복잡하여 해석하기 어렵다." },
    { s: 4, t: "의미 없는 클립아트나 이미지를 남발하여 산만하거나 메세지와 전혀 관련이 없다." },
    { s: 2, t: "창의적인 시각 자료가 메세지 전달을 왜곡하거나 심각하게 방해한다." },
    { s: 0, t: "창의롭거나 시각 자료가 전혀 사용되지 않았다." } 
  ],
  
  // 3. 딜리버리 세부 기준
  d1: [ 
    { s: 10, t: "발음이 명확하고, 목소리 크기가 적절하며, 내용에 맞게 말의 빠르기와 어조를 조절한다." },
    { s: 8, t: "발음이 명확하고, 목소리 크기도 적절하나, 다소 단조로운 톤이거나 약간의 습관어가 사용된다." },
    { s: 6, t: "목소리가 작거나, 말이 빠르거나 느려 내용을 놓치기 쉽다. 습관어가 간혹 사용되어 의식된다." },
    { s: 4, t: "목소리가 너무 작거나, 웅얼거리는 발음으로 인해 내용을 이해하기 어렵다." },
    { s: 2, t: "상당 부분에서 발음이 안 들리거나, 습관어를 과도히 사용하여 내용 전달을 방해한다." },
    { s: 0, t: "발표를 거의 진행하지 못하거나, 전혀 알아들을 수 없다." }
  ],
  d2: [ 
    { s: 10, t: "안정적이고 자신감 있는 자세를 유지하며, 자연스럽고 의미있는 제스처를 사용한다." },
    { s: 8, t: "자세는 안정적이나, 제스처 사용이 다소 적거나 어색한 부분이 있다." },
    { s: 6, t: "한 곳에 뻣뻣하게 서 있거나, 의미 없이 몸을 흔드는 등 불안정해 보이는 습관이 있다." },
    { s: 4, t: "주머니에 손을 넣거나 팔짱을 끼는 등의 자세, 시선이 바닥이나 천장을 향하는 경우가 잦다." },
    { s: 2, t: "몸을 심하게 흔들거나 화면을 등지는 등, 청중의 집중을 매우 심하게 방해하는 행동을 반복한다." },
    { s: 0, t: "발표에 임하는 태도가 전혀 갖춰져 있지 않다." }
   ],
  d3: [ 
    { s: 10, t: "발표 내내 청중 전체와 고르게 시선을 맞추며, 마치 대화하듯 자연스럽게 발표를 이끌어간다." },
    { s: 8, t: "청중과 시선을 맞추려고 노력하지만, 자주 스크린이나 대본으로 시선이 돌아간다." },
    { s: 6, t: "대부분의 시간을 스크린이나 대본을 보고 발표하며, 청중과는 간헐적으로 시선을 맞춘다." },
    { s: 4, t: "발표 내내 청중과 거의 시선을 맞추지 않아, 일방적으로 정보를 낭독하는 느낌을 준다." },
    { s: 2, t: "시종일관 대본만 보고 읽어 청중과의 소통을 완전히 차단한다." },
    { s: 0, t: "청중을 전혀 의식하지 않고 발표한다." }
  ],
  
  // 4. 상호보완성 (5점 만점)
  c1: [
    { s: 5, t: "모든 요소가 완벽하게 조화되어 시너지를 발휘한다." },
    { s: 0, t: "상호보완적인 요소가 전혀 보이지 않는다." }
  ]
};

export default function ScorePage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [presentations, setPresentations] = useState([]) 
  const [selectedPid, setSelectedPid] = useState('')
  const [week, setWeek] = useState(1) 
  const [submitting, setSubmitting] = useState(false)

  const [scores, setScores] = useState({
    i1: null, i2: null, i3: null, i4: null,
    g1: null, g2: null, g3: null,
    d1: null, d2: null, d3: null,
    c1: null
  })

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login') } 
      else { setUser(session.user); fetchPresentations(); }
    }
    init()
  }, [week])

  const fetchPresentations = async () => {
    const { data } = await supabase.from('presentations').select('*').eq('week', week) 
    if (data) { setPresentations(data); setSelectedPid(''); }
  }

  const handleScoreChange = (key, val) => {
    setScores(prev => ({ ...prev, [key]: Number(val) }))
  }

  const insightTotal = scores.i1 + scores.i2 + scores.i3 + scores.i4
  const graphicTotal = scores.g1 + scores.g2 + scores.g3
  const deliveryTotal = scores.d1 + scores.d2 + scores.d3
  const complementarityTotal = scores.c1
  const grandTotal = insightTotal + graphicTotal + deliveryTotal + complementarityTotal

  const handleSubmit = async () => {
    if (!selectedPid) return alert("발표자를 선택해줘! 👤")
    setSubmitting(true)

    const { error } = await supabase.from('scores').insert([{
        presentation_id: selectedPid,
        voter_name: user.user_metadata.name,
        insight: insightTotal,
        graphic: graphicTotal,
        delivery: deliveryTotal,
        complementarity: complementarityTotal,
        total_score: grandTotal,
        details: scores 
    }])

    if (!error) {
      alert(`투표 완료! 총점 ${grandTotal}점이 기록됐어. 🏆`)
      router.push('/vote/results') 
    } else {
      alert("오류 발생: " + error.message)
    }
    setSubmitting(false)
  }

  if (!user) return <div className="p-8 text-center font-black text-black italic">로딩 중... 🔄</div>
  const currentTopic = presentations.length > 0 ? presentations[0].topic : "등록된 주제 없음"

  return (
    <div className="p-6 bg-slate-50 min-h-screen text-black font-sans flex flex-col items-center">
      <div className="w-full max-w-2xl flex justify-start mb-4">
        <Link href="/vote" className="text-blue-600 text-sm font-black hover:underline tracking-widest uppercase">← Vote Hub</Link>
      </div>

      <header className="w-full max-w-2xl text-center mb-8">
        <h1 className="text-4xl font-black text-black tracking-tighter mb-6 italic uppercase">Evaluation System</h1>
        <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl flex flex-col gap-4">
          <div className="flex justify-around items-center divide-x divide-slate-700">
            <div className="px-4 text-center">
              <span className="text-[10px] font-black text-slate-500 uppercase block mb-1">Week</span>
              <input type="number" value={week} onChange={(e) => setWeek(Number(e.target.value))} className="w-16 text-center text-4xl font-black bg-transparent outline-none text-blue-400" />
            </div>
            <div className="px-6 flex-1 text-left">
              <span className="text-[10px] font-black text-slate-500 uppercase block mb-1">Current Topic</span>
              <p className="text-xl font-black text-white leading-tight break-keep">{currentTopic}</p>
            </div>
            <div className="px-4 text-right">
              <span className="text-[10px] font-black text-slate-500 uppercase block mb-1">Evaluator</span>
              <p className="text-lg font-black text-blue-400">{user.user_metadata.name}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full max-w-2xl space-y-8 pb-32">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <label className="text-xs font-black text-black uppercase tracking-widest mb-4 block">Select Presenter</label>
          <select value={selectedPid} onChange={(e) => setSelectedPid(e.target.value)} className="w-full p-4 bg-slate-50 border-none rounded-xl font-black text-black text-2xl outline-none focus:ring-4 ring-blue-500/10">
            <option value="">발표자를 선택해줘</option>
            {presentations.map(p => <option key={p.id} value={p.id}>{p.presenter_name}</option>)}
          </select>
        </div>

        <CategoryCard title="1. 인사이트" icon="💡" total={insightTotal} max={40} color="text-blue-600">
          <EvaluationItem id="i1" label="1-1. 주제의 명료성" val={scores.i1} max={10} onChange={(v)=>handleScoreChange('i1', v)} />
          <EvaluationItem id="i2" label="1-2. 논리적 구조" val={scores.i2} max={10} onChange={(v)=>handleScoreChange('i2', v)} />
          <EvaluationItem id="i3" label="1-3. 분석의 깊이" val={scores.i3} max={10} onChange={(v)=>handleScoreChange('i3', v)} />
          <EvaluationItem id="i4" label="1-4. 독창성" val={scores.i4} max={10} onChange={(v)=>handleScoreChange('i4', v)} />
        </CategoryCard>

        <CategoryCard title="2. 그래픽" icon="🎨" total={graphicTotal} max={30} color="text-purple-600">
          <EvaluationItem id="g1" label="2-1. 명료성" val={scores.g1} max={10} onChange={(v)=>handleScoreChange('g1', v)} />
          <EvaluationItem id="g2" label="2-2. 디자인 스킬" val={scores.g2} max={10} onChange={(v)=>handleScoreChange('g2', v)} />
          <EvaluationItem id="g3" label="2-3. 창의성" val={scores.g3} max={10} onChange={(v)=>handleScoreChange('g3', v)} />
        </CategoryCard>

        <CategoryCard title="3. 딜리버리" icon="🎤" total={deliveryTotal} max={30} color="text-pink-600">
          <EvaluationItem id="d1" label="3-1. 언어적 표현" val={scores.d1} max={10} onChange={(v)=>handleScoreChange('d1', v)} />
          <EvaluationItem id="d2" label="3-2. 비언어적 표현" val={scores.d2} max={10} onChange={(v)=>handleScoreChange('d2', v)} />
          <EvaluationItem id="d3" label="3-3. 청중과의 교감" val={scores.d3} max={10} onChange={(v)=>handleScoreChange('d3', v)} />
        </CategoryCard>

        <CategoryCard title="4. 상호보완성" icon="🔗" total={complementarityTotal} max={5} color="text-emerald-600">
          <EvaluationItem id="c1" label="4-1. IGD간 상호보완성" val={scores.c1} max={5} onChange={(v)=>handleScoreChange('c1', v)} />
        </CategoryCard>

        <div className="bg-slate-900 p-8 rounded-[3rem] shadow-2xl text-white flex flex-col items-center border-4 border-blue-500/30">
          <div className="mb-6 text-center">
            <p className="text-sm font-black text-slate-500 uppercase tracking-[0.4em] mb-2">Grand Total Score</p>
            <h2 className="text-8xl font-black text-blue-400">{grandTotal}<span className="text-2xl text-slate-700 ml-3">/ 105</span></h2>
          </div>
          <button onClick={handleSubmit} disabled={submitting} className="w-full py-6 bg-blue-600 rounded-2xl font-black text-2xl hover:bg-blue-500 active:scale-95 transition-all shadow-xl">
            {submitting ? "제출 중..." : "최종 점수 제출하기 🚀"}
          </button>
        </div>
      </main>
    </div>
  )
}

function CategoryCard({ title, icon, total, max, color, children }) {
  return (
    <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200">
      <div className="flex justify-between items-center mb-8 border-b-2 border-slate-50 pb-4">
        <h3 className={`text-2xl font-black ${color}`}>{icon} {title}</h3>
        <p className="font-black text-black">Score: <span className={`text-3xl ${color}`}>{total}</span> / {max}</p>
      </div>
      <div className="space-y-12">{children}</div>
    </div>
  )
}

function EvaluationItem({ id, label, val, max, onChange }) {
  const criteria = CRITERIA_DATA[id] || []; // 항목 ID에 맞는 기준표 가져오기
  const points = Array.from({ length: max + 1 }, (_, i) => i);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center px-1">
        <span className="text-xl font-black text-black">{label}</span>
        <span className="text-xl font-black text-blue-600 bg-blue-50 px-4 py-1 rounded-xl shadow-inner border border-blue-100">{val}점</span>
      </div>

      {/* 개별 평가 기준표 테이블 */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <tbody>
            {criteria.map((item, idx) => (
              <tr key={idx} className={`border-b border-slate-200 last:border-0 ${val === item.s ? 'bg-blue-100/50' : ''}`}>
                <td className="p-3 text-[13px] font-bold text-black border-r border-slate-200 leading-tight">{item.t}</td>
                <td className="w-12 p-3 text-center text-xs font-black text-blue-600 bg-white/50">{item.s}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {points.map((p) => (
          <button key={p} onClick={() => onChange(p)} className={`flex-1 min-w-[36px] h-12 rounded-xl font-black text-lg transition-all border-2 ${val === p ? 'bg-blue-600 border-blue-600 text-white shadow-lg scale-105 z-10' : 'bg-white border-slate-200 text-black hover:border-blue-400'}`}>
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}