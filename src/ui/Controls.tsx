import type { EngineKind, PrompterMode } from "./useController";
import type { SttStatus } from "../stt/types";

export interface Settings {
  mode: PrompterMode;
  engine: EngineKind;
  fontSize: number;
  readingLineFrac: number;
  autoSpeed: number; // px/sec for auto-scroll mode
  mirror: boolean;
}

interface Props {
  running: boolean;
  status: SttStatus;
  lost: boolean;
  paused: boolean;
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => void;
  onStart: () => void;
  onStop: () => void;
  onTogglePause: () => void;
  webSpeechAvailable: boolean;
}

// iPadOS 13+ reports as "MacIntel" with touch, so check that too.
const IS_IOS =
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

const STATUS_LABEL: Record<SttStatus, string> = {
  idle: "대기",
  loading: "준비 중…",
  listening: "듣고 있어요",
  stopped: "정지",
  error: "잠깐 멈췄어요",
};

export function Controls({ running, status, lost, paused, settings, onSettings, onStart, onStop, onTogglePause, webSpeechAvailable }: Props) {
  const { mode, engine, fontSize, readingLineFrac, autoSpeed, mirror } = settings;
  const auto = mode === "auto";

  // 다그치지 않는다: "돌아와 주세요"(사용자 탓)가 아니라 "제가 따라갈게요"(서비스가 책임)
  const runningLabel = auto
    ? paused
      ? "일시정지"
      : "자동 스크롤 중"
    : lost
      ? "잠깐 놓쳤어요. 편하게 계속 읽으시면 다시 따라갈게요"
      : STATUS_LABEL[status];

  return (
    <div className="controls">
      <div className="controls-row">
        {!running ? (
          <button className="btn primary" onClick={onStart}>
            시작
          </button>
        ) : (
          <button className="btn danger" onClick={onStop}>
            정지
          </button>
        )}

        {running && auto && (
          <button className="btn" onClick={onTogglePause}>
            {paused ? "재생" : "일시정지"}
          </button>
        )}

        {running && (
          <span className={`status ${auto ? "listening" : status}${lost && !auto ? " lost" : ""}`}>
            <span className="status-dot" />
            {runningLabel}
          </span>
        )}

        <div className="spacer" />

        {auto && (
          <label className="ctl">
            <span className="ctl-label">속도</span>
            <input
              type="range"
              min={15}
              max={170}
              step={5}
              value={autoSpeed}
              onChange={(e) => onSettings({ autoSpeed: Number(e.target.value) })}
            />
          </label>
        )}

        <div className="ctl">
          <span className="ctl-label">글자</span>
          <button className="step" onClick={() => onSettings({ fontSize: Math.max(20, fontSize - 4) })} aria-label="글자 작게">
            −
          </button>
          <span className="ctl-val">{fontSize}</span>
          <button className="step" onClick={() => onSettings({ fontSize: Math.min(96, fontSize + 4) })} aria-label="글자 크게">
            +
          </button>
        </div>

        <label className="ctl">
          <span className="ctl-label">읽는 줄</span>
          <input
            type="range"
            min={0.2}
            max={0.6}
            step={0.02}
            value={readingLineFrac}
            onChange={(e) => onSettings({ readingLineFrac: Number(e.target.value) })}
          />
        </label>

        <label className="ctl toggle">
          <input type="checkbox" checked={mirror} onChange={(e) => onSettings({ mirror: e.target.checked })} />
          <span>거울</span>
        </label>
      </div>

      {!running && (
        <div className="controls-row modes">
          <span className="ctl-label">모드</span>
          <label className={`chip-radio${!auto ? " on" : ""}`}>
            <input type="radio" name="mode" checked={!auto} onChange={() => onSettings({ mode: "voice" })} />
            🎙 음성 따라가기
          </label>
          <label className={`chip-radio${auto ? " on" : ""}`}>
            <input type="radio" name="mode" checked={auto} onChange={() => onSettings({ mode: "auto" })} />
            ⏱ 자동 스크롤
          </label>
        </div>
      )}

      {!running && !auto && (
        <>
          <div className="controls-row engines">
            <span className="ctl-label">음성인식</span>
            <label className={`chip-radio${engine === "webspeech" ? " on" : ""}`}>
              <input
                type="radio"
                name="engine"
                checked={engine === "webspeech"}
                disabled={!webSpeechAvailable}
                onChange={() => onSettings({ engine: "webspeech" })}
              />
              Web Speech · 바로 사용
            </label>
            <label className={`chip-radio${engine === "vosk" ? " on" : ""}`}>
              <input type="radio" name="engine" checked={engine === "vosk"} onChange={() => onSettings({ engine: "vosk" })} />
              Vosk · 오프라인 (모델 필요)
            </label>
          </div>
          <p className="engine-note">
            {IS_IOS && (
              <span className="warn">
                ⚠︎ iPad·아이폰(Safari)에서는 음성 인식이 아직 안 돼요. <b>자동 스크롤</b> 모드를 쓰거나 데스크톱 <b>Chrome</b>에서 열어주세요.{" "}
              </span>
            )}
            <b>Vosk</b>는 첫 실행 때 한국어 모델(약 82MB)을 받은 뒤 <b>완전 오프라인·로컬</b>로 돌아갑니다(음성이 밖으로 안 나가요). 데스크톱 Chrome 권장.{" "}
            <b>Web Speech</b>는 설치 없이 바로 되지만 인터넷이 필요하고 음성이 구글로 전송돼요. 고르고 시작만 누르면 끝이에요.{" "}
          </p>
        </>
      )}

      {!running && auto && (
        <p className="engine-note">
          마이크 없이 <b>일정 속도로 자동 스크롤</b>합니다. 인터넷·모델 필요 없고 <b>iPad를 포함한 모든 기기</b>에서 돼요. 시작한 뒤에도 속도·일시정지를 조절할 수 있어요.
        </p>
      )}
    </div>
  );
}
