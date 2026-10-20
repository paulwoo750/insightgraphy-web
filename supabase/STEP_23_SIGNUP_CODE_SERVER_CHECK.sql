-- Check the club sign-up code in the database instead of the browser.
--
-- app/signup compared the code with a fixed string in the browser. That string is in the public
-- JavaScript bundle and in git history, and supabase.auth.signUp can be called with the public key
-- without the page, so the code stopped nobody. After this step:
--
--   check      A BEFORE INSERT trigger on auth.users compares raw_user_meta_data.signup_code with
--              a salted SHA-256 hash kept in ig_private.signup_code (a schema the API cannot reach).
--              A missing or wrong code aborts the insert, so no account is created. Supabase Auth
--              then answers "Database error saving new user" (HTTP 500); the sign-up page shows it
--              as a wrong code. Supabase still allows triggers on auth.users after the April 2025
--              auth schema restrictions; new functions cannot be created in auth, so the trigger
--              function lives in public (security definer, empty search_path, not callable as RPC).
--   cleanup    signup_code is removed from raw_user_meta_data before the row is written (insert and
--              later metadata updates), so it is kept neither in the account nor in its JWT.
--   exempt     invited users (auth.users.invited_at set: dashboard "Invite user", or
--              auth.admin.inviteUserByEmail with the service role). Dashboard "Add user" without an
--              invite is refused like any other sign-up.
--   the code   Never in this file or the repository. The old code is public, so a new one is set
--              after running this step, in the SQL Editor only:
--                select ig_private.set_signup_code('새 학회 코드');
--              At least 8 characters. Until it is set every sign-up is refused. Run it again to
--              change the code.
--
-- Deploy the sign-up page that sends signup_code first, then run this step. Before that, the old
-- page sends no code and every sign-up would be refused.
--
-- 1. Snapshot (first run only) of an existing trigger or function with the same name.
-- 2. Probe inside a subtransaction that is always rolled back (no account remains): no code and a
--    wrong code are refused, the right code (a temporary probe code) is accepted and removed from
--    the metadata, an invite is accepted. If the right code is refused or a missing code is
--    accepted, the whole step is rolled back.
--
-- No rows of public tables are inserted, changed or deleted. Existing accounts are not touched.
-- Safe to re-run: the first snapshot and the saved code are kept.

begin;

select pg_advisory_xact_lock(hashtextextended('insightgraphy-step-23', 0));

do $$
begin
  if to_regclass('auth.users') is null then
    raise exception 'STEP 23: auth.users not found';
  end if;
end;
$$;

-- API로 노출되지 않는 스키마: 가입 코드 해시와 스냅샷
create schema if not exists ig_private;
revoke all on schema ig_private from public;

create table if not exists ig_private.signup_code (
  id integer primary key default 1 check (id = 1),
  code_hash text not null,
  salt text not null,
  updated_at timestamptz not null default now()
);

create schema if not exists ig_backup_step23;
revoke all on schema ig_backup_step23 from public;

create table if not exists ig_backup_step23.access_before (
  id bigint generated always as identity primary key,
  captured_at timestamptz not null default now(),
  kind text not null,          -- marker | trigger | function
  name text not null,
  detail jsonb not null
);

create table if not exists ig_backup_step23.probe_log (
  id bigint generated always as identity primary key,
  probed_at timestamptz not null default now(),
  check_name text not null,
  result text not null,
  note text
);

-- 가입 코드 저장 (SQL Editor에서만 실행한다. 원문은 저장하지 않는다)
create or replace function ig_private.set_signup_code(p_code text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  new_salt text := pg_catalog.gen_random_uuid()::text;
  code text := pg_catalog.btrim(coalesce(p_code, ''));
begin
  if pg_catalog.upper(code) like '%IG2012%' then
    raise exception '이미 공개된 예전 코드(IG2012)가 들어 있습니다. 새 코드를 정하세요';
  end if;
  if pg_catalog.char_length(code) < 8 then
    raise exception '가입 코드는 8자 이상이어야 합니다';
  end if;

  insert into ig_private.signup_code (id, code_hash, salt, updated_at)
  values (1, pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(new_salt || code, 'UTF8')), 'hex'), new_salt, pg_catalog.now())
  on conflict (id) do update set
    code_hash = excluded.code_hash,
    salt = excluded.salt,
    updated_at = excluded.updated_at;

  return '가입 코드를 저장했습니다. 운영진 안내로만 전달하세요';
end;
$$;

revoke all on all functions in schema ig_private from public;
revoke all on all tables in schema ig_private from public;

