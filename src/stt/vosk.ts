/**
 * Vosk engine — fully offline, on-device Korean recognition via WASM.
 * Runs anywhere (no WebGPU needed) and has no session time limit, so it's the
 * real engine for long takes. Needs the Korean model downloaded once:
 *   npm run get-model
 *
 * vosk-browser is an optional dependency and is imported lazily, so the app
 * still builds and runs on Web Speech even if it isn't installed.
 */
import { type SttEngine, type SttHooks, splitWords } from "./types";

// NOTE: served with a non-".gz" name on purpose. A .gz file makes static
// servers (incl. Vite) send `Content-Encoding: gzip`, so the browser silently
// decompresses it and vosk-browser then fails to un-gzip. The bytes are still a
// gzipped tar; vosk-browser detects that by content.
const MODEL_URL = "/models/vosk-model-small-ko.bin";

// Minimal shapes for the lazily-loaded library.
interface KaldiRecognizer {
  on(event: "result" | "partialresult", cb: (m: { result: { text?: string; partial?: string } }) => void): void;
  acceptWaveform(buffer: AudioBuffer): void;
  remove?(): void;
}
interface VoskModel {
  KaldiRecognizer: new (sampleRate: number) => KaldiRecognizer;
  terminate?(): void;
}

export class VoskEngine implements SttEngine {
  readonly label = "Vosk (오프라인)";
  readonly offline = true;
  private hooks: SttHooks;
  private model: VoskModel | null = null;
  private ctx: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;

  constructor(hooks: SttHooks) {
    this.hooks = hooks;
  }

  async start(): Promise<void> {
    this.hooks.onStatus("loading");
    let createModel: (url: string) => Promise<VoskModel>;
    try {
      // @ts-ignore optional dependency, resolved at runtime
      const vosk = await import("vosk-browser");
      createModel = vosk.createModel as (url: string) => Promise<VoskModel>;
    } catch {
      this.hooks.onError("Vosk 라이브러리를 불러오지 못했어요. `npm i` 후 다시 시도해주세요.");
      this.hooks.onStatus("error");
      return;
    }

    try {
      this.model = await createModel(MODEL_URL);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      this.hooks.onError(`한국어 모델을 불러오지 못했어요 (${reason}). \`npm run get-model\` 로 받았는지 확인해주세요.`);
      this.hooks.onStatus("error");
      return;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      this.hooks.onError("마이크 권한이 필요해요.");
      this.hooks.onStatus("error");
      return;
    }

    const ctx = new AudioContext();
    this.ctx = ctx;
    const recognizer = new this.model.KaldiRecognizer(ctx.sampleRate);
    recognizer.on("result", (m) => {
      const text = m.result.text ?? "";
      if (text) this.hooks.onResult({ words: splitWords(text), isFinal: true });
    });
    recognizer.on("partialresult", (m) => {
      const partial = m.result.partial ?? "";
      if (partial) this.hooks.onResult({ words: splitWords(partial), isFinal: false });
    });

    this.source = ctx.createMediaStreamSource(this.stream);
    this.processor = ctx.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (e) => {
      try {
        recognizer.acceptWaveform(e.inputBuffer);
      } catch {
        /* occasional buffer hiccup; ignore */
      }
    };
    this.source.connect(this.processor);
    // Output buffer is left silent, so this doesn't feed the mic back to speakers.
    this.processor.connect(ctx.destination);
    this.hooks.onStatus("listening");
  }

  stop(): void {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.model?.terminate?.();
    this.processor = null;
    this.source = null;
    this.stream = null;
    this.ctx = null;
    this.model = null;
    this.hooks.onStatus("stopped");
  }
}
