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
const SPEAKING_TIMEOUT_MS = 450;
const HISTORY_MAX = 40;
const TAIL_WORDS = 8;

export interface ControllerState {
  running: boolean;
  status: SttStatus;
  lost: boolean;
  error: string | null;
  currentToken: number;
}

export function useController() {
  const [tokens, setTokens] = useState<ScriptToken[]>([]);
  const [state, setState] = useState<ControllerState>({
    running: false,
    status: "idle",
    lost: false,
    error: null,
    currentToken: 0,
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
      interim.current = r.words;
    }
    const tail = [...history.current.slice(-TAIL_WORDS), ...interim.current].slice(-TAIL_WORDS);
    if (tail.length === 0) return;

    const now = performance.now();
    const res = aligner.push(tail, now);
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
    async (scriptText: string, kind: EngineKind, scrollOpts?: Partial<ScrollOptions>) => {
      const prepared = prepareScript(scriptText);
      if (prepared.tokens.length === 0) {
        setState((s) => ({ ...s, error: "대본이 비어 있어요." }));
        return;
      }
      setTokens(prepared.tokens);
      setState({ running: true, status: "loading", lost: false, error: null, currentToken: 0 });
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
      const scroll = new ScrollController(container, scrollOpts);
      scrollRef.current = scroll;
      recomputeOffsets();
      scroll.jumpTo(0);
      scroll.start();
      setHighlight(0);

      const hooks: SttHooks = {
        onResult: handleResult,
        onStatus: (status) => setState((s) => ({ ...s, status })),
        onError: (message) => setState((s) => ({ ...s, error: message })),
      };
      const engine = kind === "vosk" ? new VoskEngine(hooks) : new WebSpeechEngine(hooks);
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
    setHighlight(token);
    setState((s) => ({ ...s, currentToken: token, lost: false }));
  }, [setHighlight]);

  const setScrollOptions = useCallback((opts: Partial<ScrollOptions>) => {
    scrollRef.current?.setOptions(opts);
  }, []);

  return { tokens, state, start, stop, seek, attach, recomputeOffsets, setScrollOptions };
}

export type Controller = ReturnType<typeof useController>;
