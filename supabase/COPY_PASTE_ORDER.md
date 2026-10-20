# Supabase SQL Editor 실행 순서

실행 중에는 회원가입, 파일 업로드, 관리자 데이터 수정을 잠시 중단한다.

각 단계는 PowerShell에서 해당 명령을 실행하면 SQL 전체가 클립보드에 들어간다. Supabase SQL Editor에 붙여넣고 `Run`을 누른다.

## 0. 내부 원본 스냅샷

```powershell
Get-Content -Raw .\supabase\STEP_0_COPY_FIRST_internal_snapshot.sql | Set-Clipboard
```

결과에 14개 테이블과 행 수가 표시되는지 확인한다.

## 1. 정규화 테이블 생성

```powershell
Get-Content -Raw .\supabase\migrations\202608220001_normalize_core.sql | Set-Clipboard
```

## 2. 기존 데이터 ID 연결

```powershell
Get-Content -Raw .\supabase\migrations\202608220002_backfill_core.sql | Set-Clipboard
```

## 3. 기존 앱 호환 트리거

```powershell
Get-Content -Raw .\supabase\migrations\202608220003_legacy_bridge.sql | Set-Clipboard
```

## 4. 결과 검증

```powershell
Get-Content -Raw .\supabase\verify_core_migration.sql | Set-Clipboard
```

## 5. 관리자 계정 등록

먼저 Supabase SQL Editor에서 아래 조회를 실행한다.

```sql
select id, email, created_at
from auth.users
order by created_at desc;
```

InsightGraphy `/login`에서 실제로 사용하는 본인 이메일을 확인한 뒤 다음 파일의 `REPLACE_WITH_YOUR_LOGIN_EMAIL`만 변경한다.

```powershell
Get-Content -Raw .\supabase\bootstrap_admin.sql | Set-Clipboard
```

## 6. 새 관리자 UI 지원 정책과 트랜잭션 함수

기존 행을 삭제하지 않는다. 현재 학기의 공개 명단 읽기 정책과 학기 저장·전환을 한 트랜잭션으로 실행하는 관리자 함수만 추가한다.

```powershell
Get-Content -Raw .\supabase\STEP_6_ADMIN_APP_SUPPORT.sql | Set-Clipboard
```

마지막 결과에서 아래 세 값이 모두 `true`인지 확인한다.

- `save_function_ready`
- `activate_function_ready`
- `create_function_ready`

## 7. 관리자 권한 관리

관리자 계정 목록·권한 부여·역할 변경용 함수를 추가하고, 마지막 최고관리자 잠금을 방지한다. 기존 학회원 및 운영 데이터는 변경하지 않는다.

```powershell
Get-Content -Raw .\supabase\STEP_7_ADMIN_ACCESS_MANAGEMENT.sql | Set-Clipboard
```

마지막 결과의 네 값이 모두 `true`인지 확인한다.

- `list_function_ready`
- `grant_function_ready`
- `update_function_ready`
- `active_super_admin_ready`

## 8. 학회원 상태·사유서·출결 연동

기존 회원·출결·사유서·벌금 행은 삭제하지 않는다. 회원가입 요청 상태, 일괄 졸업 이관, 사유서 결재와 출결·벌금의 원자적 연동 함수만 추가한다.

```powershell
Get-Content -Raw .\supabase\STEP_8_MEMBER_ATTENDANCE_WORKFLOW.sql | Set-Clipboard
```

마지막 결과의 네 값이 모두 `true`인지 확인한다.

- `member_bulk_function_ready`
- `absence_resolution_function_ready`
- `attendance_update_function_ready`
- `member_request_status_ready`

## 9. 기록 보존형 학회원 삭제

잘못 등록됐거나 운영 기록이 없는 학회원을 관리자 화면에서 삭제하는 함수를 추가한다. 관리자 계정 또는 과거 학기·세션·출결·벌금·사유서·아카이브·발표·평가 기록이 연결된 학회원은 삭제하지 않는다. 삭제 가능한 학회원은 연결된 로그인 계정과 현재 학기 편성 정보까지 함께 제거한다.

```powershell
Get-Content -Raw .\supabase\STEP_9_SAFE_MEMBER_DELETION.sql | Set-Clipboard
```

마지막 결과의 `delete_function_ready`가 `true`인지 확인한다.

## 10. 출석 마감 후 미기록 자동 결석 처리

현재 활동 학기의 출석 마감이 지난 정규·평일 세션을 검사하고, 출결 행이 없는 참여자를 무단결석으로 생성한다. 인정된 사유서가 있으면 완전인정 또는 부분인정 결석으로 생성하며, 미래 세션과 마감 미설정 세션은 변경하지 않는다.

```powershell
Get-Content -Raw .\supabase\STEP_10_AUTO_ABSENCE_SYNC.sql | Set-Clipboard
```

마지막 결과의 세 값이 모두 `true`인지 확인한다.

- `sync_function_ready`
- `correction_trigger_function_ready`
- `auto_mark_column_ready`

## 11. 학기 ID 자동 연결

앱이 학기 코드(`semester`)만 넣어 저장한 출석·벌금·파일·발표·점수·사유서 행에 `semester_id`를 자동으로 채운다. 기존 행은 같은 학기 코드로 연결만 하고 삭제·수정하지 않는다. 학기 저장·전환 함수가 `week_topics`를 다시 쓸 때 평일세션 주제가 빠지던 문제도 함께 고친다.

**다음 학기로 전환하기 전에 실행한다.** 학기 ID가 없는 사유서는 실행 시점의 운영 학기로 연결되기 때문이다.

```powershell
Get-Content -Raw .\supabase\STEP_11_SEMESTER_ID_AUTOFILL.sql | Set-Clipboard
```

첫 번째 결과에서 각 테이블의 `unlinked`가 0인지 확인한다. (학기 코드가 비어 있는 오래된 점수 행은 남을 수 있다.) 마지막 결과의 세 값이 모두 `true`인지 확인한다.

- `autofill_function_ready`
- `week_topics_function_ready`
- `autofill_triggers_ready`

## 11B. 학기별 주차 주제 복구

`학기 및 주차` 화면은 학기별 주제를 `semester_weeks`에서 읽는데, 2026-08 이관 때 당시 운영 학기만 채워져 다른 학기는 비어 보였다. 현재 학기 `week_topics` → 학기 마감 스냅샷 → 제출 파일명 `(주제)` 순서로 **비어 있는 칸만** 채운다. 기존 주제와 다른 데이터는 바꾸지 않는다.

```powershell
Get-Content -Raw .\supabase\STEP_11B_RESTORE_WEEK_TOPICS.sql | Set-Clipboard
```

결과에서 학기별 `weeks_with_topic`이 0보다 큰지 확인한다. 제출 자료가 없던 주차는 비어 있을 수 있다.

## 12. 일정·마감·조 편성 학기별 분리

학기 전환 후에도 지난 학기의 타임라인(`pr_schedules`), 주차별 마감(`pr_deadlines`), 조 편성(`pr_config.weekly_setup`)이 새 학기에 그대로 남던 문제를 고친다. 행을 지우거나 옮기지 않는다.

- `pr_schedules`·`pr_deadlines`에 `semester_id`를 추가하고, 기존 행은 현재 운영 학기에 연결한다. 앱이 학기 ID 없이 저장한 행도 저장 시점의 운영 학기로 자동 연결된다.
- 마감 유일 조건을 `(week, category)`에서 `(semester_id, week, category)`로 바꾼다. 새 학기 3주차가 지난 학기 3주차 마감을 이어받지 않는다.
- 조 편성은 학기마다 `semesters.weekly_setup`에 보관한다. 학기를 전환하면 나가는 학기의 편성을 그 학기에 저장하고, 들어오는 학기의 편성(처음이면 빈 편성)을 `pr_config.weekly_setup`에 불러온다.

**STEP 11 다음, 다음 학기로 전환하기 전에 실행한다.** 기존 행은 실행 시점의 운영 학기로 연결되기 때문이다. 실행 직후 같은 변경이 들어간 앱을 배포한다. 기존 앱은 `semester_id`를 모르기 때문에 배포 전까지 마감을 저장하면 오류가 나고, 일정과 마감도 학기 구분 없이 보인다.

```powershell
Get-Content -Raw .\supabase\STEP_12_SEMESTER_SCOPED_OPERATIONS.sql | Set-Clipboard
```

첫 번째 결과에서 `pr_schedules`·`pr_deadlines` 행이 모두 현재 학기 코드로 표시되는지, `(학기 없음)`이 없는지 확인한다. `weekly_setup`의 `row_count`는 1이어야 한다. 마지막 결과의 네 값이 모두 `true`인지 확인한다.

- `semester_columns_ready`
- `deadline_unique_ready`
- `semester_triggers_ready`
- `activate_function_ready`

## 13. 자동 결석 처리 복구

STEP 10의 자동 결석 처리(벌금 화면을 열 때 실행)가 지금까지 결석 행을 하나도 만들지 못한 두 가지 원인을 고친다. 행을 지우거나 테이블을 바꾸지 않고 `admin_sync_missing_attendance` 함수만 다시 정의한다.

- 정규 세션의 출석 마감을 앱이 저장하지 않는 `semester_deadlines`에서 읽고 있었다. 이제 관리자 대시보드에서 저장하는 이 학기의 `pr_deadlines`(`attendance_end`)에서 읽는다.
- 평일세션 부분이 PostgreSQL에 없는 함수(`jsonb_object_length`)를 호출해 매번 오류로 끝났다. 같은 조건을 다른 방식으로 바꿨다.
- 취소된 주차·세션 제외, 사유서 결재 상태(완전인정·부분인정·무단)에 따른 결석 구분은 그대로다.

