// 화면 안내(단계형 투어) 정의와 확인 상태.
// 확인 상태는 영역(admin/member) · 릴리스 · 계정별로 따로 저장한다. 같은 브라우저에서
// 다른 계정으로 로그인하면 그 계정 기준으로 다시 한 번 안내한다.
// target은 화면 요소의 data-tour 값이다. path가 지금 화면과 다르면 투어가 그 화면으로 이동을
// 제안한다. 투어는 요소를 강조만 하고, 저장·삭제·출석·결재 같은 동작은 대신 실행하지 않는다.

export const ADMIN_TOUR = {
  id: '2026-10-20-admin',
  area: 'admin',
  title: '관리자 화면 안내',
  steps: [
    {
      id: 'intro',
      title: '이번 업데이트에서 바뀐 곳을 짚어 드립니다',
      body: '버튼은 눌러지지 않고 위치만 강조합니다. 언제든 Esc나 닫기로 멈출 수 있고, 상단의 도움말 버튼으로 다시 볼 수 있습니다.',
    },
    {
      id: 'week-picker',
      path: '/admin/hub/dashboard',
      target: 'session-week-picker',
      title: '학기·주차·정규/평일 선택',
      body: '세션 및 제출 화면은 먼저 학기와 주차, 정규/평일 세션을 고른 뒤 그 주차만 설정합니다. 선택한 주차와 탭은 주소에 남아 새로고침해도 유지됩니다.',
    },
    {
      id: 'save',
      path: '/admin/hub/dashboard',
      target: 'session-save',
      title: '저장 상태와 저장 버튼',
      body: '바꾼 항목 수가 표시되고, 저장 중에는 버튼이 잠깁니다. 다른 화면에서 먼저 저장된 값이 있으면 덮어쓰지 않고 알려 줍니다.',
    },
    {
      id: 'tabs',
      path: '/admin/hub/dashboard',
      target: 'session-tabs',
      title: '설정 탭',
      body: '개요·일정 / 출석·장소 / 제출·피드백 마감 / 조·팀·평가 편성 / 제출물로 나눴습니다. 제출물 탭은 선택한 주차의 대상 명단 기준으로 제출·미제출·지각을 셉니다.',
    },
    {
      id: 'preview',
      path: '/admin/hub/dashboard',
      target: 'session-preview',
      title: '학회원 화면 미리보기',
      body: '저장 전 값으로 학회원이 보게 될 주차 카드를 미리 봅니다. 저장한 뒤에는 "학회원 화면 열기"로 실제 화면을 같은 주차로 엽니다.',
    },
    {
      id: 'topics',
      path: '/admin/hub/semesters',
      target: 'semester-weeks',
      title: '주차 주제는 한곳에 저장됩니다',
      body: '여기서 고쳐도, 세션 및 제출에서 고쳐도 같은 학기별 주차 기록에 저장되어 자료실·투표·아카이브에 같은 주제가 보입니다.',
    },
    {
      id: 'access',
      path: '/admin/hub/access',
      target: 'access-member-search',
      roles: ['super_admin'],
      title: '학회원을 골라 권한 부여',
      body: '이름·기수·학교로 학회원을 찾아 역할을 줍니다. 로그인 계정이 연결되지 않은 학회원은 선택할 수 없다고 표시됩니다.',
    },
    {
      id: 'policy',
      path: '/admin/hub/access',
      target: 'access-policy',
      roles: ['super_admin'],
      title: '역할별 권한표',
      body: '최고관리자·관리자·운영진·열람자가 무엇을 할 수 있는지 기능별로 보여 줍니다. 메뉴와 버튼도 같은 표를 따릅니다.',
    },
    {
      id: 'records',
      path: '/admin/hub/records',
      target: 'records-summary',
      title: '연결 확인이 필요한 기존 기록',
      body: '운영 현황의 경고 숫자는 실패한 SQL이 아니라 학회원과 연결되지 않은 예전 기록입니다. 여기서 이미 해결된 경고인지, 실제로 연결이 필요한지 다시 확인합니다.',
    },
    {
      id: 'help',
      target: 'admin-help',
      title: '도움말은 여기서 다시 봅니다',
      body: '업데이트 내역과 이 화면 안내를 언제든 다시 열 수 있습니다.',
    },
  ],
}

