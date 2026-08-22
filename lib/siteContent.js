// 공개 페이지(랜딩·타임라인)의 모든 문구 기본값.
// 관리자가 수정한 값은 pr_config 테이블에 JSON 문자열로 저장된다.
//   key = 'landing_content'  → 랜딩(대문)
//   key = 'schedule_content' → 타임라인(Schedule)
// DB에 값이 없거나 일부 항목만 있어도 아래 기본값으로 자동 보완된다.

export const DEFAULT_LANDING = {
  hero: {
    eyebrow: 'Since 2012',
    titleLine1: 'Insight',
    titleLine2: 'Graphy',
    desc: 'InsightGraphy는 서울대, 연세대, 고려대 연합 프레젠테이션 학회로\n다양한 전공과 역량을 가진 학회원들이 모여\n최고의 프레젠터가 되기 위한 훈련을 진행하고 있습니다.',
    btnPrimary: 'Learn More',
    btnSecondary: 'Apply Now'
  },
  activities: {
    title: 'Core Activities',
    items: [
      { icon: '💡', title: '정규 세션', desc: '매주 다양한 주제에 대해 문제 해결 방안을 발표하는 정기적인 세션', href: '/activities/regular' },
      { icon: '🎨', title: '교육 세션', desc: '인사이트, 그래픽, 딜리버리 역량 향상을 위한 내, 외부적 교육 및 실습 세션', href: '/activities/education' },
      { icon: '🎤', title: '특별 세션', desc: '연합세션, 공모전 기획 등 정규세션 이외의 비정기적 세션', href: '/activities/special' },
      { icon: '🤝', title: '기업 세션', desc: '기업과의 연계를 통해 IG만의 통찰력을 공유하고 함께 성장하는 프로젝트 세션', href: '/activities/corporate' }
    ],
    cardLink: 'View Detail →'
  },
  showcase: {
    title: 'Best Practices',
    desc: '학회원들이 만들어낸 압도적인 결과물을 확인하세요.',
    btn: 'View Gallery',
    empty: '선택된 쇼케이스 작품이 없습니다.'
  },
  sessions: {
    title: 'Upcoming Sessions',
    quote: '다가오는 우리의 성장을 준비하세요',
    btn: 'View Full Timeline',
    empty: '예정된 세션이 없습니다. 🏁'
  },
  footer: {
    text: '© 2026 InsightGraphy. All Rights Reserved.'
  }
}

export const DEFAULT_SCHEDULE = {
  header: {
    eyebrow: 'InsightGraphy 2026',
    title: 'Schedule Board'
  },
  table: {
    semesterBadge: '2026년 1학기 세션 일정',
    quote: '모든 생각은 가치있기에 공유되어야 마땅하다',
    colType: '유형/주차',
    colDate: '날짜',
    colTitle: '세션 내용',
    colNote: '비고',
    breakLabel: '(휴회)'
  },
  journey: {
    title: 'Journey Line',
    desc: '좌우로 스크롤하여 전체 여정을 확인하세요.',
    defaultDesc: '정규 세션 진행'
  },
  calendar: {
    title: 'Monthly Calendar',
    eventsTitle: 'Events in',
    empty: '예정된 일정이 없습니다.'
  },
  footer: {
    text: '© 2026 InsightGraphy.'
  }
}

// 저장된 값(부분 저장 포함)을 기본값 위에 덮어써 안전하게 합친다.
export function mergeContent(defaults, saved) {
  if (!saved || typeof saved !== 'object') return defaults
  const out = Array.isArray(defaults) ? [...defaults] : { ...defaults }
  Object.keys(saved).forEach(k => {
    const sv = saved[k]
    const dv = defaults?.[k]
    if (sv === undefined || sv === null) return
    if (Array.isArray(dv) && Array.isArray(sv)) {
      out[k] = sv.map((item, i) => (typeof item === 'object' && !Array.isArray(item)) ? mergeContent(dv[i] || {}, item) : item)
    } else if (dv && typeof dv === 'object' && typeof sv === 'object') {
      out[k] = mergeContent(dv, sv)
    } else {
      out[k] = sv
    }
  })
  return out
}

// pr_config 에서 공개 페이지 문구를 읽어온다.
export async function loadSiteContent(supabase, key, defaults) {
  try {
    const { data } = await supabase.from('pr_config').select('value').eq('key', key).single()
    if (data?.value) return mergeContent(defaults, JSON.parse(data.value))
  } catch (e) { /* 값이 없으면 기본값 사용 */ }
  return defaults
}
