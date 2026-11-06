// How Chat reads a program whose conversations live in its own store (Swift
// ChatTranscriptAdapter.openCode, ADR 0025). Rows keep their place when the program rewrites them,
// and a saved prefix may hold rows the store no longer has, so older pages, cheap point queries, are
// read instead of joining the cache.

import type { ChatTranscriptAdapter } from '../engine/adapter';
import type { ChatTranscriptReducer } from '../model/reducer';
import type { ChatStore } from './query';
import { StoreRecordSource } from './record-source';

const NO_BASE = () => null;
const NO_SUPPLY = () => undefined;

export function storeAdapter({
  store,
  revision,
  makeReducer,
  sessionID,
}: {
  store: ChatStore;
  revision: number;
  makeReducer: () => ChatTranscriptReducer;
  sessionID: (value: string) => string | null;
}): ChatTranscriptAdapter {
  return {
    program: store.program,
    revision,
    limits: {},
    wantsFirstLine: false,
    joinsCachedHistory: false,
    makeReducer,
    // The text as the program records it, which drops what Agentico adds when it sends.
    echoKey: (text) => text.trim(),
    identity: null,
    pendingBase: NO_BASE,
    supplyBase: NO_SUPPLY,
    makeRecordSource: (value) => {
      const id = sessionID(value);
      return id === null ? null : new StoreRecordSource(store, id);
    },
  };
}
