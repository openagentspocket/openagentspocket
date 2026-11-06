// The Hermes Agent store: `state.db` under `$HERMES_HOME` when that is absolute, else `~/.hermes`,
// and each profile's under `profiles/<name>`. herdr's session names no profile, so the store is the
// open one that holds the session: a running Hermes keeps its store's side files, and a store without
// them is never opened to ask. With no `sqlite3` to ask, only the default store is read.
//
// Hermes opens a store in WAL mode unless its configuration says otherwise, and a database in rollback
// mode has no side files to miss, so only one marked WAL in its header (byte 18) reads as closed
// without them.

import type { ChatStore, StoreQuery, StoreScriptOptions } from '../store/query';
import { storeScript, WAL_SIDE_FILES_MISSING } from '../store/script';
import { hermesStatements } from './store-sql';

const LOCATE = [
  // biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter expansion, not a template
  'o=${HERMES_HOME:-}',
  'case $o in /*) ;; *) o=$HOME/.hermes ;; esac',
  'db=$o/state.db',
];

/** The session id reaches this shell word: `hermesID` lets through nothing a shell or SQL reads specially. */
const pickStore = (session: string) => [
  'if [ -n "$sq" ]; then',
  '  for f in "$db" "$o"/profiles/*/state.db /home/*/.hermes/state.db /home/*/.hermes/profiles/*/state.db; do',
  '    [ -e "$f-wal" ] && [ -e "$f-shm" ] || continue',
  `    q=$("$sq" -init /dev/null -readonly -batch -noheader -list "$f" "SELECT 1 FROM sessions WHERE id = '${session}'" 2>/dev/null) || continue`,
  '    [ -n "$q" ] && { db=$f; break; }',
  '  done',
  'fi',
];

const IS_WAL = `[ "$(od -An -tu1 -j18 -N1 "$db" 2>/dev/null | tr -d ' ')" = 2 ]`;

export function hermesScript(
  query: StoreQuery,
  nonce: string,
  options: StoreScriptOptions = {},
): Uint8Array {
  return storeScript({
    ...options,
    nonce,
    locate: LOCATE,
    pick: pickStore(query.session),
    closedTest: `${IS_WAL} && { ${WAL_SIDE_FILES_MISSING}; }`,
    statements: hermesStatements(query),
  });
}

export const hermesStore: ChatStore = {
  program: 'hermes',
  name: 'Hermes Agent',
  script: hermesScript,
  isStoreName: () => false,
};
