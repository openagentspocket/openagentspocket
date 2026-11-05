// How Chat reads one program's transcript (Swift ChatTranscriptAdapter): the reducer to build, the
// framing limits, the cache revision and how a sent prompt is compared with a recorded one.

import { CLAUDE_REVISION, ClaudeTranscriptReducer } from '../claude/reducer';
import { echoKey as claudeEchoKey } from '../claude/user-text';
import { parseRolloutFileName } from '../codex/locator';
import { codexEchoKey } from '../codex/pending-echo';
import { CODEX_REVISION, CodexRolloutReducer } from '../codex/reducer';
import type { FollowerLimits, HeadIdentity } from '../model/follower';
import type { ChatLine } from '../model/lines';
import type { ChatTranscriptReducer } from '../model/reducer';
import type { ChatTranscriptSource } from '../model/source';
import type { ChatProgram } from '../model/types';
import { programDefinition } from '../programs/registry';

/** What a reducer is built from: the file it reads and, when its records depend on it, the file's first line. */
export interface ChatReducerSeed {
  path: string;
  firstLine: ChatLine | null;
}

/** A history base a reverted conversation continues, named by the reducer. */
export interface PendingHistoryBase {
  rolloutID: string;
  /** The base file's lines over `[0, endByteOffset)` are what the lineage needs. */
  endByteOffset: number;
}

export interface ChatTranscriptAdapter {
  program: ChatProgram;
  /** Bumped when the program's normalization changes, so older cached entries are dropped. */
  revision: number;
  /** Framing limits overriding the follower's defaults. */
  limits: Partial<FollowerLimits>;
  /** Whether `makeReducer` needs the file's first line (a tail window starts after it). */
  wantsFirstLine: boolean;
  /** False for a tree transcript that must prove ancestry before restoring earlier entries. */
  joinsCachedHistory: boolean;
  makeReducer(seed: ChatReducerSeed): ChatTranscriptReducer;
  /** What a sent prompt and a recorded one are compared on. */
  echoKey(text: string): string;
  identity: HeadIdentity | null;
  /**
   * Makes the source of a program whose conversations are read from its store by query rather than
   * from a transcript file (ADR 0025); it returns null for a session id the store cannot be asked
   * about. Absent for a program whose transcript file the engine finds and follows.
   */
  makeRecordSource?(sessionID: string): ChatTranscriptSource | null;
  /** The older rollout the reducer still needs, for a program whose history spans files. */
  pendingBase(reducer: ChatTranscriptReducer): PendingHistoryBase | null;
  /** Hands the reducer the base's lines; empty lines mark the base unreadable. */
  supplyBase(
    reducer: ChatTranscriptReducer,
    base: PendingHistoryBase,
    path: string,
    lines: readonly ChatLine[],
  ): void;
}

/** Whether the conversation is read by query, so there is no file to look for. */
export const readsByQuery = (adapter: ChatTranscriptAdapter): boolean =>
  adapter.makeRecordSource !== undefined;

const NO_BASE = () => null;
const NO_SUPPLY = () => undefined;

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export const claudeAdapter: ChatTranscriptAdapter = {
  program: 'claude',
  revision: CLAUDE_REVISION,
  limits: {},
  wantsFirstLine: false,
  joinsCachedHistory: true,
  // The session's own file: sidechain and team records belong to the subagents that wrote them.
  makeReducer: (seed) => new ClaudeTranscriptReducer('main', seed.path),
  echoKey: claudeEchoKey,
  identity: null,
  pendingBase: NO_BASE,
  supplyBase: NO_SUPPLY,
};

export const codexAdapter: ChatTranscriptAdapter = {
  program: 'codex',
  revision: CODEX_REVISION,
  limits: {},
  // Line 1's `session_meta` names the rollout's dialect, so a tail window past it still needs it.
  wantsFirstLine: true,
  joinsCachedHistory: true,
  makeReducer: (seed) => {
    const name = basename(seed.path);
    const reducer = new CodexRolloutReducer(parseRolloutFileName(name)?.rolloutID ?? name);
    if (seed.firstLine) reducer.setSessionMeta(seed.firstLine);
    return reducer;
  },
  echoKey: codexEchoKey,
  identity: null,
  pendingBase: (reducer) => {
    if (!(reducer instanceof CodexRolloutReducer)) return null;
    const base = reducer.pendingHistoryBase;
    return base ? { rolloutID: base.baseRolloutID, endByteOffset: base.endByteOffset } : null;
  },
  supplyBase: (reducer, base, path, lines) => {
    if (reducer instanceof CodexRolloutReducer) {
      reducer.setBaseSegment(base.rolloutID, path, lines);
    }
  },
};

/** The adapter Chat reads `program` with; null for a program it cannot read yet. */
export function standardAdapter(program: ChatProgram): ChatTranscriptAdapter | null {
  return programDefinition(program).adapter();
}