-- 1. 같은 이름의 트리거·함수가 이미 있었다면 정의를 남긴다 (처음 실행할 때만)
do $$
begin
  if exists (select 1 from ig_backup_step23.access_before) then
    raise notice 'STEP 23: keeping the snapshot from the first run';
    return;
  end if;

  -- 아무것도 없었더라도 첫 실행 표시를 남긴다 (다시 실행할 때 STEP 23 자신의 정의를 저장하지 않도록)
  insert into ig_backup_step23.access_before (kind, name, detail)
  values ('marker', 'first run', jsonb_build_object('captured_by', current_user));

  insert into ig_backup_step23.access_before (kind, name, detail)
  select 'function', 'public.ig_check_signup_code()',
    jsonb_build_object('definition', pg_get_functiondef(to_regprocedure('public.ig_check_signup_code()')))
  where to_regprocedure('public.ig_check_signup_code()') is not null;

  insert into ig_backup_step23.access_before (kind, name, detail)
  select 'trigger', t.tgname, jsonb_build_object('definition', pg_get_triggerdef(t.oid))
  from pg_trigger t
  where t.tgrelid = 'auth.users'::regclass and t.tgname = 'ig_check_signup_code';
end;
$$;

-- 2. 가입 코드 확인 트리거 (auth 스키마에는 새 함수를 만들 수 없어 public에 둔다)
create or replace function public.ig_check_signup_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  given text := nullif(pg_catalog.btrim(coalesce(new.raw_user_meta_data ->> 'signup_code', '')), '');
  saved_hash text;
  saved_salt text;
begin
  -- 새 계정만 확인한다. 관리자 초대(invited_at)는 코드 없이 만든다
  if tg_op = 'INSERT' and new.invited_at is null then
    select s.code_hash, s.salt into saved_hash, saved_salt
    from ig_private.signup_code s
    where s.id = 1;

    if saved_hash is null then
      raise exception 'IG signup code is not configured';
    end if;
    if given is null
       or pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(saved_salt || given, 'UTF8')), 'hex') <> saved_hash then
      raise exception 'IG signup code is wrong';
    end if;
  end if;

  -- 코드는 계정 정보(로그인 토큰 포함)에 남기지 않는다
  if new.raw_user_meta_data ? 'signup_code' then
    new.raw_user_meta_data := new.raw_user_meta_data - 'signup_code';
  end if;

  return new;
end;
$$;

revoke all on function public.ig_check_signup_code() from public, anon, authenticated;

-- auth.users의 소유자는 Supabase Auth 역할이라 SQL Editor 계정은 트리거를 만들 수는 있어도 지우거나 바꿀 수는
-- 없을 수 있다. 그래서 트리거는 없을 때만 만들고, 다시 실행할 때는 위 함수 본문만 바뀐다.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'auth.users'::regclass and tgname = 'ig_check_signup_code'
  ) then
    create trigger ig_check_signup_code
    before insert or update of raw_user_meta_data on auth.users
    for each row execute function public.ig_check_signup_code();
  end if;
end;
$$;

-- 3. 확인: 가상 계정을 하위 트랜잭션 안에서 만들고 항상 되돌린다 (임시 확인 코드도 되돌린다)
do $$
declare
  probe_code text := 'probe-' || md5(random()::text);
  probe_id uuid;
  r_invite text := 'skipped';
  r_missing text := 'skipped';
  r_wrong text := 'skipped';
  r_right text := 'skipped';
  stored jsonb;
  failure text;
begin
  begin
    perform ig_private.set_signup_code(probe_code);

    -- 관리자 초대: 코드 없이 만들어진다. 여기서 막히면 이 SQL Editor 계정으로는 가상 계정을 만들 수 없는 것
    begin
      insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, invited_at, created_at, updated_at)
      values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'ig-step23-invite-' || gen_random_uuid() || '@example.invalid', '{}'::jsonb,
        '{"provider": "email", "providers": ["email"]}'::jsonb, now(), now(), now());
      r_invite := 'ok';
    exception when others then
      r_invite := 'refused: ' || sqlstate || ' ' || sqlerrm;
    end;

    if r_invite = 'ok' then
      -- 코드 없음
      begin
        insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
        values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'ig-step23-missing-' || gen_random_uuid() || '@example.invalid', '{"name": "확인용"}'::jsonb,
          '{"provider": "email", "providers": ["email"]}'::jsonb, now(), now());
        r_missing := 'accepted';
      exception when others then
        r_missing := case when sqlerrm like 'IG signup code is wrong%' then 'refused' else 'error ' || sqlstate || ' ' || sqlerrm end;
      end;

      -- 틀린 코드
      begin
        insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
        values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'ig-step23-wrong-' || gen_random_uuid() || '@example.invalid',
          jsonb_build_object('name', '확인용', 'signup_code', probe_code || 'x'),
          '{"provider": "email", "providers": ["email"]}'::jsonb, now(), now());
        r_wrong := 'accepted';
      exception when others then
        r_wrong := case when sqlerrm like 'IG signup code is wrong%' then 'refused' else 'error ' || sqlstate || ' ' || sqlerrm end;
      end;

      -- 맞는 코드 (앞뒤 공백 허용): 만들어지고 메타데이터에서 코드가 빠져야 한다
      probe_id := gen_random_uuid();
      begin
        insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
        values (probe_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'ig-step23-right-' || probe_id || '@example.invalid',
          jsonb_build_object('name', '확인용', 'student_id', '999', 'signup_code', ' ' || probe_code || ' '),
          '{"provider": "email", "providers": ["email"]}'::jsonb, now(), now());
        select u.raw_user_meta_data into stored from auth.users u where u.id = probe_id;
        r_right := case
          when stored ? 'signup_code' then 'accepted but code kept in metadata'
          when stored ->> 'name' is distinct from '확인용' then 'accepted but metadata changed'
          else 'ok'
        end;
      exception when others then
        r_right := 'refused: ' || sqlstate || ' ' || sqlerrm;
      end;
    end if;

    raise exception 'ig_step23_probe_rollback';
  exception when others then
    if sqlerrm <> 'ig_step23_probe_rollback' then
      failure := sqlstate || ' ' || sqlerrm;
    end if;
  end;

  -- 초대까지 이 트리거가 막으면 관리자 초대도 막힌다
  if r_invite like 'refused: % IG signup code%' then
    raise exception 'STEP 23: an invited account was refused (%). Nothing was applied.', r_invite;
  end if;
  if r_missing = 'accepted' or r_wrong = 'accepted' then
    raise exception 'STEP 23: a sign-up without the right code was accepted (missing %, wrong %). Nothing was applied.', r_missing, r_wrong;
  end if;
  if r_right not in ('ok', 'skipped') then
    raise exception 'STEP 23: a sign-up with the right code failed (%). Nothing was applied.', r_right;
  end if;

  insert into ig_backup_step23.probe_log (check_name, result, note) values
    ('missing_code_refused', r_missing, null),
    ('wrong_code_refused', r_wrong, null),
    ('right_code_accepted', r_right, null),
    ('invite_exempt', r_invite,
      case
        when failure is not null then '가상 계정 확인 중 오류: ' || failure
        when r_invite <> 'ok' then '이 SQL Editor 계정으로 가상 계정을 만들 수 없어 코드 확인은 트리거 정의로만 확인됨'
      end);