**STEP 12 다음에 실행한다.** STEP 12 전에 실행하면 `Run STEP_12_SEMESTER_SCOPED_OPERATIONS.sql first` 오류로 중단되고 아무것도 바뀌지 않는다. 실행 후 처음 벌금 화면을 열면, 현재 학기에서 출석 마감이 지난 정규 주차와 평일세션 중 출결 기록이 없는 인원이 한꺼번에 결석으로 기록된다. 실제로 출석했지만 기록이 빠진 인원이 있으면 그 전에 출결을 먼저 입력한다.

```powershell
Get-Content -Raw .\supabase\STEP_13_AUTO_ABSENCE_PR_DEADLINES.sql | Set-Clipboard
```

첫 번째 결과는 현재 학기의 정규 주차별 출석 마감이다. `members_without_attendance`는 다음 벌금 화면 스캔 때 정규 결석으로 기록될 인원 수다. 마감 전, 마감 미설정(`closed`가 비어 있음), 취소된(`cancelled`) 주차는 비어 있다. 평일세션 결석은 이 표에 나오지 않는다. 마지막 결과의 세 값이 모두 `true`인지 확인한다.

- `sync_function_ready`
- `deadlines_linked_ready`: 학기가 연결되지 않은 `pr_deadlines` 행이 없다
- `active_semester_config_ready`: 운영 학기와 `pr_config.current_semester`가 같다. `false`이면 자동 결석 처리가 건너뛰어진다

## 14. 취소한 주차 유지

학기 설정을 저장하거나 학기를 전환하면 기존 앱 호환 트리거(3단계)가 운영 학기의 모든 주차 상태를 현재 주차 기준으로 다시 계산했다. 그래서 `취소`로 저장한 주차가 곧바로 `완료`·`현재`·`예정`으로 되돌아갔고, 자동 결석 처리처럼 취소된 주차를 제외하는 기능은 취소 주차를 한 번도 보지 못했다. 트리거 함수(`sync_legacy_semester_config`)만 다시 정의해 `취소` 상태는 그대로 두고, 나머지 주차는 지금처럼 현재 주차에 따라 바뀌게 한다. 행을 바꾸거나 지우지 않는다.

3단계 이후 언제든 실행할 수 있다. 13단계를 실행했다면 처음 벌금 화면을 열기 전에 실행한다. 출석 마감이 지난 휴회 주차가 취소로 남아 있어야 결석 처리에서 빠진다.

```powershell
Get-Content -Raw .\supabase\STEP_14_KEEP_CANCELLED_WEEKS.sql | Set-Clipboard
```

마지막 결과의 두 값이 모두 `true`인지 확인한다.

- `bridge_keeps_cancelled_ready`
- `bridge_trigger_ready`

이미 되돌아간 주차는 복구되지 않는다. `학기 및 주차` 화면에는 주차를 취소하는 버튼이 없으므로, 휴회 주차가 있으면 실행 후 SQL Editor에서 직접 지정한다 (`N`을 주차 번호로 바꾼다). 이후 학기 설정을 저장하거나 현재 주차를 바꿔도 취소로 남는다.

```sql
update public.semester_weeks
set status = 'cancelled'
where semester_id = (select id from public.semesters where status = 'active')
  and week_no = N;
```

## 15. 주차 주제·세션 계획 저장 일원화

`운영 기준 > 학기 및 주차`와 `세션 및 제출` 화면이 같은 저장 경로(`semester_weeks`)로 주제를 저장하게 한다. 행을 지우지 않는다.

- `semesters.ot_topic` 컬럼을 추가해 W0(OT) 주제를 학기별로 보관한다. 운영 학기는 `pr_config.week_topics`의 `0`, 지난 학기는 학기 마감 스냅샷의 `topics`에서 **비어 있을 때만** 채운다.
- 운영 학기의 `semester_weeks` 주제 중 **비어 있는 칸만** `pr_config.week_topics`에서 채운다. 지난 학기는 현재 설정으로 채우지 않는다. 양쪽 값이 다른 칸은 바꾸지 않고 확인 2에 나열한다.
- `admin_save_semester_configuration`은 요청에 들어 있는 주차의 주제만 바꾼다. 화면에서 건드리지 않은 주제를 빈 값으로 덮어쓰지 않는다. 다른 탭에서 먼저 같은 칸을 바꿨다면 저장 전체를 되돌리고 `WEEK_TOPIC_CONFLICT`로 알린다.
- `admin_save_week_plan`을 추가한다. 세션 및 제출 화면의 한 주차(주제·조 편성·마감·장소 즐겨찾기)를 한 트랜잭션으로 저장하고, 충돌하면 `WEEK_PLAN_CONFLICT`로 되돌린다.
- 취소한 주차, 평일세션 주제, 지난 학기 스냅샷은 그대로 둔다.

**STEP 12 다음에 실행한다.** STEP 11·12가 없으면 `Run STEP_11…first` / `Run STEP_12…first` 오류로 중단되고 아무것도 바뀌지 않는다. 이 단계를 실행하기 전에는 새 앱의 `학기 및 주차` 저장 버튼이 잠겨 있고, `세션 및 제출` 저장은 "STEP 15를 먼저 실행" 안내와 함께 실패한다(데이터는 바뀌지 않는다).

```powershell
Get-Content -Raw -Encoding UTF8 .\supabase\STEP_15_WEEK_PLAN_SINGLE_SOURCE.sql | Set-Clipboard
```

- 확인 1: 학기별 `weeks_with_topic`·`has_w0_topic`. 운영 학기는 기존 `week_topics`에 있던 주차 수만큼 채워져 있어야 한다.
- 확인 2: 행이 없으면 정상이다. 행이 있으면 같은 주차의 주제가 두 곳에서 다르다는 뜻이며, `학기 및 주차` 화면의 "예전 설정값과 다른 주제" 표에서 어느 쪽을 쓸지 고른다.
- 확인 3: 다섯 값이 모두 `true`인지 확인한다.
  - `ot_topic_column_ready`
  - `week_plan_function_ready`
  - `legacy_refresh_ready`
  - `semester_save_keeps_topics_ready`
  - `week_topics_include_w0_ready`

## 16. 학회원 선택으로 관리자 권한 부여

이메일을 입력하는 대신 학회원을 검색해서 그 학회원의 로그인 계정에 권한을 준다. 로그인 계정이 연결되지 않은 학회원은 거절하며, 이름으로 계정을 만들거나 연결하지 않는다. 기존 `admin_users` 행과 이메일 방식 권한 부여 함수는 그대로 둔다. 모든 부여는 `admin_access_audit`에 학회원 ID와 함께 남는다.

**STEP 7 다음에 실행한다.** STEP 7이 없으면 `Run STEP_7_ADMIN_ACCESS_MANAGEMENT.sql first` 오류로 중단된다.

```powershell
Get-Content -Raw -Encoding UTF8 .\supabase\STEP_16_ADMIN_ACCESS_BY_MEMBER.sql | Set-Clipboard
```

- 확인 1: 관리자 계정별 연결 학회원. `member_name`이 비어 있는 계정은 학회원 명단과 연결되지 않은 계정이다(권한은 그대로 유지된다).
- 확인 2: 네 값이 모두 `true`인지 확인한다.
  - `candidates_ready`
  - `list_ready`
  - `grant_member_ready`
  - `active_super_admin_ready`

## 17. 연결 확인이 필요한 기존 기록 검토

`data_migration_issues`는 실패한 SQL이 아니라, 2026-08 이관 때 작성자를 학회원 한 명으로 특정하지 못한 기록 목록이다. 관리자 화면 `기록 연결 검토`에서 항목을 하나씩 확인하고 연결·종료할 수 있게 한다. 일괄 해결과 이름만으로 자동 연결하는 기능은 없다.

- `admin_record_link_report()`: 읽기 전용. 열린 항목을 지금 상태로 다시 분류한다(이미 연결됨, 원본 삭제됨, 시스템 행, 가입 승인 대기, 연결 필요). 후보는 근거(같은 로그인 계정, 같은 이름)와 함께 보여 주기만 한다.
- `admin_link_record(...)`: 관리자가 고른 학회원으로 **기록 한 건**을 연결한다. 허용된 테이블의 학회원 컬럼이 비어 있을 때만 채우고, 다시 읽어 확인한 뒤에만 항목을 닫는다.
- `admin_close_record_issue(...)`: 사유가 지금 사실일 때만(이미 연결됨·원본 삭제·시스템 행·가입 처리 완료) 한 건을 닫는다.
- 로그인한 학회원이 자기 자신에 대해 새로 쓰는 출석·사유서·업로드·댓글·채점 행에는 로그인 계정의 학회원 ID가 자동으로 들어간다. 다른 사람을 대신해 쓴 행은 검토 대상으로 남긴다.

행을 지우지 않고, 기록에 저장된 이름도 바꾸지 않는다. 1단계(`202608220001_normalize_core.sql`) 이후 언제든 실행할 수 있다.

```powershell
Get-Content -Raw -Encoding UTF8 .\supabase\STEP_17_RECORD_LINK_REVIEW.sql | Set-Clipboard
```

- 확인 1: 열린 항목을 지금 상태(`current_state`)로 다시 센 개수. `needs_link`만 실제로 사람이 연결해야 하는 항목이다. `already_linked`·`source_deleted`·`system_row`는 화면에서 사유를 확인하고 한 건씩 닫는다.
- 확인 2: 네 값이 모두 `true`인지 확인한다.
  - `report_ready`
  - `link_ready`
  - `close_ready`
  - `actor_triggers_ready` (출결·사유서·파일·댓글·점수 5개 트리거)

