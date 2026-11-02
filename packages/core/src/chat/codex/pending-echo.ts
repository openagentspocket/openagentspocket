// Matches prompts Agentico sent to the prompts Codex recorded (Swift CodexPendingEcho). The rules
// are conservative because a wrong match hides a prompt that was never delivered: keys must be
// equal, only entries recorded after the send count, and matching is first in, first out and one
// to one.

/** Characters Agentico strips before sending: zero-width and bidi controls, joiners, BOM, tags. */
export function isInvisible(code: number): boolean {
  return (
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2060 && code <= 0x2064) ||
    (code >= 0x2066 && code <= 0x2069) ||
    code === 0xfeff ||
    (code >= 0xfe00 && code <= 0xfe0f) ||
    (code >= 0xe0000 && code <= 0xe007f) ||
    (code >= 0xe0100 && code <= 0xe01ef)
  );
}

/**
 * The key a sent prompt and a recorded prompt are compared on. The Codex TUI changes a paste
 * before recording it (CRLF and CR become LF, control characters and CSI sequences are dropped,
 * submission trims); Agentico strips invisible characters. Applying all of it to both sides lets
 * an echo compare equal exactly.
 */
export function codexEchoKey(text: string): string {
  const input = Array.from(text, (char) => char.codePointAt(0) as number);
  let output = '';
  let index = 0;
  while (index < input.length) {
    const code = input[index] as number;
    index += 1;
    if (code === 0x1b) {
      // `ESC [` starts a CSI sequence that runs through its final byte.
      if (input[index] === 0x5b) {
        index += 1;
        while (
          index < input.length &&
          !((input[index] as number) >= 0x40 && (input[index] as number) <= 0x7e)
        ) {
          index += 1;
        }
        index += 1;
      }
    } else if (code === 0x0d) {
      output += '\n';
      if (input[index] === 0x0a) index += 1;
    } else if (code === 0x0a || code === 0x09) {
      output += String.fromCodePoint(code);
    } else if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
      // Dropped.
    } else if (!isInvisible(code)) {
      output += String.fromCodePoint(code);
    }
  }
  return output.trim();
}

/** Where the transcript stood when a prompt was sent. */
export interface CodexEchoCursor {
  rolloutID: string;
  offset: number;
}

export interface CodexPendingSend {
  /** The text as sent to herdr. */
  text: string;
  cursor: CodexEchoCursor;
}

export type CodexEchoKind =
  | { type: 'prompt'; text: string; localImagePaths: string[] }
  /** What a sent `/compact` leaves: the TUI records no prompt for it. */
  | { type: 'compaction' };

export interface CodexEchoCandidate {
  rolloutID: string;
  offset: number;
  entryID: string;
  kind: CodexEchoKind;
}

export const COMPACT_COMMAND = '/compact';

function isAfter(candidate: CodexEchoCandidate, cursor: CodexEchoCursor): boolean {
  return candidate.rolloutID !== cursor.rolloutID || candidate.offset >= cursor.offset;
}

/** For each pending send, in order, the entry it matched, or null. `candidates` in transcript order. */
export function matchPendingSends(
  pending: readonly CodexPendingSend[],
  candidates: readonly CodexEchoCandidate[],
): (string | null)[] {
  const claimed = new Set<number>();
  return pending.map((send) => {
    const key = codexEchoKey(send.text);
    const index = candidates.findIndex((candidate, at) => {
      if (claimed.has(at) || !isAfter(candidate, send.cursor)) return false;
      if (candidate.kind.type === 'compaction') return key === COMPACT_COMMAND;
      return key !== COMPACT_COMMAND && codexEchoKey(candidate.kind.text) === key;
    });
    if (index < 0) return null;
    claimed.add(index);
    return (candidates[index] as CodexEchoCandidate).entryID;
  });
}
