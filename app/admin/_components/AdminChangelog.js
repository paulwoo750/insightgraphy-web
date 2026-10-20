'use client'

import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Modal } from '@/app/components/ui'

// 관리자에게 보여줄 변경 안내. 새 릴리스는 맨 앞에 추가한다.
// id가 바뀌면 각 관리자 계정에 한 번 다시 표시된다.
export const ADMIN_RELEASES = [
  {
    id: '2026-10-20-closeout-clean',
    date: '2026.10.20',
    title: '학기 마감은 학회장도, 화면은 더 가볍게',
    summary: '학기 마감 점검을 학회장도 열 수 있습니다. 화면의 윤곽선 상자를 걷어내고 위쪽 색 선으로 구역을 나눴습니다.',
    sections: [
      {
        title: '학기 마감 점검',
        badge: '권한',
        href: '/admin/hub/reset',
        roles: ['developer', 'super_admin'],
        items: ['👑 학회장도 정책 및 시스템 → 학기 마감 점검을 열 수 있습니다. 기록은 지우지 않고 보존 상태만 확인합니다.'],
      },
      {
        title: '화면',
        items: [
          '패널·지표 카드의 윤곽선을 없애고 위쪽 색 선으로 구역을 나눴습니다.',
          '학회원 화면: 투표·결과는 청록색, 사유서 게시판은 주차별 자료실처럼 주차를 고르고 그 주차 사유서를 보는 구조로 바꿨습니다.',
        ],
      },
    ],
  },
  {
    id: '2026-10-20-roles-color',
    date: '2026.10.20',
    title: '학회장·개발자 역할과 날짜 기준 현재 주차',
    summary: '최고관리자는 학회장으로 이름이 바뀌고, 기존 기록 연결은 개발자 역할로 옮겼습니다. 현재 주차는 실제 세션 날짜로 계산합니다.',
    sections: [
      {
        title: '역할',
        badge: '변경',
        href: '/admin/hub/access',
        roles: ['developer', 'super_admin'],
        items: [
          '👑 학회장: 모든 운영 작업과 관리자 권한 조회·변경 (개발자 계정은 바꿀 수 없음).',
          '🛠️ 개발자: 여기에 기존 기록 연결 검토·개발자 권한 관리가 더해집니다.',
          '졸업생 계정은 "학회원 명단과 연결되지 않은 계정" 대신 🎓 졸업생 계정으로 표시합니다.',
        ],
      },
      {
        title: '현재 주차',
        href: '/admin/hub/semesters',
        items: [
          '전체 일정의 정규 세션 날짜와 출석 시간으로 현재 주차를 계산합니다. 오늘 세션이 있으면 그 주차, 아니면 다음 세션 주차입니다.',
          '상단 학기 표시, 세션 및 제출, 학회원 화면이 모두 이 주차로 열립니다. 저장된 현재 주차와 다르면 운영 현황에 맞추기 안내가 나옵니다.',
        ],
      },
      {
        title: '화면',
        items: [
          '도움말 버튼은 화면에서 바로 안내를 띄웁니다. 바뀐 점 목록은 새 소식 버튼에 있습니다.',
          '메뉴 줄 아래에 같은 메뉴 묶음의 화면이 버튼으로 나와 한 번에 옮겨 갈 수 있습니다.',
          '메뉴 묶음마다 색을 정하고 제목 영역·지표 카드에 색과 아이콘을 넣었습니다.',
        ],
      },
    ],
  },
  {
    id: '2026-10-20-unified',
    date: '2026.10.20',
    title: '세션 관리와 관리자 화면을 정리했습니다',
    summary: '주차 주제가 한곳에 저장되고, 세션 및 제출 화면이 주차 중심으로 바뀌었습니다. "화면에서 따라보기"로 바뀐 위치를 직접 짚어 드립니다.',
    sections: [
      {
        title: '세션 및 제출',
        badge: '개편',
        href: '/admin/hub/dashboard',
        items: [
          '학기·주차·정규/평일을 먼저 고르고, 개요·일정 / 출석·장소 / 제출·피드백 마감 / 조·팀·평가 편성 / 제출물 탭으로 나눠 설정합니다.',
          '제출 현황은 선택한 주차의 실제 대상 명단으로 셉니다. 편성에서 제외한 사람은 미제출로 세지 않습니다.',
          '저장하지 않은 변경 수가 보이고, 일부라도 실패하면 성공으로 표시하지 않습니다. 다른 탭에서 먼저 저장한 값은 덮어쓰지 않습니다.',
          '저장 전 학회원 화면 미리보기와, 저장 후 같은 주차의 실제 학회원 화면 열기를 추가했습니다.',
        ],
      },
      {
        title: '주차 주제',
        href: '/admin/hub/semesters',
        items: [
          '학기 및 주차, 세션 및 제출 어디서 고쳐도 같은 학기별 주차 기록에 저장되고 자료실·투표·아카이브가 같은 주제를 읽습니다.',
          '예전 설정값과 다른 주제가 있으면 학기 및 주차 화면에 충돌로 표시하고 기존 값을 지우지 않습니다.',
        ],
      },
      {
        title: '관리자 권한',
        href: '/admin/hub/access',
        roles: ['developer', 'super_admin'],
        items: [
          '이메일 대신 학회원을 이름·기수·학교로 검색해 역할을 줍니다. 로그인 계정이 없는 학회원은 "로그인 계정 미연결"로 표시됩니다.',
          '역할별로 할 수 있는 일을 기능별 표로 보여 줍니다.',
        ],
      },
      {
        title: '기존 기록 연결 검토',
        badge: '신규',
        href: '/admin/hub/records',
        items: ['운영 현황의 경고 숫자는 실패한 SQL이 아니라 학회원과 연결되지 않은 예전 기록입니다. 지금 상태로 다시 확인하고, 근거를 골라 한 건씩 연결합니다.'],
      },
      {
        title: '메인 일정 자동 노출',
        href: '/admin/hub/landing',
        items: ['메인 화면의 다가오는 일정은 전체 일정에 등록한 현재 학기 공개 일정 중 가까운 4개를 자동으로 보여 줍니다. 직접 고르기도 계속 쓸 수 있습니다.'],
      },
      {
        title: '알럼나이 인터뷰 한 줄 요약',
        href: '/admin/hub/about',
        items: ['인터뷰 본문을 근거로 한 줄 요약을 만들고 직접 고친 뒤 저장합니다. 저장할 때 인터뷰 주소(ID)는 바뀌지 않습니다.'],
      },
    ],
  },
  {
    id: '2026-10-19-top-menu',
    date: '2026.10.19',
    title: '관리자 화면이 새로워졌습니다',
    summary: '메뉴 구성과 학기 운영 방식이 바뀌었습니다.',
    sections: [
      {
        title: '메뉴 구성',
        items: [
          '메뉴가 화면 위쪽 가로 메뉴로 옮겨졌습니다. 운영 기준 · 학회원 시스템 · 외부 사이트 · 정책 및 시스템을 누르면 세부 메뉴가 펼쳐집니다.',
          '메뉴 바로 아래 줄에 지금 보고 있는 화면 위치와 현재 운영 학기·주차가 표시됩니다.',
        ],
      },
      {
        title: '학기 및 주차',
        href: '/admin/hub/semesters',
        items: [
          '학기 생성, 주차별 주제, 현재 주차를 한 화면에서 관리합니다.',
          '새 학기는 준비 상태로 만든 뒤 "현재 학기로 전환"으로 바꿉니다. 지난 학기 기록은 지워지지 않습니다.',
        ],
      },
      {
        title: '출결·벌금·사유서',
        href: '/admin/hub/attendance',
        items: [
          '학회원별 출결과 결석 위험도를 확인하고 출결을 직접 고칠 수 있습니다.',
          '출석 마감이 지난 세션에 기록이 없으면 자동으로 결석 처리되고, 인정된 사유서가 있으면 인정 결석으로 들어갑니다.',
        ],
      },
    ],
  },
]

