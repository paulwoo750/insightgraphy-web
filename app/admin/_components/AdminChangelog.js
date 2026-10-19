'use client'

import Link from 'next/link'
import { ArrowRight, Sparkles, X } from 'lucide-react'

// 관리자에게 보여줄 변경 안내. 새 릴리스는 맨 앞에 추가한다.
// id가 바뀌면 모든 관리자에게 한 번 다시 표시된다.
export const ADMIN_RELEASES = [
  {
    id: '2026-10-19-top-menu',
    date: '2026.10.19',
    title: '관리자 화면이 새로워졌습니다',
    summary: '메뉴 구성과 학기 운영 방식이 바뀌었습니다. 처음 한 번만 확인해 주세요.',
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
        badge: '신규',
        href: '/admin/hub/semesters',
        items: [
          '학기 생성, 주차별 주제, 현재 주차를 한 화면에서 관리합니다.',
          '새 학기는 준비 상태로 만든 뒤 "현재 학기로 전환"으로 바꿉니다.',
          '전환해도 지난 학기 기록은 지워지지 않고, 타임라인·주차 주제는 아카이브에 학기별로 보관됩니다.',
        ],
      },
      {
        title: '학기 마감 도구',
        href: '/admin/hub/reset',
        items: ['데이터를 일괄 삭제하던 기능을 없앴습니다. 이번 학기 기록이 잘 보존됐는지 점검하는 화면입니다.'],
      },
      {
        title: '학회원',
        href: '/admin/hub/members',
        items: [
          '기본 정보는 한 번만 등록하고, 학기별 참여 여부와 직책은 학기 명단에서 관리합니다.',
          '가입 승인 대기·졸업 학회원 탭과 여러 명 일괄 처리가 추가됐습니다.',
          '출결·벌금 등 활동 기록이 있는 학회원은 삭제되지 않습니다.',
        ],
      },
      {
        title: '출결·벌금 대시보드',
        badge: '신규',
        href: '/admin/hub/attendance',
        items: [
          '학회원별 출결과 결석 위험도를 확인하고 출결을 직접 고칠 수 있습니다.',
          '출석 마감이 지난 세션에 기록이 없으면 자동으로 결석 처리됩니다. 인정된 사유서가 있으면 인정 결석으로 들어갑니다.',
        ],
      },
      {
        title: '사유서',
        href: '/admin/hub/absence',
        items: [
          '결재하면 출결과 벌금에 바로 반영됩니다.',
          '이번 학기 사유서만 표시됩니다. 지난 학기 사유서는 아카이브 > 과거 자료실에서 볼 수 있습니다.',
        ],
      },
      {
        title: '아카이브',
        href: '/admin/hub/archive',
        items: [
          '지난 학기 제출 자료를 학기별로 보고, 검색·이름 수정·삭제할 수 있습니다.',
          '과거 주차에 현재 학기 주제가 섞여 보이던 문제를 고쳤습니다.',
          '회칙 편집은 "회칙 문서" 메뉴로 한 곳에 모았습니다.',
        ],
      },
      {
        title: '세션 및 제출',
        href: '/admin/hub/dashboard',
        items: [
          '주차 주제를 저장하면 학기별 기록에도 함께 남아, 학기를 바꿔도 그 학기 주제가 유지됩니다.',
          '평일세션 슬라이드가 정규세션 조로 묶이던 문제와 영상 업로드 대상 명단을 고쳤습니다.',
        ],
      },
      {
        title: '관리자 권한',
        badge: '신규',
        href: '/admin/hub/access',
        roles: ['super_admin'],
        items: ['이미 가입된 계정에 관리자 역할을 부여하거나 변경합니다. 최고관리자에게만 보입니다.'],
      },
    ],
  },
]

export const LATEST_RELEASE_ID = ADMIN_RELEASES[0].id
const SEEN_STORAGE_KEY = 'ig-admin-changelog-seen'

// 브라우저 저장소를 쓸 수 없으면(사생활 보호 모드 등) 매번 새 안내로 취급한다
export function hasUnseenRelease() {
  try {
    return window.localStorage.getItem(SEEN_STORAGE_KEY) !== LATEST_RELEASE_ID
  } catch {
    return true
  }
}

export function markReleaseSeen() {
  try {
    window.localStorage.setItem(SEEN_STORAGE_KEY, LATEST_RELEASE_ID)
  } catch {
    // 저장하지 못해도 이번 페이지에서는 닫힌 상태를 유지한다
  }
}

export default function AdminChangelogDialog({ role, onClose }) {
  const release = ADMIN_RELEASES[0]
  const sections = release.sections.filter((section) => !section.roles || section.roles.includes(role))

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="admin-changelog-title">
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden break-keep rounded-md border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-teal-50 text-teal-700">
              <Sparkles className="h-[18px] w-[18px]" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase text-teal-700">업데이트 · {release.date}</p>
              <h2 id="admin-changelog-title" className="text-lg font-bold text-slate-950">{release.title}</h2>
              <p className="mt-0.5 text-xs leading-5 text-slate-500">{release.summary}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100" aria-label="닫기">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="divide-y divide-slate-100 overflow-y-auto">
          {sections.map((section) => (
            <section key={section.title} className="px-5 py-4 sm:px-6">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  {section.title}
                  {section.badge && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-800 ring-1 ring-inset ring-teal-200">{section.badge}</span>}
                </h3>
                {section.href && (
                  <Link href={section.href} onClick={onClose} className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-900">
                    바로가기
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                )}
              </div>
              <ul className="space-y-1.5">
                {section.items.map((item) => (
                  <li key={item} className="flex gap-2 text-[13px] leading-5 text-slate-600">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:px-6">
          <p className="text-[11px] text-slate-500">상단의 업데이트 버튼으로 언제든 다시 볼 수 있습니다.</p>
          <button type="button" onClick={onClose} className="min-h-10 shrink-0 rounded-md bg-teal-700 px-5 text-sm font-bold text-white hover:bg-teal-800">확인했어요</button>
        </div>
      </div>
    </div>
  )
}
