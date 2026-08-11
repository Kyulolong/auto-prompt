-- 대본 보관함 테이블.
--
-- 규로롱 Supabase 프로젝트에 실제로 데이터를 넣는 첫 테이블이라, 여기서 정한
-- 모양(이름 규칙 · RLS · updated_at 트리거)이 다음 서비스들의 본이 된다.
--
-- 실행: Supabase 대시보드 → SQL Editor 에 그대로 붙여넣고 Run.
-- 그 전에 Authentication → Providers → "Anonymous sign-ins" 를 켤 것. 안 켜면
-- 로그인하지 않은 사람이 저장을 눌렀을 때 익명 세션을 못 만들어 저장이 실패한다.

-- 이름에 prompt_ 를 붙인 이유: 프로젝트 하나를 여러 서비스가 나눠 쓴다. 그냥
-- scripts 로 두면 storyboard 가 자기 대본 테이블을 만들 때 부딪힌다.
create table if not exists public.prompt_scripts (
  id         uuid primary key default gen_random_uuid(),

  -- 계정이 지워지면 대본도 같이 지운다. 익명 계정도 결국 auth.users 의 한 행이라,
  -- 나중에 오래된 익명 계정 청소 정책을 붙이면 대본이 알아서 따라 지워진다.
  user_id    uuid not null references auth.users (id) on delete cascade,

  title      text not null default '',
  body       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 익명으로 아무나 쓸 수 있는 테이블이라 크기를 막아둔다. 10분 분량 한국어 대본이
  -- 대략 3~4KB 라 100KB 면 넉넉하면서, 파일 저장소로 쓰이는 건 막힌다.
  constraint prompt_scripts_body_len  check (char_length(body)  <= 100000),
  constraint prompt_scripts_title_len check (char_length(title) <= 200)
);

-- 목록은 언제나 "내 것을 최근 순으로" 읽는다.
create index if not exists prompt_scripts_user_updated_idx
  on public.prompt_scripts (user_id, updated_at desc);

-- updated_at 을 클라이언트가 보내게 두지 않는다. 목록 정렬의 기준이라 브라우저
-- 시계가 틀어진 기기 하나가 남의 순서까지 뒤집을 이유가 없다.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists prompt_scripts_touch on public.prompt_scripts;
create trigger prompt_scripts_touch
  before update on public.prompt_scripts
  for each row execute function public.touch_updated_at();


-- ── RLS ──────────────────────────────────────────────────────────────────────
-- anon 키는 정적 번들에 박혀서 그대로 공개된다. 공개를 전제로 설계된 키라 그 자체는
-- 문제가 아니지만, 그래서 **실제 방어선은 전부 여기다.** 이 블록을 빼먹으면 그 순간
-- 아무나 남의 대본을 읽고 지울 수 있다.
--
-- to authenticated: 익명 로그인한 사람도 role 은 authenticated 다(is_anonymous
-- 클레임만 다르다). 로그인 안 한 요청은 auth.uid() 가 null 이라 어차피 한 행도 못 본다.
alter table public.prompt_scripts enable row level security;

drop policy if exists "prompt_scripts: 내 것만 읽기"   on public.prompt_scripts;
drop policy if exists "prompt_scripts: 내 것만 넣기"   on public.prompt_scripts;
drop policy if exists "prompt_scripts: 내 것만 고치기" on public.prompt_scripts;
drop policy if exists "prompt_scripts: 내 것만 지우기" on public.prompt_scripts;

create policy "prompt_scripts: 내 것만 읽기"
  on public.prompt_scripts for select
  to authenticated
  using (auth.uid() = user_id);

create policy "prompt_scripts: 내 것만 넣기"
  on public.prompt_scripts for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "prompt_scripts: 내 것만 고치기"
  on public.prompt_scripts for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "prompt_scripts: 내 것만 지우기"
  on public.prompt_scripts for delete
  to authenticated
  using (auth.uid() = user_id);
