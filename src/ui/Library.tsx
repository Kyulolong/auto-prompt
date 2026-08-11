/**
 * 대본 보관함.
 *
 * 편집기 아래 선반. 키가 안 박힌 빌드에서는 통째로 그려지지 않으므로, 이 컴포넌트가
 * 없는 것처럼 앱이 돌아간다 — 그게 '보관함은 덤'이라는 말의 실제 구현이다.
 */
import { useCallback, useEffect, useState } from "react";
import { isLibraryConfigured } from "../lib/supabase";
import {
  explain,
  listScripts,
  removeScript,
  saveScript,
  watchAccount,
  readAccount,
  SIGNED_OUT,
  type Account,
  type SavedScript,
} from "../lib/library";

interface Props {
  text: string;
  currentId: string | null;
  onLoad: (s: SavedScript) => void;
  onSaved: (s: SavedScript) => void;
  onDropped: (id: string) => void;
}

/** "3분 전" 정도면 충분하다. 촬영 전에 어느 게 최근 건지만 알면 된다. */
function when(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

export function Library({ text, currentId, onLoad, onSaved, onDropped }: Props) {
  const [account, setAccount] = useState<Account>(SIGNED_OUT);
  const [items, setItems] = useState<SavedScript[]>([]);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");

  const refresh = useCallback(async () => {
    try {
      setItems(await listScripts());
      setHint("");
    } catch (e) {
      setHint(explain(e));
    }
  }, []);

  // 첫 진입에 이미 세션이 있는지 본다. 홈페이지에서 로그인하고 넘어온 경우가
  // 여기에 걸린다 — onAuthStateChange 는 '바뀔 때'만 울리므로 이게 따로 필요하다.
  useEffect(() => {
    if (!isLibraryConfigured) return;
    let alive = true;
    readAccount().then((a) => {
      if (!alive) return;
      setAccount(a);
      if (a.signedIn) refresh();
    });
    return () => {
      alive = false;
    };
  }, [refresh]);

  // 그 뒤로는 세션 변화를 따라간다. 다른 탭에서 홈페이지에 로그인해도 여기가 같이
  // 바뀐다 — 같은 오리진이라 supabase-js 가 localStorage 를 통해 탭 사이로 세션을
  // 흘려보낸다.
  useEffect(() => {
    if (!isLibraryConfigured) return;
    return watchAccount((a) => {
      setAccount(a);
      if (a.signedIn) refresh();
      else setItems([]);
    });
  }, [refresh]);

  if (!isLibraryConfigured) return null;

  const current = items.find((s) => s.id === currentId) ?? null;
  const dirty = text.trim() !== "" && (!current || current.body !== text);
  const canSave = text.trim() !== "" && !busy && dirty;

  async function save() {
    setBusy(true);
    setHint("");
    try {
      const saved = await saveScript(text, currentId);
      onSaved(saved);
      await refresh();
    } catch (e) {
      setHint(explain(e));
    } finally {
      setBusy(false);
    }
  }

  function load(s: SavedScript) {
    if (dirty && !window.confirm("지금 쓰던 대본은 저장되지 않았어요. 불러오면 그 내용이 사라집니다. 계속할까요?")) return;
    onLoad(s);
  }

  async function drop(s: SavedScript) {
    if (!window.confirm(`"${s.title}" 을(를) 보관함에서 지울까요?`)) return;
    setBusy(true);
    try {
      await removeScript(s.id);
      onDropped(s.id);
      await refresh();
    } catch (e) {
      setHint(explain(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="library">
      <div className="library-head">
        <h2>보관함</h2>
        <div className="library-meta">
          {account.signedIn && !account.anonymous && account.label ? (
            <span className="library-who">{account.label}</span>
          ) : null}
          <button className="btn small" onClick={save} disabled={!canSave}>
            {busy ? "저장 중…" : currentId ? "저장하기" : "이 대본 보관하기"}
          </button>
        </div>
      </div>

      {hint ? <p className="library-hint">{hint}</p> : null}

      {items.length > 0 ? (
        <ul className="library-list">
          {items.map((s) => (
            <li key={s.id} className={s.id === currentId ? "on" : undefined}>
              <button className="library-item" onClick={() => load(s)} disabled={busy}>
                <span className="library-title">{s.title}</span>
                <span className="library-when">{when(s.updatedAt)}</span>
              </button>
              <button className="link-btn" onClick={() => drop(s)} disabled={busy}>
                지우기
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="library-empty">
          대본을 보관해두면 여기 쌓여요. 계정이 없어도 바로 됩니다.
        </p>
      )}

      {/* 익명 세션은 이 브라우저에만 남는다. 기기를 옮겨서 쓰는 게 이 기능의 요점이라
          그 한계를 숨기지 않고 바로 옆에 적는다. */}
      {account.anonymous ? (
        <p className="library-nudge">
          지금은 이 브라우저에만 보관돼요.{" "}
          <a href="/login?next=/prompt">계정을 만들면</a> 다른 기기에서도 그대로 이어집니다. 지금
          보관한 것도 같이 따라가요.
        </p>
      ) : null}
    </section>
  );
}
