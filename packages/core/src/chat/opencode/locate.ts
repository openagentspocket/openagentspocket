// OpenCode has no transcript file to find: its adapter makes a record source that reads the session
// store by query (ADR 0025), so the engine never asks for a location. Kept so the engine's locate
// dispatch stays total.

import type { LocateState, Location } from '../engine/locate';

export async function locateOpenCodeTranscript(_state: LocateState): Promise<Location> {
  return {
    type: 'unavailable',
    reason: { kind: 'unsupportedSession' },
    newConversationActivity: null,
  };
}
