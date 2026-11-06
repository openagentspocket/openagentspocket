// How Chat reads Hermes Agent: by query from its session store (ADR 0025).

import type { ChatTranscriptAdapter } from '../engine/adapter';
import { hermesID } from '../model/session-ids';
import { storeAdapter } from '../store/adapter';
import { HERMES_REVISION, HermesTranscriptReducer } from './reducer';
import { hermesStore } from './store';

const hermesAdapterValue = storeAdapter({
  store: hermesStore,
  revision: HERMES_REVISION,
  makeReducer: () => new HermesTranscriptReducer(),
  sessionID: hermesID,
});

export function hermesAdapter(): ChatTranscriptAdapter | null {
  return hermesAdapterValue;
}
