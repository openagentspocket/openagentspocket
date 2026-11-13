/**
 * Test support: captures the agent lab took from a real program (scripts/agent-lab.py), kept under
 * packages/core/goldens/<program>/lab/. A screen is an `agent.read` of the pane as the Blocked card
 * reads it; a store output is what Chat's store script printed for one query over SSH. Node only.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeAnsiScreen } from './blocked/ansi-decoder';
import type { AnsiScreen } from './blocked/screen';
import type { ChatHostFiles } from './chat/model/host-files';
import { parseStoreOutput } from './chat/store/output';
import type { ChatStore, StoreQuery } from './chat/store/query';

const GOLDENS = fileURLToPath(new URL('../goldens/', import.meta.url));

export type LabProgram = 'opencode' | 'codex';

const labPath = (program: LabProgram, file: string) => `${GOLDENS}${program}/lab/${file}`;

/** One captured screen, decoded as the card decodes `agent.read`. */
export function labScreen(program: LabProgram, name: string): AnsiScreen {
  return decodeAnsiScreen(readFileSync(labPath(program, `${name}.ansi`), 'utf8'));
}

/** A captured screen's rows as plain text, the way the mode reader takes it. */
export function labScreenText(program: LabProgram, name: string): string {
  return labScreen(program, name)
    .rows.map((row) => row.text)
    .join('\n');
}

/**
 * Chat's file port answering every store query with one captured output, parsed by the real
 * parser under the capture's own nonce. Only `queryStore` exists: a store program reads nothing else.
 */
export function labStoreFiles(program: LabProgram, name: string): ChatHostFiles {
  const stdout = readFileSync(labPath(program, `${name}.out`));
  const nonce = /__AGENTICO_OC_BEGIN_([0-9a-f]+)/.exec(stdout.toString('utf8'))?.[1];
  if (!nonce) throw new Error(`${name}.out has no begin marker`);
  const unused = () => Promise.reject(new Error('a lab store capture answers queries only'));
  return {
    home: unused,
    status: unused,
    list: unused,
    read: unused,
    queryStore: async (store: ChatStore, query: StoreQuery) =>
      parseStoreOutput(store, new Uint8Array(stdout), new Uint8Array(), 0, nonce, query),
  };
}
