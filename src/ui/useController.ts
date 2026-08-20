/**
 * Wires the pieces together: STT engine -> aligner -> scroll controller, plus
 * the imperative highlight of the current word. Kept out of React's render path
 * (refs + class toggling) so following the voice never re-renders the script.
 */
import { useCallback, useRef, useState } from "react";
import { prepareScript, type ScriptToken } from "../korean/script";
import { Aligner } from "../engine/align";
import { ScrollController, type ScrollOptions } from "../engine/scroll";
import type { SttEngine, SttHooks, SttStatus } from "../stt/types";
import { WebSpeechEngine } from "../stt/webspeech";
import { VoskEngine } from "../stt/vosk";

export type EngineKind = "webspeech" | "vosk";
export type PrompterMode = "voice" | "auto";
const SPEAKING_TIMEOUT_MS = 450;
const HISTORY_MAX = 40;
const TAIL_WORDS = 8;

export interface StartConfig {
  mode: PrompterMode;
  engine: EngineKind;
  readingLineFrac: number;
  autoSpeed: number;
}

export interface ControllerState {
  running: boolean;
  status: SttStatus;
  lost: boolean;
  error: string | null;
  currentToken: number;
  mode: PrompterMode;
  paused: boolean;
}

export function useController() {
  const [tokens, setTokens] = useState<ScriptToken[]>([]);
  const [state, setState] = useState<ControllerState>({
    running: false,
    status: "idle",
    lost: false,
    error: null,
    currentToken: 0,
    mode: "voice",
    paused: false,
  });

  const alignerRef = useRef<Aligner | null>(null);
  const scrollRef = useRef<ScrollController | null>(null);
  const engineRef = useRef<SttEngine | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const elsRef = useRef<HTMLElement[]>([]);
  const highlightRef = useRef<number>(-1);
  const speakingTimer = useRef<number>(0);

  const history = useRef<string[]>([]);
  const interim = useRef<string[]>([]);

  const setHighlight = useCallback((idx: number) => {
    if (idx === highlightRef.current) return;
    const els = elsRef.current;
    if (highlightRef.current >= 0 && els[highlightRef.current]) els[highlightRef.current].classList.remove("is-current");
    if (els[idx]) els[idx].classList.add("is-current");
    highlightRef.current = idx;
  }, []);

  const recomputeOffsets = useCallback(() => {
    const container = containerRef.current;
    const els = elsRef.current;
    if (!container || els.length === 0) return;
    const base = container.getBoundingClientRect().top - container.scrollTop;
    const offsets = els.map((el) => {
      const r = el.getBoundingClientRect();
      return r.top - base + r.height / 2;
    });
    scrollRef.current?.setOffsets(offsets);
  }, []);

  // Called by <Prompter> after it renders the token spans.
  const attach = useCallback(
    (container: HTMLElement, els: HTMLElement[]) => {
      containerRef.current = container;
      elsRef.current = els;
      if (scrollRef.current) {
        recomputeOffsets();
      }
    },
    [recomputeOffsets],
  );

  const handleResult: SttHooks["onResult"] = useCallback((r) => {
    const aligner = alignerRef.current;
    const scroll = scrollRef.current;
    if (!aligner || !scroll) return;

    if (r.isFinal) {
      history.current.push(...r.words);
      if (history.current.length > HISTORY_MAX) history.current = history.current.slice(-HISTORY_MAX);
      interim.current = [];
    } else {
      // Safari's interim is cumulative: it restates words that were already
      // finalized. Drop the longest interim prefix that matches the tail of
      // history, so the query never carries the same phrase twice — duplicated
      // phrases are what pull the aligner back to text the reader passed.
      let words = r.words;
      const past = history.current;
      for (let k = Math.min(words.length, past.length); k > 0; k--) {
        const off = past.length - k;
        let match = true;
        for (let i = 0; i < k; i++) {
          if (past[off + i] !== words[i]) {
            match = false;
            break;
          }
        }
        if (match) {
          words = words.slice(k);
          break;
        }
      }
      interim.current = words;
    }
    const tail = [...history.current.slice(-TAIL_WORDS), ...interim.current].slice(-TAIL_WORDS);
    if (tail.length === 0) return;

    const now = performance.now();
    const res = aligner.push(tail, now, r.isFinal);
    setHighlight(res.token);
    scroll.update({ confirmedToken: res.token, tokensPerSec: aligner.tokensPerSec, speaking: true, lost: res.lost, now });

    setState((s) => (s.currentToken === res.token && s.lost === res.lost ? s : { ...s, currentToken: res.token, lost: res.lost }));

    // speech-activity gate: no results for a beat => paused => freeze creep
    if (speakingTimer.current) clearTimeout(speakingTimer.current);
    speakingTimer.current = window.setTimeout(() => {
      scrollRef.current?.update({ speaking: false, now: performance.now() });
    }, SPEAKING_TIMEOUT_MS);
  }, [setHighlight]);

  const start = useCallback(
    async (scriptText: string, cfg: StartConfig) => {
      const prepared = prepareScript(scriptText);
      if (prepared.tokens.length === 0) {
        setState((s) => ({ ...s, error: "대본이 아직 비어 있어요. 아무 문장이나 붙여넣고 시작해 보세요." }));
        return;
      }
      setTokens(prepared.tokens);
      setState({ running: true, status: "loading", lost: false, error: null, currentToken: 0, mode: cfg.mode, paused: false });
      history.current = [];
      interim.current = [];
      highlightRef.current = -1;

      const aligner = new Aligner(prepared);
      aligner.reset(0);
      alignerRef.current = aligner;

      // container is attached by <Prompter> on its next render; wait a frame.
      await new Promise((res) => requestAnimationFrame(() => res(null)));
      const container = containerRef.current;
      if (!container) {
        setState((s) => ({ ...s, running: false, error: "프롬프터 화면을 찾지 못했어요." }));
        return;
      }
      const scroll = new ScrollController(container, { readingLineFrac: cfg.readingLineFrac });
      scrollRef.current = scroll;
      recomputeOffsets();
      scroll.jumpTo(0);
      scroll.start();

      // Auto mode: constant-speed scroll, no microphone / STT / word highlight.
      if (cfg.mode === "auto") {
        scroll.setAutoSpeed(cfg.autoSpeed);
        scroll.setMode("auto");
        setState((s) => ({ ...s, status: "listening" }));
        return;
      }
      setHighlight(0);

      const hooks: SttHooks = {
        onResult: handleResult,
        onStatus: (status) => setState((s) => ({ ...s, status })),
        onError: (message) => setState((s) => ({ ...s, error: message })),
      };
      const engine = cfg.engine === "vosk" ? new VoskEngine(hooks) : new WebSpeechEngine(hooks);
      engineRef.current = engine;
      await engine.start();
    },
    [handleResult, recomputeOffsets, setHighlight],
  );

  const stop = useCallback(() => {
    engineRef.current?.stop();
    scrollRef.current?.stop();
    engineRef.current = null;
    if (speakingTimer.current) clearTimeout(speakingTimer.current);
    setState((s) => ({ ...s, running: false, status: "stopped" }));
  }, []);

  const seek = useCallback((token: number) => {
    alignerRef.current?.seekToken(token);
    scrollRef.current?.update({ confirmedToken: token, now: performance.now() });
    scrollRef.current?.jumpTo(token); // snap on manual click (works in both modes)
    setHighlight(token);
    setState((s) => ({ ...s, currentToken: token, lost: false }));
  }, [setHighlight]);

  const setScrollOptions = useCallback((opts: Partial<ScrollOptions>) => {
    scrollRef.current?.setOptions(opts);
  }, []);

  const setAutoSpeed = useCallback((pxPerSec: number) => {
    scrollRef.current?.setAutoSpeed(pxPerSec);
  }, []);

  const togglePause = useCallback(() => {
    setState((s) => {
      const paused = !s.paused;
      scrollRef.current?.setPaused(paused);
      return { ...s, paused };
    });
  }, []);

  return { tokens, state, start, stop, seek, attach, recomputeOffsets, setScrollOptions, setAutoSpeed, togglePause };
}

export type Controller = ReturnType<typeof useController>;
