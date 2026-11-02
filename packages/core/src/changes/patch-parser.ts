import { type ByteString, decodeBytes, displayText } from './bytes';
import type { DiffFile, DiffHunk, DiffLine, DiffNote } from './types';

interface MutableHunk {
  id: number;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  section: string;
  lines: DiffLine[];
}

/** C-quoted names are emitted for control bytes, quotes and backslashes; octal recovers bytes. */
export function patchUnquote(data: ByteString): { bytes: ByteString; consumed: number } {
  if (!data.startsWith('"')) return { bytes: data, consumed: data.length };
  let output = '';
  let index = 1;
  const simple: Record<string, string> = {
    a: '\x07',
    b: '\x08',
    t: '\t',
    n: '\n',
    v: '\x0b',
    f: '\x0c',
    r: '\r',
  };
  while (index < data.length) {
    const char = data.charAt(index);
    index += 1;
    if (char === '"') return { bytes: output, consumed: index };
    if (char !== '\\' || index >= data.length) {
      output += char;
      continue;
    }
    const code = data.charAt(index);
    index += 1;
    if (code >= '0' && code <= '7') {
      let value = Number(code);
      let digits = 1;
      while (digits < 3 && index < data.length && /[0-7]/.test(data.charAt(index))) {
        value = value * 8 + Number(data.charAt(index));
        index += 1;
        digits += 1;
      }
      output += String.fromCharCode(value & 0xff);
    } else {
      output += simple[code] ?? code;
    }
  }
  return { bytes: output, consumed: index };
}

/** `a/` and `b/` prefixes dropped; `/dev/null` is no path. */
export function patchPath(bytes: ByteString): ByteString | null {
  if (bytes === '/dev/null') return null;
  if (bytes.startsWith('a/') || bytes.startsWith('b/')) return bytes.slice(2);
  return bytes;
}

/**
 * Header paths need a small tokenizer because git does not quote spaces. Content headers and
 * rename metadata later provide exact paths.
 */
function patchHeaderPaths(bytes: ByteString): [ByteString | null, ByteString | null] {
  if (bytes.startsWith('"')) {
    const old = patchUnquote(bytes);
    const remainder = bytes.slice(old.consumed).replace(/^ +/, '');
    return [patchPath(old.bytes), patchPath(patchUnquote(remainder).bytes)];
  }
  // With relaxed quoting, equal paths can themselves contain " b/". Prefer the split whose two
  // decoded suffixes agree before taking the first separator.
  const candidates: [ByteString | null, ByteString | null][] = [];
  for (const separator of [' b/', ' "b/']) {
    let start = 0;
    for (;;) {
      const split = bytes.indexOf(separator, start);
      if (split < 0) break;
      const old = patchPath(bytes.slice(0, split));
      const next = patchPath(patchUnquote(bytes.slice(split + 1)).bytes);
      if (old === next) return [old, next];
      candidates.push([old, next]);
      start = split + separator.length;
    }
  }
  return candidates[0] ?? [null, null];
}

function patchRange(bytes: string): [number, number] | null {
  const parts = bytes.split(',');
  if (parts.length > 2 || !/^\d+$/.test(parts[0] ?? '')) return null;
  const start = Number(parts[0]);
  if (parts.length === 1) return [start, 1];
  if (!/^\d+$/.test(parts[1] ?? '')) return null;
  return [start, Number(parts[1])];
}

function patchHunk(line: ByteString, id: number): MutableHunk | null {
  if (!line.startsWith('@@ -')) return null;
  const close = line.indexOf(' @@', 3);
  if (close < 0) return null;
  const ranges = line
    .slice(3, close)
    .split(' ')
    .filter((part) => part !== '');
  const [oldRange, newRange] = ranges;
  if (ranges.length !== 2 || !oldRange?.startsWith('-') || !newRange?.startsWith('+')) return null;
  const old = patchRange(oldRange.slice(1));
  const next = patchRange(newRange.slice(1));
  if (!old || !next) return null;
  let section = line.slice(close + 3);
  if (section.startsWith(' ')) section = section.slice(1);
  return {
    id,
    oldStart: old[0],
    oldCount: old[1],
    newStart: next[0],
    newCount: next[1],
    section: decodeBytes(section),
    lines: [],
  };
}

/** Mutable only while parsing one file. */
class PatchFileBuilder {
  hunks: MutableHunk[] = [];
  isBinary = false;
  isNew = false;
  isDeleted = false;
  isRename = false;
  oldMode: string | null = null;
  newMode: string | null = null;
  private oldLine = 0;
  private newLine = 0;
  private oldRemaining = 0;
  private newRemaining = 0;

  constructor(
    public oldPath: ByteString | null,
    public newPath: ByteString | null,
  ) {}

  begin(hunk: MutableHunk): void {
    this.hunks.push(hunk);
    this.oldLine = hunk.oldStart;
    this.newLine = hunk.newStart;
    this.oldRemaining = hunk.oldCount;
    this.newRemaining = hunk.newCount;
  }

