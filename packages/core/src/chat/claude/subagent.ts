// Reading one Claude Code subagent's own transcript (Swift ClaudeSubagentRoute and
// ClaudeSubagentTranscriptReader): once, read-only, through the same Host file operations and size
// caps the main transcript uses. A file longer than the tail window shows its end.

import { userFacingDescription } from '../../errors/presentation';
import { DEFAULT_FOLLOWER_LIMITS, type FollowerLimits } from '../model/follower';
import { type ChatHostFiles, readBytes } from '../model/host-files';
import { JsonlLineFramer } from '../model/lines';
import { type ChatEntry, type ChatTranscript, projectionContext } from '../model/types';
import { subagentTranscriptPath } from './location';
import { ClaudeTranscriptReducer } from './reducer';

export type ClaudeSubagentOutcome =
  /** `isPartial`: the file is longer than the tail window and only its end was read. */
  | { type: 'loaded'; transcript: ChatTranscript; isPartial: boolean }
  /** The file exists but holds no conversation yet (or none Chat reads). */
  | { type: 'empty' }
  /** No file under the session's `subagents/` folder: never written, or since cleaned up. */
  | { type: 'missing' }
  /** The Host could not be read, for this reason. Reading again may work. */
  | { type: 'unreadable'; reason: string };

export interface ClaudeSubagentRoute {
  agentID: string;
  /** The subagent's file on the Host. */
  path: string;
  /** The call's description; null when it had none (the screen shows "Subagent"). */
  title: string | null;
  /** The subagent type (`Explore`, `general-purpose`), when the call named one. */
  subtitle: string | null;
}

/**
 * The route for the call that reported `agentID`, found among the session transcript's entries.
 * Null when the session file's path is unknown, `agentID` cannot name a file in the session's
 * `subagents/` folder, or no entry holds that call (an older page not loaded).
 */
export function subagentRoute(
  agentID: string,
  transcriptPath: string | null,
  entries: readonly ChatEntry[],
): ClaudeSubagentRoute | null {
  if (transcriptPath === null) return null;
  const path = subagentTranscriptPath(transcriptPath, agentID);
  if (path === null) return null;
  for (const entry of entries) {
    if (entry.content.type !== 'tool' || entry.content.value.subagentAgentID !== agentID) continue;
    const { title, subtitle } = entry.content.value;
    return {
      agentID,
      path,
      title: title === '' ? null : title,
      subtitle: subtitle === null || subtitle === '' ? null : subtitle,
    };
  }
  return null;
}

/**
 * The conversation the bytes hold. A window that starts mid-file drops its leading fragment, and a
 * last line still being written is left out until it is complete. A finished file has no live
 * activity: a call without a result reads as having none, not as still running.
 */
export function subagentTranscriptFrom(
  data: Uint8Array,
  startOffset = 0,
  path: string | null = null,
  limits: Pick<FollowerLimits, 'lineCap' | 'prefixCap'> = DEFAULT_FOLLOWER_LIMITS,
): ChatTranscript {
  const framer = new JsonlLineFramer({
    startOffset,
    dropsLeadingFragment: startOffset > 0,
    lineCap: limits.lineCap,
    prefixCap: limits.prefixCap,
  });
  const reducer = new ClaudeTranscriptReducer('subagent', path);
  reducer.append(framer.append(data));
  return reducer.transcript(projectionContext({ windowStart: startOffset, activity: 'idle' }));
}

export async function readSubagentTranscript(
  files: ChatHostFiles,
  path: string,
  limits: Partial<FollowerLimits> = {},
): Promise<ClaudeSubagentOutcome> {
  const all = { ...DEFAULT_FOLLOWER_LIMITS, ...limits };
  try {
    const status = await files.status(path);
    if (!status || (status.kind !== null && status.kind !== 'regular')) return { type: 'missing' };
    const size = status.size ?? all.tailWindow;
    if (size <= 0) return { type: 'empty' };
    const start = size > all.tailWindow ? size - all.tailWindow : 0;
    const data = await readBytes(files, path, start, size, all.readChunk);
    if (data === null) return { type: 'missing' };
    const transcript = subagentTranscriptFrom(data, start, path, all);
    if (transcript.entries.length === 0) return { type: 'empty' };
    return { type: 'loaded', transcript, isPartial: start > 0 };
  } catch (thrown) {
    return { type: 'unreadable', reason: userFacingDescription(thrown) };
  }
}
