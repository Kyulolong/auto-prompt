import type { EngineKind } from "./useController";
import type { SttStatus } from "../stt/types";

export interface Settings {
  engine: EngineKind;
  fontSize: number;
  readingLineFrac: number;
  mirror: boolean;
}

interface Props {
  running: boolean;
  status: SttStatus;
  lost: boolean;
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => void;
  onStart: () => void;
  onStop: () => void;
  webSpeechAvailable: boolean;
}

const STATUS_LABEL: Record<SttStatus, string> = {
  idle: "대기",
  loading: "준비 중…",
  listening: "듣는 중",
  stopped: "정지",
  error: "오류",
};

export function Controls({ running, status, lost, settings, onSettings, onStart, onStop, webSpeechAvailable }: Props) {
  const { engine, fontSize, readingLineFrac, mirror } = settings;
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

        {running && (
          <span className={`status ${status}${lost ? " lost" : ""}`}>
            <span className="status-dot" />
            {lost ? "위치 찾는 중… (읽던 문장으로 돌아와 주세요)" : STATUS_LABEL[status]}
          </span>
        )}

        <div className="spacer" />

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
      )}
    </div>
  );
}
