// How Chat reads Grok Build's `updates.jsonl` (Swift ChatTranscriptAdapter.grok). A `rewind_marker`
// in the tail can hide turns above it, so cached entries never join live ones, as for Pi. One
// turn's `read_file` results can fill tens of MB, so the timeline reads at most 4 MiB of earlier
// history by itself.

import type { ChatTranscriptAdapter } from '../engine/adapter';
import { GROK_REVISION, GrokTranscriptReducer, grokEchoKey } from './reducer';

export function grokAdapter(): ChatTranscriptAdapter {
  return {
    program: 'grok',
    revision: GROK_REVISION,
    limits: { automaticOlderSearch: 4 << 20 },
    wantsFirstLine: false,
    joinsCachedHistory: false,
    makeReducer: (seed) => new GrokTranscriptReducer(seed.path),
    echoKey: grokEchoKey,
    identity: null,
    pendingBase: () => null,
    supplyBase: () => undefined,
  };
}
