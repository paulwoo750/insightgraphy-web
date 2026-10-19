# InsightGraphy 데이터 구조 개편안

## 목표

현재 중복 입력의 원인은 학회원, 학기, 주차, 세션을 각 기능이 문자열과 JSON으로 따로 관리하는 데 있다. 새 구조에서는 식별자를 한 번만 만들고 출석, 벌금, 사유서, 파일, 발표, 평가가 그 식별자를 참조한다.

```text
auth.users
    0..1
     |
     v
members <------ semester_memberships ------> semesters
                                               |
                                               v
                                        semester_weeks
                                          |         |
                                          v         v
                                      sessions   calendar_events
                                       |    |
                                       v    v
                         session_participants  semester_deadlines

운영 데이터
pr_attendance / pr_fines / absence_forms / files_metadata
archive_files / file_comments / presentations / scores
     |              |                 |
     +---- member_id / semester_id / session_id ----+
```

## 단일 기준 정보

| 기준 정보 | 새 기준 테이블 | 대체되는 기존 중복 |
| --- | --- | --- |
| 학회원 인적 정보 | `members` | `profiles`, `pr_members`, 존재하지 않는 `members` 조회 fallback |
| 관리자 권한 | `admin_users` | 코드의 `IGAdmin`, `sessionStorage` 관리자 플래그 |
| 학기 | `semesters` | `pr_config.current_semester`, 각 테이블의 `semester` 문자열 |
| 학기 참여자 | `semester_memberships` | `pr_members.is_active`, `pr_members_config.active_generations` 조합 |
| 주차/주제 | `semester_weeks` | `total_weeks`, `current_week`, `week_topics` JSON |
| 실제 세션/조 | `sessions`, `session_participants` | `weekly_setup` JSON의 장소, 시간, 조 편성 |
| 마감 | `semester_deadlines` | 학기 ID가 없는 `pr_deadlines`, `weekly_setup` 내부 마감 |
| 공개 일정 | `calendar_events` | 현재 학기만 남는 `pr_schedules` |

## 마이그레이션 원칙

1. 기존 테이블과 문자열 컬럼은 삭제하지 않는다.
2. 새 테이블을 먼저 만들고 기존 테이블에 연결용 UUID 컬럼만 추가한다.
3. 이름 매칭은 최초 이관에서만 사용하며, 정규화된 이름이 유일할 때만 연결한다.
4. 동명이인과 명단에 없는 가입자는 추측하지 않고 `data_migration_issues`에 기록한다.
5. 앱 전환 후 모든 신규 쓰기는 `member_id`, `semester_id`, `session_id`를 기준으로 한다.
6. 한 학기만 `active`가 될 수 있도록 DB 인덱스로 강제한다.

## 현재 데이터 이관 규칙

- `pr_members` 17명은 canonical `members`로 이관한다.
- `profiles` 35건은 이름과 기수가 유일하게 일치하면 기존 회원에 Auth 계정으로 연결한다.
- 명단과 연결되지 않는 프로필은 삭제하지 않고 `pending`, 비공개 회원으로 만든다.
- `2026-1`, `2026-여름`처럼 운영 데이터가 참조하는 학기를 모두 보존한다.
- `pr_config.current_semester` 값은 활성 학기가 된다.
- `absence_forms`, `pr_deadlines`, `pr_schedules`는 기존 리셋 방식상 활성 학기에 귀속한다.
- `archive_files.semester = '상시'` 자료는 특정 학기에 강제로 귀속하지 않는다.
- 출석, 벌금, 파일, 발표, 점수는 기존 학기/주차와 유일한 회원 이름을 이용해 ID를 백필한다.
- `weekly_setup.members`, `weekdayMembers`, `weekday`의 조/장소/시간/마감을 세션 구조로 펼친다.

## 적용 순서

Supabase Dashboard의 SQL Editor에서 아래 파일을 한 번에 하나씩 실행한다. 각 파일은 트랜잭션이므로 오류가 나면 그 파일의 변경은 롤백된다. 외부 백업을 만들 수 없는 경우 STEP 0의 DB 내부 스냅샷을 반드시 먼저 실행한다.

1. `supabase/STEP_0_COPY_FIRST_internal_snapshot.sql`
2. `supabase/migrations/202608220001_normalize_core.sql`
3. `supabase/migrations/202608220002_backfill_core.sql`
4. `supabase/migrations/202608220003_legacy_bridge.sql`
5. `supabase/verify_core_migration.sql` 실행 후 결과 확인
6. `supabase/bootstrap_admin.sql`의 이메일을 본인 로그인 이메일로 바꾼 뒤 실행

STEP 0은 기존 원본 컬럼을 `ig_backup_20260822` 스키마에 복제한다. 이후 각 마이그레이션은 실행 전과 커밋 직전에 원본 데이터를 스냅샷과 비교한다. 원래 행이나 컬럼 값이 하나라도 달라지면 해당 단계는 자동 롤백된다. 어느 단계에서든 오류가 나면 다음 파일로 넘어가지 않는다.

## 적용 직후 영향

- 현재 앱은 계속 레거시 테이블을 사용하므로 관리자 화면은 즉시 바뀌지 않는다.
- `/dashboard/video`가 원래 조회하던 미존재 `members` 테이블이 생성되므로, 프로필 fallback 대신 활성 canonical 회원 명단을 사용하게 된다.
- 신규 회원가입은 `profiles`와 `members`에 함께 연결된다.
- 기존 관리자 회원 편집은 호환 트리거를 통해 `members`에도 반영된다.
- 관리자 UI 코드 전환이 끝나기 전까지 `weekly_setup`, 마감, 일정의 구조 변경은 최소화한다.

## 다음 코드 전환 범위

1. 관리자 인증을 `admin_users` + RLS로 교체한다.
2. 회원 관리 화면을 `members`와 `semester_memberships` 기준으로 통합한다.
3. 학기 설정 화면에서 학기, 주차, 세션, 조 편성, 마감을 한 흐름으로 저장한다.
4. 출석/벌금/사유서/아카이브/평가 쿼리를 ID 기반으로 전환한다.
5. 충분한 검증 후 레거시 JSON과 이름 컬럼을 읽기 전용으로 만들고 마지막 단계에서 제거한다.