## 18. 졸업생 인터뷰 한 줄 요약·랜딩 일정 자동 표시

컬럼만 추가한다. 행을 바꾸거나 지우지 않는다.

- `pr_about_alumni`: `summary_line`(카드에 보이는 "인터뷰 한 줄 요약"), `summary_origin`(`ai`/`manual`), `summary_source_hash`(인터뷰 내용이 바뀌면 "요약 갱신 필요" 표시), `summary_model`, `summary_generated_at`. 인터뷰이 본인의 말인 `short_quote`는 그대로 둔다.
- `pr_landing_config.schedule_mode`: 기본값 `auto`(이번 학기 공개 일정 중 오늘 이후 4개를 자동 표시). `manual`이면 지금처럼 고른 일정(`selected_schedules`)을 보여 준다.

이 단계 전에는 관리자 `학회 소개`의 요약 만들기·편집이 잠겨 있고(기존 인용구만 저장된다), `메인` 화면의 "직접 선택"이 잠겨 있다(자동 표시는 동작한다).

```powershell
Get-Content -Raw -Encoding UTF8 .\supabase\STEP_18_SITE_CONTENT_SUMMARY_AND_LANDING.sql | Set-Clipboard
```

- 확인 1: 알럼나이 인터뷰 목록. `id`가 실행 전과 같고 `summary_line`은 비어 있어야 한다.
- 확인 2: `alumni_summary_columns_ready`·`landing_schedule_mode_ready`가 `true`, `current_landing_mode`가 `auto`인지 확인한다.

## 18B. 학회장·개발자 역할 분리 (2026-10-20 적용 완료)

처음에는 STEP 20이라는 이름으로 전달했다. 같은 날 다른 작업의 STEP 19~23과 번호가 겹쳐 파일 이름만 바꿨고, 이미 실행했다면 다시 실행할 필요가 없다. STEP 19~23과 겹치는 함수는 없다.

- 새 역할 `developer`(개발자)를 추가한다. 개발자는 모든 관리자 검사를 통과하고, 기존 기록 연결 검토(STEP 17 함수)는 개발자만 쓸 수 있다. 개발자 역할은 개발자만 주고 바꿀 수 있다.
- `super_admin`은 DB 값은 그대로 두고 앱에서 **학회장**으로 표시한다. 학회장은 관리자 권한 조회·변경을 한다(개발자 계정 제외).
- 자기 계정의 역할·사용 여부는 스스로 바꿀 수 없고, 활성 학회장 또는 개발자가 최소 한 명은 남아야 한다.
- `admin_list_access()`가 계정 종류를 함께 돌려준다: 학회원 명단 연결 · 🎓 졸업생(졸업생 명단과 연결, 졸업생으로 가입 요청, 또는 가입 이름이 졸업생 명단의 한 명과만 같음 — 이 경우도 연결하지는 않는다) · 명단 미연결.

**STEP 16·17 다음에 실행한다.** 실행 전에 SQL 안의 `REPLACE_WITH_DEVELOPER_LOGIN_EMAIL`을 개발자 로그인 이메일로 바꾼다. 바꾸지 않으면 개발자 지정만 건너뛰고 나머지는 적용된다(이 경우 기록 연결 검토는 아무도 못 쓰므로, 이메일을 넣어 다시 실행한다). 다시 실행해도 안전하다.

```powershell
Get-Content -Raw -Encoding UTF8 .\supabase\STEP_18B_DEVELOPER_AND_PRESIDENT_ROLES.sql | Set-Clipboard
```

- 확인 1: 역할별 계정과 `account_kind`. 개발자 행이 맨 위에 보여야 한다.
- 확인 2: 여섯 값이 모두 `true`인지 확인한다.
  - `role_check_ready`
  - `developer_passes_admin_ready`
  - `records_developer_only_ready`
  - `list_account_kind_ready`
  - `developer_assigned` (이메일을 넣었을 때)
  - `lead_account_ready`

## 19. 공개 키로 개인 기록 읽기 차단 (2026-10-20 적용 완료)

로그인하지 않은 공개 키(anon, 브라우저에 그대로 들어 있는 키)로 출결(`pr_attendance`)·벌금(`pr_fines`)·사유서(`absence_forms`, 사유·증빙 링크·관리자 코멘트 포함)·평가 점수(`scores`)·피드백 댓글(`file_comments`)의 모든 행을 읽을 수 있었다. 2026-10-20 점검 때 공개 키로 출결 174행, 벌금 269행, 사유서 4행, 점수 1,254행, 댓글 1,054행이 전부 조회됐다.

공개 페이지(메인·소개·일정·활동·쇼케이스·로그인·회원가입)는 이 다섯 테이블을 읽지 않는다. 학회원 화면과 관리자 화면은 모두 로그인을 확인한 뒤 로그인 계정(`authenticated`)으로 읽는다. 그래서 공개 키의 접근만 없애고, 로그인한 학회원과 관리자가 읽고 쓰는 범위는 그대로 둔다. 사유서 게시판에서 학회원끼리 사유서를 보는 기능도 그대로다.

- 다섯 테이블에서 역할이 `public`(모든 역할) 또는 `anon`인 정책을 `authenticated` 전용으로 바꾼다. 조건식(`using`·`with check`)은 바꾸지 않는다. `anon`만 대상인 정책은 지운다.
- 다섯 테이블에 대한 `anon`의 테이블 권한을 회수한다. RLS가 꺼진 테이블도 이것으로 막힌다. RLS를 켜거나 끄지 않는다.
- STEP 17의 내부 함수 `record_link_source`·`record_link_classify`를 `anon`·`authenticated`가 직접 호출하지 못하게 한다. Supabase는 새 함수에 `anon` 실행 권한을 따로 주기 때문에 STEP 17의 `revoke ... from public`만으로는 공개 키로 `record_link_source`(관리자 확인 없이 기록 행을 돌려줌)를 호출할 수 있었다. 관리자 화면 `기록 연결 검토`는 이 함수를 관리자 함수 안에서만 쓰므로 영향이 없다.
- 변경 전 정책·권한을 `ig_backup_step19.access_before`에 저장한다(처음 실행할 때만). API로 노출되지 않는 스키마다.
- 실행 중에 공개 키와 로그인 계정으로 각각 행 수를 센다(행 내용은 읽지 않는다). 로그인 계정의 행 수가 실행 전과 달라지면 전체를 되돌리고 `signed-in member reads changed` 오류로 멈춘다.

행을 추가·수정·삭제하지 않는다. 앱 변경이나 배포는 필요 없다. **STEP 17 다음에 실행한다.** STEP 17을 아직 실행하지 않았어도 실행할 수 있지만, 그 경우 STEP 17을 실행한 뒤 STEP 19를 한 번 더 실행한다(다시 실행해도 안전하다).

실행 전 확인 (읽기 전용, 아무것도 바꾸지 않는다). 지금은 다섯 테이블 모두 `anon_can_select`가 `true`로 나온다.

```sql
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  has_any_column_privilege('anon', c.oid, 'SELECT') as anon_can_select,
  coalesce((
    select string_agg(format('%s (%s, %s)', p.policyname, array_to_string(p.roles, ','), p.cmd), ' / ' order by p.policyname)
    from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname
  ), '(정책 없음)') as policies
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('pr_attendance', 'pr_fines', 'absence_forms', 'scores', 'file_comments')
order by c.relname;
```

```powershell
Get-Content -Raw -Encoding UTF8 .\supabase\STEP_19_BLOCK_ANON_RECORD_READS.sql | Set-Clipboard
```

결과는 6행이며 모두 `ok`가 `true`여야 한다.

- 테이블 5행: `anon_before`는 실행 전 공개 키로 읽히던 행 수, `anon_after`는 `blocked`(공개 키로 읽을 수 없음)이다. `member_before`와 `member_after`는 같은 숫자다(로그인한 학회원이 읽는 행 수가 그대로). 다시 실행하면 `anon_before`도 `blocked`로 나온다.
- `other_paths` 1행: 공개 키로 같은 기록에 닿는 다른 경로(STEP 17 내부 함수, STEP 0 백업 스키마, 이 테이블을 읽는 공개 뷰나 관리자 확인 없는 함수)가 없으면 `true`다. `note`에 `STEP 17 미실행`이 보이면 STEP 17 실행 후 STEP 19를 다시 실행한다. `공개 뷰:`·`공개 함수:` 뒤에 이름이 나오면 앱이 쓰지 않는 예전 객체이므로 지우기 전에 이름을 알려 준다.
- `note`의 `RLS 꺼짐`은 오류가 아니다. 그 테이블은 원래 로그인 사용자에게 제한이 없었고, 이번 단계에서도 그대로 둔다.
- `anon_after`가 `skipped`이면 SQL Editor 계정이 역할 전환을 못 해서 직접 세지 못했다는 뜻이다. 이때는 권한·정책 기준으로 `ok`를 판단한다.

실행 후 로그인하지 않은 브라우저(시크릿 창)에서 메인·소개·일정 화면이 그대로 열리는지, 로그인한 계정으로 마이페이지·사유서 게시판·출석 체크·평가 결과·관리자 벌금 화면이 그대로 열리는지 확인한다.

되돌리기 (문제가 있을 때만). 실행 전 정책 역할과 `anon` 권한을 스냅샷대로 되돌린다. STEP 17 내부 함수와 백업 스키마 권한은 되돌리지 않는다.

