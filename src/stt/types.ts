/**
 * The swap seam. The alignment engine never knows which recognizer produced the
 * words — Web Speech (cloud, zero-setup) or Vosk (offline, on-device) both just
 * emit SttResult. Add a new engine by implementing SttEngine; nothing above this
 * line changes.
 */
export type SttStatus = "idle" | "loading" | "listening" | "stopped" | "error";

export interface SttResult {
  /** words of the current utterance (interim or final), in order */
  words: string[];
  isFinal: boolean;
}

export interface SttHooks {
  onResult(result: SttResult): void;
  onStatus(status: SttStatus): void;
  onError(message: string): void;
}

export interface SttEngine {
  readonly label: string;
  /** true when the engine can run without a network connection */
  readonly offline: boolean;
  start(): Promise<void>;
  stop(): void;
}

export function splitWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}
