// Parses what an OpenCode store query script prints (Swift OpenCodeProbe.parse): the tagged lines
// between the request's nonce markers, a store problem when the script says so, or the reader's
// failure. Throws a `TransportFailure` for a script that went wrong.

import { randomBytes } from '@noble/hashes/utils';
import { TransportFailure } from '../../errors';
import { decodeUtf8, encodeUtf8 } from '../../events/utf8';
import type {
  OpenCodeQuery,
  OpenCodeQueryResponse,
  OpenCodeRecords,
  OpenCodeRowLine,
  OpenCodeStoreProblem,
} from './query';

/** The reader's output past this many bytes is cut, and its exit line with it. */
export const OUTPUT_CAP = 2_097_152;

/** 24 lowercase hexadecimal digits from a random source. Hex only, so it needs no quoting. */
export function makeNonce(random: (length: number) => Uint8Array = randomBytes): string {
  return [...random(12)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export const beginMarker = (nonce: string) => `__AGENTICO_OC_BEGIN_${nonce}`;
export const endMarker = (nonce: string) => `__AGENTICO_OC_END_${nonce}`;

const malformed = (detail: string): never => {
  throw new TransportFailure({ kind: 'malformedResponse', detail });
};

const unreadable = (detail: string): never => {
  throw new TransportFailure({ kind: 'hostStoreUnreadable', detail });
};

/** Printable ASCII only, cut to `limit` characters with an ellipsis. */
function printable(text: string, limit: number): string {
  const shown = [...text].map((character) => {
    const value = character.codePointAt(0) ?? 0;
    return value >= 0x20 && value <= 0x7e ? character : '?';
  });
  return shown.length > limit ? `${shown.slice(0, limit - 1).join('')}…` : shown.join('');
}

/** Below 3.25 the statements' window functions do not parse. */
function isBelowFloor(version: string): boolean {
  const parts = version
    .split('.')
    .slice(0, 2)
    .map((part) => (/^[0-9]+$/.test(part) ? Number.parseInt(part, 10) : null))
    .filter((part): part is number => part !== null);
  if (parts.length !== 2) return false;
  const [major = 0, minor = 0] = parts;
  return major < 3 || (major === 3 && minor < 25);
}

function isStoreName(name: string): boolean {
  if (!name.startsWith('opencode-') || !name.endsWith('.db')) return false;
  const channel = name.slice('opencode-'.length, -'.db'.length);
  return channel.length >= 1 && channel.length <= 64 && /^[A-Za-z0-9._-]+$/.test(channel);
}

/** `/Users/<name>` and `/home/<name>` read as `~`, so a reader's message never shows the account name. */
function homeShownAsTilde(text: string): string {
  return text.replace(/\/(?:Users|home)\/[^/\s]*/g, '~');
}

const unavailable = (problem: OpenCodeStoreProblem): OpenCodeQueryResponse => ({
  type: 'unavailable',
  problem,
});

/**
 * The reader's last error, as a store problem when it names one. The CLI prefixes errors with
 * `Error`, `Parse error` or `Runtime error`, and Python's reader copies the first; the prefix alone
 * says nothing, because preparing a statement that names a missing table is a parse error too.
 */
function readerFailure(
  stderr: Uint8Array,
  status: number,
  version: string | null,
  walPresent: boolean | null,
): OpenCodeQueryResponse {
  const lines = decodeUtf8(stderr)
    .split(/\r\n|[\n\r]/)
    .map((line) => line.trim());
  const reversed = [...lines].reverse();
  const line =
    reversed.find(
      (candidate) =>
        candidate.startsWith('Error') ||
        candidate.startsWith('Parse error') ||
        candidate.startsWith('Runtime error'),
    ) ??
    reversed.find((candidate) => candidate !== '') ??
    '';
  // A Python built without SQLite cannot read the store at all.
  if (line.startsWith('Error: ModuleNotFoundError') || line.startsWith('Error: ImportError')) {
    return unavailable({ kind: 'noReader' });
  }
  if (line.includes('database is locked') || line.includes('database is busy')) {
    return unreadable("OpenCode's database is busy.");
  }
  if (line.includes('unable to open')) {
    if (walPresent === false) return unavailable({ kind: 'storeClosed' });
    return unreadable("OpenCode's database couldn't be opened.");
  }
  if (line.includes('not a database')) {
    return unreadable("OpenCode's database file isn't one Chat can read.");
  }
  for (const prefix of ['no such table: ', 'no such column: ']) {
    const at = line.indexOf(prefix);
    if (at < 0) continue;
    const name = /^\S*/.exec(line.slice(at + prefix.length))?.[0] ?? '';
    // SQLite without JSON1, or older than 3.16, reports its missing table-valued functions as tables.
    if (name.startsWith('json_') || name.startsWith('pragma_')) {
      return unavailable({ kind: 'readerTooOld', version: version ?? 'unknown' });
    }
    return unavailable({ kind: 'layout', missing: [printable(name, 64)] });
  }
  // A SQLite whose fixed parser stack is smaller than the one releases before 3.46 have cannot
  // parse the statements at all.
  if (
    line.includes('no such function: json') ||
    line.includes('syntax error') ||
    line.includes('GROUP BY clause is required') ||
    line.includes('parser stack overflow')
  ) {
    return unavailable({ kind: 'readerTooOld', version: version ?? 'unknown' });
  }
  const detail = printable(homeShownAsTilde(line), 200);
  return unreadable(
    detail === '' ? `OpenCode's database reader exited with status ${status}.` : detail,
  );
}

/** An empty text reads as null; undefined when it is neither empty nor an integer. */
function optionalInt(text: string): number | null | undefined {
  if (text === '') return null;
  return /^-?[0-9]+$/.test(text) ? Number.parseInt(text, 10) : undefined;
}

function rowHead(text: string): Omit<OpenCodeRowLine, 'line'> | null {
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    if (
      typeof value.id !== 'string' ||
      typeof value.seq !== 'number' ||
      !Number.isInteger(value.seq)
    ) {
      return null;
    }
    const updated = typeof value.tu === 'number' && Number.isInteger(value.tu) ? value.tu : 0;
    return {
      id: value.id,
      seq: value.seq,
      timeUpdated: updated,
      isFinal: typeof value.f === 'boolean' ? value.f : false,
    };
  } catch {
    return null;
  }
}

/** The tagged lines of one output, read in one pass. */
class Output {
  version: string | null = null;
  problem: string | null = null;
  olderTables: string | null = null;
  missingColumns: string[] | null = null;
  eventSeq: number | null = null;
  sessionMissing = false;
  sessionLine: Uint8Array | null = null;
  rows: OpenCodeRowLine[] = [];
  overBudget = false;
  firstSeq: number | null = null;
  windowCount: number | null = null;
  inboxLine: Uint8Array | null = null;
  exitLine: number | null = null;
  walPresent: boolean | null = null;
  otherStores: string[] = [];
  ignoredLines = 0;
  /**
   * The body less the script's own `W` and `O` lines: what the reader printed through `head -c`,
   * with its exit line. A `W` line joined to a row cut mid-line counts too, past the cap.
   */
  readerBytes = 0;

  constructor(body: Uint8Array) {
    const lines = decodeUtf8(body).split('\n');
    if (lines.at(-1) === '') lines.pop();
    let scriptBytes = 0;
    for (const line of lines) {
      const tag = line[0];
      const known =
        tag !== undefined &&
        (line.length === 1 || line[1] === ' ') &&
        this.read(tag, line.length > 2 ? line.slice(2) : '');
      if (!known) {
        this.ignoredLines += 1;
        continue;
      }
      if (tag === 'W' || tag === 'O') scriptBytes += encodeUtf8(line).length + 1;
    }
    this.readerBytes = body.length - scriptBytes;
  }

  /**
   * False for a line this parse does not know. SQLite turns a lone surrogate escape in OpenCode's
   * JSON into bytes that are not UTF-8; JSON lines keep them as U+FFFD, so the rest of the line
   * still decodes.
   */
  private read(tag: string, text: string): boolean {
    switch (tag) {
      case 'V':
        this.version = text;
        return true;
      case 'P':
        this.problem = text;
        return true;
      case 'T':
        this.olderTables = text;
        return true;
      case 'L':
        this.missingColumns = text.split(',').filter((part) => part !== '');
        return true;
      case 'E': {
        const value = optionalInt(text);
        if (value === undefined) return false;
        this.eventSeq = value;
        return true;
      }
      case 'M':
        if (text !== '') return false;
        this.sessionMissing = true;
        return true;
      case 'S':
        this.sessionLine = encodeUtf8(text);
        return true;
      case 'R': {
        const head = rowHead(text);
        if (!head) return false;
        this.rows.push({ ...head, line: encodeUtf8(text) });
        return true;
      }
      case 'X':
        if (text !== '') return false;
        this.overBudget = true;
        return true;
      case 'F': {
        const value = optionalInt(text);
        if (value === undefined) return false;
        this.firstSeq = value;
        return true;
      }
      case 'C':
        if (!/^-?[0-9]+$/.test(text)) return false;
        this.windowCount = Number.parseInt(text, 10);
        return true;
      case 'I':
        this.inboxLine = encodeUtf8(text);
        return true;
      case 'Z':
        if (!/^-?[0-9]+$/.test(text)) return false;
        this.exitLine = Number.parseInt(text, 10);
        return true;
      case 'W': {
        const flags = text.split(' ').filter((part) => part !== '');
        if (flags.length !== 2) return false;
        this.walPresent = flags[0] === '1';
        return true;
      }
      case 'O':
        this.otherStores = text.split(' ').filter((part) => part !== '');
        return true;
      default:
        return false;
    }
  }

  records(overflow: boolean): OpenCodeRecords {
    return {
      sqliteVersion: this.version,
      eventSeq: this.eventSeq,
      sessionLine: this.sessionLine,
      inboxLine: this.inboxLine,
      rows: [...this.rows].sort((a, b) => a.seq - b.seq),
      firstSeq: this.firstSeq,
      windowCount: this.windowCount,
      overflow,
      ignoredLines: this.ignoredLines,
    };
  }
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

/**
 * Reads the tagged lines between this request's markers. Anything outside them, such as login-shell
 * noise, is ignored. Throws a `malformedResponse` failure when either marker is missing and
 * `hostStoreUnreadable` for a reader failure Chat cannot explain as a store problem.
 */
export function parseOpenCodeOutput(
  stdout: Uint8Array,
  stderr: Uint8Array,
  exitStatus: number,
  nonce: string,
  query: OpenCodeQuery,
): OpenCodeQueryResponse {
  const beginBytes = encodeUtf8(`${beginMarker(nonce)}\n`);
  const begin = indexOfBytes(stdout, beginBytes);
  const end =
    begin < 0
      ? -1
      : indexOfBytes(stdout, encodeUtf8(`\n${endMarker(nonce)}\n`), begin + beginBytes.length);
  if (begin < 0 || end < 0) {
    return malformed(`OpenCode's store query stopped before its end (exit status ${exitStatus})`);
  }
  const output = new Output(stdout.subarray(begin + beginBytes.length, end));

  if (output.problem === 'noreader') return unavailable({ kind: 'noReader' });
  if (output.problem === 'closed') return unavailable({ kind: 'storeClosed' });
  if (output.problem?.startsWith('nodb ')) {
    return unavailable({ kind: 'noStore', path: printable(output.problem.slice(5), 512) });
  }
  if (output.version !== null && isBelowFloor(output.version)) {
    return unavailable({ kind: 'readerTooOld', version: output.version });
  }
  if (output.olderTables !== null) return unavailable({ kind: 'olderOpenCode' });
  if (output.missingColumns !== null) {
    return unavailable({ kind: 'layout', missing: output.missingColumns });
  }
  if (output.sessionMissing) {
    return { type: 'sessionMissing', otherStores: output.otherStores.filter(isStoreName) };
  }
  if (output.exitLine === null) {
    // `head -c` cut the reader's output, its exit line with it. Short of the cap, a missing exit
    // line is a script that went wrong, not a conversation too large to read.
    if (output.readerBytes < OUTPUT_CAP) {
      return malformed(`OpenCode's store query printed no exit status (exit status ${exitStatus})`);
    }
    return { type: 'records', records: output.records(true) };
  }
  if (output.exitLine !== 0) {
    return readerFailure(stderr, output.exitLine, output.version, output.walPresent);
  }
  const kind = query.query;
  if (
    kind.kind === 'poll' &&
    kind.cursor.eventSeq !== null &&
    output.eventSeq === kind.cursor.eventSeq
  ) {
    return { type: 'unchanged', eventSeq: kind.cursor.eventSeq };
  }
  return { type: 'records', records: output.records(output.overBudget) };
}