<!-- step19-rollback -->
```sql
begin;

do $$
declare
  snap record;
begin
  if to_regclass('ig_backup_step19.access_before') is null then
    raise exception 'STEP 19 snapshot not found';
  end if;

  for snap in
    select table_name, name, detail
    from ig_backup_step19.access_before
    where kind = 'policy'
  loop
    if exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = snap.table_name and policyname = snap.name
    ) then
      execute format('alter policy %I on public.%I to %s', snap.name, snap.table_name, snap.detail ->> 'roles_sql');
    else
      execute snap.detail ->> 'create_sql';
    end if;
  end loop;

  for snap in
    select table_name, detail
    from ig_backup_step19.access_before
    where kind in ('table_grant', 'column_grant')
  loop
    execute format(
      'grant %s%s on public.%I to %s',
      snap.detail ->> 'privilege',
      case when snap.detail ? 'column' then format(' (%I)', snap.detail ->> 'column') else '' end,
      snap.table_name,
      case when snap.detail ->> 'grantee' = 'PUBLIC' then 'public' else quote_ident(snap.detail ->> 'grantee') end);
  end loop;
end;
$$;

commit;
```

## 20. 승인된 학회원·관리자만 개인 기록 읽기 (2026-10-20 적용 완료)

회원가입은 누구나 할 수 있다. 가입 화면의 학회 코드는 브라우저에서만 확인하므로, 공개 키로 `signUp`을 직접 호출하면 코드 없이도 계정이 생긴다. 새 계정은 관리자가 승인하기 전까지 학회원 상태가 `pending`(승인 대기)이지만 이미 로그인 계정(`authenticated`)이다. 그래서 STEP 19 이후에도 승인 전 계정이 출결(`pr_attendance`)·벌금(`pr_fines`)·사유서(`absence_forms`, 사유·증빙 링크·관리자 코멘트 포함)·평가 점수(`scores`)·피드백 댓글(`file_comments`)의 모든 행을 읽고, 정책이 허용하는 쓰기(출석 체크, 사유서 제출, 채점, 댓글)도 할 수 있었다.

이번 단계 후 다섯 테이블을 읽고 쓸 수 있는 계정은 다음 두 종류다.

- 승인된 학회원: 로그인 계정에 연결된 학회원(`members.auth_user_id`)의 상태가 활동·휴회·비활동·졸업(`active`·`leave`·`inactive`·`alumni`)인 계정. 승인 대기(`pending`)와 학회원 행이 없는 계정만 빠진다. 관리자 `학회원` 화면에서 승인하면 그 즉시 읽을 수 있다(SQL을 다시 실행할 필요 없음).
- 관리자: 활성 관리자 권한이 있는 계정(최고관리자·관리자·운영진·열람자). 학회원 행이 없거나 승인 대기여도 관리 화면은 그대로 열린다.

바꾸는 것은 다음과 같다.

- 판별 함수 `public.is_approved_member()`를 추가한다.
- 다섯 테이블에 제한 정책(restrictive) `ig_step20_approved_only`를 하나씩 추가한다. Postgres는 제한 정책을 기존 정책과 AND로 묶으므로 기존 정책의 조건식(`using`·`with check`)은 다시 쓰지 않는다. 승인 학회원과 관리자가 읽고 쓰는 범위는 지금과 같고, 승인 전 계정에게는 행이 0개로 보이며 추가·수정·삭제는 거절된다.
- RLS가 꺼진 테이블이 있으면, 로그인 계정이 지금처럼 모두 읽고 쓰도록 허용 정책 `ig_step20_signed_in_all`을 먼저 만들고 RLS를 켠다.
- 변경 전 RLS 상태와 정책을 `ig_backup_step20.access_before`에 저장한다(처음 실행할 때만). API로 노출되지 않는 스키마다.
- 실행 중에 승인 학회원·승인 전 계정·관리자·열람자 계정 한 명씩으로 행 수를 센다(행 내용은 읽지 않는다). 승인 학회원·관리자·열람자의 행 수가 실행 전과 달라지면 전체를 되돌리고 `approved member or admin reads changed` 오류로 멈춘다.

행을 추가·수정·삭제하지 않는다. 앱 변경이나 배포는 필요 없다. **STEP 19 다음에 실행한다.** STEP 19 전에 실행하면 `run STEP 19 first` 오류로 멈추고 아무것도 바뀌지 않는다.

실행 전 확인 (읽기 전용, 아무것도 바꾸지 않는다). 이번 단계 후 기록을 읽을 수 없게 되는 로그인 계정 목록이다(관리자 제외). 2026-08 이관 때 학회원 명단과 이름·기수가 맞지 않은 기존 가입자는 `승인 대기`로 들어갔으므로, 실제로 활동 중인 학회원이 이 목록에 있을 수 있다. `own_records`(이 계정으로 남은 출결·벌금·사유서·점수·댓글 수)가 0보다 크거나 `roster_match`(같은 이름의 승인 학회원 행이 로그인 연결 없이 있음)가 `true`인 계정은 실제 학회원일 가능성이 높다. 실제 학회원이면 관리자 `학회원` 화면의 `가입 승인 대기`에서 먼저 승인한다.

```sql
with accounts as (
  select
    u.id as user_id,
    u.created_at,
    u.last_sign_in_at,
    m.id as member_id,
    m.requested_status,
    nullif(trim(coalesce(m.name, p.name, u.raw_user_meta_data ->> 'name')), '') as name,
    coalesce(m.generation, p.student_id, u.raw_user_meta_data ->> 'student_id') as generation
  from auth.users u
  left join public.members m on m.auth_user_id = u.id
  left join public.profiles p on p.id = u.id
  where not exists (select 1 from public.admin_users au where au.user_id = u.id and au.is_active)
    and (m.id is null or m.status not in ('active', 'leave', 'inactive', 'alumni'))
)
select
  case when a.member_id is null then '학회원 연결 없음' else '승인 대기' end as account_type,
  a.name,
  a.generation,
  case a.requested_status when 'alumni' then '졸업' when 'active' then '활동' end as requested,
  a.created_at::date as signed_up,
  a.last_sign_in_at::date as last_sign_in,
  (select count(*) from public.pr_attendance r where r.member_id = a.member_id or (r.member_id is null and trim(r.user_name) = a.name))
  + (select count(*) from public.pr_fines r where r.member_id = a.member_id or (r.member_id is null and trim(r.user_name) = a.name))
  + (select count(*) from public.absence_forms r where r.member_id = a.member_id or (r.member_id is null and trim(r.user_name) = a.name))
  + (select count(*) from public.scores r where r.voter_member_id = a.member_id or (r.voter_member_id is null and trim(r.voter_name) = a.name))
  + (select count(*) from public.file_comments r where r.user_id = a.user_id or r.member_id = a.member_id) as own_records,
  exists (
    select 1 from public.members roster
    where roster.auth_user_id is null
      and roster.status in ('active', 'leave', 'inactive', 'alumni')
      and public.normalize_member_name(roster.name) = public.normalize_member_name(a.name)
  ) as roster_match
from accounts a
order by own_records desc, roster_match desc, a.created_at;
```

```powershell
Get-Content -Raw -Encoding UTF8 .\supabase\STEP_20_RECORDS_APPROVED_MEMBERS_ONLY.sql | Set-Clipboard
```

결과는 7행이며 모두 `ok`가 `true`여야 한다. 칸의 `a -> b`는 실행 전 -> 실행 후 행 수다.

- 테이블 5행: `member`(승인 학회원 계정)·`admin`(관리자 계정)·`viewer`(열람자 계정)는 양쪽 숫자가 같다. `unapproved`(승인 전 계정)는 `N -> 0`이다. 다시 실행하면 `unapproved`가 `0 -> 0`으로 나온다. 열람자 계정이 없으면 `viewer`는 `skipped -> skipped`이고 `note`에 `열람자 계정 없음`이 보인다(오류 아님). 승인 대기 계정이 하나도 없으면 학회원 행이 없는 가상 계정으로 세고 `note`에 그렇게 적힌다.
- `note`의 `RLS를 켬`: 그 테이블은 RLS가 꺼져 있었다. 로그인 계정 전체 허용 정책을 함께 만들었으므로 승인 학회원·관리자는 지금과 같다.
- `accounts` 1행: `member`는 승인 학회원 계정 수, `unapproved`는 읽기 불가 계정 수, `admin`은 관리자 계정 수다. `ok`가 `false`이면 기록이 있거나 같은 이름의 학회원이 있는 읽기 불가 계정이 있다는 뜻이다. `select * from ig_backup_step20.blocked_accounts();`(실행 전 확인과 같은 목록)로 이름을 보고, 실제 학회원이면 관리자 `학회원` 화면에서 승인한다. 승인하면 바로 읽을 수 있고 SQL을 다시 실행할 필요는 없다. 확인해 보니 학회원이 아니면 `false`는 그대로 둬도 된다.
- `other_paths` 1행: 승인 확인 없이 로그인 계정이 호출할 수 있는 보안 정의 함수나 RLS를 거치지 않는 뷰가 없으면 `true`다. 이름이 나오면 지우거나 고치기 전에 이름을 알려 준다.
- `member`가 `skipped`이면 승인 학회원 계정이 없거나 SQL Editor 계정이 역할 전환을 못 한 것이다. 이때는 정책 기준으로만 `ok`를 판단한다.
- STEP 20 이후 STEP 19를 다시 실행하면 STEP 19 결과의 `member_before`·`member_after`가 `0`으로 나온다. STEP 19는 학회원 행이 없는 로그인 계정으로 세기 때문이며 정상이다.

화면별 영향. 승인 학회원과 관리자는 모든 화면이 지금과 같다. 아래 `승인 전 계정` 칸은 승인 대기 계정이나 학회원 행이 없는 계정이 로그인했을 때다.

