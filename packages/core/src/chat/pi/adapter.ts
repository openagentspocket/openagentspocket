// How Chat reads Pi and Oh My Pi (Swift ChatTranscriptAdapter.standard for .pi and .omp): Oh My Pi
// rewrites its title slot in place and its whole file atomically, header included, keeping every
// entry's id, so the conversation is named by the header's session id and a cached prefix never
// joins live records across a branch switch.

import type { ChatTranscriptAdapter } from '../engine/adapter';
import { piSessionIDInHead } from './locator';
import { PI_REVISION, PiTranscriptReducer } from './reducer';

export function piAdapter(program: 'pi' | 'omp'): ChatTranscriptAdapter {
  return {
    program,
    revision: PI_REVISION,
    limits: {},
    wantsFirstLine: true,
    joinsCachedHistory: false,
    makeReducer: (seed) => {
      const reducer = new PiTranscriptReducer(program);
      if (seed.firstLine) reducer.append([seed.firstLine]);
      return reducer;
    },
    echoKey: (text) => text.trim(),
    identity: piSessionIDInHead,
    pendingBase: () => null,
    supplyBase: () => undefined,
  };
}
