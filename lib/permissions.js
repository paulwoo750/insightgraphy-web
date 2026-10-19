// 관리자 역할 정책의 단일 기준. 권한 화면의 설명표, 메뉴, 버튼 비활성화, 자동 실행 여부가
// 모두 이 표를 읽는다. DB 쪽 실제 검사(RLS·RPC)는 enforcement 항목에 적어 두었다.
//
// 현재 DB 정책(STEP 6~17 기준):
// - is_admin()           = 최고관리자·관리자·운영진 (열람자 제외)  → 대부분의 쓰기 RPC·RLS
// - is_admin(['super_admin']) = 관리자 권한 변경
// - STEP 17 기록 연결 수정·종료 = 최고관리자·관리자
// 관리자와 운영진은 권한 관리와 기록 연결 수정을 빼면 같은 범위다. 운영진도 학회원 안전 삭제
// (STEP 9)가 허용되어 있다. 이 범위를 줄이려면 RPC·RLS를 바꿔야 하며 이번 작업에서는 바꾸지 않았다.

export const ROLES = [
  { key: 'super_admin', label: '최고관리자', tone: 'red', summary: '모든 운영 작업과 관리자 권한 변경' },
  { key: 'admin', label: '관리자', tone: 'teal', summary: '모든 운영 작업, 기존 기록 연결 수정' },
  { key: 'operator', label: '운영진', tone: 'blue', summary: '학기·세션·출결·벌금·콘텐츠 운영 (권한 변경·기록 연결 수정 제외)' },
  { key: 'viewer', label: '열람자', tone: 'gray', summary: '관리 화면 조회만 가능, 저장·삭제·자동 처리 없음' },
]

const ALL = ['super_admin', 'admin', 'operator', 'viewer']
const WRITERS = ['super_admin', 'admin', 'operator']
const LEADS = ['super_admin', 'admin']
const SUPER = ['super_admin']

export const ACTION_LABELS = {
  view: '조회',
  create: '등록',
  update: '수정',
  delete: '삭제',
  approve: '결재',
  payment: '납부 처리',
  grant: '권한 변경',
}

// 기능별 허용 역할. enforcement는 실제로 막는 곳이다.
export const POLICY = [
  {
    key: 'semester',
    area: '학기 및 주차',
    actions: { view: ALL, create: WRITERS, update: WRITERS },
    enforcement: 'RPC admin_create_semester · admin_save_semester_configuration · admin_activate_semester (is_admin)',
  },
  {
    key: 'session',
    area: '세션 및 제출 설정',
    actions: { view: ALL, update: WRITERS, delete: WRITERS },
    enforcement: 'RPC admin_save_week_plan (is_admin) · 제출물 삭제는 files_metadata 정책',
  },
  {
    key: 'members',
    area: '학회원 명단',
    actions: { view: ALL, create: WRITERS, update: WRITERS, delete: WRITERS },
    enforcement: 'members RLS (is_admin) · RPC admin_bulk_set_member_status · admin_delete_members',
  },
  {
    key: 'schedule',
    area: '전체 일정',
    actions: { view: ALL, create: WRITERS, update: WRITERS, delete: WRITERS },
    enforcement: '관리 화면 버튼 (pr_schedules는 기존 테이블 정책을 따름)',
  },
  {
    key: 'absence',
    area: '사유서',
    actions: { view: ALL, approve: WRITERS },
    enforcement: 'RPC admin_resolve_absence (is_admin)',
  },
  {
    key: 'attendance',
    area: '출결',
    actions: { view: ALL, update: WRITERS },
    enforcement: 'RPC admin_set_attendance_status · admin_sync_missing_attendance (is_admin)',
  },
  {
    key: 'fines',
    area: '벌금',
    actions: { view: ALL, create: WRITERS, update: WRITERS, delete: WRITERS, payment: WRITERS },
    enforcement: '관리 화면 버튼 (pr_fines는 기존 테이블 정책을 따름)',
  },
  {
    key: 'content',
    area: '외부 사이트 콘텐츠 (메인·소개·활동·쇼케이스·지원)',
    actions: { view: ALL, create: WRITERS, update: WRITERS, delete: WRITERS },
    enforcement: '관리 화면 버튼 · AI 요약 API (is_admin)',
  },
  {
    key: 'archive',
    area: '아카이브·운영 규정·회칙',
    actions: { view: ALL, create: WRITERS, update: WRITERS, delete: WRITERS },
    enforcement: '관리 화면 버튼 (기존 테이블 정책을 따름)',
  },
  {
    key: 'records',
    area: '기존 기록 연결 검토',
    actions: { view: ALL, update: LEADS },
    enforcement: 'RPC admin_record_link_report (전체 역할) · admin_link_record · admin_close_record_issue (최고관리자·관리자)',
  },
  {
    key: 'access',
    area: '관리자 권한',
    actions: { view: SUPER, grant: SUPER },
    enforcement: 'RPC admin_list_access · admin_grant_access_member · admin_set_access (super_admin)',
  },
]

const POLICY_BY_KEY = Object.fromEntries(POLICY.map((item) => [item.key, item]))

export function roleLabel(role) {
  return ROLES.find((item) => item.key === role)?.label || role || '권한 없음'
}

export function roleTone(role) {
  return ROLES.find((item) => item.key === role)?.tone || 'gray'
}

// can('fines', 'payment', role)
export function can(area, action, role) {
  const roles = POLICY_BY_KEY[area]?.actions?.[action]
  return Boolean(role && roles?.includes(role))
}

// 쓰기 가능한 관리자 역할인가 (열람자 제외)
export function canWrite(role) {
  return WRITERS.includes(role)
}

// 화면 진입 시 자동으로 DB를 바꾸는 작업(자동 결석 동기화, 벌금 스캔)은 쓰기 역할만 실행한다
export function canRunAutomation(role) {
  return WRITERS.includes(role)
}

// 역할 한 줄 요약: 허용된 영역 목록
export function roleCapabilities(role) {
  return POLICY.map((item) => ({
    area: item.area,
    actions: Object.entries(item.actions).filter(([, roles]) => roles.includes(role)).map(([action]) => ACTION_LABELS[action]),
  })).filter((item) => item.actions.length > 0)
}

export const READ_ONLY_NOTICE = '열람자 계정은 조회만 할 수 있습니다. 저장·삭제·결재와 화면 진입 시 자동 처리는 실행되지 않습니다.'
