// Finds the opencode conversation's transcript (the `locate` step for this program). Filled in by P2.10.

import type { LocateState, Location } from '../engine/locate';

export async function locateOpenCodeTranscript(_state: LocateState): Promise<Location> {
  return {
    type: 'unavailable',
    reason: { kind: 'unsupportedSession' },
    newConversationActivity: null,
  };
}
