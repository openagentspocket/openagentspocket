// How every line, problem and reader failure of an OpenCode store query reads (Swift
// OpenCodeProbeTests, parse half).

import { describe, expect, it } from 'vitest';
import { decodeUtf8, encodeUtf8 } from '../../events/utf8';
import { beginMarker, endMarker, makeNonce, OUTPUT_CAP, parseOpenCodeOutput } from './probe';
import { failure, POLL, parse, partsOf, SESSION, TAIL } from './probe.testkit';
import type { OpenCodeQuery } from './query';

describe('OpenCode probe parse', () => {
  it('parses records between the nonce markers and ignores what is outside', () => {
    const nonce = makeNonce();
    const stray = makeNonce();
    const session = '{"k":"session","id":"ses_0a1b2c3d4e5fK2mN8pQ4rT6vX9","parent":null}';
    const older = '{"k":"row","id":"msg_a","type":"user","seq":7,"tc":1,"tu":3,"f":true,"d":{}}';
    const newer =
      '{"k":"row","id":"msg_b","type":"assistant","seq":9,"tc":2,"tu":5,"f":false,"d":{}}';
    const inbox = '{"k":"inbox","items":[],"more":0}';
    const stdout = encodeUtf8(
      [
        'Last login: noise from a login shell',
        beginMarker(stray),
        'R {"k":"row","id":"msg_stray","seq":1}',
        beginMarker(nonce),
        'V 3.54.0',
        'E 12',
        `S ${session}`,
        `R ${newer}`,
        `R ${older}`,
        'F 4',
        `I ${inbox}`,
        'Z 0',
        'W 1 1',
        '',
        endMarker(nonce),
        'R {"k":"row","id":"msg_after","seq":99}',
        '',
      ].join('\n'),
    );
    const response = parseOpenCodeOutput(stdout, new Uint8Array(), 0, nonce, TAIL);
    if (response.type !== 'records') throw new Error('expected records');
    const { records } = response;
    expect(records.sqliteVersion).toBe('3.54.0');
    expect(records.eventSeq).toBe(12);
    expect(decodeUtf8(records.sessionLine ?? new Uint8Array())).toBe(session);
    expect(decodeUtf8(records.inboxLine ?? new Uint8Array())).toBe(inbox);
    expect(records.rows.map((row) => row.id)).toEqual(['msg_a', 'msg_b']);
    expect(records.rows.map((row) => row.seq)).toEqual([7, 9]);
    expect(records.rows.map((row) => row.timeUpdated)).toEqual([3, 5]);
    expect(records.rows.map((row) => row.isFinal)).toEqual([true, false]);
    expect(records.rows.map((row) => decodeUtf8(row.line))).toEqual([older, newer]);
    expect(records.firstSeq).toBe(4);
    expect(records.windowCount).toBeNull();
    expect(records.overflow).toBe(false);
    expect(records.ignoredLines).toBe(0);

    for (const cut of [
      `${beginMarker(nonce)}\nV 3.54.0\nZ 0\n`,
      `V 3.54.0\n\n${endMarker(nonce)}\n`,
      `${beginMarker(stray)}\nZ 0\n\n${endMarker(stray)}\n`,
    ]) {
      expect(
        failure(() => parseOpenCodeOutput(encodeUtf8(cut), new Uint8Array(), 137, nonce, TAIL)),
      ).toEqual({
        kind: 'malformedResponse',
        detail: "OpenCode's store query stopped before its end (exit status 137)",
      });
    }
  });

  it('ignores and counts blank and untagged lines', () => {
    const response = parse([
      'V 3.54.0',
      '',
      'Last login: noise',
      'R {"k":"row","id":',
      'E twelve',
      'Q 1',
      'X extra',
      'M extra',
      'E 12',
      'Z 0',
      'W 1 1',
    ]);
    if (response.type !== 'records') throw new Error('expected records');
    expect(response.records.ignoredLines).toBe(7);
    expect(response.records.eventSeq).toBe(12);
    expect(response.records.rows).toEqual([]);
    expect(response.records.overflow).toBe(false);
  });

  it('reads a python without its sqlite module as no reader', () => {
    const { python } = partsOf(TAIL);
    expect(python.filter((line) => line.includes('sqlite3') && line.includes('import'))).toEqual([
      '    import sqlite3',
    ]);
    expect(python.indexOf('    import sqlite3')).toBe(python.indexOf('try:') + 1);
    expect(
      parse(['Z 1', 'W 1 1'], {
        stderr: "Error: ModuleNotFoundError: No module named '_sqlite3'\n",
      }),
    ).toEqual({ type: 'unavailable', problem: { kind: 'noReader' } });
  });

  it('reads text that is not UTF-8 as replacement characters', () => {
    const nonce = makeNonce();
    const surrogate = [0xed, 0xa0, 0xbd];
    const parts: Uint8Array[] = [];
    const add = (chunk: string | number[]) =>
      parts.push(typeof chunk === 'string' ? encodeUtf8(chunk) : Uint8Array.from(chunk));
    add(`${beginMarker(nonce)}\nV 3.54.0\nE 12\n`);
    add('S {"k":"session","id":"ses_0a1b2c3d4e5fK2mN8pQ4rT6vX9","title":"cut ');
    add(surrogate);
    add('"}\n');
    add(
      'R {"k":"row","id":"msg_a","type":"assistant","seq":7,"tc":1,"tu":3,"f":true,"d":{"content":[{"_i":0,"type":"text","text":"before ',
    );
    add(surrogate);
    add(' after","n":14}]}}\n');
    add('Z 0\nW 1 1\n\n');
    add(`${endMarker(nonce)}\n`);
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const stdout = new Uint8Array(total);
    let at = 0;
    for (const part of parts) {
      stdout.set(part, at);
      at += part.length;
    }
    const response = parseOpenCodeOutput(stdout, new Uint8Array(), 0, nonce, TAIL);
    if (response.type !== 'records') throw new Error('expected records');
    expect(response.records.ignoredLines).toBe(0);
    // Swift reads the three bytes as three replacement characters; the shared decoder reads the
    // lone surrogate as one. Either way the rest of the text decodes.
    expect(decodeUtf8(response.records.sessionLine ?? new Uint8Array())).toMatch(/cut \uFFFD+"\}$/);
    expect(decodeUtf8(response.records.rows[0]?.line ?? new Uint8Array())).toMatch(
      /before \uFFFD+ after/,
    );
  });

  it('reads a missing exit line as an overflow when the cap cut the output', () => {
    const read = [
      'V 3.54.0',
      'E 12',
      '{"k":"row","id":"msg_a","type":"user","seq":7,"tu":3,"f":true,"d":{}}',
    ];
    const first = [read[0], read[1], `R ${read[2]}`] as string[];
    const readBytes = first.reduce((sum, line) => sum + line.length + 1, 0);
    const row = 'R {"k":"row","id":"msg_b","type":"assistant","seq":9,"tu":5,"f":true,"d":{"t":"';
    const filler = OUTPUT_CAP - readBytes - row.length;
    // Cut inside a row, so the script's `W` line joins it; and cut at the end of a line.
    const cutInside = [...first, `${row}${'x'.repeat(filler)}W 1 1`];
    const cutAtLineEnd = [...first, `${row}${'x'.repeat(filler - 4)}"}}`, 'W 1 1'];
    for (const [lines, rows, ignored] of [
      [cutInside, [7], 1],
      [cutAtLineEnd, [7, 9], 0],
    ] as const) {
      const response = parse([...lines]);
      if (response.type !== 'records') throw new Error('expected records');
      expect(response.records.overflow).toBe(true);
      expect(response.records.rows.map((r) => r.seq)).toEqual([...rows]);
      expect(response.records.ignoredLines).toBe(ignored);
    }
  });

  it('reads a missing exit line short of the cap as malformed', () => {
    const detail = "OpenCode's store query printed no exit status (exit status 0)";
    expect(
      failure(() => parse(['??n?????????????????r???p?n?????????p?n???????', 'W 0 0'])),
    ).toEqual({
      kind: 'malformedResponse',
      detail,
    });
    expect(
      failure(() =>
        parse(['V 3.54.0', 'E 12', 'R {"k":"row","id":"msg_b","type":"assistant","se']),
      ),
    ).toEqual({ kind: 'malformedResponse', detail });
  });

  it.each([
    [
      'Parse error near line 9: no such column: data',
      true,
      { problem: { kind: 'layout', missing: ['data'] } },
    ],
    [
      'Runtime error near line 9: database is locked (5)',
      true,
      { unreadable: "OpenCode's database is busy." },
    ],
    [
      'Parse error near line 4: no such function: json_object',
      true,
      { problem: { kind: 'readerTooOld', version: '3.54.0' } },
    ],
    [
      'Error: near line 7: a GROUP BY clause is required before HAVING',
      true,
      { problem: { kind: 'readerTooOld', version: '3.54.0' } },
    ],
    ['Error: unable to open database file', false, { problem: { kind: 'storeClosed' } }],
    [
      'Error: unable to open database file',
      true,
      { unreadable: "OpenCode's database couldn't be opened." },
    ],
    [
      'Error: OperationalError: database is locked',
      true,
      { unreadable: "OpenCode's database is busy." },
    ],
    [
      'Error: OperationalError: parser stack overflow',
      true,
      { problem: { kind: 'readerTooOld', version: '3.54.0' } },
    ],
    [
      'Parse error near line 12: parser stack overflow',
      true,
      { problem: { kind: 'readerTooOld', version: '3.54.0' } },
    ],
    [
      "Error: ModuleNotFoundError: No module named '_sqlite3'",
      true,
      { problem: { kind: 'noReader' } },
    ],
    [
      'Error: ImportError: libsqlite3.so.0: cannot open shared object file: No such file or directory',
      true,
      { problem: { kind: 'noReader' } },
    ],
  ] as const)('classifies the reader error %s', (stderr, sideFiles, expected) => {
    const lines = ['V 3.54.0', 'E 12', 'Z 1', sideFiles ? 'W 1 1' : 'W 0 0'];
    if ('problem' in expected) {
      expect(parse(lines, { stderr })).toEqual({ type: 'unavailable', problem: expected.problem });
    } else {
      expect(failure(() => parse(lines, { stderr }))).toEqual({
        kind: 'hostStoreUnreadable',
        detail: expected.unreadable,
      });
    }
  });

  it('shows an unexplained reader failure without the account name', () => {
    expect(
      failure(() =>
        parse(['V 3.54.0', 'Z 1', 'W 1 1'], {
          stderr:
            'warning: noise\nError: disk I/O error reading /Users/someone/.local/share/opencode/opencode.db\n',
        }),
      ),
    ).toEqual({
      kind: 'hostStoreUnreadable',
      detail: 'Error: disk I/O error reading ~/.local/share/opencode/opencode.db',
    });
    expect(failure(() => parse(['V 3.54.0', 'Z 2', 'W 1 1']))).toEqual({
      kind: 'hostStoreUnreadable',
      detail: "OpenCode's database reader exited with status 2.",
    });
    const long = 'x'.repeat(300);
    const error = failure(() => parse(['V 3.54.0', 'Z 1', 'W 1 1'], { stderr: `Error: ${long}` }));
    if (error.kind !== 'hostStoreUnreadable') throw new Error('expected unreadable');
    expect([...error.detail].length).toBe(200);
    expect(error.detail.endsWith('…')).toBe(true);
  });

  it('lets the store problem win over the error it caused', () => {
    expect(
      parse(['V 3.54.0', 'L session_message.data,session_inbox.delivery', 'E 12', 'Z 1', 'W 1 1'], {
        stderr: 'Parse error near line 9: no such column: data',
      }),
    ).toEqual({
      type: 'unavailable',
      problem: { kind: 'layout', missing: ['session_message.data', 'session_inbox.delivery'] },
    });
    expect(
      parse(['V 3.54.0', 'T session,message,part', 'Z 1', 'W 1 1'], {
        stderr: 'Parse error near line 31: no such table: event_sequence',
      }),
    ).toEqual({ type: 'unavailable', problem: { kind: 'olderOpenCode' } });
  });

  it('reads an old SQLite as too old', () => {
    expect(
      parse(['V 3.24.0', 'Z 1', 'W 1 1'], {
        stderr: 'Parse error near line 5: near "(": syntax error',
      }),
    ).toEqual({ type: 'unavailable', problem: { kind: 'readerTooOld', version: '3.24.0' } });
    expect(parse(['V 2.8.17', 'Z 0', 'W 1 1'])).toEqual({
      type: 'unavailable',
      problem: { kind: 'readerTooOld', version: '2.8.17' },
    });
    const floor = parse(['V 3.25.0', 'E 12', 'Z 0', 'W 1 1']);
    expect(floor.type).toBe('records');
  });

  it('names a missing store and no reader as problems', () => {
    expect(parse(['P nodb ~/.local/share/opencode/opencode.db', 'W 0 0'])).toEqual({
      type: 'unavailable',
      problem: { kind: 'noStore', path: '~/.local/share/opencode/opencode.db' },
    });
    expect(parse(['P nodb /srv/data/opencode/opencode.db', 'W 0 0'])).toEqual({
      type: 'unavailable',
      problem: { kind: 'noStore', path: '/srv/data/opencode/opencode.db' },
    });
    expect(parse(['P noreader', 'W 1 1'])).toEqual({
      type: 'unavailable',
      problem: { kind: 'noReader' },
    });
  });

  it('names the other stores beside a missing session', () => {
    expect(
      parse([
        'V 3.54.0',
        'E ',
        'M',
        'Z 0',
        'W 1 1',
        'O opencode-beta.db notes.db opencode-.db opencode-dev_2.db',
      ]),
    ).toEqual({ type: 'sessionMissing', otherStores: ['opencode-beta.db', 'opencode-dev_2.db'] });
    expect(parse(['V 3.54.0', 'E ', 'M', 'Z 0', 'W 1 1'])).toEqual({
      type: 'sessionMissing',
      otherStores: [],
    });
  });

  it('ignores login shell noise on stderr on success', () => {
    const response = parse(['V 3.54.0', 'E 12', 'Z 0', 'W 1 1'], {
      stderr:
        'bash: warning: setlocale: LC_ALL: cannot change locale\nError: unable to open database file\n',
    });
    if (response.type !== 'records') throw new Error('expected records');
    expect(response.records.eventSeq).toBe(12);
  });

  it('reads an unchanged counter as unchanged only for a poll', () => {
    expect(parse(['V 3.54.0', 'E 12', 'Z 0', 'W 1 1']).type).toBe('records');
    expect(parse(['V 3.54.0', 'E 12', 'Z 0', 'W 1 1'], { query: POLL })).toEqual({
      type: 'unchanged',
      eventSeq: 12,
    });
    expect(parse(['V 3.54.0', 'E 13', 'Z 0', 'W 1 1'], { query: POLL }).type).toBe('records');
    if (POLL.query.kind !== 'poll') throw new Error('poll');
    const unread: OpenCodeQuery = {
      session: SESSION,
      query: { kind: 'poll', cursor: { ...POLL.query.cursor, eventSeq: null } },
    };
    expect(parse(['V 3.54.0', 'E 12', 'Z 0', 'W 1 1'], { query: unread }).type).toBe('records');
  });
});
