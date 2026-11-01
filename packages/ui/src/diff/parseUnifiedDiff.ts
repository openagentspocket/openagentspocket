export type DiffLineKind = 'meta' | 'hunk' | 'context' | 'add' | 'del';

export interface DiffLine {
  kind: DiffLineKind;
  /** The line without its +/-/space prefix. */
  text: string;
  oldNumber?: number;
  newNumber?: number;
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Parses `git diff` unified output into numbered lines. Pure; file headers come back as meta lines. */
export function parseUnifiedDiff(diff: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  const raw = diff.split('\n');
  if (raw.at(-1) === '') raw.pop();
  for (const line of raw) {
    const hunk = HUNK.exec(line);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      inHunk = true;
      lines.push({ kind: 'hunk', text: line });
    } else if (!inHunk || line.startsWith('diff ') || line.startsWith('\\')) {
      if (line.startsWith('diff ')) inHunk = false;
      lines.push({ kind: 'meta', text: line });
    } else if (line.startsWith('+')) {
      lines.push({ kind: 'add', text: line.slice(1), newNumber: newLine++ });
    } else if (line.startsWith('-')) {
      lines.push({ kind: 'del', text: line.slice(1), oldNumber: oldLine++ });
    } else {
      lines.push({
        kind: 'context',
        text: line.slice(1),
        oldNumber: oldLine++,
        newNumber: newLine++,
      });
    }
  }
  return lines;
}

export interface SideBySideRow {
  left?: DiffLine;
  right?: DiffLine;
}

/** Pairs each run of deletions with the additions that follow it, row by row; context sits on both sides. */
export function toSideBySide(lines: readonly DiffLine[]): SideBySideRow[] {
  const rows: SideBySideRow[] = [];
  let dels: DiffLine[] = [];
  let adds: DiffLine[] = [];
  const flush = () => {
    for (let index = 0; index < Math.max(dels.length, adds.length); index++) {
      rows.push({ left: dels[index], right: adds[index] });
    }
    dels = [];
    adds = [];
  };
  for (const line of lines) {
    if (line.kind === 'del') {
      if (adds.length) flush();
      dels.push(line);
    } else if (line.kind === 'add') {
      adds.push(line);
    } else {
      flush();
      rows.push(line.kind === 'context' ? { left: line, right: line } : { left: line });
    }
  }
  flush();
  return rows;
}