| 화면 | 다섯 테이블 사용 | 승인 학회원·관리자 | 승인 전 계정 |
| --- | --- | --- | --- |
| 홈 `/home`, 마이페이지 `/mypage` (`lib/myRecords.js`) | 출결·벌금·사유서 읽기 (본인 기록) | 같음 | 본인 기록이 모두 비어 보인다 (오류 없음) |
| 출석 `/attendance` | 출결 읽기 (이번 주차 본인), 출석 체크 추가 | 같음 | 출석 체크 때 `서버 저장 중 오류가 발생했습니다: new row violates row-level security policy ...` |
| 사유서 게시판 `/archive/absence` | 사유서 읽기 (이번 학기 전체, 학회원끼리 열람), 제출 | 같음 (학회원끼리 열람 유지) | 게시판이 비어 보이고, 제출 때 `제출하지 못했습니다: new row violates ...` |
| 아카이브 `/archive` 과거 자료실 | 지난 학기 사유서 읽기 | 같음 | 지난 학기 사유서 부분이 비어 보인다 |
| 기획서 제출 `/dashboard/proposal` | 피드백 댓글 읽기·작성·수정·삭제 | 같음 | 댓글이 보이지 않고 작성이 거절된다 |
| 발표영상 `/dashboard/video` | 본인 채점 임시저장 읽기, 피드백 댓글 읽기·작성·수정·삭제 | 같음 | 댓글·임시저장이 비어 보이고 작성이 거절된다 |
| 발표 채점 `/vote/score`, 임시저장 피드백 `/vote/feedback` | 점수 읽기 (본인)·추가·수정 | 같음 | 목록이 비어 보이고 저장이 거절된다 |
| 내 결과 `/vote/results/my`, 베스트 프레젠터 `/vote/results/ranking` | 점수 읽기 (학기 전체) | 같음 | 결과·순위가 비어 보인다 |
| 받은 피드백 `/vote/results/arxiv` | 피드백 댓글 읽기 | 같음 | 비어 보인다 |
| 관리자 사유서·출결·벌금·초기화·투표 설정 `/admin/hub/absence`·`attendance`·`fine`·`reset`·`vote/setup` | 다섯 테이블 읽기·쓰기 | 같음 (열람자 포함, 학회원 행이 없거나 승인 대기인 관리자 포함) | 관리 화면에 들어갈 수 없다 (원래부터 관리자 권한 확인) |
| 관리자 기록 연결 검토 `/admin/hub/records`, 결재·자동 결석 처리 | 보안 정의 관리자 함수 (`is_admin` 확인) | 같음 | 해당 없음 |
| 공개 페이지 (메인·소개·일정·활동·쇼케이스·로그인·회원가입) | 사용 안 함 | 같음 | 같음 |

앱 안내 제안 (이번 단계에 포함하지 않음): 지금 학회원 화면(`app/components/MemberShell.js`)은 승인 여부를 보지 않는다. STEP 20 후 승인 전 계정은 빈 화면과 영문 RLS 오류를 보게 되므로, 학회원 공통 틀에서 로그인 계정의 학회원 상태가 `pending`이거나 학회원 행이 없고 관리자도 아니면 본문 대신 "가입 승인 대기 중입니다. 운영진이 승인하면 이용할 수 있습니다" 안내와 로그아웃 버튼을 보여 주는 것이 좋다. 화면은 이미 읽고 있는 `identity.member.status`·`identity.admin`만으로 판단할 수 있어 DB 변경은 필요 없다.

실행 후 승인된 학회원 계정으로 홈·마이페이지·출석·사유서 게시판·발표 채점·내 결과가, 관리자 계정(열람자 포함)으로 사유서 결재함·출결·벌금 화면이 그대로 열리는지 확인한다. 승인 대기 계정이 있으면 그 계정으로 사유서 게시판이 비어 보이는지 확인한다.

되돌리기 (문제가 있을 때만). STEP 20이 추가한 정책을 지우고, STEP 20이 켠 RLS만 다시 끈다. 판별 함수 `public.is_approved_member()`는 남겨 둔다(어디에서도 쓰이지 않으면 영향 없음). STEP 19 상태로 돌아간다.

<!-- step20-rollback -->
```sql
begin;

do $$
declare
  target text;
  snap record;
begin
  if to_regclass('ig_backup_step20.access_before') is null then
    raise exception 'STEP 20 snapshot not found';
  end if;

  foreach target in array array['pr_attendance', 'pr_fines', 'absence_forms', 'scores', 'file_comments'] loop
    execute format('drop policy if exists ig_step20_approved_only on public.%I', target);
  end loop;

  -- STEP 20이 RLS를 켠 테이블만 다시 끄고, 그때 만든 허용 정책을 지운다
  for snap in
    select table_name
    from ig_backup_step20.access_before
    where kind = 'rls'
      and not (detail ->> 'rls_enabled')::boolean
  loop
    execute format('alter table public.%I disable row level security', snap.table_name);
    execute format('drop policy if exists ig_step20_signed_in_all on public.%I', snap.table_name);
  end loop;

  -- 같은 이름의 함수가 STEP 20 전부터 있었다면 원래 정의로 되돌린다
  for snap in
    select detail
    from ig_backup_step20.access_before
    where kind = 'function'
  loop
    execute snap.detail ->> 'definition';
  end loop;
end;
$$;

commit;
```

## 21. 승인 전 계정·공개 키로 나머지 학회원 데이터 막기 (2026-10-20 적용 완료)

STEP 20은 다섯 기록 테이블만 막았다. 그 밖의 학회원 데이터는 승인 전 계정(가입만 하고 승인받지 않은 계정: 학회원 상태 `pending` 또는 학회원 행 없음)과 공개 키(anon)가 여전히 읽고, 대시보드에서 만든 정책이 허용하는 만큼 쓸 수 있다. 저장소(`supabase/`)에 정책이 있는 것은 새 구조 테이블(`members`·`semester_*`·`sessions`·`calendar_events` 등)뿐이고, 예전 테이블(`files_metadata`·`pr_config`·`profiles` 등)과 저장소 버킷의 정책은 대시보드에서 만들어져 모양을 알 수 없다.

- 학회원 명단 `members`: `members_authenticated_read`(`using (true)`) 때문에 로그인 계정이면 승인 대기 신청자와 비공개 학회원을 포함한 모든 행(로그인 계정 ID·신청 구분 포함)이 보인다.
- 제출물 `files_metadata`: 기획서 파일 주소(공개 버킷 `ig-files`), 슬라이드 드라이브 링크, 영상 링크, 제출자·지각 여부·조.
- 아카이브 `archive_files`, 발표 순서 `presentations`, 채점 기준 `pr_vote_criteria`, 마감 `pr_deadlines`, 회칙 `club_rules`, 주차 주제 `semester_weeks`.
- 운영 설정 `pr_config`: 평일세션 조 편성(이름별), 세션 장소 좌표, 벌금 규정 등. 비공개 일정, 학기 참여 명단 전체, 가입 정보 `profiles`(모든 가입자의 이름·기수).
- 쓰기: 예전 명단 `pr_members`에 행을 쓰면 트리거가 이름·기수가 같은 학회원을 `active`로 바꾼다. 대시보드 정책이 허용하면 승인 대기 계정이 스스로 승인되거나, 공개 키로 다른 신청자를 승인할 수 있다. `pr_config`의 `current_semester`를 쓰면 운영 학기가 바뀐다. 공개 사이트 콘텐츠(메인·소개·활동·쇼케이스)도 정책에 따라 고칠 수 있다.

이번 단계 후 범위는 다음과 같다. 승인 기준은 STEP 20과 같다(`public.is_approved_member()` 또는 관리자 권한, 열람자 포함).

| 계정 | 읽기 | 쓰기 |
| --- | --- | --- |
| 승인 학회원·관리자 | 지금과 같음 | 지금과 같음. 단 `members`·`pr_members`·`pr_members_config`는 관리자(최고관리자·관리자·운영진)만 쓴다. 앱에서 학회원이 이 세 테이블에 직접 쓰는 화면은 없다 |
| 승인 전 계정 | 공개 페이지에 나오는 행, 본인 `members`·`profiles` 행 | 본인 `profiles` 행 추가(가입 직후 명단 등록)만 |
| 공개 키 (로그아웃) | 공개 페이지에 나오는 행 | 가입 화면의 `profiles` 추가만 |

공개 페이지에 나오는 행: `members`는 공개(`is_public`)이고 승인 대기가 아닌 행(지금 공개 키 범위와 같다), `semester_memberships`는 STEP 6의 공개 명단 조건, `pr_config`는 공개 페이지가 읽는 다섯 키(`landing_content`·`schedule_content`·`recruiting_generation`·`application_form_url`·`members_group_photo`), `pr_schedules`·`sessions`·`calendar_events`는 공개 행, 공개 사이트 테이블(`pr_landing_config`·`pr_showcase`·`pr_about_*`·`pr_activities_*`)은 전부. `semesters`는 바꾸지 않는다.

바꾸는 것은 다음과 같다.

