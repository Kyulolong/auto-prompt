/**
 * 대본 보관함 — Supabase 에 올려두는 대본 목록.
 *
 * localStorage 를 대체하지 않는다. 지금 쓰고 있는 대본 한 개는 예전처럼
 * localStorage 가 들고 있고(App.tsx), 보관함은 그 위에 얹는 선반이다. 그래서
 * 로그아웃 상태에서도, Supabase 가 죽어도, 인터넷이 끊겨도 프롬프터는 그대로 돈다.
 */
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

const TABLE = "prompt_scripts";

export interface SavedScript {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
}

export interface Account {
  /** 익명이든 계정이든, 저장할 곳이 있는 상태 */
  signedIn: boolean;
  /** 익명 세션이다 — 이 기기에만 남는다 */
  anonymous: boolean;
  /** 계정이 있을 때 보여줄 이름 */
  label: string | null;
}

export const SIGNED_OUT: Account = { signedIn: false, anonymous: false, label: null };

/**
 * 대본 첫 줄에서 제목을 뽑는다.
 *
 * 제목을 따로 입력받지 않는 건 마찰을 줄이려는 것이다. 이 앱은 대본을 붙여넣고
 * 바로 읽기 시작하는 도구라, 저장 한 번에 입력칸이 하나 더 생기면 그 리듬이 깨진다.
 */
export function deriveTitle(body: string): string {
  const first = body
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (!first) return "제목 없는 대본";
  return first.length > 60 ? `${first.slice(0, 60)}…` : first;
}

function toAccount(session: Session | null): Account {
  if (!session) return SIGNED_OUT;
  const u = session.user;
  return {
    signedIn: true,
    anonymous: Boolean(u.is_anonymous),
    label: (u.user_metadata?.nickname as string) || u.email || null,
  };
}

export async function readAccount(): Promise<Account> {
  const sb = getSupabase();
  if (!sb) return SIGNED_OUT;
  const { data } = await sb.auth.getSession();
  return toAccount(data.session);
}

/** 세션이 바뀔 때마다 알려준다. 다른 탭에서 홈페이지에 로그인해도 여기가 따라 바뀐다. */
export function watchAccount(cb: (a: Account) => void): () => void {
  const sb = getSupabase();
  if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange((_e, session) => cb(toAccount(session)));
  return () => data.subscription.unsubscribe();
}

/**
 * 저장하려면 세션이 있어야 한다. 없으면 익명으로 하나 만든다.
 *
 * 저장 버튼이 로그인 화면으로 튀지 않게 하려는 것이다 — 홈페이지 스펙 3번은
 * 로그인이 문이 아니라 덤이라고 못박고 있고, 홈페이지 로그인 페이지에는 이 익명
 * 세션을 나중에 진짜 계정으로 '승격'시키는 경로가 이미 들어가 있다. 그래서 익명으로
 * 저장해둔 것이 계정을 만드는 순간 고아가 되지 않는다.
 *
 * 주의: Supabase 대시보드에서 Anonymous sign-ins 를 켜둬야 동작한다.
 */
async function ensureSession(): Promise<Session> {
  const sb = getSupabase();
  if (!sb) throw new Error("unconfigured");

  const { data } = await sb.auth.getSession();
  if (data.session) return data.session;

  const { data: created, error } = await sb.auth.signInAnonymously();
  if (error) throw error;
  if (!created.session) throw new Error("no session");
  return created.session;
}

function toSaved(row: { id: string; title: string; body: string; updated_at: string }): SavedScript {
  return { id: row.id, title: row.title, body: row.body, updatedAt: row.updated_at };
}

/**
 * 보관함 목록. 세션이 없으면 빈 목록을 준다 — 여기서 익명 세션을 만들지는 않는다.
 * 앱을 열기만 해도 계정이 생기면 빈 익명 계정만 쌓이고, 아무것도 저장한 적 없는
 * 사람에게 "이 기기에만 남아요" 같은 안내가 먼저 나오는 것도 이상하다.
 */
export async function listScripts(): Promise<SavedScript[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const { data: s } = await sb.auth.getSession();
  if (!s.session) return [];

  const { data, error } = await sb
    .from(TABLE)
    .select("id,title,body,updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toSaved);
}

/** id 가 있으면 그 대본을 갱신하고, 없으면 새로 만든다. */
export async function saveScript(body: string, id: string | null): Promise<SavedScript> {
  const sb = getSupabase();
  if (!sb) throw new Error("unconfigured");

  const session = await ensureSession();
  const row = { user_id: session.user.id, title: deriveTitle(body), body };

  const q = id
    ? sb.from(TABLE).update(row).eq("id", id).select("id,title,body,updated_at").single()
    : sb.from(TABLE).insert(row).select("id,title,body,updated_at").single();

  const { data, error } = await q;
  if (error) throw error;
  return toSaved(data);
}

export async function removeScript(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const { error } = await sb.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

/**
 * 사용자에게 보여줄 한 줄. 원문 메시지는 대부분 영어 postgres 에러라 그대로 못 쓴다.
 * 다그치지 않고 무슨 일인지와 어떻게 하면 되는지만 말한다 (DESIGN.md §9).
 */
export function explain(e: unknown): string {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (m.includes("anonymous") && (m.includes("disabled") || m.includes("not enabled"))) {
    return "익명 저장이 아직 꺼져 있어요. 로그인하시면 바로 저장됩니다.";
  }
  if (m.includes("row-level security") || m.includes("policy")) {
    return "보관함 권한이 아직 정리 중이에요. 잠시 뒤 다시 눌러주세요.";
  }
  if (m.includes("relation") && m.includes("does not exist")) {
    return "보관함이 아직 준비되지 않았어요. 조금만 기다려 주세요.";
  }
  if (m.includes("failed to fetch") || m.includes("network")) {
    return "지금은 연결이 안 되네요. 대본은 이 기기에 그대로 있으니 잠시 뒤 다시 해보세요.";
  }
  return "지금은 저장이 안 되네요. 대본은 이 기기에 그대로 있어요.";
}
