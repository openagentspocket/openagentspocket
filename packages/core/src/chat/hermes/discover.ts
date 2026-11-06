// Finds the Agent's conversation when herdr reports none. A Hermes running as another user cannot
// reach herdr's socket, and sharing that socket would hand that user the panes of herdr's owner, so
// the store is asked instead: read-only, and only a single match counts. Two open conversations in
// one directory name no conversation, and a store Hermes has closed is never opened.

import { decodeUtf8, encodeUtf8 } from '../../events/utf8';
import { HERDR_PATH_EXPORT } from '../../hosts/host-path';
import type { ChatHostFiles } from '../model/host-files';
import { hermesID } from '../model/session-ids';

/** What may reach a SQL literal in a shell word: anything else names no conversation here. */
const PLAIN_PATH = /^\/[A-Za-z0-9._/ -]*$/u;

export function hermesDiscoverScript(directories: readonly string[]): string | null {
  const plain = directories.filter((directory) => PLAIN_PATH.test(directory));
  if (plain.length === 0) return null;
  const list = plain.map((directory) => `'${directory}'`).join(',');
  const sql = `SELECT id FROM sessions WHERE source='local' AND ended_at IS NULL AND cwd IN (${list})`;
  return `export LC_ALL=C
${HERDR_PATH_EXPORT}
sq=$(command -v sqlite3) || exit 0
o=\${HERMES_HOME:-}
case $o in /*) ;; *) o=$HOME/.hermes ;; esac
for f in "$o"/state.db "$o"/profiles/*/state.db /home/*/.hermes/state.db /home/*/.hermes/profiles/*/state.db; do
  [ -e "$f-wal" ] && [ -e "$f-shm" ] || continue
  "$sq" -init /dev/null -readonly -batch -noheader -list "$f" "${sql.replaceAll('"', '')}" 2>/dev/null
done | sort -u
`;
}

/** The one id the output names; null for none, several, or anything that is not an id. */
export function parseDiscoveredSession(stdout: string): string | null {
  const ids = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const [only] = ids;
  return ids.length === 1 && only !== undefined ? hermesID(only) : null;
}

export async function discoverHermesSession(
  files: ChatHostFiles,
  directories: readonly string[],
): Promise<string | null> {
  const script = hermesDiscoverScript(directories);
  if (!script || !files.runScript) return null;
  const result = await files.runScript(encodeUtf8(script));
  return parseDiscoveredSession(decodeUtf8(result.stdout));
}
