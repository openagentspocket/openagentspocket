// The context share of a Codex `token_count` event (Swift CodexTokenCount). Every field is
// optional: a version that renames one yields null, not a wrong figure.

import { decodeUtf8 } from '../../events/utf8';
import { asObject, asString } from '../model/reducer';
import type { AgentContextUsage } from '../model/types';
import { includesBytes } from './json-bytes';

function whole(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e12)
    return null;
  return Math.trunc(value);
}

export function contextUsageIn(line: Uint8Array): AgentContextUsage | null {
  // Cheap reject first: most lines are not this event.
  if (!includesBytes(line, 'token_count')) return null;
  let root: unknown;
  try {
    root = JSON.parse(decodeUtf8(line));
  } catch {
    return null;
  }
  const payload = asObject(asObject(root)?.payload);
  if (!payload || asString(payload.type) !== 'token_count') return null;
  const info = asObject(payload.info);
  const last = asObject(info?.last_token_usage);
  const window = whole(info?.model_context_window);
  if (!info || !last || window === null) return null;
  const input = whole(last.input_tokens);
  const used =
    whole(last.total_tokens) ?? (input === null ? null : input + (whole(last.output_tokens) ?? 0));
  return used === null ? null : { usedTokens: used, windowTokens: window };
}