  /** A body line of the current hunk; false when it is not one (so it may be metadata). */
  append(bytes: ByteString, id: number): boolean {
    const hunk = this.hunks.at(-1);
    if (!hunk) return false;
    const first = bytes.charAt(0);
    let kind: DiffLine['kind'];
    let oldNumber: number | null = null;
    let newNumber: number | null = null;
    if (first === '+' && this.newRemaining > 0) {
      kind = 'added';
      newNumber = this.newLine++;
      this.newRemaining -= 1;
    } else if (first === '-' && this.oldRemaining > 0) {
      kind = 'removed';
      oldNumber = this.oldLine++;
      this.oldRemaining -= 1;
    } else if ((first === ' ' || first === '') && this.oldRemaining > 0 && this.newRemaining > 0) {
      // An empty line is a blank context line written without its space (`diff.suppressBlankEmpty`);
      // skipping it would shift every later line's number.
      kind = 'context';
      oldNumber = this.oldLine++;
      newNumber = this.newLine++;
      this.oldRemaining -= 1;
      this.newRemaining -= 1;
    } else {
      return false;
    }
    hunk.lines.push({
      id,
      kind,
      oldNumber,
      newNumber,
      text: decodeBytes(bytes.slice(1)),
      missingNewline: false,
    });
    return true;
  }

  markMissingNewline(): void {
    const hunk = this.hunks.at(-1);
    const last = hunk?.lines.at(-1);
    if (hunk && last) hunk.lines[hunk.lines.length - 1] = { ...last, missingNewline: true };
  }

  readMetadata(line: ByteString): void {
    const after = (prefix: string) => (line.startsWith(prefix) ? line.slice(prefix.length) : null);
    const stripTab = (path: string) => (path.endsWith('\t') ? path.slice(0, -1) : path);
    const oldHeader = after('--- ');
    const newHeader = after('+++ ');
    const renameFrom = after('rename from ');
    const renameTo = after('rename to ');
    const oldMode = after('old mode ');
    const newMode = after('new mode ');
    if (oldHeader !== null) {
      this.oldPath = patchPath(patchUnquote(stripTab(oldHeader)).bytes);
    } else if (newHeader !== null) {
      this.newPath = patchPath(patchUnquote(stripTab(newHeader)).bytes);
    } else if (renameFrom !== null) {
      this.oldPath = patchUnquote(renameFrom).bytes;
      this.isRename = true;
    } else if (renameTo !== null) {
      this.newPath = patchUnquote(renameTo).bytes;
      this.isRename = true;
    } else if (oldMode !== null) {
      this.oldMode = decodeBytes(oldMode);
    } else if (newMode !== null) {
      this.newMode = decodeBytes(newMode);
    } else if (after('new file mode ') !== null) {
      this.oldPath = null;
      this.isNew = true;
    } else if (after('deleted file mode ') !== null) {
      this.newPath = null;
      this.isDeleted = true;
    } else if (after('Binary files ') !== null || line === 'GIT binary patch') {
      this.isBinary = true;
    }
  }

  document(id: number, isComplete = true): DiffFile {
    const notes: DiffNote[] = [];
    if (this.isBinary) notes.push({ kind: 'binary' });
    if (this.isRename && this.oldPath !== null && this.newPath !== null) {
      notes.push({
        kind: 'renamed',
        from: displayText(this.oldPath),
        to: displayText(this.newPath),
      });
    }
    if (this.oldMode !== null && this.newMode !== null) {
      notes.push({ kind: 'mode', from: this.oldMode, to: this.newMode });
    }
    if (isComplete && this.hunks.length === 0 && !this.isBinary) {
      if (this.isNew) notes.push({ kind: 'newEmpty' });
      if (this.isDeleted) notes.push({ kind: 'deletedEmpty' });
    }
    const hunks: DiffHunk[] = this.hunks.map((hunk) => ({ ...hunk, lines: [...hunk.lines] }));
    return {
      id,
      oldPath: this.oldPath === null ? null : decodeBytes(this.oldPath),
      newPath: this.newPath === null ? null : decodeBytes(this.newPath),
      notes,
      isBinary: this.isBinary,
      hunks,
    };
  }
}

/**
 * Git's patch protocol is line-oriented in bytes. IDs are stable prefix ordinals at each level,
 * so extending the read preserves existing row identities.
 */
export function parsePatchFiles(body: ByteString, isTruncated: boolean): DiffFile[] {
  const files: DiffFile[] = [];
  let current: PatchFileBuilder | null = null;
  let nextHunkId = 0;
  let nextLineId = 0;
  const rawLines = body.split('\n');
  // The text after the final newline is not a line (it would read as a blank context line).
  if (rawLines.at(-1) === '') rawLines.pop();
  for (const raw of rawLines) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.startsWith('diff --git ')) {
      if (current) files.push(current.document(files.length));
      const [oldPath, newPath] = patchHeaderPaths(line.slice(11));
      current = new PatchFileBuilder(oldPath, newPath);
      continue;
    }
    if (!current) continue;
    const hunk = patchHunk(line, nextHunkId);
    if (hunk) {
      current.begin(hunk);
      nextHunkId += 1;
    } else if (line === '\\ No newline at end of file') {
      current.markMissingNewline();
    } else if (current.append(line, nextLineId)) {
      nextLineId += 1;
    } else {
      current.readMetadata(line);
    }
  }
  if (current) files.push(current.document(files.length, !isTruncated));
  return files;
}
