import { useCallback, useEffect, useRef, useState } from "react";
import { Editor } from "./ui/Editor";
import { Controls, type Settings } from "./ui/Controls";
import { Prompter } from "./ui/Prompter";
import { Library } from "./ui/Library";
import { useController } from "./ui/useController";
import { isWebSpeechAvailable } from "./stt/webspeech";

const LS_SCRIPT = "ap.script";
const LS_SETTINGS = "ap.settings";
/**
 * 지금 편집기에 있는 대본이 보관함의 어느 항목에서 온 것인지.
 *
 * 새로고침해도 남겨둔다 — 안 그러면 불러온 대본을 고치고 저장했을 때 같은 대본이
 * 보관함에 하나 더 생긴다.
 */
const LS_SAVED_ID = "ap.savedId";

const DEFAULT_SETTINGS: Settings = {
  mode: "voice",
  engine: isWebSpeechAvailable() ? "webspeech" : "vosk",
  fontSize: 44,
  readingLineFrac: 0.38,
  autoSpeed: 45,
  mirror: false,
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_SETTINGS;
}

export default function App() {
  const controller = useController();
  const { running, error } = controller.state;
  const [text, setText] = useState(() => localStorage.getItem(LS_SCRIPT) ?? "");
  const [savedId, setSavedId] = useState<string | null>(() => localStorage.getItem(LS_SAVED_ID));
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    localStorage.setItem(LS_SCRIPT, text);
  }, [text]);
  useEffect(() => {
    localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
  }, [settings]);
  useEffect(() => {
    if (savedId) localStorage.setItem(LS_SAVED_ID, savedId);
    else localStorage.removeItem(LS_SAVED_ID);
  }, [savedId]);

  // Keep the screen awake while prompting.
  const acquireWakeLock = useCallback(async () => {
    try {
      wakeLock.current = await navigator.wakeLock?.request("screen");
    } catch {
      /* unsupported or denied — non-fatal */
    }
  }, []);
  useEffect(() => {
    if (!running) return;
    acquireWakeLock();
    const onVis = () => {
      if (document.visibilityState === "visible" && running) acquireWakeLock();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      wakeLock.current?.release().catch(() => {});
      wakeLock.current = null;
    };
  }, [running, acquireWakeLock]);

  const patchSettings = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((s) => ({ ...s, ...patch }));
      if (patch.readingLineFrac !== undefined) controller.setScrollOptions({ readingLineFrac: patch.readingLineFrac });
      if (patch.autoSpeed !== undefined) controller.setAutoSpeed(patch.autoSpeed);
    },
    [controller],
  );

  const onStart = useCallback(() => {
    controller.start(text, {
      mode: settings.mode,
      engine: settings.engine,
      readingLineFrac: settings.readingLineFrac,
      autoSpeed: settings.autoSpeed,
    });
  }, [controller, text, settings.mode, settings.engine, settings.readingLineFrac, settings.autoSpeed]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>
            <span className="logo" aria-hidden="true" />
            보이스 프롬프터
          </h1>
          <p>그냥 편하게 읽으세요. 화면은 제가 따라갈게요.</p>
        </div>
        <div className="topbar-side">
          {/* 홈페이지의 이 서비스 소개로 돌아간다.
              루트 상대경로(/services/prompt) 가 아니라 절대 URL 인 이유는 로컬
              dev(localhost:5173/prompt/) 에서도 같은 곳을 가리키게 하려는 것이다.
              보관함의 /login 링크는 반대로 상대경로여야 한다 — 세션 공유가 같은
              오리진을 전제로 하기 때문에 거기서 도메인을 박으면 오히려 깨진다. */}
          <a className="back" href="https://kyulolong.com/services/prompt">
            <span aria-hidden="true">←</span> 규로롱
          </a>
          <span className="credit">made by kyulolong</span>
        </div>
      </header>

      <Controls
        running={running}
        status={controller.state.status}
        lost={controller.state.lost}
        paused={controller.state.paused}
        settings={settings}
        onSettings={patchSettings}
        onStart={onStart}
        onStop={controller.stop}
        onTogglePause={controller.togglePause}
        webSpeechAvailable={isWebSpeechAvailable()}
      />

      {error && <div className="banner error">{error}</div>}

      <main className="stage">
        {running ? (
          <Prompter controller={controller} fontSize={settings.fontSize} mirror={settings.mirror} readingLineFrac={settings.readingLineFrac} />
        ) : (
          <div className="compose">
            <Editor value={text} onChange={setText} disabled={running} />
            <Library
              text={text}
              currentId={savedId}
              onLoad={(s) => {
                setText(s.body);
                setSavedId(s.id);
              }}
              onSaved={(s) => setSavedId(s.id)}
              onDropped={(id) => setSavedId((cur) => (cur === id ? null : cur))}
            />
          </div>
        )}
      </main>
    </div>
  );
}