export const MEMBER_TOUR = {
  id: '2026-10-20-member',
  area: 'member',
  title: '학회원 화면 안내',
  steps: [
    {
      id: 'intro',
      title: '학회원 공간이 새로워졌습니다',
      body: '홈에서 이번 주차와 마감, 내 제출 상태를 바로 확인하고 같은 주차의 자료실로 이어갈 수 있습니다. 강조만 하고 아무것도 대신 누르지 않습니다.',
    },
    {
      id: 'week',
      path: '/home',
      target: 'member-week-card',
      title: '이번 주차 한눈에 보기',
      body: '현재 학기·주차·주제와 세션 시간, 출석 가능 시간을 보여 줍니다. 카드의 버튼은 같은 주차의 자료실로 이동합니다.',
    },
    {
      id: 'deadlines',
      path: '/home',
      target: 'member-deadlines',
      title: '다가오는 마감과 내 제출 상태',
      body: '이번 학기 마감을 가까운 순서로 보여 주고, 내가 이미 제출한 항목은 표시합니다.',
    },
    {
      id: 'recent',
      path: '/home',
      target: 'member-recent',
      title: '최근 자료 미리보기',
      body: '슬라이드는 첫 장, PDF는 첫 페이지, 영상은 실제 썸네일로 보여 줍니다. 미리보기를 만들 수 없는 파일은 원본 열기 버튼이 나옵니다.',
    },
    {
      id: 'mypage',
      path: '/home',
      target: 'member-mypage-summary',
      title: '마이페이지 요약',
      body: '이번 학기 출결·지각·결석과 미납 벌금을 요약합니다. 자세한 내역과 지난 학기 기록은 마이페이지에서 학기별로 봅니다.',
    },
    {
      id: 'nav',
      target: 'member-nav',
      title: '메뉴',
      body: '메뉴는 눌러서 열고 Esc로 닫습니다. 터치와 키보드로도 쓸 수 있습니다.',
    },
    {
      id: 'external',
      target: 'member-external',
      title: '외부 홈페이지',
      body: '학회 공개 홈페이지로 이동합니다. 로그아웃은 오른쪽의 별도 버튼입니다.',
    },
    {
      id: 'help',
      target: 'member-help',
      title: '안내 다시 보기',
      body: '이 버튼으로 화면 안내를 다시 볼 수 있습니다.',
    },
  ],
}

function storageKey(area, releaseId, userId) {
  return `ig-tour-seen:${area}:${releaseId}:${userId || 'anonymous'}`
}

export function hasSeenTour(tour, userId) {
  try {
    return window.localStorage.getItem(storageKey(tour.area, tour.id, userId)) === 'done'
  } catch {
    // 저장소를 쓸 수 없으면 자동으로 띄우지 않는다 (매 페이지 반복 방지)
    return true
  }
}

export function markTourSeen(tour, userId) {
  try {
    window.localStorage.setItem(storageKey(tour.area, tour.id, userId), 'done')
  } catch {
    // 저장하지 못해도 이번 화면에서는 닫힌 상태를 유지한다
  }
}

// 화면 이동 중에도 이어지도록 진행 위치를 탭 단위로 기억한다
const SESSION_KEY = 'ig-tour-progress'

export function readTourProgress() {
  try {
    return JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || 'null')
  } catch {
    return null
  }
}

export function writeTourProgress(progress) {
  try {
    if (progress) window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(progress))
    else window.sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // 이어보기 없이 현재 화면에서만 진행한다
  }
}

export function visibleSteps(tour, role) {
  return tour.steps.filter((step) => !step.roles || step.roles.includes(role))
}