- 대상 테이블마다 명령별 제한 정책(restrictive) `ig_step21_*`을 추가한다(STEP 20과 같은 방식). 기존 정책의 조건식은 다시 쓰지 않는다.
- RLS가 꺼진 테이블은 공개 키·로그인 계정이 지금처럼 읽고 쓰도록 허용 정책 `ig_step21_keep_current`를 먼저 만들고 RLS를 켠다.
- 저장소 `storage.objects`: 버킷 `ig-files`(기획서 파일)·`showcase`(공개 사이트 이미지·자료)의 목록 보기·올리기·지우기를 승인 학회원·관리자로 제한한다(`ig_step21_storage`·`ig_step21_storage_anon`). 공개 주소로 파일을 여는 것은 RLS와 무관하므로 공개 사이트 이미지와 이미 공유된 파일 링크는 그대로 열린다. SQL Editor 계정이 저장소 정책을 만들 권한이 없으면 이 부분만 건너뛰고 결과에 표시한다.
- `refresh_legacy_week_topics`(관리자 확인 없이 `pr_config.week_topics`를 다시 쓰는 함수)를 공개 키·로그인 계정이 직접 호출하지 못하게 한다. 관리자 주차 저장 함수 안에서만 쓰므로 영향이 없다.
- `ig_backup_*` 백업 스키마에 공개 키·로그인 계정 접근 권한이 있으면 회수한다.
- 변경 전 RLS 상태·정책·함수와 스키마 권한을 `ig_backup_step21.access_before`에 저장한다(처음 실행할 때만). API로 노출되지 않는 스키마다.
- 실행 중에 공개 키·승인 학회원·승인 전 계정·관리자·열람자로 행 수를 센다(행 내용은 읽지 않는다). 승인 학회원·관리자·열람자의 행 수, 또는 공개 사이트 테이블을 공개 키·승인 전 계정이 읽는 행 수가 실행 전과 달라지면 전체를 되돌리고 `approved member, admin or public site reads changed` 오류로 멈춘다.

행을 추가·수정·삭제하지 않는다. 앱 변경이나 배포는 필요 없다. **STEP 20 다음에 실행한다.** STEP 20 전에 실행하면 `Run STEP 20 first` 오류로 멈추고 아무것도 바뀌지 않는다.

실행 전 확인 (읽기 전용, 아무것도 바꾸지 않는다). 대상 테이블과 저장소의 지금 RLS·정책이다. 결과를 저장해 두면 실행 후와 비교하기 쉽다. `anon_can_select`가 `true`이고 `policies`에 `public` 역할의 `SELECT` 정책이 있으면 공개 키로 그 테이블을 읽을 수 있다는 뜻이다.

```sql
select
  n.nspname || '.' || c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  has_any_column_privilege('anon', c.oid, 'SELECT') as anon_can_select,
  coalesce((
    select string_agg(
      format('%s (%s, %s%s)', p.policyname, array_to_string(p.roles, ','), p.cmd,
        case when p.permissive = 'RESTRICTIVE' then ', 제한' else '' end),
      ' / ' order by p.policyname)
    from pg_policies p
    where p.schemaname = n.nspname and p.tablename = c.relname
  ), '(정책 없음)') as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where (n.nspname = 'public' and c.relname in (
    'files_metadata', 'archive_files', 'presentations', 'pr_vote_criteria', 'pr_deadlines', 'club_rules',
    'semester_weeks', 'semester_deadlines', 'session_participants', 'pr_members', 'pr_members_config',
    'members', 'profiles', 'semester_memberships', 'pr_config', 'pr_schedules', 'sessions', 'calendar_events',
    'pr_landing_config', 'pr_showcase', 'pr_about_content', 'pr_about_alumni', 'pr_activities_content',
    'pr_activities_regular_routine', 'pr_activities_edu_curriculum', 'pr_activities_union_projects',
    'pr_activities_corp_projects', 'pr_activities_corp_partners'))
   or (n.nspname = 'storage' and c.relname = 'objects')
order by 1;
```

```powershell
Get-Content -Raw -Encoding UTF8 .\supabase\STEP_21_MEMBER_SPACE_APPROVED_ONLY.sql | Set-Clipboard
```

결과는 테이블 행, 저장소 2행, `signup_auto_link`·`other_tables`·`other_paths`다. 칸의 `a -> b`는 실행 전 -> 실행 후 행 수다. `ok`가 비어 있는 행은 정보이고, 나머지는 `true`여야 한다.

- `학회원 전용` 행: `anon`(공개 키)·`unapproved`(승인 전 계정)는 `N -> 0`, `member`(승인 학회원)·`admin`(관리자)·`viewer`(열람자)는 양쪽 숫자가 같다.
- `공개 행만` 행: `anon`·`unapproved`가 `note`의 `공개 행 N` 이하로 줄어든다(`members`·`profiles`는 승인 전 계정 본인 행 1개까지 더). `members`의 `anon`은 원래 공개 행만 보였으므로 그대로다.
- `공개 (쓰기만 제한)` 행: 다섯 칸 모두 양쪽 숫자가 같다. 쓰기만 막는다.
- `pr_config`의 `note`에 `공개 키·승인 전 계정에서 숨긴 설정` 목록이 나온다. 공개 페이지에 보여야 하는 설정이 섞여 있으면 알려 준다. `아직 없는 공개 설정`은 오류가 아니다(관리자 화면에서 아직 저장한 적이 없는 설정).
- `테이블 없음: 건너뜀`(`ok` 비어 있음)은 그 테이블이 DB에 없다는 뜻이다. `RLS를 켬`은 원래 RLS가 꺼져 있던 테이블이며, 허용 정책을 함께 만들었으므로 승인 학회원·관리자는 지금과 같다.
- `storage:ig-files`·`storage:showcase`: 버킷의 파일 수다. `공개 버킷` 안내는 오류가 아니다. `ok`가 `false`이고 `저장소 정책을 만들 권한이 없어 건너뜀`이면 테이블 부분은 적용된 것이다. 실행 전 확인 결과의 `storage.objects` 줄을 알려 주면 저장소는 대시보드 방식으로 다시 정한다.
- `signup_auto_link` (정보): 이름·기수만 맞으면 가입하는 순간 승인 학회원이 되는 명단 행 수(로그인 계정이 연결되지 않은 승인 학회원)와, 지금까지 그렇게 연결된 계정 수다. 이 단계로 막지 못한다(아래 "이 단계로 막지 못하는 것" 1번). 목록은 `select * from ig_backup_step21.auto_linked_accounts();`로 본다.
- `other_tables`: 이 단계가 다루지 않았는데 로그인 계정이나 공개 키가 읽을 수 있는 테이블이 있으면 `false`와 이름이 나온다. 이름을 알려 주면 막을지 판단한다.
- `other_paths`: 승인 확인 없이 호출할 수 있는 보안 정의 함수, RLS를 거치지 않는 뷰, 접근 가능한 백업 스키마가 없으면 `true`다. 이름이 나오면 지우거나 고치기 전에 알려 준다.
- STEP 20처럼, 승인 대기 계정이 없으면 학회원 행 없는 가상 계정으로 세고, 열람자 계정이 없으면 `viewer`가 `skipped`로 나온다. 다시 실행하면 `anon`·`unapproved`의 실행 전 숫자도 줄어든 숫자로 나온다.

화면별 영향. 승인 학회원과 관리자는 모든 화면이 지금과 같다.

| 화면 | 이 단계 대상 테이블 | 승인 전 계정 (로그인) | 공개 키 (로그아웃) |
| --- | --- | --- | --- |
| 메인 `/`, 일정 `/schedule`, 지원 `/join` | `pr_config`(공개 키), `pr_landing_config`, `pr_schedules`(공개 행), `pr_showcase` | 같음 | 같음 |
| 학회원 소개 `/members` | `pr_config`(단체사진), `semester_memberships`(공개 명단), `members`(공개 행) | 같음 (로그인 상태로 봐도 공개 명단) | 같음 |
| 소개·활동·쇼케이스 | `pr_about_*`, `pr_activities_*`, `pr_showcase` | 같음 (읽기) | 같음 (읽기) |
| 회원가입 `/signup` | `profiles` 추가 (가입 직후 명단 등록) | 같음 | 같음 (이메일 인증 전에는 공개 키로 추가된다) |
| 로그인 직후 상단 이름·관리자 버튼 | `members` 본인 행, `admin_users` 본인 행 | 같음 | 해당 없음 |
| 홈 `/home` | `files_metadata`, `pr_deadlines`, `pr_config`, `pr_schedules` | 제출 현황·마감·장소가 비고, 일정은 공개 일정만 | 해당 없음 |
| 주차별 자료실 `/dashboard/*` | `files_metadata`, `pr_deadlines`, `presentations`, 저장소 `ig-files` | 목록이 비고 제출·파일 올리기가 거절된다 | 해당 없음 |
| 출석 `/attendance` | `pr_deadlines`, `pr_config`(조 편성·장소) | 출석 시간·장소가 비어 보인다 (출석 기록은 STEP 20에서 이미 막힘) | 해당 없음 |
| 아카이브 `/archive` | `files_metadata`, `archive_files`, `semester_weeks`, `club_rules` | 자료·회칙이 비고 등록이 거절된다 | 해당 없음 |
| 투표·결과 `/vote/*` | `presentations`, `pr_vote_criteria` | 발표 목록·채점 기준이 비어 보인다 | 해당 없음 |
| 썸네일 API `/api/thumbnail` | `files_metadata`, `archive_files` (요청자 권한으로 확인) | `등록된 자료의 파일이 아닙니다` (404) | 로그인 필요 (원래) |
| 관리자 화면 | 위 테이블 읽기·쓰기, 저장소 `showcase` 올리기 | 진입 불가 (원래) | 진입 불가 (원래) |

실행 후 확인한다.

