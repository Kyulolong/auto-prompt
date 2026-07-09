import { useCallback, useEffect, useRef, useState } from "react";
import { Editor } from "./ui/Editor";
import { Controls, type Settings } from "./ui/Controls";
import { Prompter } from "./ui/Prompter";
import { useController } from "./ui/useController";
import { isWebSpeechAvailable } from "./stt/webspeech";

const LS_SCRIPT = "ap.script";
const LS_SETTINGS = "ap.settings";

const DEFAULT_SETTINGS: Settings = {
  engine: isWebSpeechAvailable() ? "webspeech" : "vosk",
  fontSize: 44,
  readingLineFrac: 0.38,
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
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    localStorage.setItem(LS_SCRIPT, text);
  }, [text]);
  useEffect(() => {
    localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
  }, [settings]);

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
    },
    [controller],
  );

  const onStart = useCallback(() => {
    controller.start(text, settings.engine, { readingLineFrac: settings.readingLineFrac });
  }, [controller, text, settings.engine, settings.readingLineFrac]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true" />
          <div>
            <h1>보이스 프롬프터</h1>
            <p>목소리를 듣고 대본을 따라 스크롤합니다</p>
          </div>
        </div>
      </header>

      <Controls
        running={running}
        status={controller.state.status}
        lost={controller.state.lost}
        settings={settings}
        onSettings={patchSettings}
        onStart={onStart}
        onStop={controller.stop}
        webSpeechAvailable={isWebSpeechAvailable()}
      />

      {error && <div className="banner error">{error}</div>}

      <main className="stage">
        {running ? (
          <Prompter controller={controller} fontSize={settings.fontSize} mirror={settings.mirror} readingLineFrac={settings.readingLineFrac} />
        ) : (
          <Editor value={text} onChange={setText} disabled={running} />
        )}
      </main>
    </div>
  );
}
