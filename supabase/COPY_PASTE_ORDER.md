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

## 중단 조건

- 어느 단계에서든 빨간색 오류가 나오면 다음 단계로 넘어가지 않는다.
- `Legacy data changed` 오류는 스냅샷 이후 기존 데이터가 바뀌었다는 뜻이다.
- STEP 0은 재실행하거나 기존 `ig_backup_20260822` 스키마를 삭제하지 않는다.
- 오류 메시지 전체를 확인한 뒤 수정 여부를 결정한다.
