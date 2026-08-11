/**
 * 규로롱 공용 Supabase 클라이언트.
 *
 * storageKey 는 kyulolong-site 의 lib/supabase.ts 와 **반드시 같아야 한다.**
 * kyulolong.com/* 은 전부 같은 오리진이라 localStorage 를 공유하는데, supabase-js
 * 의 기본 키는 프로젝트 URL 마다 달라서 안 맞추면 같은 오리진인데도 홈페이지에서
 * 한 로그인이 여기까지 안 온다. 홈페이지 쪽에도 "바꾸지 말 것"이라고 적혀 있다.
 *
 * 환경변수가 없으면 던지지 않고 null 을 준다. 이유는 홈페이지와 같다 — 프롬프터는
 * 로그인 없이 완전히 돌아가야 하고, 키가 없다고 앱이 죽으면 '보관함은 덤'이라는
 * 전제가 무너진다. 키가 없으면 보관함 UI 자체가 그려지지 않고 앱은 예전 그대로다.
 *
 * Vite 라 이 값들은 런타임이 아니라 **docker build 시점**에 번들에 박힌다.
 * Dockerfile 의 ARG VITE_SUPABASE_* 를 함께 볼 것.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** 보관함 UI 를 그릴지 말지. 안 그리면 이 앱은 예전과 완전히 동일하게 동작한다. */
export const isLibraryConfigured = Boolean(url && anon);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!url || !anon) return null;
  if (client) return client;

  client = createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // 바꾸지 말 것 — 홈페이지와 같은 값이어야 세션이 이어진다.
      storageKey: "kyulolong.auth",
    },
  });
  return client;
}
