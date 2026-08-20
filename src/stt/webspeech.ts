/**
 * Web Speech API engine — zero setup, works today in desktop Chrome/Edge.
 * Downside: audio goes to Google's servers (needs internet, not truly offline),
 * and the recognizer self-terminates roughly every 60s. We wrap that so long
 * takes keep going.
 */
import { type SttEngine, type SttHooks, splitWords } from "./types";

type RecCtor = new () => SpeechRecognition;

export function isWebSpeechAvailable(): boolean {
  return typeof window !== "undefined" && !!((window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: RecCtor }).webkitSpeechRecognition);
}

export class WebSpeechEngine implements SttEngine {
  readonly label = "Web Speech (ko-KR)";
  readonly offline = false;
  private rec: SpeechRecognition | null = null;
  private hooks: SttHooks;
  private wantRunning = false;
  private restartTimer = 0;
  private emittedFinals = 0; // finals already forwarded this session (Safari re-sends them)

  constructor(hooks: SttHooks) {
    this.hooks = hooks;
  }

  async start(): Promise<void> {
    const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      this.hooks.onError("이 브라우저는 Web Speech API를 지원하지 않아요. 데스크톱 Chrome을 쓰거나 Vosk 엔진으로 바꿔주세요.");
      this.hooks.onStatus("error");
      return;
    }
    this.wantRunning = true;
    this.spawn(Ctor);
  }

  private spawn(Ctor: RecCtor): void {
    const rec = new Ctor();
    rec.lang = "ko-KR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => this.hooks.onStatus("listening");
    this.emittedFinals = 0; // fresh recognition session -> fresh results list

    rec.onresult = (e: SpeechRecognitionEvent) => {
      // Emit the tail: the latest final (if any this event) plus the live interim.
      //
      // Don't trust e.resultIndex: Safari (iPad/iPhone) keeps it at 0 and
      // restates every result since the session began, so already-finalized
      // phrases would be re-emitted and drag the aligner back to text the
      // reader passed long ago. Result indexes are stable within a session,
      // so counting the finals we've forwarded dedupes on every browser.
      let interim = "";
      let finalText = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          if (i >= this.emittedFinals) {
            finalText += r[0].transcript;
            this.emittedFinals = i + 1;
          }
        } else {
          interim += r[0].transcript;
        }
      }
      if (finalText) this.hooks.onResult({ words: splitWords(finalText), isFinal: true });
      if (interim) this.hooks.onResult({ words: splitWords(interim), isFinal: false });
    };

    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === "no-speech" || e.error === "aborted") return; // pauses / our own stop
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        this.hooks.onError("마이크 권한이 필요해요. 브라우저 주소창의 마이크 아이콘에서 허용해주세요.");
        this.wantRunning = false;
        this.hooks.onStatus("error");
        return;
      }
      this.hooks.onError(`음성인식 오류: ${e.error}`);
    };

    // The ~60s auto-stop (and stops on long silence) land here — just respawn.
    rec.onend = () => {
      if (!this.wantRunning) {
        this.hooks.onStatus("stopped");
        return;
      }
      this.restartTimer = window.setTimeout(() => this.spawn(Ctor), 250);
    };

    this.rec = rec;
    try {
      rec.start();
    } catch {
      // start() throws if called while already starting; onend will respawn.
    }
  }

  stop(): void {
    this.wantRunning = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    if (this.rec) {
      try {
        this.rec.abort();
      } catch {
        /* ignore */
      }
    }
    this.hooks.onStatus("stopped");
  }
}
