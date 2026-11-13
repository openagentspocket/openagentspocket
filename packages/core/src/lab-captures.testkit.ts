/**
 * Test support: captures the agent lab took from a real program (scripts/agent-lab.py), kept under
 * packages/core/goldens/<program>/lab/. A screen is an `agent.read` of the pane as the Blocked card
 * reads it; a store output is what Chat's store script printed for one query over SSH. Node only.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeAnsiScreen } from './blocked/ansi-decoder';
import type { AnsiScreen } from './blocked/screen';
import { codexAdapter } from './chat/engine/adapter';
import type { ChatHostFiles } from './chat/model/host-files';
import { frameLines } from './chat/model/lines';
import { type ChatAgentActivity, type ChatTranscript, projectionContext } from './chat/model/types';
import { openCodeAdapter } from './chat/opencode/adapter';
import { OpenCodeRecordSource } from './chat/opencode/record-source';
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

/** The OpenCode session the lab's store captures read. */
export const LAB_OPENCODE_SESSION = 'ses_e2d0145c0ffeFUENCuCYVJcvJF';

/** One OpenCode store capture read through the record source and the reducer the app uses. */
export async function labTranscript(
  capture: string,
  activity: ChatAgentActivity,
): Promise<ChatTranscript> {
  const lines = await new OpenCodeRecordSource(LAB_OPENCODE_SESSION).open(
    labStoreFiles('opencode', capture),
  );
  const adapter = openCodeAdapter();
  if (!adapter || !lines) throw new Error('OpenCode is not readable');
  const reducer = adapter.makeReducer({ path: '', firstLine: null });
  reducer.append(lines);
  if (reducer.unsupportedFormat !== null) throw new Error(`${capture} reads as unsupported`);
  return reducer.transcript(projectionContext({ activity }));
}

/** A captured file's text (a Usage report, for example). */
export const labText = (program: LabProgram, file: string): string =>
  readFileSync(labPath(program, file), 'utf8');

/**
 * One Codex rollout capture (redacted by `agent-lab.py keep`) read through the adapter and the
 * reducer the app uses, seeded with its first line as the engine seeds it.
 */
export function labRollout(
  capture: string,
  activity: ChatAgentActivity,
): { transcript: ChatTranscript; unsupportedFormat: string | null } {
  const lines = frameLines(new Uint8Array(readFileSync(labPath('codex', `${capture}.jsonl`))));
  const reducer = codexAdapter.makeReducer({
    path: `/sessions/rollout-2026-11-13T12-13-53-${LAB_CODEX_SESSION}.jsonl`,
    firstLine: lines[0] ?? null,
  });
  reducer.append(lines);
  return {
    transcript: reducer.transcript(projectionContext({ activity })),
    unsupportedFormat: reducer.unsupportedFormat,
  };
}

/** The Codex conversation the lab's rollout captures hold. */
export const LAB_CODEX_SESSION = '01a1d578-e8dc-7b91-be76-14cb186563d3';

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
