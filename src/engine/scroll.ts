/**
 * Smooth scroll controller.
 *
 * Two layers of smoothing keep it from lurching:
 *  1. "word creep" — between STT updates we keep inching forward at the measured
 *     reading speed, so a batchy recognizer doesn't make the text stutter.
 *  2. rAF easing — the scroll position eases toward its target every frame, so
 *     both single-word steps and big skips glide.
 *
 * Creep freezes when the speaker pauses or the aligner is lost, so silence holds
 * position instead of drifting ahead. The target is also a forward ratchet:
 * accrued creep never unwinds when speech stops (that read as a queasy
 * back-then-forward bounce at every paragraph break) — the view only moves
 * backward for a real backward event (re-read confirmation, manual seek).
 */
export interface ScrollOptions {
  readingLineFrac: number; // where the current line sits (0=top, 1=bottom)
  spring: number; // 0..1 easing per frame
  creepCapTokens: number; // max tokens creep may run ahead of confirmed
  deadbandPx: number; // ignore target moves smaller than this
}

export const DEFAULT_SCROLL: ScrollOptions = {
  readingLineFrac: 0.38,
  spring: 0.12,
  creepCapTokens: 3,
  deadbandPx: 1.5,
};

interface State {
  confirmedToken: number;
  confirmedAt: number;
  tokensPerSec: number;
  speaking: boolean;
  lost: boolean;
}

export class ScrollController {
  private el: HTMLElement;
  private opts: ScrollOptions;
  private offsets: number[] = []; // center-Y of each token's line, in content px
  private state: State = { confirmedToken: 0, confirmedAt: 0, tokensPerSec: 2.5, speaking: false, lost: false };
  private raf = 0;
  private running = false;
  private mode: "voice" | "auto" = "voice";
  private autoPxPerSec = 45;
  private paused = false;
  private lastFrame = 0;
  private ratchetToken = 0; // highest token-space target shown so far (voice mode)

  constructor(el: HTMLElement, opts: Partial<ScrollOptions> = {}) {
    this.el = el;
    this.opts = { ...DEFAULT_SCROLL, ...opts };
  }

  setOptions(opts: Partial<ScrollOptions>): void {
    this.opts = { ...this.opts, ...opts };
  }

  setMode(mode: "voice" | "auto"): void {
    this.mode = mode;
    this.lastFrame = 0;
  }

  setAutoSpeed(pxPerSec: number): void {
    this.autoPxPerSec = pxPerSec;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.lastFrame = 0; // avoid a jump on resume
  }

  setOffsets(offsets: number[]): void {
    this.offsets = offsets;
  }

  update(s: Partial<State> & { now: number }): void {
    if (s.confirmedToken !== undefined && s.confirmedToken !== this.state.confirmedToken) {
      // A backward confirmation is a real re-read — release the ratchet so the
      // view may glide back to it.
      if (s.confirmedToken < this.state.confirmedToken) this.ratchetToken = 0;
      this.state.confirmedToken = s.confirmedToken;
      this.state.confirmedAt = s.now;
    }
    if (s.tokensPerSec !== undefined) this.state.tokensPerSec = s.tokensPerSec;
    if (s.speaking !== undefined) this.state.speaking = s.speaking;
    if (s.lost !== undefined) this.state.lost = s.lost;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.tick(performance.now());
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
  }

  /** Immediately center a token (used on manual seek / start). */
  jumpTo(token: number): void {
    this.ratchetToken = token; // a seek re-bases the ratchet, backward included
    const y = this.yAt(token);
    this.el.scrollTop = y - this.el.clientHeight * this.opts.readingLineFrac;
  }

  private yAt(index: number): number {
    if (this.offsets.length === 0) return 0;
    const i = Math.max(0, Math.min(this.offsets.length - 1, Math.floor(index)));
    const f = index - i;
    const a = this.offsets[i];
    const b = this.offsets[Math.min(this.offsets.length - 1, i + 1)];
    return a + (b - a) * Math.max(0, Math.min(1, f));
  }

  private tick(now: number): void {
    // Auto mode: constant-speed upward scroll, no voice needed.
    if (this.mode === "auto") {
      const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.1) : 0;
      this.lastFrame = now;
      if (!this.paused && this.autoPxPerSec > 0) {
        const max = this.el.scrollHeight - this.el.clientHeight;
        this.el.scrollTop = Math.min(max, this.el.scrollTop + this.autoPxPerSec * dt);
      }
      return;
    }
    this.lastFrame = now;
    if (this.offsets.length === 0) return;
    const { creepCapTokens, readingLineFrac, spring, deadbandPx } = this.opts;
    const s = this.state;

    let creep = 0;
    if (s.speaking && !s.lost && s.confirmedAt > 0) {
      creep = Math.min((s.tokensPerSec * (now - s.confirmedAt)) / 1000, creepCapTokens);
    }
    // Forward ratchet: when speech stops, creep collapsing to 0 must not pull
    // the view back — hold the furthest target instead of unwinding it.
    const desired = Math.max(s.confirmedToken + creep, this.ratchetToken);
    this.ratchetToken = desired;
    const targetTop = this.yAt(desired) - this.el.clientHeight * readingLineFrac;
    const diff = targetTop - this.el.scrollTop;
    if (Math.abs(diff) > deadbandPx) {
      this.el.scrollTop += diff * spring;
    }
  }
}
