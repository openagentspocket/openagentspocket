// Shared builders for the Pi reducer tests.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeUtf8 } from '../../events/utf8';
import { type ChatLine, frameLines } from '../model/lines';
import {
  type ChatAgentActivity,
  type ChatToolActivity,
  type ChatTranscript,
  projectionContext,
} from '../model/types';
import { PiTranscriptReducer } from './reducer';

export const HEADER =
  '{"type":"session","version":3,"id":"f3c2a481-54ed-4c7e-a240-6d036157dc80","cwd":"/project"}';

export const lines = (rows: string[]): ChatLine[] => frameLines(encodeUtf8(`${rows.join('\n')}\n`));

export const fixture = (name: string): ChatLine[] =>
  frameLines(new Uint8Array(readFileSync(join(__dirname, '../../../goldens', name))));

export const project = (
  reducer: PiTranscriptReducer,
  activity: ChatAgentActivity = 'unknown',
  windowStart = 0,
): ChatTranscript => reducer.transcript(projectionContext({ activity, windowStart }));

export const reduce = (
  rows: string[],
  program: 'pi' | 'omp' = 'pi',
  activity: ChatAgentActivity = 'unknown',
) => {
  const reducer = new PiTranscriptReducer(program);
  reducer.append(lines(rows));
  return { reducer, transcript: project(reducer, activity) };
};

export const toolOf = (
  transcript: ChatTranscript,
  callPrefix?: string,
): ChatToolActivity | undefined => {
  for (const entry of [...transcript.entries].reverse()) {
    if (entry.content.type !== 'tool') continue;
    if (callPrefix === undefined || entry.content.value.callID?.startsWith(callPrefix)) {
      return entry.content.value;
    }
  }
  return undefined;
};

export const ompTranscript = (through?: number, activity: ChatAgentActivity = 'idle') => {
  const all = fixture('omp/transcripts/approvals-asks-plan.jsonl');
  const reducer = new PiTranscriptReducer('omp');
  reducer.append(all.slice(0, through ?? all.length));
  return project(reducer, activity);
};

export const text = (value: string) => ({ type: 'text', text: value });
export const user = (id: string, parent: string | null, content: unknown, extra = '') =>
  `{"type":"message","id":"${id}","parentId":${JSON.stringify(parent)}${extra},"message":{"role":"user","content":${JSON.stringify(content)}}}`;
