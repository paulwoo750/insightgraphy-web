// 출석 체크 (웹 출석 화면·휴대폰 앱 공통). 판단은 서버 함수가 한다 (STEP 24).
// 휴대폰은 좌표와 정확도만 보내고, 출석 시간·장소 반경·지각 여부는 DB가 정한다.
import { supabase } from '@/lib/supabase'

const MISSING_FUNCTION = new Set(['PGRST202', '42883'])

export const SESSION_LABELS = { regular: '정규 세션', weekday: '평일 세션' }

// 서버가 돌려준 code → 화면 문구
export const CHECK_IN_MESSAGES = {
  OK: { tone: 'success', title: '출석이 확인됐어요 ✅' },
  LATE: { tone: 'warning', title: '지각으로 출석됐어요 ⏰' },
  ALREADY: { tone: 'info', title: '이미 출석했어요' },
  NOT_OPEN: { tone: 'info', title: '아직 출석 시간이 아니에요', body: '출석이 열리면 다시 눌러 주세요.' },
  CLOSED: { tone: 'danger', title: '출석 시간이 끝났어요', body: '사정이 있었다면 사유서를 내 주세요.' },
  TOO_FAR: { tone: 'danger', title: '세션 장소에서 멀어요', body: '강의실에 도착한 뒤 다시 눌러 주세요. 실내라면 와이파이를 켜면 위치가 더 정확해져요.' },
  LOW_ACCURACY: { tone: 'danger', title: '위치가 정확하지 않아요', body: '휴대폰 설정에서 "정확한 위치"를 켜고, 와이파이를 켠 뒤 다시 눌러 주세요.' },
  NO_LOCATION: { tone: 'danger', title: '세션 장소가 아직 정해지지 않았어요', body: '운영진에게 알려 주세요.' },
  NO_SETTING: { tone: 'info', title: '출석 시간이 아직 정해지지 않았어요' },
  BAD_LOCATION: { tone: 'danger', title: '위치를 읽지 못했어요', body: '위치 권한을 허용했는지 확인해 주세요.' },
  NOT_MEMBER: { tone: 'danger', title: '승인된 학회원만 출석할 수 있어요', body: '가입 승인이 끝났는지 운영진에게 확인해 주세요.' },
  NO_SEMESTER: { tone: 'info', title: '운영 중인 학기가 없어요' },
  LOGIN_REQUIRED: { tone: 'danger', title: '로그인이 필요해요' },
  PERMISSION: { tone: 'danger', title: '위치 권한이 꺼져 있어요', body: '설치 안내의 "위치 권한 켜기"를 따라 허용해 주세요.' },
  POSITION_UNAVAILABLE: { tone: 'danger', title: '위치를 찾지 못했어요', body: 'GPS·와이파이를 켜고 잠시 뒤 다시 눌러 주세요.' },
  TIMEOUT: { tone: 'danger', title: '위치를 찾는 데 시간이 오래 걸려요', body: '창가나 실외에서 다시 눌러 주세요.' },
  NO_GEOLOCATION: { tone: 'danger', title: '이 브라우저는 위치를 지원하지 않아요', body: '크롬(안드로이드)이나 사파리(아이폰)로 열어 주세요.' },
  NOT_READY: { tone: 'danger', title: '출석 기능을 준비하고 있어요', body: '운영진이 서버 설정(STEP 24)을 마치면 쓸 수 있어요.' },
}

export class AttendanceError extends Error {
  constructor(code, detail) {
    super(code)
    this.code = code
    this.detail = detail
  }
}

// 이번 출석 세션들 (정규, 방학학기면 내 평일 조)
export async function fetchAttendanceContext() {
  const { data, error } = await supabase.rpc('member_attendance_context')
  if (error) {
    if (MISSING_FUNCTION.has(error.code)) throw new AttendanceError('NOT_READY')
    throw error
  }
  return data
}

// 현재 위치 (정확도 우선, 캐시 없이)
export function getPosition({ timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new AttendanceError('NO_GEOLOCATION'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy }),
      (error) => reject(new AttendanceError(error.code === 1 ? 'PERMISSION' : error.code === 3 ? 'TIMEOUT' : 'POSITION_UNAVAILABLE')),
      { enableHighAccuracy: true, maximumAge: 0, timeout },
    )
  })
}

// 출석하기: 위치를 읽어 서버에 보낸다. 결과는 { ok, code, ... }
export async function checkIn(sessionType) {
  const position = await getPosition()
  const { data, error } = await supabase.rpc('member_check_in', {
    p_session_type: sessionType,
    p_lat: position.lat,
    p_lng: position.lng,
    p_accuracy: Math.round(position.accuracy || 0),
  })
  if (error) {
    if (MISSING_FUNCTION.has(error.code)) throw new AttendanceError('NOT_READY')
    throw error
  }
  return { ...data, accuracy_m: data?.accuracy_m ?? Math.round(position.accuracy || 0) }
}

// 지금 시각으로 다시 계산한 상태 (화면을 켜 둔 동안 바뀐다)
export function liveState(session, now = Date.now()) {
  if (!session?.start || !session?.end) return 'no_setting'
  const start = new Date(session.start).getTime()
  const end = new Date(session.end).getTime()
  if (now < start) return 'before'
  if (now > end) return 'closed'
  if (session.late && now > new Date(session.late).getTime()) return 'late'
  return 'open'
}

// 남은 시간 "2시간 13분" / "45초"
export function remaining(ms) {
  if (ms <= 0) return '0초'
  const seconds = Math.floor(ms / 1000)
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}일 ${hours}시간`
  if (hours > 0) return `${hours}시간 ${minutes}분`
  if (minutes > 0) return `${minutes}분 ${seconds % 60}초`
  return `${seconds}초`
}

export function messageFor(code) {
  return CHECK_IN_MESSAGES[code] || { tone: 'danger', title: '출석하지 못했어요', body: code }
}