- 로그아웃한 브라우저(시크릿 창)로 메인·학회원 소개·일정·지원·학회 소개·활동·쇼케이스가 그대로 열리는지.
- 승인된 학회원 계정으로 홈·기획서 제출(파일 올리기)·슬라이드 제출·발표영상·아카이브·발표 채점이 그대로인지.
- 관리자 계정으로 학회원 수정, 단체사진·쇼케이스 이미지 올리기, 일정·메인 설정 저장이 되는지.
- 회원가입: 테스트용 이메일로 한 번 가입해 관리자 `학회원` 화면의 `가입 승인 대기`에 나타나는지(가입 직후 명단 등록이 되는지) 확인한다. 테스트 신청은 확인 후 운영진이 정리한다.

이 단계로 막지 못하는 것 (따로 결정이 필요하다).

1. 가입할 때 명단 자동 연결: 가입하면서 입력한 이름·기수가 로그인 계정이 연결되지 않은 기존 학회원 한 명과 같으면, 그 학회원 행에 바로 연결되어 관리자 승인 없이 승인 학회원이 된다(`sync_profile_to_member`). 학회 코드는 브라우저에서만 확인하고 공개 명단에 이름·기수가 나오므로, 다른 사람 이름으로 가입하면 그 사람으로 들어올 수 있다. 막으려면 자동 연결을 "연결 요청"으로 바꾸고 관리자 학회원 화면에서 확인하게 해야 한다(앱과 DB 변경).
2. 가입 코드 `IG2012`는 `app/signup/page.js` 브라우저 코드에만 있다. 공개 키로 `signUp`을 직접 호출하면 코드 없이 가입된다.
3. `/api/upload-drive`: 로그인 확인 없이 누구나 학회 구글 드라이브 폴더에 파일을 올릴 수 있는 서버 API다. 앱 어디에서도 호출하지 않는다. 지우거나 관리자 확인을 넣어야 한다(배포 필요, DB와 무관).
4. 공개 주소: `ig-files` 공개 버킷 파일, 사유서 증빙·슬라이드 드라이브 링크는 주소를 아는 사람이면 누구나 열 수 있다. 이 단계는 주소 목록을 숨길 뿐 이미 알려진 주소는 막지 못한다. 슬라이드 제출 화면 코드(`app/dashboard/slide/page.js`)에 제출용 드라이브 폴더 주소가 들어 있으므로 폴더 공유 설정을 확인한다.
5. 승인 학회원끼리의 범위는 바꾸지 않았다. 승인 학회원은 지금처럼 승인 대기 신청자를 포함한 학회원 명단 전체를 읽고, 대시보드 정책에 따라 다른 사람의 제출물을 지울 수도 있다(화면에서만 본인 것만 지우게 한다).

되돌리기 (문제가 있을 때만). STEP 21이 추가한 제한 정책을 모두 지우고, STEP 21이 켠 RLS만 다시 끄고, 함수·백업 스키마 권한을 실행 전대로 되돌린다. STEP 20 상태로 돌아간다.

<!-- step21-rollback -->
```sql
begin;

do $$
declare
  pol record;
  snap record;
begin
  if to_regclass('ig_backup_step21.access_before') is null then
    raise exception 'STEP 21 snapshot not found';
  end if;

  -- STEP 21이 만든 제한 정책을 모두 지운다 (테이블·저장소)
  for pol in
    select p.polname, n.nspname, c.relname
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where p.polname like 'ig\_step21\_%'
      and p.polname <> 'ig_step21_keep_current'
  loop
    execute format('drop policy %I on %I.%I', pol.polname, pol.nspname, pol.relname);
  end loop;

  -- STEP 21이 RLS를 켠 테이블만 다시 끄고, 그때 만든 허용 정책을 지운다
  for snap in
    select table_name
    from ig_backup_step21.access_before
    where kind = 'rls'
      and table_name like 'public.%'
      and not (detail ->> 'rls_enabled')::boolean
  loop
    execute format('alter table %s disable row level security', snap.table_name);
    execute format('drop policy if exists ig_step21_keep_current on %s', snap.table_name);
  end loop;

  -- 함수 실행 권한과 백업 스키마 사용 권한을 실행 전대로 되돌린다
  for snap in
    select name, detail from ig_backup_step21.access_before where kind = 'function_acl'
  loop
    if (snap.detail ->> 'anon')::boolean then
      execute format('grant execute on function %s to anon', snap.name);
    end if;
    if (snap.detail ->> 'authenticated')::boolean then
      execute format('grant execute on function %s to authenticated', snap.name);
    end if;
  end loop;

  for snap in
    select name, detail from ig_backup_step21.access_before where kind = 'schema_usage'
  loop
    if (snap.detail ->> 'anon')::boolean then
      execute format('grant usage on schema %I to anon', snap.name);
    end if;
    if (snap.detail ->> 'authenticated')::boolean then
      execute format('grant usage on schema %I to authenticated', snap.name);
    end if;
  end loop;
end;
$$;

commit;
```

## 22. 가입 즉시 기존 학회원 자동 연결 중단 (관리자 연결로 전환) (2026-10-20 적용 완료)

지금은 가입 트리거(`sync_profile_to_member`, STEP 8)가 이름·기수가 같고 로그인 계정이 없는 학회원 행이 하나뿐이면 가입하는 순간 그 행에 계정을 붙인다. 그 행이 활동·졸업 등 승인 상태면 새 계정은 관리자 승인 없이 승인 학회원이 되어 STEP 20·21을 통과한다. 공개 `/members`에 이름·기수가 나오고 학회 코드는 브라우저 코드에 있으므로, 아직 계정이 없는 학회원의 이름·기수로 가입하면 그 사람의 출결·벌금·사유서·점수를 볼 수 있다. 관리자 화면에는 계정을 기존 학회원에 붙이는 기능이 없어서 이 자동 연결이 기존 학회원이 계정을 얻는 유일한 길이었다. 설계와 근거는 `docs/signup-account-linking.md`에 있다.

바꾸는 것은 다음과 같다.

- 가입하면 항상 본인 승인 대기 행이 생긴다. 이름·기수가 같은 기존 학회원 행에는 연결하지 않는다. 로그인 계정이 없는 가입 정보(공개 키로 `profiles`만 넣은 것)는 거절한다. 승인된 학회원이 가입 정보를 고쳐도 명단 이름·기수는 바뀌지 않는다.
- `public.admin_signup_requests()`: 가입 승인 대기 목록에 로그인 이메일·이메일 인증 여부·가입일·신청 행에 남은 기록 수와, 같은 이름의 로그인 계정 없는 기존 학회원 후보(이름·기수 같음 / 이름만 같음)를 돌려준다. 관리자(열람자 포함)만.
- `public.admin_link_signup_to_member(신청, 기존 학회원)`: 관리자 `학회원` 화면의 `기존 학회원에 연결` 버튼. 신청 행의 로그인 계정과, 신청 행을 가리키던 모든 기록(가입 정보·출결·사유서·제출물·학기 명단 등)을 기존 학회원 행으로 옮기고 신청 행을 정리한다. 기존 학회원의 이름·기수·상태·기록은 그대로이고, 승인 상태였으면 그 계정은 바로 학회원 공간을 쓴다. 같은 학기 명단에 둘 다 있으면 기존 학회원 쪽을 남긴다. 최고관리자·관리자·운영진만.
- 연결할 때마다 지운 신청 행 전체, 연결 전 기존 학회원 행, 옮긴 기록 수, 겹쳐서 지운 명단 행을 `ig_backup_step22.link_log`에 남긴다. 변경 전 함수 정의는 `ig_backup_step22.access_before`에 저장한다(처음 실행할 때만). 둘 다 API로 노출되지 않는 스키마다.
- 실행 중에 가상 학회원·로그인 계정·가입을 하위 트랜잭션에서 만들고 항상 되돌린다(남는 행 없음). 가상 가입이 실패하거나 관리자 연결이 실패하면 전체를 되돌리고 `probe failed` 또는 `probe result unexpected` 오류로 멈춘다. 가입 화면과 기존 학회원의 계정 연결이 고장 난 채로 남지 않는다.

SQL 자체는 공개 테이블 행을 추가·수정·삭제하지 않는다. 이미 자동 연결된 계정은 그대로 둔다(목록으로 확인). STEP 20·21과 독립이라 그 전후 어느 때든 실행할 수 있지만, STEP 20·21을 실행했다면 이 단계까지 해야 승인 기준이 의미가 있다. 앱의 관리자 `학회원` 화면 변경(연결 버튼)은 이 단계 후 배포한다. 이 단계 전에 배포하면 가입 승인 대기 탭에 "STEP 22 실행 여부를 확인하세요" 안내만 나오고 나머지는 그대로다.

실행 전 확인 (읽기 전용). `roster_without_account`는 가입만 하면 차지할 수 있던 행 수, `auto_linked_accounts`는 지금까지 가입 즉시 기존 행에 연결된 계정 수다(2026-08 이관 때 연결된 예전 계정이 섞일 수 있다).

```sql
select
  (select count(*) from public.members m
    where m.status in ('active', 'leave', 'inactive', 'alumni') and m.auth_user_id is null) as roster_without_account,
  (select count(*) from public.members m
    join auth.users u on u.id = m.auth_user_id
    where m.status in ('active', 'leave', 'inactive', 'alumni')
      and m.created_at < u.created_at - interval '1 minute') as auto_linked_accounts;
```

```powershell
Get-Content -Raw -Encoding UTF8 .\supabase\STEP_22_SIGNUP_LINK_BY_ADMIN.sql | Set-Clipboard
```

결과는 9행이다. `ok`가 `false`인 행이 없어야 한다(`ok`가 비어 있는 행은 정보).

