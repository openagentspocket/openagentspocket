// How Chat reads OpenCode (Swift ChatTranscriptAdapter.openCode, ADR 0025): its conversations are
// read by query from its session store. A committed `/undo` deletes rows at or above its boundary,
// so a saved prefix may hold rows the store no longer has: older pages, cheap point queries, are
// read instead of joining the cache. Rows keep their ids when OpenCode rewrites them.

import type { ChatTranscriptAdapter } from '../engine/adapter';
import { OpenCodeRecordSource } from './record-source';
import { OPENCODE_REVISION, OpenCodeTranscriptReducer } from './reducer';
import { openCodeSessionID } from './session-id';

const NO_BASE = () => null;
const NO_SUPPLY = () => undefined;

const openCodeAdapterValue: ChatTranscriptAdapter = {
  program: 'opencode',
  revision: OPENCODE_REVISION,
  limits: {},
  wantsFirstLine: false,
  joinsCachedHistory: false,
  makeReducer: () => new OpenCodeTranscriptReducer(),
  // The text as the program records it, which drops what Agentico adds when it sends.
  echoKey: (text) => text.trim(),
  identity: null,
  pendingBase: NO_BASE,
  supplyBase: NO_SUPPLY,
  makeRecordSource: (sessionID) => {
    const id = openCodeSessionID(sessionID);
    return id === null ? null : new OpenCodeRecordSource(id);
  },
};

export function openCodeAdapter(): ChatTranscriptAdapter | null {
  return openCodeAdapterValue;
}
