'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// ★ 버전별 항목 이름(label)과 점수 기준(criteria) 통합 데이터 (원본 서식 유지)
const CRITERIA_DATA = {
  v1: {
    i1: { label: "1-1. 주제의 명료성", 
      criteria: 
      [
        { s: 10, t: "원 메세지가 하나로 명확하고 타겟된 청중이 일관되며 발표 목적이 완벽하다" },
        { s: 8, t: "발표의 일부 내용이 주제와 직접적인 관련성이 다소 떨어진다" },
        { s: 6, t: "전체 주제는 파악이 되나, 원메세지가 모호하거나 명확하지 않다" },
        { s: 4, t: "전체 주제가 파악이 어려워지며 메세지를 알 수 없다" },
        { s: 2, t: "내용이 광범위하여 여러 주제가 나열되어 원에메지가 무엇인지 파악하기 어렵다" }, 
        { s: 0, t: "발표의 주제가 무엇인지 알 수 없고 주제와 동떨어진 발표를 한다" }
      ] },
    i2: { label: "1-2. 논리적 구조", 
      criteria: 
      [
        { s: 10, t: "구조가 명확하며 주장에 대한 근거가 구체적이어서 반박의 여지가 없다" },
        { s: 8, t: "전체 구조는 논리적이나 일부 주장에 대한 근거가 부족하거나 연결이 부자연스럽다" },
        { s: 6, t: "주장을 제시하나 근거가 불충분하거나 주장과 근거 사이의 논리적 연결성이 떨어진다" },
        { s: 4, t: "이야기의 흐름이 자주 끊기고 근거가 불충분하다" },
        { s: 2, t: "전체 내용이 순서가 뒤섞여 있으며 주장만 있고 근거가 미흡하다" }, 
        { s: 0, t: "일관된 구조가 없고, 생각의 나열일 뿐이다" }
      ] },
    i3: { 
      label: "1-3. 분석의 깊이", 
      criteria: 
      [
        { s: 10, t: "문제의 원인, 구조, 맥락을 다각적으로 심층 분석하여 새로운 시각을 제공한다" },
        { s: 8, t: "주제에 대해 깊이 고민하였으며, 다각적이지는 않지만 이면에 있는 의미를 분석하려고 한다" },
        { s: 6, t: "주제를 하나의 시선으로 보며 의미를 분석하고 있다" },
        { s: 4, t: "주제와 관련된 사실과 데이터를 제시하나 대부분 이미 알려진 정보를 재구성한 수준이다" },
        { s: 2, t: "주제의 표면적인 정보만 다루며 대부분이 개인의 추측이나 의견에 불과하다" }, 
        { s: 0, t: "주제에 대한 이해가 부족해 보이며, 내용에 깊이가 느껴지지 않는다" }
      ] },
    i4: { label: "1-4. 독창성", 
      criteria: 
      [
        { s: 10, t: "기존의 틀을 깨는 참신한 관점 혹은 문제에 대한 현실적이고 창의적인 해결책을 제안한다" },
        { s: 8, t: "기존의 관점을 자신만의 방식으로 재해석하거나 여러 아이디어를 융합하였다" },
        { s: 6, t: "새로운 관점 혹은 해결책을 제시하였으나 원래 있던 아이디어를 응용한 수준에 불과하다" },
        { s: 4, t: "제시된 관점이나 주장이 일반적이거나 예측 가능한 범위이다" },
        { s: 2, t: "다른 사람의 의견이나 기존 자료를 그대로 반복하는 수준이다" }, 
        { s: 0, t: "자신만의 생각이나 관점을 찾을 수 없다" }
      ] },
    g1: { label: "2-1. 명료성", 
      criteria: 
      [
        { s: 10, t: "모든 슬라이드가 쉽게 읽힐 만큼 명확하며, 배경과 요소가 뚜렷하게 대비된다" },
        { s: 8, t: "전반적으로 내용을 식별 가능하나, 일부 슬라이드에서 폰트나 이미지의 해상도가 다소 낮다" },
        { s: 6, t: "글자가 너무 많거나 요소들이 겹쳐 있어 한눈에 파악하기에는 다소 노력이 필요하다" },
        { s: 4, t: "글자 크기가 작거나 색상 대비가 낮아 상당수의 텍스트나 차트의 내용을 알아보기 힘들다" },
        { s: 2, t: "이미지 품질이 매우 낮거나, 전반적으로 너무 어둡거나 복잡하여 내용을 식별하기 어렵다" }, 
        { s: 0, t: "눈이 아플 정도로 슬라이드가 어지럽거나 배치 및 구조가 엉망이다" }
      ] },
    g2: { label: "2-2. 디자인 스킬", 
      criteria: 
      [
        { s: 10, t: "자료 전체에서 색상, 글꼴, 로고, 레이아웃 등이 일관되어 전문적이고 통일감있다" },
        { s: 8, t: "정해진 디자인을 사용하나, 일부 슬라이드에서 글꼴이나 색상의 일관성이 깨진다" },
        { s: 6, t: "통일감은 있으나, 슬라이드마다 레이아웃 혹은 디자인 요소가 조금씩 달라 산만하다" },
        { s: 4, t: "슬라이드마다 사용된 색상, 글꼴, 스타일이 제각각이라 통일성이 없으며, 디자인이 조잡하다" },
        { s: 2, t: "부적절한 색 조합, 너무 많은 종류의 글꼴 사용 등 디자인 요소들이 내용 전달을 방해한다" }, 
        { s: 0, t: "디자인에 대한 고려가 전혀 없다" }
      ] },
    g3: { label: "2-3. 창의성", 
      criteria: 
      [
        { s: 10, t: "복잡한 데이터나 추상적인 개념을 독창적인 시각자료로 시각화했으며, 모든 이미지가 메세지를 뒷받침한다" },
        { s: 8, t: "내용과 관련된 시각 자료를 적절히 사용하였으며, 발표 내용 이해에 실질적인 도움을 준다" },
        { s: 6, t: "시각 자료가 쓰였으나, 내용과 직접적이지 않은 장식용 이미지이거나, 차트가 너무 복잡하여 해석하기 어렵다" },
        { s: 4, t: "의미 없는 클립아트나 이미지를 남발하여 산만하거나 메세지와 전혀 관련이 없다" },
        { s: 2, t: "창의적인 시각 자료가 메세지 전달을 왜곡하거나 심각하게 방해한다" }, 
        { s: 0, t: "창의적이지 않고 시각자료가 전혀 사용되지 않았다" }
      ] },
    d1: { label: "3-1. 언어적 표현", 
      criteria: 
      [
        { s: 10, t: "발음이 명확하고 목소리 크기가 적절하며, 내용에 맞게 말의 빠르기나 어조를 조절한다" },
        { s: 8, t: "발음이 명확하고 목소리 크기도 적절하나, 다소 단조로운 톤이거나 약간의 습관어가 사용된다" },
        { s: 6, t: "목소리가 작거나, 말이 빠르거나 느려 내용을 놓치기 쉽다. 습관어가 간혹 사용되어 의식된다" },
        { s: 4, t: "목소리가 너무 작거나, 웅얼거리는 발음으로 인해 내용을 이해하기 어렵다" },
        { s: 2, t: "상당 부분에서 발음이 안들리거나, 습관어를 과도히 사용하여 내용 전달을 방해한다" }, 
        { s: 0, t: "발표를 거의 진행하지 못하거나, 전혀 알아들을 수 없다" }
      ] },
    d2: { label: "3-2. 비언어적 표현", 
      criteria: 
      [
        { s: 10, t: "안정적이고 자신감 있는 자세를 유지하며, 자연스럽고 의미 있는 제스처를 사용한다" },
        { s: 8, t: "자세는 안정적이나, 제스처 사용이 다소 적거나 어색한 부분이 있다" },
        { s: 6, t: "한 곳에 뻣뻣하게 서 있거나, 의미 없이 몸을 흔드는 등 불안정해 보이는 습관이 있다" },
        { s: 4, t: "주머니에 손을 넣거나 팔짱을 끼는 등의 자세, 시선이 바닥이나 천장을 향하는 경우가 잦다" },
        { s: 2, t: "몸을 심하게 흔들거나 화면을 등지는 등, 청중의 집중을 매우 심하게 방해하는 행동을 반복한다" }, 
        { s: 0, t: "방표에 임하는 태도가 전혀 갖춰져 있지 않다" }
      ] },
    d3: { label: "3-3. 청중과의 교감", 
      criteria: 
      [
        { s: 10, t: "발표 내내 청중 전체와 고르게 시선을 맞추며, 마치 대화하듯 자연스럽게 발표를 이끌어간다" },
        { s: 8, t: "청중과 시선을 맞추려고 노력하지만, 자주 스크린이나 대본으로 시선이 돌아간다" },
        { s: 6, t: "대부분의 시간을 스크린이나 대본을 보고 발표하며, 청중과는 간헐적으로 시선을 맞춘다" },
        { s: 4, t: "발표 내내 청중과 거의 시선을 맞추지 않아, 일방적으로 정보를 낭독하는 느낌을 준다" },
        { s: 2, t: "시종일관 대본만 보고 읽어 청중과의 소통을 완전히 차단한다" }, 
        { s: 0, t: "청중을 전혀 의식하지 않고 발표한다" }
      ] },
    c1: { label: "4-1. IGD간 상호보완성", 
      criteria: [{ s: 5, t: "I, G, D간 상호보완성이 돋보인다" }, 
        { s: 0, t: "I, G, D간 상호 편차가 심하다" }] }
  },
  v2: {
    i1: { label: "1-1. 주제의 명료성", 
      criteria: 
      [
        { s: 10, t: "원 메세지가 하나로 명확하고 타겟된 청중이 일관되며 발표 목적이 완벽하다" },
        { s: 8, t: "발표의 일부 내용이 주제와 직접적인 관련성이 다소 떨어진다" },
        { s: 6, t: "전체 주제는 파악이 되나, 원메세지가 모호하거나 명확하지 않다" },
        { s: 4, t: "전체 주제가 파악이 어려워지며 메세지를 알 수 없다" },
        { s: 2, t: "내용이 광범위하여 여러 주제가 나열되어 원에메지가 무엇인지 파악하기 어렵다" }, 
        { s: 0, t: "발표의 주제가 무엇인지 알 수 없고 주제와 동떨어진 발표를 한다" }
      ] },
    i2: { label: "1-2. 내용의 구성력", 
      criteria: 
      [
        { s: 10, t: "시간의 흐름, 주제별 분류 등 명확한 기준에 따라 내용이 체계적으로 구성되어 이야기의 흐름이 자연스럽다" },
        { s: 8, t: "전체적인 구성은 체계적이나, 일부 내용의 순서가 바뀌었으면 좋았을 것 같은 아쉬움이 있다" },
        { s: 6, t: "전체적인 구성이 일관되나 3개 이상의 슬라이드가 산만하다" },
        { s: 4, t: "이야기의 시작과 끝은 있으나, 중간 부분의 내용 전개가 산만하여 흐름을 놓치기 쉽다" },
        { s: 2, t: "이야기의 흐름이 자주 끊기거나 내용의 순서가 자연스럽지 않아 전체 내용을 이해하기 어렵다" }, 
        { s: 0, t: "일관된 질서가 전혀 없으며, 생각나는대로 파편적인 정보를 나열하는 데 그친다" }
      ] },
    i3: { 
      label: "1-3. 내용의 풍부함과 구체성", 
      criteria: 
      [
        { s: 10, t: "생생한 묘사, 흥미로운 에피소드, 구체적인 예시가 풍부하여 직접 경험하는 듯한 몰입감을 준다" },
        { s: 8, t: "발표 내용이 구체적이며, 청중의 이해와 흥미를 돕기 위한 적절한 예시나 에피소드가 포함되어 있다" },
        { s: 6, t: "발표 내용이 구체적이나 적절한 예시와 에피소드가 부족하다" },
        { s: 4, t: "대부분 사실을 전달하는 데 초점을 맞추고 있으며, 내용이 건조하거나 추상적으로 느껴진다" },
        { s: 2, t: "'좋았다', '재미있었다' 와 같이 피상적인 감상이나 일반적인 정보 나열이며 내용이 구체적이지 않다" }, 
        { s: 0, t: "내용이 거의 없어 발표 시간이 짧거나, 같은 말을 반복하는 등 전달할 정보가 매우 부족하다" }
      ] },
    i4: { label: "1-4. 독창성", 
      criteria: 
      [
        { s: 10, t: "평범한 경험이나 정보 속에서도 자신만의 특별한 의미나 가치를 전달한다" },
        { s: 8, t: "전달하는 경험이나 정보에 자신만의 생각이나 느낌을 덧붙여, 내용을 더욱 흥미롭게 만든다" },
        { s: 6, t: "전달하는 경험이나 정보에 자신만의 생각과 느낌을 덧붙이나 다른 경험이나 정보를 응용한 수준이다" },
        { s: 4, t: "제시된 경험이나 정보에 대한 해석이 일반적이거나 예측 가능한 범위 안에 있다" },
        { s: 2, t: "인터넷 검색이나 책엥서 쉽게 얻을 수 있는 정보를 거의 그대로 반복하여 전달하는 수준이다" }, 
        { s: 0, t: "발표 내용에서 발표자 자신만의 생각이나 관점을 전혀 찾아볼 수 없다" }
      ] },
    g1: { label: "2-1. 명료성", 
      criteria: 
      [
        { s: 10, t: "모든 슬라이드가 쉽게 읽힐 만큼 명확하며, 배경과 요소가 뚜렷하게 대비된다" },
        { s: 8, t: "전반적으로 내용을 식별 가능하나, 일부 슬라이드에서 폰트나 이미지의 해상도가 다소 낮다" },
        { s: 6, t: "글자가 너무 많거나 요소들이 겹쳐 있어 한눈에 파악하기에는 다소 노력이 필요하다" },
        { s: 4, t: "글자 크기가 작거나 색상 대비가 낮아 상당수의 텍스트나 차트의 내용을 알아보기 힘들다" },
        { s: 2, t: "이미지 품질이 매우 낮거나, 전반적으로 너무 어둡거나 복잡하여 내용을 식별하기 어렵다" }, 
        { s: 0, t: "눈이 아플 정도로 슬라이드가 어지럽거나 배치 및 구조가 엉망이다" }
      ] },
    g2: { label: "2-2. 디자인 스킬", 
      criteria: 
      [
        { s: 10, t: "자료 전체에서 색상, 글꼴, 로고, 레이아웃 등이 일관되어 전문적이고 통일감있다" },
        { s: 8, t: "정해진 디자인을 사용하나, 일부 슬라이드에서 글꼴이나 색상의 일관성이 깨진다" },
        { s: 6, t: "통일감은 있으나, 슬라이드마다 레이아웃 혹은 디자인 요소가 조금씩 달라 산만하다" },
        { s: 4, t: "슬라이드마다 사용된 색상, 글꼴, 스타일이 제각각이라 통일성이 없으며, 디자인이 조잡하다" },
        { s: 2, t: "부적절한 색 조합, 너무 많은 종류의 글꼴 사용 등 디자인 요소들이 내용 전달을 방해한다" }, 
        { s: 0, t: "디자인에 대한 고려가 전혀 없다" }
      ] },
    g3: { label: "2-3. 창의성", 
      criteria: 
      [
        { s: 10, t: "복잡한 데이터나 추상적인 개념을 독창적인 시각자료로 시각화했으며, 모든 이미지가 메세지를 뒷받침한다" },
        { s: 8, t: "내용과 관련된 시각 자료를 적절히 사용하였으며, 발표 내용 이해에 실질적인 도움을 준다" },
        { s: 6, t: "시각 자료가 쓰였으나, 내용과 직접적이지 않은 장식용 이미지이거나, 차트가 너무 복잡하여 해석하기 어렵다" },
        { s: 4, t: "의미 없는 클립아트나 이미지를 남발하여 산만하거나 메세지와 전혀 관련이 없다" },
        { s: 2, t: "창의적인 시각 자료가 메세지 전달을 왜곡하거나 심각하게 방해한다" }, 
        { s: 0, t: "창의적이지 않고 시각자료가 전혀 사용되지 않았다" }
      ] },
    d1: { label: "3-1. 언어적 표현", 
      criteria: 
      [
        { s: 10, t: "발음이 명확하고 목소리 크기가 적절하며, 내용에 맞게 말의 빠르기나 어조를 조절한다" },
        { s: 8, t: "발음이 명확하고 목소리 크기도 적절하나, 다소 단조로운 톤이거나 약간의 습관어가 사용된다" },
        { s: 6, t: "목소리가 작거나, 말이 빠르거나 느려 내용을 놓치기 쉽다. 습관어가 간혹 사용되어 의식된다" },
        { s: 4, t: "목소리가 너무 작거나, 웅얼거리는 발음으로 인해 내용을 이해하기 어렵다" },
        { s: 2, t: "상당 부분에서 발음이 안들리거나, 습관어를 과도히 사용하여 내용 전달을 방해한다" }, 
        { s: 0, t: "발표를 거의 진행하지 못하거나, 전혀 알아들을 수 없다" }
      ] },
    d2: { label: "3-2. 비언어적 표현", 
      criteria: 
      [
        { s: 10, t: "안정적이고 자신감 있는 자세를 유지하며, 자연스럽고 의미 있는 제스처를 사용한다" },
        { s: 8, t: "자세는 안정적이나, 제스처 사용이 다소 적거나 어색한 부분이 있다" },
        { s: 6, t: "한 곳에 뻣뻣하게 서 있거나, 의미 없이 몸을 흔드는 등 불안정해 보이는 습관이 있다" },
        { s: 4, t: "주머니에 손을 넣거나 팔짱을 끼는 등의 자세, 시선이 바닥이나 천장을 향하는 경우가 잦다" },
        { s: 2, t: "몸을 심하게 흔들거나 화면을 등지는 등, 청중의 집중을 매우 심하게 방해하는 행동을 반복한다" }, 
        { s: 0, t: "방표에 임하는 태도가 전혀 갖춰져 있지 않다" }
      ] },
    d3: { label: "3-3. 청중과의 교감", 
      criteria: 
      [
        { s: 10, t: "발표 내내 청중 전체와 고르게 시선을 맞추며, 마치 대화하듯 자연스럽게 발표를 이끌어간다" },
        { s: 8, t: "청중과 시선을 맞추려고 노력하지만, 자주 스크린이나 대본으로 시선이 돌아간다" },
        { s: 6, t: "대부분의 시간을 스크린이나 대본을 보고 발표하며, 청중과는 간헐적으로 시선을 맞춘다" },
        { s: 4, t: "발표 내내 청중과 거의 시선을 맞추지 않아, 일방적으로 정보를 낭독하는 느낌을 준다" },
        { s: 2, t: "시종일관 대본만 보고 읽어 청중과의 소통을 완전히 차단한다" }, 
        { s: 0, t: "청중을 전혀 의식하지 않고 발표한다" }
      ] },
    c1: { label: "4-1. IGD간 상호보완성", 
      criteria: [{ s: 5, t: "I, G, D간 상호보완성이 돋보인다" }, 
        { s: 0, t: "I, G, D간 상호 편차가 심하다" }] }
  },
};

