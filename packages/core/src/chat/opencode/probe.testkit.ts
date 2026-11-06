// Shared by the OpenCode probe tests: one query of each kind, the script split into its shell, SQL
// and Python parts, and a parse helper that prints lines between the markers (Swift
// OpenCodeProbeTests helpers).

import { TransportFailure } from '../../errors';
import { decodeUtf8, encodeUtf8 } from '../../events/utf8';
import { beginMarker, endMarker, makeNonce, openCodeScript, parseOpenCodeOutput } from './probe';
import type { OpenCodeQuery, OpenCodeQueryResponse } from './query';

export const SESSION = 'ses_0a1b2c3d4e5fK2mN8pQ4rT6vX9';
export const TAIL: OpenCodeQuery = { session: SESSION, query: { kind: 'tail', budget: 524_288 } };
export const POLL: OpenCodeQuery = {
  session: SESSION,
  query: {
    kind: 'poll',
    cursor: {
      eventSeq: 12,
      generation: null,
      lowSeq: 4,
      highSeq: 12,
      knownInWindow: 3,
      openRows: [7, 9],
      updatedSince: 1_800_000_000_000,
      budget: 1_048_576,
    },
  },
};
/** One query of each kind. */
export const QUERIES: OpenCodeQuery[] = [
  TAIL,
  POLL,
  {
    session: SESSION,
    query: {
      kind: 'poll',
      cursor: {
        eventSeq: null,
        generation: null,
        lowSeq: 4,
        highSeq: 12,
        knownInWindow: 3,
        openRows: [],
        updatedSince: 0,
        budget: 1_048_576,
      },
    },
  },
  { session: SESSION, query: { kind: 'older', before: 40, budget: 524_288 } },
  { session: SESSION, query: { kind: 'row', seq: 7, outputLimit: 262_144 } },
];

export const text = (query: OpenCodeQuery, options?: Parameters<typeof openCodeScript>[2]) =>
  decodeUtf8(openCodeScript(query, makeNonce(), options));

/** The script's lines outside its here-document and Python's program, the here-document's SQL, and the program. */
function scriptParts(script: string, nonce: string) {
  const delimiter = `__AGENTICO_SQL_${nonce}__`;
  const parts = { shell: [] as string[], sql: [] as string[], python: [] as string[] };
  let body: 'sql' | 'python' | null = null;
  for (const line of script.split('\n')) {
    if (body) {
      if (body === 'sql' ? line === delimiter : line.startsWith("' ")) {
        body = null;
        parts.shell.push(line);
      } else {
        parts[body].push(line);
      }
      continue;
    }
    parts.shell.push(line);
    if (line.endsWith(`<<'${delimiter}'`)) body = 'sql';
    else if (line.endsWith(" -c '")) body = 'python';
  }
  return parts;
}

export function partsOf(query: OpenCodeQuery, options?: Parameters<typeof openCodeScript>[2]) {
  const nonce = makeNonce();
  return { nonce, ...scriptParts(decodeUtf8(openCodeScript(query, nonce, options)), nonce) };
}

/** A statement's text without its string literals, and the literals. */
export function split(statement: string): { code: string; literals: string[] } {
  let code = '';
  const literals: string[] = [];
  let literal: string | null = null;
  for (const character of statement) {
    if (literal !== null) {
      if (character === "'") {
        literals.push(literal);
        literal = null;
        code += "''";
      } else {
        literal += character;
      }
    } else if (character === "'") {
      literal = '';
    } else {
      code += character;
    }
  }
  return { code, literals };
}

/** Identifiers, and parentheses as tokens of their own. */
export function tokens(code: string): string[] {
  const out: string[] = [];
  let word = '';
  for (const character of code) {
    if (/[A-Za-z0-9_]/.test(character)) {
      word += character;
      continue;
    }
    if (word !== '') {
      out.push(word);
      word = '';
    }
    if (character === '(' || character === ')') out.push(character);
  }
  if (word !== '') out.push(word);
  return out.filter((token) => !/^[0-9]/.test(token));
}

export function parse(
  lines: string[],
  {
    stderr = '',
    query = TAIL,
    exit = 0,
  }: { stderr?: string; query?: OpenCodeQuery; exit?: number } = {},
): OpenCodeQueryResponse {
  const nonce = makeNonce();
  const body = `${lines.join('\n')}\n`;
  const stdout = encodeUtf8(`${beginMarker(nonce)}\n${body}\n${endMarker(nonce)}\n`);
  return parseOpenCodeOutput(stdout, encodeUtf8(stderr), exit, nonce, query);
}

export function failure(run: () => unknown) {
  try {
    run();
  } catch (thrown) {
    if (thrown instanceof TransportFailure) return thrown.error;
    throw thrown;
  }
  throw new Error('expected a failure');
}
