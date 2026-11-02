import type { Ref } from 'react';

/** What a screen drives a terminal with; every renderer keeps the same handle. */
export interface TerminalHandle {
  /** Feeds PTY output given as text. */
  write(data: string): void;
  /** Feeds PTY output as raw bytes (a multi-byte character may be split across calls). */
  writeBytes(data: Uint8Array): void;
  /** Feeds PTY output as base64 text, as it crossed the bridge (skips decoding in JavaScript). */
  writeEncoded(base64: string): void;
  clear(): void;
  focus(): void;
}

export interface TerminalViewProps {
  /** Keystrokes typed into the terminal, as bytes to send to the PTY (Return is "\r", Delete "\x7f"). */
  onInput?: (data: string) => void;
  /** The grid that fits the view, sent to the PTY on layout. */
  onResize?: (cols: number, rows: number) => void;
  fontSize?: number;
  /** Screen-reader label ("Terminal, Agent 3"). */
  accessibilityLabel?: string;
  testID?: string;
  ref?: Ref<TerminalHandle>;
}
