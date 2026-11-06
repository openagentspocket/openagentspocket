// The OpenCode store: the shell lines that find its default database (`$XDG_DATA_HOME/opencode/
// opencode.db` when that is absolute, else under `~/.local/share`), and what a read of it prints
// (Swift OpenCodeProbe). Pure: no I/O. ADR 0025 records why Chat reads the store and how;
// `chat/store/script.ts` is the script, `chat/store/output.ts` the parse.

import { beginMarker, endMarker, makeNonce, OUTPUT_CAP, parseStoreOutput } from '../store/output';
import type { ChatStore, StoreQuery, StoreQueryResponse, StoreScriptOptions } from '../store/query';
import { PYTHON_READER, storeScript, WAL_SIDE_FILES_MISSING } from '../store/script';
import { openCodeStatements } from './probe-sql';
import { readOpenCodeLine } from './record';

export type { StoreScriptOptions as ScriptOptions } from '../store/query';

const LOCATE = [
  // biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter expansion, not a template
  'd=${XDG_DATA_HOME:-}',
  'case $d in /*) ;; *) d=$HOME/.local/share ;; esac',
  'o=$d/opencode',
  'db=$o/opencode.db',
];

/**
 * Stores beside the default one, named for the hint when the session is not in the default store.
 * Names only, never read.
 */
const OTHER_STORES = [
  'n=0; names=',
  'for f in "$o"/opencode-*.db; do',
  '  [ -f "$f" ] || continue',
  // biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter expansion, not a template
  '  b="${f##*/}"',
  '  case "$b" in *[!A-Za-z0-9._-]*) continue ;; esac',
  '  n="$((n + 1))"; [ "$n" -le 8 ] || break',
  '  names="$names $b"',
  'done',
  String.raw`[ -n "$names" ] && printf 'O%s\n' "$names"`,
];

export function openCodeScript(
  query: StoreQuery,
  nonce: string,
  options: StoreScriptOptions = {},
): Uint8Array {
  return storeScript({
    ...options,
    nonce,
    locate: LOCATE,
    closedTest: WAL_SIDE_FILES_MISSING,
    statements: openCodeStatements(query),
    after: query.query.kind === 'tail' ? OTHER_STORES : [],
  });
}

function isStoreName(name: string): boolean {
  if (!name.startsWith('opencode-') || !name.endsWith('.db')) return false;
  const channel = name.slice('opencode-'.length, -'.db'.length);
  return channel.length >= 1 && channel.length <= 64 && /^[A-Za-z0-9._-]+$/.test(channel);
}

export const openCodeStore: ChatStore = {
  program: 'opencode',
  name: 'OpenCode',
  script: openCodeScript,
  isStoreName,
  isSubagentSession: (sessionLine) => {
    const line = readOpenCodeLine(sessionLine);
    return line.kind === 'session' && line.session.parent !== null;
  },
};

export function parseOpenCodeOutput(
  stdout: Uint8Array,
  stderr: Uint8Array,
  exitStatus: number,
  nonce: string,
  query: StoreQuery,
): StoreQueryResponse {
  return parseStoreOutput(openCodeStore, stdout, stderr, exitStatus, nonce, query);
}

export { beginMarker, endMarker, makeNonce, OUTPUT_CAP, PYTHON_READER };
