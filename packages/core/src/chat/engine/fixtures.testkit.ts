// Shared builders for the engine tests: a Claude session on a fake Host, and its engine.

import { encodeUtf8 } from '../../events/utf8';
import { projectKey } from '../claude/location';
import { VolatileChatTranscriptCache } from '../model/cache';
import type { FakeHostFiles } from '../model/fake-host-files';
import type { ChatProjectionContext } from '../model/types';
import { projectionContext } from '../model/types';
import { type ChatTranscriptAdapter, standardAdapter } from './adapter';
import { ChatConversationEngine } from './engine';

export const SESSION = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b';
export const CWD = '/work/app';
export const IDLE: ChatProjectionContext = projectionContext({ activity: 'idle' });

export function claudePath(files: FakeHostFiles): string {
  return `${files.homePath}/.claude/projects/${projectKey(CWD)}/${SESSION}.jsonl`;
}

export const userLine = (uuid: string, parent: string | null, text: string) =>
  `{"type":"user","uuid":"${uuid}","parentUuid":${parent === null ? 'null' : `"${parent}"`},"sessionId":"${SESSION}","timestamp":"2026-10-06T05:50:00.000Z","message":{"role":"user","content":${JSON.stringify(text)}},"promptSource":"typed","origin":{"kind":"human"}}`;

export const assistantLine = (uuid: string, parent: string, text: string) =>
  `{"type":"assistant","uuid":"${uuid}","parentUuid":"${parent}","sessionId":"${SESSION}","timestamp":"2026-10-06T05:50:01.000Z","message":{"id":"m-${uuid}","role":"assistant","content":[{"type":"text","text":${JSON.stringify(text)}}]},"apiBlockIndex":0}`;

export const bashLine = (uuid: string, parent: string, call: string) =>
  `{"type":"assistant","uuid":"${uuid}","parentUuid":"${parent}","sessionId":"${SESSION}","message":{"id":"m-${uuid}","role":"assistant","content":[{"type":"tool_use","id":"${call}","name":"Bash","input":{"command":"ls","description":"List"}}]},"apiBlockIndex":0}`;

export const resultLine = (uuid: string, parent: string, call: string, output: string) =>
  `{"type":"user","uuid":"${uuid}","parentUuid":"${parent}","sessionId":"${SESSION}","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"${call}","content":${JSON.stringify(output)},"is_error":false}]},"toolUseResult":{"stdout":${JSON.stringify(output)},"stderr":""}}`;

/** `turns` prompt/answer pairs chained one after another. */
export function conversation(turns: number, from = 1): string[] {
  const lines: string[] = [];
  let parent: string | null = from === 1 ? null : `a${from - 1}`;
  for (let i = from; i < from + turns; i += 1) {
    lines.push(userLine(`u${i}`, parent, `question ${i} ${'x'.repeat(80)}`));
    lines.push(assistantLine(`a${i}`, `u${i}`, `answer ${i}`));
    parent = `a${i}`;
  }
  return lines;
}

export const toText = (lines: string[]) => `${lines.join('\n')}\n`;

export function writeClaude(files: FakeHostFiles, lines: string[]): string {
  const path = claudePath(files);
  files.write(path, encodeUtf8(toText(lines)));
  return path;
}

export function withLimits(
  adapter: ChatTranscriptAdapter | null,
  limits: ChatTranscriptAdapter['limits'],
): ChatTranscriptAdapter {
  if (!adapter) throw new Error('no adapter');
  return { ...adapter, limits };
}

export function makeClaudeEngine(
  files: FakeHostFiles,
  options: {
    cache?: VolatileChatTranscriptCache;
    limits?: ChatTranscriptAdapter['limits'];
    now?: () => number;
  } = {},
) {
  const cache = options.cache ?? new VolatileChatTranscriptCache();
  const engine = new ChatConversationEngine({
    reference: { program: 'claude', sessionID: SESSION },
    cacheKey: { hostID: 'h1', herdrSession: '', program: 'claude', conversationID: SESSION },
    files,
    cache,
    adapter: withLimits(standardAdapter('claude'), options.limits ?? {}),
    now: options.now,
  });
  return { engine, cache };
}
