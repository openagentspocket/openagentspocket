// Test support: each program's captured transcript read through its own adapter, as the engine
// does (the adapter's reducer, fed the fixture's lines), so program-neutral layers can be proven
// against Pi, Oh My Pi, Grok and OpenCode without a branch on the program.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { standardAdapter } from './engine/adapter';
import { type ChatLine, frameLines } from './model/lines';
import {
  type ChatAgentActivity,
  type ChatProgram,
  type ChatTranscript,
  projectionContext,
} from './model/types';

const GOLDENS = fileURLToPath(new URL('../../goldens/', import.meta.url));

export interface ProgramFixture {
  program: ChatProgram;
  directory: string;
  fixture: string;
}

/** One finished conversation per program, each with messages, answers and tool calls. */
export const OTHER_PROGRAM_FIXTURES: readonly ProgramFixture[] = [
  { program: 'pi', directory: 'pi', fixture: 'summaries.jsonl' },
  { program: 'omp', directory: 'omp', fixture: 'approvals-asks-plan.jsonl' },
  { program: 'grok', directory: 'grok', fixture: 'core-turns.jsonl' },
  { program: 'opencode', directory: 'opencode', fixture: 'rows-pong.jsonl' },
];

/** OpenCode's rows sit at their `seq`; its session and inbox lines at the read offset past the counter. */
function openCodeLines(path: string, fixture: string): ChatLine[] {
  const scenario = fixture.replace(/^rows-/, '').replace(/\.jsonl$/, '');
  const store = JSON.parse(readFileSync(`${path}store-${scenario}.json`, 'utf8')) as {
    event_seq: number | null;
  };
  const readOffset = Math.max(store.event_seq ?? 0, 0) + 1;
  return readFileSync(`${path}${fixture}`, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const data = new TextEncoder().encode(line);
      const value = JSON.parse(line) as { seq?: unknown };
      return {
        offset: typeof value.seq === 'number' ? value.seq : readOffset,
        length: data.length,
        data,
      };
    });
}

/**
 * The fixture read through the program's registered adapter, as a function of herdr's activity.
 * `through` stops at the first line it accepts, for a conversation still waiting there.
 */
export function projectionThroughAdapter(
  entry: ProgramFixture,
  through?: (line: string) => boolean,
): (activity: ChatAgentActivity) => ChatTranscript {
  const adapter = standardAdapter(entry.program);
  if (!adapter) throw new Error(`no adapter registered for ${entry.program}`);
  const path = `${GOLDENS}${entry.directory}/transcripts/`;
  const all =
    entry.program === 'opencode'
      ? openCodeLines(path, entry.fixture)
      : frameLines(new Uint8Array(readFileSync(`${path}${entry.fixture}`)));
  const last = through
    ? all.findIndex((line) => through(new TextDecoder().decode(line.data)))
    : all.length - 1;
  if (last < 0) throw new Error(`no line accepted in ${entry.fixture}`);
  const lines = all.slice(0, last + 1);
  const reducer = adapter.makeReducer({
    path: `${path}${entry.fixture}`,
    firstLine: lines[0] ?? null,
  });
  reducer.append(adapter.wantsFirstLine && lines[0] ? lines.slice(1) : lines);
  return (activity) => reducer.transcript(projectionContext({ activity }));
}

/** The fixture's transcript, projected idle, through the program's registered adapter. */
export const transcriptThroughAdapter = (entry: ProgramFixture): ChatTranscript =>
  projectionThroughAdapter(entry)('idle');
