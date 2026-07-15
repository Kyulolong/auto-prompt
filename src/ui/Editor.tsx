import { SAMPLE_SCRIPT } from "./sample";

interface Props {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}

function countWords(t: string): number {
  return t.trim().split(/\s+/).filter(Boolean).length;
}

// ~3 Korean 어절/sec reading pace -> rough minutes estimate.
function estMinutes(words: number): string {
  const sec = words / 3;
  if (sec < 60) return `약 ${Math.max(1, Math.round(sec))}초`;
  return `약 ${Math.round(sec / 60)}분`;
}

export function Editor({ value, onChange, disabled }: Props) {
  const words = countWords(value);
  return (
    <div className="editor">
      <div className="editor-head">
        <label htmlFor="script">대본</label>
        <div className="editor-meta">
          <span>{words} 어절</span>
          <span className="dot">·</span>
          <span>{estMinutes(words)}</span>
          <button className="link-btn" onClick={() => onChange(SAMPLE_SCRIPT)} disabled={disabled}>
            샘플 넣기
          </button>
        </div>
      </div>
      <textarea
        id="script"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="여기에 대본을 붙여넣어 보세요. 10분 분량도 괜찮아요."
        spellCheck={false}
      />
    </div>
  );
}