end;
$$;

commit;

-- 확인: 7행. 처음 실행하면 code_set만 false다 (코드를 아직 정하지 않았기 때문). 나머지는 ok가 false이면 안 된다
with last_probe as (
  select l.*
  from ig_backup_step23.probe_log l
  where l.probed_at = (select max(probed_at) from ig_backup_step23.probe_log)
)
select item, result, ok, note
from (
  select
    1 as sort_order,
    'code_check_trigger' as item,
    coalesce((
      select string_agg(case t.tgenabled when 'D' then 'disabled' else 'enabled' end, ', ')
      from pg_trigger t
      where t.tgrelid = 'auth.users'::regclass and t.tgname = 'ig_check_signup_code'
    ), 'missing') as result,
    exists (
      select 1 from pg_trigger t
      where t.tgrelid = 'auth.users'::regclass and t.tgname = 'ig_check_signup_code' and t.tgenabled <> 'D'
    ) as ok,
    '새 계정을 만들 때 가입 코드를 DB에서 확인한다 (브라우저 확인 아님)' as note
  union all
  select 2, l.check_name, l.result, l.result in ('refused', 'skipped'),
    '코드 없이 signUp을 직접 호출하면 계정이 만들어지지 않는다'
  from last_probe l where l.check_name = 'missing_code_refused'
  union all
  select 3, l.check_name, l.result, l.result in ('refused', 'skipped'),
    '틀린 코드는 거절된다'
  from last_probe l where l.check_name = 'wrong_code_refused'
  union all
  select 4, l.check_name, l.result, l.result in ('ok', 'skipped'),
    '맞는 코드는 통과하고, 코드는 계정 메타데이터에 남지 않는다 (임시 확인 코드로 확인한 뒤 되돌림)'
  from last_probe l where l.check_name = 'right_code_accepted'
  union all
  select 5, l.check_name, l.result, l.result = 'ok',
    concat_ws(' / ', '대시보드 Invite user로 초대한 계정은 코드 없이 만들어진다', l.note)
  from last_probe l where l.check_name = 'invite_exempt'
  union all
  select 6, 'code_set',
    coalesce((select format('설정됨 (%s)', to_char(s.updated_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI')) from ig_private.signup_code s), '미설정'),
    exists (select 1 from ig_private.signup_code),
    case when exists (select 1 from ig_private.signup_code)
      then '코드를 바꾸려면 select ig_private.set_signup_code(''새 코드''); 를 다시 실행한다'
      else '지금은 모든 가입이 거절된다. SQL Editor에서 select ig_private.set_signup_code(''새 학회 코드''); 를 실행한다 (8자 이상, 예전 코드 IG2012 불가, 저장소·채팅에 적지 않는다)'
    end
  union all
  select 7, 'other_auth_triggers',
    coalesce((
      select string_agg(t.tgname, ', ' order by t.tgname)
      from pg_trigger t
      where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal and t.tgname <> 'ig_check_signup_code'
    ), '없음'),
    null,
    '이 단계 밖에서 만든 auth.users 트리거. 가입 실패 문구 "Database error saving new user"는 이 트리거들이 실패해도 나온다'
) result
order by sort_order;
