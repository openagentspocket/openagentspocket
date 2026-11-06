// How Chat reads OpenCode (Swift ChatTranscriptAdapter.openCode, ADR 0025): its conversations are
// read by query from its session store. A committed `/undo` deletes rows at or above its boundary,
// which is why a store's saved prefix never joins the cache.

import type { ChatTranscriptAdapter } from '../engine/adapter';
import { storeAdapter } from '../store/adapter';
import { openCodeStore } from './probe';
import { OPENCODE_REVISION, OpenCodeTranscriptReducer } from './reducer';
import { openCodeSessionID } from './session-id';

const openCodeAdapterValue = storeAdapter({
  store: openCodeStore,
  revision: OPENCODE_REVISION,
  makeReducer: () => new OpenCodeTranscriptReducer(),
  sessionID: openCodeSessionID,
});

export function openCodeAdapter(): ChatTranscriptAdapter | null {
  return openCodeAdapterValue;
}
