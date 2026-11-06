// The POSIX shell script that reads one store on the Host, whichever program's it is (Swift
// OpenCodeProbe, ADR 0025). Pure: no I/O.
//
// It reads the store with the `sqlite3` CLI, or with `python3` when the Host has no CLI. Both open the
// database read-only, ignore the user's settings, set `query_only`, and run every statement after the
// version inside one transaction, so the lines come from one snapshot. A store the program's
// `closedTest` calls closed is never opened, because stock SQLite would create a WAL database's
// missing side files. Output is cut at `OUTPUT_CAP` bytes. Each line carries a one-letter tag between
// markers holding a per-request nonce.
//
// The only values that reach the script are the nonce, the validated session id inside SQL string
// literals, and integers. Nothing is interpolated into a shell word. The statements travel once, in
// one here-document that whichever reader runs reads, because every poll uploads the whole script.

import { encodeUtf8 } from '../../events/utf8';
import { HERDR_PATH_EXPORT } from '../../hosts/host-path';
import { OUTPUT_CAP } from './output';
import type { StoreScriptOptions } from './query';

export const VERSION_STATEMENT = "SELECT 'V ' || sqlite_version()";

/**
 * Python reads the statements the CLI reads, from the same here-document: it runs each text that
 * ends in `;` at a line end and skips the CLI's dot-command lines, so no statement holds a `;` or
 * starts a line with `.`. The program goes in single quotes on the command line, so it holds no `'`
 * itself.
 *
 * It writes the bytes SQLite returns, as the CLI does: text that is not UTF-8 reaches the parse
 * instead of failing the read, and an ASCII stdout under `LC_ALL=C` (Python 3.6) never fails on
 * text. It skips NULL rows, as the CLI's empty lines are skipped, and reports any failure in the
 * CLI's form, a Python built without its `sqlite3` module included.
 */
export const PYTHON_READER = String.raw`import sys
from urllib.parse import quote
out = sys.stdout.buffer
try:
    import sqlite3
    c = sqlite3.connect("file:" + quote(sys.argv[1]) + "?mode=ro", uri=True,
                        timeout=1.0, isolation_level=None)
    c.text_factory = bytes
    c.execute("PRAGMA query_only = 1")
    for s in sys.stdin.buffer.read().decode("utf-8").split(";\n"):
        s = "\n".join(l for l in s.split("\n") if not l.startswith("."))
        if not s.strip():
            continue
        for row in c.execute(s):
            v = row[0]
            if v is not None:
                out.write((v if isinstance(v, bytes) else str(v).encode("utf-8")) + b"\n")
    out.flush()
except Exception as e:
    out.flush()
    sys.stderr.write("Error: " + type(e).__name__ + ": " + str(e) + "\n")
    sys.exit(1)`;

export interface StoreScriptSpec extends StoreScriptOptions {
  nonce: string;
  /** Shell lines that set `db`, the store's path, and `o`, its folder. */
  locate: readonly string[];
  /** Shell lines run once `sq` and `py` name the readers, which may point `db` at another store. */
  pick?: readonly string[];
  /** A shell condition, true for a store Chat must not open. */
  closedTest: string;
  /** The statements, the version first. */
  statements: readonly string[];
  /** Shell lines run after the read, before the end marker. */
  after?: readonly string[];
}

/** The test for a database that is always in WAL mode, as a store open only while its program runs. */
export const WAL_SIDE_FILES_MISSING = '[ ! -e "$db-wal" ] || [ ! -e "$db-shm" ]';

export function storeScript({
  nonce,
  locate,
  pick = [],
  closedTest,
  statements,
  after = [],
  reader = 'automatic',
  pathExport = HERDR_PATH_EXPORT,
}: StoreScriptSpec): Uint8Array {
  const sqlDelimiter = `__AGENTICO_SQL_${nonce}__`;
  const lines = [
    `N=${nonce}`,
    'LC_ALL=C',
    'export LC_ALL',
    pathExport,
    ...locate,
    'sq=',
    'py=',
    'if [ "$(uname -s)" = Darwin ]; then',
    '  if [ -x /usr/bin/sqlite3 ]; then sq=/usr/bin/sqlite3; else sq=$(command -v sqlite3 2>/dev/null) || sq=; fi',
    '  py=$(command -v python3 2>/dev/null) || py=',
    '  [ "$py" = /usr/bin/python3 ] && py=',
    'else',
    '  sq=$(command -v sqlite3 2>/dev/null) || sq=',
    '  py=$(command -v python3 2>/dev/null) || py=',
    'fi',
  ];
  if (reader === 'pythonOnly') lines.push('sq=');
  lines.push(
    ...pick,
    String.raw`printf '%s\n' "__AGENTICO_OC_BEGIN_$N"`,
    'if [ ! -f "$db" ]; then',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: shell parameter expansion, not a template
    '  case $db in "$HOME"/*) p="~${db#"$HOME"}" ;; *) p=$db ;; esac',
    // A range rather than `[:print:]`, which BusyBox's `tr -c` reads as its letters, so it mangled
    // the whole line.
    String.raw`  printf 'P nodb %s\n' "$p" | tr -c ' -~\n' '?'`,
    // Stock SQLite opens a WAL database read-only by creating its missing side files; Apple's
    // refuses. Neither reader starts.
    `elif ${closedTest}; then`,
    String.raw`  printf 'P closed\n'`,
    'elif [ -n "$sq$py" ]; then',
    // The CLI whenever there is one, Python only without it. Both read the statements from the
    // here-document below.
    '  { if [ -n "$sq" ]; then',
    '    "$sq" -init /dev/null -readonly -batch -bail -noheader -list "$db"',
    '  else',
    '    "$py" -I -c \'',
    PYTHON_READER,
    '\' "$db"',
    `  fi <<'${sqlDelimiter}'`,
    '.timeout 1000',
    'PRAGMA query_only = 1;',
    `${statements[0] ?? VERSION_STATEMENT};`,
    'BEGIN;',
    `${statements.slice(1).join(';\n')};`,
    'COMMIT;',
    sqlDelimiter,
    String.raw`    printf 'Z %s\n' "$?"; } | head -c ${OUTPUT_CAP}`,
    'else',
    String.raw`  printf 'P noreader\n'`,
    'fi',
    'w=0; [ -e "$db-wal" ] && w=1',
    's=0; [ -e "$db-shm" ] && s=1',
    String.raw`printf 'W %s %s\n' "$w" "$s"`,
    ...after,
    String.raw`printf '\n%s\n' "__AGENTICO_OC_END_$N"`,
  );
  return encodeUtf8(`${lines.join('\n')}\n`);
}
