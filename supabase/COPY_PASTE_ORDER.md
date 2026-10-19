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

## 중단 조건

- 어느 단계에서든 빨간색 오류가 나오면 다음 단계로 넘어가지 않는다.
- `Legacy data changed` 오류는 스냅샷 이후 기존 데이터가 바뀌었다는 뜻이다.
- STEP 0은 재실행하거나 기존 `ig_backup_20260822` 스키마를 삭제하지 않는다.
- 오류 메시지 전체를 확인한 뒤 수정 여부를 결정한다.