- `signup_no_auto_link`·`non_admin_refused`·`admin_request_list`·`admin_link`·`approved_after_link` 5행: 가상 가입으로 확인한 결과다. 모두 `ok`(또는 `ok (기록 2건 모두 기존 학회원 행)`)여야 한다. `skipped`는 SQL Editor 계정이 가상 로그인 계정을 만들 수 없거나, 최고관리자·관리자·운영진 계정이 없거나(`admin_*`), STEP 20을 실행하지 않은 경우(`approved_after_link`)다. `note`에 이유가 나온다. 이때 `signup_no_auto_link`는 함수 정의로 확인한다.
- `pending_requests`: 지금 승인 대기 중인 가입 수와, 그중 기존 학회원 후보가 있는 수.
- `roster_without_account`: 로그인 계정이 없는 승인 학회원 수. 이 학회원들은 이제 가입 후 관리자 연결로 계정을 얻는다.
- `already_auto_linked`: 이 단계 전에 가입 즉시 연결된 계정 수. 이 단계는 풀지 않는다. `select * from ig_backup_step22.auto_linked_accounts();`로 이름·이메일·가입일을 보고 본인 계정인지 확인한다. 본인이 아닌 계정이 있으면 알려 준다(해제 SQL을 따로 만든다).
- `other_paths`: 학회원 행의 로그인 계정을 바꾸는 다른 보안 정의 함수가 있거나, STEP 21을 실행하지 않아 로그인 계정이 `pr_members`에 써서 같은 이름 학회원을 활동으로 바꿀 수 있으면 `false`와 이름이 나온다.

실행 후 관리자 `학회원` 화면 → `가입 승인 대기` 탭에서 각 신청 아래에 이메일과 `기존 학회원 ○○○(기수 · 상태)에 연결` 버튼(또는 `이름이 같은 기존 학회원이 없습니다`)이 보이는지 확인한다. 연결은 이메일·이름으로 본인인지 확인한 뒤 누른다. 연결한 계정으로 로그인하면 홈·마이페이지에 예전 기록이 보인다. 새 학회원 승인(`활동으로 이동`)은 지금과 같다. 이름·기수가 같은 후보가 있는 신청을 `활동으로 이동`하려 하면 확인창에 중복 경고가 나온다.

되돌리기 (문제가 있을 때만). 가입 트리거 함수를 STEP 22 전 정의로 되돌리고(이름·기수가 같으면 가입 즉시 연결되는 동작이 다시 켜진다), STEP 22가 만든 관리자 함수 두 개를 지운다. 이미 누른 연결은 되돌리지 않는다(`ig_backup_step22.link_log`에 원래 행이 남아 있다).

<!-- step22-rollback -->
```sql
begin;

do $$
declare
  snap record;
begin
  if to_regclass('ig_backup_step22.access_before') is null then
    raise exception 'STEP 22 snapshot not found';
  end if;

  -- 가입 트리거 함수(그리고 STEP 22 전부터 같은 이름으로 있던 함수)를 원래 정의로 되돌린다
  for snap in
    select detail
    from ig_backup_step22.access_before
    where kind = 'function'
  loop
    execute snap.detail ->> 'definition';
  end loop;

  -- STEP 22가 새로 만든 관리자 함수는 지운다
  if not exists (
    select 1 from ig_backup_step22.access_before
    where kind = 'function' and name = 'public.admin_link_signup_to_member(uuid,uuid)'
  ) then
    drop function if exists public.admin_link_signup_to_member(uuid, uuid);
  end if;

  if not exists (
    select 1 from ig_backup_step22.access_before
    where kind = 'function' and name = 'public.admin_signup_requests()'
  ) then
    drop function if exists public.admin_signup_requests();
  end if;
end;
$$;

commit;
```

## 23. 학회 코드를 DB에서 확인

가입 화면의 학회 코드는 브라우저에서만 비교했다. 그 코드는 공개된 화면 코드와 git 기록에 그대로 있고, 공개 키로 `signUp`을 직접 부르면 비교 자체를 건너뛴다. 그래서 코드는 아무것도 막지 못했다. 학회 결정으로 코드는 지금 코드 그대로 쓴다(공개된 코드라 가벼운 거름망일 뿐이고, 실제로 막는 것은 STEP 22의 관리자 승인이다).

- `auth.users`에 BEFORE INSERT 트리거 `ig_check_signup_code`를 단다(Supabase는 2025-04 auth 스키마 제한 후에도 `auth.users` 트리거를 허용한다. auth 스키마에는 함수를 만들 수 없어 함수는 `public.ig_check_signup_code()`에 둔다). 가입 메타데이터의 `signup_code`가 비공개 스키마 `ig_private`에 저장한 해시와 다르면 계정이 만들어지지 않는다. 화면에는 `학회 코드가 맞지 않아 가입하지 못했어`가 나온다(Supabase Auth는 "Database error saving new user"만 돌려준다).
- 맞는 코드는 계정 메타데이터(로그인 토큰 포함)에 남기지 않고 지운다.
- 대시보드 `Invite user`로 초대한 계정은 코드 없이 만들어진다. 대시보드 `Add user`로 바로 만드는 계정은 거절되므로 초대를 쓴다. 구글 로그인 등 다른 가입 방식을 켜면 그 가입도 거절된다.
- DB에는 코드 해시(소금 포함 SHA-256)만 저장한다. 대소문자와 가운데 공백까지 정확히 비교한다(앞뒤 공백은 무시).
- 실행 중에 임시 확인 코드와 가상 계정으로 코드 없음·틀린 코드 거절, 맞는 코드 통과·메타데이터 삭제, 초대 통과를 확인하고 되돌린다(남는 계정·코드 없음). 맞는 코드가 거절되거나 코드 없이 통과하면 전체를 되돌린다.

순서가 중요하다.

1. 가입 화면 변경(코드를 `signup_code`로 보내고 브라우저 비교를 없앤 화면)을 배포한다. 배포 후 2번까지는 코드 확인이 없다(지금도 사실상 없다). 모집 기간을 피해 한 번에 진행한다.
2. 바로 STEP 23을 실행한다. 배포 전에 실행하면 예전 화면이 코드를 보내지 않아 가입이 모두 거절된다.
3. 바로 코드를 저장한다. 저장하기 전까지는 모든 가입이 거절된다. 4자 이상.

```sql
select ig_private.set_signup_code('학회 코드');
```

행을 추가·수정·삭제하지 않는다. 기존 계정은 건드리지 않는다. 다시 실행해도 안전하다(저장한 코드는 유지된다). 코드를 바꿀 때는 위 한 줄만 다시 실행한다.

```powershell
Get-Content -Raw -Encoding UTF8 .\supabase\STEP_23_SIGNUP_CODE_SERVER_CHECK.sql | Set-Clipboard
```

결과는 7행이다. 처음 실행하면 `code_set`만 `false`(코드 미설정)이고 나머지는 `ok`가 `false`이면 안 된다. 3번으로 코드를 저장한 뒤 결과 쿼리(파일 맨 아래 `with last_probe as ...`부터 끝까지)를 다시 실행하면 `code_set`이 `설정됨 (날짜)`·`true`로 바뀐다.

- `code_check_trigger`: `enabled`.
- `missing_code_refused`·`wrong_code_refused`: `refused`. `right_code_accepted`: `ok`(맞는 코드는 통과하고 메타데이터에 코드가 남지 않음). `invite_exempt`: `ok`. 가상 계정을 만들 수 없는 환경이면 `invite_exempt`가 `refused: ...`(`ok`가 `false`)이고 나머지는 `skipped`이며, `note`에 이유가 나온다. 이때는 시크릿 창에서 틀린 코드로 가입해 거절되는지 직접 확인한다.
- `other_auth_triggers`: 이 단계 밖에서 만든 `auth.users` 트리거 이름. 있으면 그 트리거가 실패해도 같은 "가입 코드" 안내가 나올 수 있다.

실행 후 시크릿 창에서 틀린 코드로 가입하면 `학회 코드가 맞지 않아` 안내가 나오고, 맞는 코드로는 가입 신청이 접수되는지 확인한다(확인용 계정은 관리자 `학회원` 화면에서 영구 삭제).

되돌리기 (문제가 있을 때만). SQL Editor 계정은 `auth.users` 트리거를 직접 지울 수 없을 수 있어(테이블 소유자가 Supabase Auth), Supabase 안내대로 함수를 CASCADE로 지워 트리거를 함께 지운다. 저장한 코드 해시(`ig_private`)는 남는다. 되돌린 뒤에는 코드 확인이 없고, 가입 화면이 보내는 `signup_code`가 계정 메타데이터에 남는다.

<!-- step23-rollback -->
```sql
begin;

do $$
declare
  snap record;
begin
  if to_regclass('ig_backup_step23.access_before') is null then
    raise exception 'STEP 23 snapshot not found';
  end if;

  -- SQL Editor 계정은 auth.users 트리거를 직접 지울 수 없을 수 있어, 함수를 지워 트리거를 함께 지운다
  drop function if exists public.ig_check_signup_code() cascade;

  -- 같은 이름의 함수·트리거가 STEP 23 전부터 있었다면 원래 정의로 되돌린다 (함수 먼저)
  for snap in
    select kind, detail
    from ig_backup_step23.access_before
    where kind in ('function', 'trigger')
    order by case kind when 'function' then 1 else 2 end
  loop
    execute snap.detail ->> 'definition';
  end loop;
end;
$$;

commit;
```

## 중단 조건

- 어느 단계에서든 빨간색 오류가 나오면 다음 단계로 넘어가지 않는다.
- `Legacy data changed` 오류는 스냅샷 이후 기존 데이터가 바뀌었다는 뜻이다.
- STEP 0은 재실행하거나 기존 `ig_backup_20260822` 스키마를 삭제하지 않는다.
- 오류 메시지 전체를 확인한 뒤 수정 여부를 결정한다.
