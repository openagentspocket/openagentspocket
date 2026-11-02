// Shell command titles as the Codex TUI renders them (Swift CodexToolSummary, "Commands").

import { decodeUtf8, encodeUtf8 } from '../../events/utf8';

const SHELLS: ReadonlySet<string> = new Set(['zsh', 'sh', 'bash', 'pwsh', 'powershell']);

/** A command row's title: the script of a `bash -lc` style wrapper, else the argv shell-joined. */
export function commandTitle(argv: string[]): string {
  return shellScript(argv) ?? shellJoin(argv);
}

function shellType(path: string): string | null {
  if (SHELLS.has(path)) return path;
  const parts = path.split(/[/\\]/).filter((p) => p !== '');
  const base = parts[parts.length - 1] ?? path;
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return SHELLS.has(stem) ? stem : null;
}

/** The script of `[sh|bash|zsh, -lc|-c, script]`, or of a PowerShell `-Command` invocation. */
export function shellScript(argv: string[]): string | null {
  const first = argv[0];
  if (argv.length < 3 || first === undefined) return null;
  const shell = shellType(first);
  if (shell === null) return null;
  if (shell === 'bash' || shell === 'zsh' || shell === 'sh') {
    return argv.length === 3 && (argv[1] === '-lc' || argv[1] === '-c')
      ? (argv[2] as string)
      : null;
  }
  let index = 1;
  while (index + 1 < argv.length) {
    const flag = (argv[index] as string).toLowerCase();
    if (!['-nologo', '-noprofile', '-command', '-c'].includes(flag)) return null;
    if (flag === '-command' || flag === '-c') return argv[index + 1] as string;
    index += 1;
  }
  return null;
}

/** Joins words the way the Rust `shlex` crate's `try_join` does (plain spaces if a word holds NUL). */
export function shellJoin(words: string[]): string {
  if (words.some((word) => word.includes('\0'))) return words.join(' ');
  return words.map(shellQuote).join(' ');
}

const UNQUOTED_OK = 1;
const SINGLE_OK = 2;
const DOUBLE_OK = 4;

function isUnquotedSafe(byte: number): boolean {
  return (
    (byte >= 0x30 && byte <= 0x39) ||
    (byte >= 0x41 && byte <= 0x5a) ||
    (byte >= 0x61 && byte <= 0x7a) ||
    '+-./:@]_'.includes(String.fromCharCode(byte))
  );
}

/** The longest run of `bytes` from `start` that one quoting strategy handles. */
function quotingStrategy(
  bytes: Uint8Array,
  start: number,
): { length: number; strategy: 'unquoted' | 'single' | 'double' } {
  let previous = UNQUOTED_OK | SINGLE_OK | DOUBLE_OK;
  let count = 0;
  let index = start;
  if (bytes[index] === 0x5e) {
    previous = SINGLE_OK;
    count = 1;
    index += 1;
  }
  while (index < bytes.length) {
    const byte = bytes[index] as number;
    let current = previous;
    if (byte >= 0x80) {
      current &= ~UNQUOTED_OK;
    } else {
      if (!isUnquotedSafe(byte)) current &= ~UNQUOTED_OK;
      if (byte === 0x27 || byte === 0x5e || byte === 0x5c) current &= ~SINGLE_OK;
      if (byte === 0x60 || byte === 0x24 || byte === 0x21 || byte === 0x5e) current &= ~DOUBLE_OK;
    }
    if (current === 0) break;
    previous = current;
    count += 1;
    index += 1;
  }
  if (previous & UNQUOTED_OK) return { length: count, strategy: 'unquoted' };
  if (previous & SINGLE_OK) return { length: count, strategy: 'single' };
  return { length: count, strategy: 'double' };
}

/** One word quoted by `shlex::Quoter::quote`: unquoted when safe, else in quotes chunk by chunk. */
export function shellQuote(word: string): string {
  const bytes = encodeUtf8(word);
  if (bytes.length === 0) return "''";
  const output: number[] = [];
  let at = 0;
  while (at < bytes.length) {
    const { length, strategy } = quotingStrategy(bytes, at);
    if (length === bytes.length - at && strategy === 'unquoted' && output.length === 0) return word;
    const chunk = bytes.subarray(at, at + length);
    at += length;
    if (strategy === 'unquoted') {
      output.push(...chunk);
    } else if (strategy === 'single') {
      output.push(0x27, ...chunk, 0x27);
    } else {
      output.push(0x22);
      for (const byte of chunk) {
        if (byte === 0x24 || byte === 0x60 || byte === 0x22 || byte === 0x5c) output.push(0x5c);
        output.push(byte);
      }
      output.push(0x22);
    }
  }
  return decodeUtf8(Uint8Array.from(output));
}
