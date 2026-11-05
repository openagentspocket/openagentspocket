// What the OpenCode store query script may carry and run (Swift OpenCodeProbeTests, script half).

import { describe, expect, it } from 'vitest';
import { decodeUtf8 } from '../../events/utf8';
import { makeNonce, openCodeScript, PYTHON_READER } from './probe';
import { parse, partsOf, QUERIES, SESSION, split, TAIL, text, tokens } from './probe.testkit';
import {
  LAYOUT_STATEMENT,
  openCodeStatements,
  TABLES_STATEMENT,
  VERSION_STATEMENT,
} from './probe-sql';

describe('OpenCode probe script', () => {
  it('carries only validated values', () => {
    for (const query of QUERIES) {
      const { nonce, shell, sql, python } = partsOf(query);
      const shellText = shell.join('\n');
      // The session id reaches the Host only inside SQL string literals.
      expect(shellText).not.toContain(SESSION);
      expect(python.join('\n')).not.toContain(SESSION);
      const sqlText = sql.join('\n');
      const occurrences = [...sqlText.matchAll(new RegExp(SESSION, 'g'))];
      expect(occurrences.length).toBeGreaterThan(0);
      for (const at of occurrences) {
        const index = at.index ?? 0;
        expect(sqlText[index - 1]).toBe("'");
        expect(sqlText[index + SESSION.length]).toBe("'");
      }
      // Command substitution only for the fixed lookups; `$((` is arithmetic on the script's counter.
      for (const at of shellText.matchAll(/\$\(/g)) {
        const rest = shellText.slice((at.index ?? 0) + 2);
        if (rest.startsWith('(')) continue;
        expect(
          ['uname -s)', 'command -v sqlite3 2>/dev/null)', 'command -v python3 2>/dev/null)'].some(
            (allowed) => rest.startsWith(allowed),
          ),
        ).toBe(true);
      }
      expect(shellText).not.toContain('`');
      // The one here-document ends at a delimiter carrying the nonce; Python's program is fixed text.
      expect(shell.filter((line) => line.includes('<<'))).toEqual([
        `  fi <<'__AGENTICO_SQL_${nonce}__'`,
      ]);
      expect(shell).toContain(`__AGENTICO_SQL_${nonce}__`);
      expect(python.join('\n')).toBe(PYTHON_READER);
      expect(PYTHON_READER).not.toContain("'");
      expect(shell[0]).toBe(`N=${nonce}`);
    }
  });

  it('prefers sqlite then python but never the shim', () => {
    const { shell } = partsOf(TAIL);
    const darwin = shell.indexOf('if [ "$(uname -s)" = Darwin ]; then');
    expect(shell[darwin + 1]).toBe(
      '  if [ -x /usr/bin/sqlite3 ]; then sq=/usr/bin/sqlite3; else sq=$(command -v sqlite3 2>/dev/null) || sq=; fi',
    );
    expect(shell[darwin + 2]).toBe('  py=$(command -v python3 2>/dev/null) || py=');
    expect(shell[darwin + 3]).toBe('  [ "$py" = /usr/bin/python3 ] && py=');
    expect(shell[darwin + 4]).toBe('else');
    const readers = shell.indexOf('elif [ -n "$sq$py" ]; then');
    expect(shell[readers + 1]).toBe('  { if [ -n "$sq" ]; then');
    expect(shell[readers + 2]?.startsWith('    "$sq" ')).toBe(true);
    expect(shell[readers + 3]).toBe('  else');
    expect(shell[readers + 4]).toBe('    "$py" -I -c \'');
    expect(readers).toBeLessThan(shell.indexOf("  printf 'P noreader\\n'"));
    const pythonOnly = partsOf(TAIL, { reader: 'pythonOnly' }).shell;
    const cleared = pythonOnly.lastIndexOf('sq=');
    expect(cleared).toBeGreaterThan(pythonOnly.indexOf('fi', darwin));
    expect(cleared).toBeLessThan(readers);
  });

  it('ignores the users sqliterc and opens read-only', () => {
    for (const query of QUERIES) {
      const { shell, sql, python } = partsOf(query);
      const cli = shell.find((line) => line.startsWith('    "$sq" ')) ?? '';
      expect(cli).toContain(' -init /dev/null ');
      expect(cli).toContain(' -batch -bail ');
      expect(cli).toContain(' -readonly ');
      const pythonText = python.join('\n');
      expect(pythonText).toContain('"?mode=ro"');
      expect(pythonText).toContain('PRAGMA query_only = 1');
      expect(sql).toContain('PRAGMA query_only = 1;');
      const script = text(query);
      for (const forbidden of ['immutable', 'mode=rw', 'mode=rwc', 'nolock']) {
        expect(script).not.toContain(forbidden);
      }
    }
  });

  it('writes the bytes SQLite returns from the python reader', () => {
    expect(PYTHON_READER).toContain('out = sys.stdout.buffer');
    expect(PYTHON_READER).toContain('c.text_factory = bytes');
    expect(PYTHON_READER).toContain(
      'out.write((v if isinstance(v, bytes) else str(v).encode("utf-8")) + b"\\n")',
    );
    expect(PYTHON_READER).toContain('except Exception as e:');
    expect(PYTHON_READER).not.toContain('print(');
  });

  it('splits every statement where both readers split it', () => {
    for (const query of QUERIES) {
      const statements = openCodeStatements(query);
      for (const statement of statements) {
        expect(statement).not.toContain(';');
        expect(statement.split('\n').some((line) => line.startsWith('.'))).toBe(false);
      }
      const { sql } = partsOf(query);
      const texts = `${sql.join('\n')}\n`
        .split(';\n')
        .map((part) =>
          part
            .split('\n')
            .filter((line) => !line.startsWith('.'))
            .join('\n'),
        )
        .filter((part) => part.trim() !== '');
      expect(texts).toEqual([
        'PRAGMA query_only = 1',
        ...statements.slice(0, 1),
        'BEGIN',
        ...statements.slice(1),
        'COMMIT',
      ]);
    }
  });

  it('keeps a poll script small and builds the window once', () => {
    for (const query of QUERIES) {
      if (query.query.kind !== 'poll') continue;
      const script = openCodeScript(query, makeNonce());
      const body = decodeUtf8(script);
      expect(script.length).toBeLessThanOrEqual(16_384);
      expect(body.split('w AS (').length - 1).toBe(1);
      for (const statement of openCodeStatements(query)) {
        expect(body.split(statement).length - 1, statement.slice(0, 60)).toBe(1);
      }
    }
  });

  it('reads only the four tables', () => {
    const tables = new Set(['session_v2', 'session_message', 'event_sequence', 'session_inbox']);
    const sources = new Set(['raw', 'm', 'items', 'slim_items', 'r', 'w', 'need', 'json_each']);
    const refused = new Set([
      'credential',
      'account',
      'control_account',
      'kv',
      'event',
      'message',
      'part',
      'session',
      'project',
    ]);
    for (const query of QUERIES) {
      for (const statement of openCodeStatements(query)) {
        const { code, literals } = split(statement);
        const list = tokens(code);
        list.forEach((token, index) => {
          if (['FROM', 'JOIN'].includes(token.toUpperCase()) && index + 1 < list.length) {
            const source = list[index + 1] as string;
            expect(
              source === '(' ||
                tables.has(source) ||
                sources.has(source) ||
                source === 'sqlite_master' ||
                source === 'pragma_table_info',
              `reads ${source}`,
            ).toBe(true);
          }
          expect(refused.has(token.toLowerCase()), `names ${token}`).toBe(false);
        });
        if (list.includes('sqlite_master')) {
          // The 1.x tables are named only to tell an older store apart.
          expect(statement).toBe(TABLES_STATEMENT);
          for (const literal of literals) {
            expect(['T ', ',', 'table', 'session', 'message', 'part', 'session_v2']).toContain(
              literal,
            );
          }
        }
        if (list.includes('pragma_table_info')) {
          expect(statement).toBe(LAYOUT_STATEMENT);
          const pairs = literals.slice(0, -3);
          expect(literals.slice(-3)).toEqual(['L ', '.', ',']);
          expect(new Set(pairs.filter((_, index) => index % 2 === 0))).toEqual(tables);
        }
      }
    }
  });

  it('binds every statement to the session except the store checks', () => {
    for (const query of QUERIES) {
      const statements = openCodeStatements(query);
      expect(statements.slice(0, 3)).toEqual([
        VERSION_STATEMENT,
        TABLES_STATEMENT,
        LAYOUT_STATEMENT,
      ]);
      for (const statement of statements.slice(3)) expect(statement).toContain(`'${SESSION}'`);
    }
  });

  it('never writes', () => {
    const writes = new Set([
      'INSERT',
      'UPDATE',
      'DELETE',
      'REPLACE',
      'CREATE',
      'DROP',
      'ALTER',
      'ATTACH',
      'DETACH',
      'VACUUM',
      'REINDEX',
      'PRAGMA',
      'UPSERT',
      'TRUNCATE',
      'ANALYZE',
    ]);
    for (const query of QUERIES) {
      for (const statement of openCodeStatements(query)) {
        for (const token of tokens(split(statement).code)) {
          expect(writes.has(token.toUpperCase()), token).toBe(false);
        }
      }
      const { sql } = partsOf(query);
      expect(sql.filter((line) => line.trim().toUpperCase().startsWith('PRAGMA'))).toEqual([
        'PRAGMA query_only = 1;',
      ]);
    }
  });

  it('avoids syntax newer than the SQLite 3.25 floor', () => {
    const newer = new Set([
      'IIF',
      'FILTER',
      'NULLS',
      'RETURNING',
      'MATERIALIZED',
      'HAVING',
      'GROUPS',
      'EXCLUDE',
      'FORMAT',
      'UNIXEPOCH',
      'CONCAT',
      'CONCAT_WS',
      'STRING_AGG',
      'OCTET_LENGTH',
      'UNHEX',
      'TIMEDIFF',
      'JSON_PRETTY',
      'JSON_ERROR_POSITION',
      'RIGHT',
      'FULL',
      'DISTINCT',
    ]);
    const aggregates = new Set([
      'GROUP_CONCAT',
      'JSON_GROUP_ARRAY',
      'JSON_GROUP_OBJECT',
      'SUM',
      'COUNT',
      'MIN',
      'MAX',
      'AVG',
      'TOTAL',
    ]);
    for (const query of QUERIES) {
      for (const statement of openCodeStatements(query)) {
        const { code } = split(statement);
        expect(code).not.toContain('->');
        const list = tokens(code);
        const calls: string[] = [];
        list.forEach((token, index) => {
          const upper = token.toUpperCase();
          expect(newer.has(upper) || upper.startsWith('JSONB'), token).toBe(false);
          if (token === '(') calls.push(index > 0 ? (list[index - 1] as string).toUpperCase() : '');
          else if (token === ')') calls.pop();
          else if (upper === 'ORDER') {
            // ORDER BY inside an aggregate's arguments is 3.44.
            expect(aggregates.has(calls.at(-1) ?? '')).toBe(false);
          }
        });
        expect(calls).toEqual([]);
      }
    }
  });

  it('reads a store without a side file as closed before any reader starts', () => {
    const { shell } = partsOf(TAIL);
    const closed = shell.indexOf('elif [ ! -e "$db-wal" ] || [ ! -e "$db-shm" ]; then');
    const readers = shell.indexOf('elif [ -n "$sq$py" ]; then');
    expect(shell[closed + 1]).toBe("  printf 'P closed\\n'");
    expect(closed).toBeLessThan(readers);
    expect(parse(['P closed', 'W 1 0'])).toEqual({
      type: 'unavailable',
      problem: { kind: 'storeClosed' },
    });
  });

  it('prints the missing store path through a byte range', () => {
    const { shell } = partsOf(TAIL);
    expect(shell).toContain("  printf 'P nodb %s\\n' \"$p\" | tr -c ' -~\\n' '?'");
    expect(shell.some((line) => line.includes('[:'))).toBe(false);
  });
});