export default function ScorePage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [version, setVersion] = useState('v1') 
  const [presentations, setPresentations] = useState([]) 
  const [votedPids, setVotedPids] = useState([]) 
  const [selectedPid, setSelectedPid] = useState('')
  const [week, setWeek] = useState(1) 
  const [submitting, setSubmitting] = useState(false)

  const [scores, setScores] = useState({
    i1: null, i2: null, i3: null, i4: null,
    g1: null, g2: null, g3: null,
    d1: null, d2: null, d3: null,
    c1: null
  })

  const [feedback, setFeedback] = useState({
    originalMessage: '',
    insightPlus: '', insightMinus: '',
    graphicPlus: '', graphicMinus: '',
    deliveryPlus: '', deliveryMinus: ''
  })

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { 
        router.push('/login') 
      } else { 
        const currentUser = session.user;
        setUser(currentUser); 
        const { data: latestP } = await supabase.from('presentations').select('week').order('created_at', { ascending: false }).limit(1);
        if (latestP && latestP.length > 0) setWeek(latestP[0].week);
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (user?.id) fetchData(user.user_metadata.name, week);
  }, [week, user?.id]);

  const fetchData = async (userName, targetWeek) => {
    const { data: pData } = await supabase.from('presentations').select('*').eq('week', targetWeek).order('order_index', { ascending: true }) 
    if (pData && pData.length > 0) {
      setPresentations(pData)
      setVersion(pData[0].eval_version || 'v1') 
    } else { setPresentations([]) }

    const { data: sData } = await supabase.from('scores').select('presentation_id').eq('voter_name', userName)
    const votedIds = sData ? sData.map(s => s.presentation_id) : []
    setVotedPids(votedIds)
    
    const nextToScore = pData?.find(p => p.presenter_name !== userName && !votedIds.includes(p.id))
    if (nextToScore) setSelectedPid(nextToScore.id)
    
    setScores({i1:null,i2:null,i3:null,i4:null,g1:null,g2:null,g3:null,d1:null,d2:null,d3:null,c1:null})
    setFeedback({ originalMessage: '', insightPlus: '', insightMinus: '', graphicPlus: '', graphicMinus: '', deliveryPlus: '', deliveryMinus: '' })
  }

  const handleScoreChange = (key, val) => setScores(prev => ({ ...prev, [key]: Number(val) }))
  const handleFeedbackChange = (key, val) => setFeedback(prev => ({ ...prev, [key]: val }))

  const insightTotal = (scores.i1 || 0) + (scores.i2 || 0) + (scores.i3 || 0) + (scores.i4 || 0)
  const graphicTotal = (scores.g1 || 0) + (scores.g2 || 0) + (scores.g3 || 0)
  const deliveryTotal = (scores.d1 || 0) + (scores.d2 || 0) + (scores.d3 || 0)
  const grandTotal = insightTotal + graphicTotal + deliveryTotal + (scores.c1 || 0)

  const handleSubmit = async () => {
    if (!selectedPid) return alert("채점 대상이 없어! 👤")
    const allFilled = Object.values(scores).every(v => v !== null)
    if (!allFilled) return alert("모든 점수 항목을 선택해줘! ✍️")

    setSubmitting(true)
    const { error } = await supabase.from('scores').insert([{
        presentation_id: selectedPid,
        voter_name: user.user_metadata.name,
        insight: insightTotal,
        graphic: graphicTotal,
        delivery: deliveryTotal,
        complementarity: scores.c1,
        total_score: grandTotal,
        details: { ...scores, version, qualitative: feedback } 
    }])

    if (!error) {
      alert("평가 완료! 다음 사람으로 이동합니다. 👏")
      window.location.reload(); 
    } else { alert("오류 발생: " + error.message) }
    setSubmitting(false)
  }

  if (!user) return <div className="p-8 text-center font-black text-black">데이터 로딩 중... 🔄</div>
  const currentPresenter = presentations.find(p => p.id === selectedPid)
  const targetsToScore = presentations.filter(p => p.presenter_name !== user.user_metadata.name);
  const allEvaluated = targetsToScore.length > 0 && targetsToScore.every(p => votedPids.includes(p.id));

  return (
    <div className="p-6 bg-slate-50 min-h-screen text-black font-sans">
      <div className="max-w-[1650px] mx-auto">
        
        {/* 상단 섹션: 주차 선택 UI 복구 */}
        <header className="w-full text-center mb-12">
          <div className="flex justify-between items-center mb-6 max-w-2xl mx-auto">
            <Link href="/vote" className="text-blue-600 text-xs font-black hover:underline tracking-widest uppercase">← Vote Hub</Link>
            <div className="bg-slate-900 text-white px-4 py-1.5 rounded-full shadow-lg border border-slate-700 font-black text-[10px] uppercase">
              {version === 'v1' ? '기획서 4-1' : '기획서 4-2'}
            </div>
          </div>
          <h1 className="text-4xl font-black text-black tracking-tighter mb-8 uppercase">Evaluation System</h1>
          
          <div className="bg-slate-900 text-white p-6 rounded-[2.5rem] shadow-xl space-y-6 max-w-2xl mx-auto">
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-black text-slate-500 uppercase block mb-3 tracking-widest">Select Active Week</span>
              <div className="flex flex-wrap justify-center gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((w) => (
                  <button key={w} onClick={() => setWeek(w)} className={`w-10 h-10 rounded-xl font-black text-sm transition-all ${week === w ? 'bg-blue-500 text-white shadow-lg' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}>{w}</button>
                ))}
              </div>
            </div>
            <div className="flex justify-around items-center pt-4 border-t border-slate-800">
              <div className="px-6 flex-1 text-left"><span className="text-[10px] font-black text-slate-500 uppercase block mb-1">Topic</span><p className="text-xl font-black text-white leading-tight">{presentations[0]?.topic || "주제 없음"}</p></div>
              <div className="px-4 text-right"><span className="text-[10px] font-black text-slate-500 uppercase block mb-1">Evaluator</span><p className="text-lg font-black text-blue-400">{user.user_metadata.name}</p></div>
            </div>
          </div>
        </header>

        {/* 메인 3단 레이아웃 */}
        <div className="flex flex-col lg:flex-row justify-center items-start gap-8">
          
          {/* [좌] 발표 순서 사이드바 */}
          <aside className="w-full lg:w-64 shrink-0 order-2 lg:order-1">
            <div className="bg-slate-900 p-6 rounded-[2.5rem] text-white shadow-2xl sticky top-8 border border-slate-800">
              <h3 className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
                <span className="animate-pulse">●</span> Presentation Flow
              </h3>
              <div className="space-y-4">
                {presentations.map((p, idx) => (
                  <div key={p.id} className="flex items-center gap-4 group">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-black border transition-all ${p.id === selectedPid ? 'bg-blue-500 border-blue-400 text-white scale-110 shadow-[0_0_15px_rgba(59,130,246,0.5)]' : votedPids.includes(p.id) ? 'bg-slate-800 border-slate-700 text-slate-500' : 'bg-transparent border-slate-700 text-slate-400'}`}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 border-b border-slate-800 pb-2">
                      <p className={`text-xs font-black transition-colors ${p.id === selectedPid ? 'text-blue-400' : votedPids.includes(p.id) ? 'text-slate-600 line-through' : 'text-slate-300'}`}>
                        {p.presenter_name} {p.presenter_name === user?.user_metadata?.name && <span className="text-[8px] text-slate-500 opacity-50">(ME)</span>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* [중] 정량 평가창 */}
          <div className="w-full max-w-2xl space-y-8 order-1 lg:order-2">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <label className="text-xs font-black text-black uppercase tracking-widest mb-4 block text-center">Active Target</label>
              <div className="w-full p-4 bg-slate-50 border-none rounded-xl font-black text-black text-2xl text-center">
                {allEvaluated ? "🎉 채점 완료" : currentPresenter ? `${currentPresenter.presenter_name} 님 채점 중` : "대상 없음"}
              </div>
            </div>

            {!allEvaluated ? (
              <>
                <CategoryCard title="1. 인사이트" icon="💡" total={insightTotal} max={40} color="text-blue-600">
                  {['i1', 'i2', 'i3', 'i4'].map(id => (<EvaluationItem key={id} version={version} id={id} val={scores[id]} max={10} onChange={(v)=>handleScoreChange(id, v)} />))}
                </CategoryCard>
                <CategoryCard title="2. 그래픽" icon="🎨" total={graphicTotal} max={30} color="text-purple-600">
                  {['g1', 'g2', 'g3'].map(id => (<EvaluationItem key={id} version={version} id={id} val={scores[id]} max={10} onChange={(v)=>handleScoreChange(id, v)} />))}
                </CategoryCard>
                <CategoryCard title="3. 딜리버리" icon="🎤" total={deliveryTotal} max={30} color="text-pink-600">
                  {['d1', 'd2', 'd3'].map(id => (<EvaluationItem key={id} version={version} id={id} val={scores[id]} max={10} onChange={(v)=>handleScoreChange(id, v)} />))}
                </CategoryCard>
                <CategoryCard title="4. 상호보완성" icon="🔗" total={scores.c1 || 0} max={5} color="text-emerald-600">
                  <EvaluationItem version={version} id="c1" val={scores.c1} max={5} onChange={(v)=>handleScoreChange('c1', v)} />
                </CategoryCard>
              </>
            ) : (
              <div className="bg-white p-20 rounded-[3rem] text-center border-2 border-dashed border-slate-200 animate-in fade-in duration-500">
                <span className="text-6xl mb-6 block">🏆</span>
                <h3 className="text-3xl font-black text-black mb-2 uppercase italic">채점 완료</h3>
                <p className="text-slate-400 font-bold mb-8 leading-relaxed">오늘 모든 채점을 무사히 마쳤습니다!<br/>결과 보러가기 버튼을 통해 확인하세요.</p>
                <Link href="/vote/results" className="bg-blue-600 text-white px-10 py-5 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-900 transition-all shadow-xl">결과 보러가기</Link>
              </div>
            )}
          </div>

          {/* [우] 정성 피드백 영역: (+) / (-) 세로 정렬 및 크기 확대 [수정] */}
          {!allEvaluated && (
            <aside className="w-full lg:w-[480px] shrink-0 order-3">
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 sticky top-8 space-y-8">
                <h3 className="text-xl font-black text-black border-b border-slate-100 pb-4 flex items-center gap-2">✍️ [{currentPresenter?.presenter_name}] 피드백</h3>
                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-2 block">• 원메세지</label>
                    <textarea value={feedback.originalMessage} onChange={(e)=>handleFeedbackChange('originalMessage', e.target.value)} className="w-full bg-slate-50 p-4 rounded-2xl text-sm font-bold min-h-[100px] outline-none border border-transparent focus:border-blue-100" placeholder="발표 핵심 메세지를 기록하세요." />
                  </div>
                  <FeedbackSection title="1. Insight" subtitle="독창성, 완결성, 적합성" plusVal={feedback.insightPlus} minusVal={feedback.insightMinus} onPlusChange={(v)=>handleFeedbackChange('insightPlus', v)} onMinusChange={(v)=>handleFeedbackChange('insightMinus', v)} />
                  <FeedbackSection title="2. Graphic" subtitle="가독성, 가시성, 활용성" plusVal={feedback.graphicPlus} minusVal={feedback.graphicMinus} onPlusChange={(v)=>handleFeedbackChange('graphicPlus', v)} onMinusChange={(v)=>handleFeedbackChange('graphicMinus', v)} />
                  <FeedbackSection title="3. Delivery" subtitle="목소리, 몸짓, 흐름" plusVal={feedback.deliveryPlus} minusVal={feedback.deliveryMinus} onPlusChange={(v)=>handleFeedbackChange('deliveryPlus', v)} onMinusChange={(v)=>handleFeedbackChange('deliveryMinus', v)} />
                </div>
                <div className="pt-6 border-t border-slate-50 space-y-4">
                  <div className="text-center"><p className="text-[10px] font-black text-slate-300 uppercase mb-1">Grand Total</p><h2 className="text-5xl font-black text-blue-600">{grandTotal}점</h2></div>
                  <button onClick={handleSubmit} disabled={submitting} className="w-full py-6 bg-blue-600 rounded-2xl font-black text-xl text-white hover:bg-blue-500 active:scale-95 transition-all shadow-xl">{submitting ? "제출 중..." : "최종 제출하기 🚀"}</button>
                </div>
              </div>
            </aside>
          )}

        </div>
      </div>
    </div>
  )
}