export const LATEST_RELEASE_ID = ADMIN_RELEASES[0].id

// 확인 상태는 계정별로 따로 저장한다
function seenKey(userId) {
  return `ig-admin-changelog-seen:${userId || 'anonymous'}`
}

// 브라우저 저장소를 쓸 수 없으면(사생활 보호 모드 등) 자동으로 띄우지 않는다 (매 페이지 반복 방지)
export function hasUnseenRelease(userId) {
  try {
    return window.localStorage.getItem(seenKey(userId)) !== LATEST_RELEASE_ID
  } catch {
    return false
  }
}

export function markReleaseSeen(userId) {
  try {
    window.localStorage.setItem(seenKey(userId), LATEST_RELEASE_ID)
  } catch {
    // 저장하지 못해도 이번 페이지에서는 닫힌 상태를 유지한다
  }
}

export default function AdminChangelogDialog({ role, onClose, onStartTour }) {
  const [release, ...previous] = ADMIN_RELEASES
  const visible = (sections) => sections.filter((section) => !section.roles || section.roles.includes(role))

  return (
    <Modal
      title={release.title}
      description={`업데이트 · ${release.date} — ${release.summary}`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <p className="mr-auto hidden self-center text-xs text-slate-500 sm:block">상단의 도움말 버튼으로 언제든 다시 볼 수 있습니다.</p>
          <button type="button" onClick={onClose} className="min-h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">닫기</button>
          {onStartTour && (
            <button type="button" onClick={onStartTour} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              화면에서 따라보기
            </button>
          )}
        </>
      }
    >
      <div className="divide-y divide-slate-100 break-keep">
        {visible(release.sections).map((section) => <ReleaseSection key={section.title} section={section} onClose={onClose} />)}
      </div>
      {previous.length > 0 && (
        <details className="border-t border-slate-200 bg-slate-50/60">
          <summary className="cursor-pointer px-5 py-3 text-sm font-bold text-slate-600 hover:text-slate-900">이전 업데이트 보기</summary>
          {previous.map((item) => (
            <div key={item.id} className="divide-y divide-slate-100 border-t border-slate-200 bg-white">
              <p className="px-5 pt-4 text-xs font-bold text-slate-500">{item.date} · {item.title}</p>
              {visible(item.sections).map((section) => <ReleaseSection key={section.title} section={section} onClose={onClose} />)}
            </div>
          ))}
        </details>
      )}
    </Modal>
  )
}

function ReleaseSection({ section, onClose }) {
  return (
    <section className="px-5 py-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          {section.title}
          {section.badge && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-800 ring-1 ring-inset ring-teal-200">{section.badge}</span>}
        </h3>
        {section.href && (
          <Link href={section.href} onClick={onClose} className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-teal-700 hover:text-teal-900">
            바로가기
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>
      <ul className="space-y-1.5">
        {section.items.map((item) => (
          <li key={item} className="flex gap-2 text-sm leading-6 text-slate-600">
            <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