// 정성 피드백 섹션 컴포넌트: 세로 정렬 및 크기 확대 적용 [수정]
function FeedbackSection({ title, subtitle, plusVal, minusVal, onPlusChange, onMinusChange }) {
  return (
    <div className="space-y-4">
      <div><p className="text-sm font-black text-black">{title}</p><p className="text-[9px] text-slate-400 font-bold mb-1">- {subtitle}</p></div>
      <div className="flex flex-col gap-3">
        <textarea value={plusVal} onChange={(e)=>onPlusChange(e.target.value)} className="w-full bg-blue-50/50 p-4 rounded-xl text-xs font-bold min-h-[120px] outline-none border border-transparent focus:border-blue-200" placeholder="(+) 장점 및 배운 점" />
        <textarea value={minusVal} onChange={(e)=>onMinusChange(e.target.value)} className="w-full bg-red-50/50 p-4 rounded-xl text-xs font-bold min-h-[120px] outline-none border border-transparent focus:border-red-200" placeholder="(-) 아쉬운 점 및 개선 제안" />
      </div>
    </div>
  )
}

function CategoryCard({ title, icon, total, max, color, children }) {
  return (
    <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200">
      <div className="flex justify-between items-center mb-8 border-b-2 border-slate-50 pb-4">
        <h3 className={`text-2xl font-black ${color}`}>{icon} {title}</h3>
        <p className="font-black text-black text-center">Score: <span className={`text-3xl ${color}`}>{total}</span> / {max}</p>
      </div>
      <div className="space-y-12">{children}</div>
    </div>
  )
}

function EvaluationItem({ version, id, val, max, onChange }) {
  const itemData = CRITERIA_DATA[version]?.[id] || { label: "항목 오류", criteria: [] };
  const points = Array.from({ length: max + 1 }, (_, i) => i);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center px-1">
        <span className="text-xl font-black text-black">{itemData.label}</span>
        <span className="text-xl font-black text-blue-600 bg-blue-50 px-4 py-1 rounded-full border border-blue-100">{val === null ? '?' : val}점</span>
      </div>
      <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden shadow-inner">
        <table className="w-full text-left border-collapse">
          <tbody>
            {itemData.criteria?.map((item, idx) => (
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
          <button key={p} onClick={() => onChange(p)} className={`flex-1 min-w-[36px] h-12 rounded-xl font-black text-lg transition-all border-2 ${val === p ? 'bg-blue-600 border-blue-600 text-white shadow-lg' : 'bg-white border-slate-200 text-black hover:border-blue-400'}`}>{p}</button>
        ))}
      </div>
    </div>
  )
}