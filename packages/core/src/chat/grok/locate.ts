// Finds the Grok Build conversation's transcript (the `locate` step for this program).

import type { LocateState, Location } from '../engine/locate';
import { GrokTranscriptLocator } from './locator';

export async function locateGrokTranscript(state: LocateState): Promise<Location> {
  const result = await new GrokTranscriptLocator(state.files).locate(
    state.reference.sessionID,
    state.directories,
  );
  if (result.ok) {
    return {
      type: 'found',
      path: result.path,
      segments: [],
      newConversationActivity: state.newConversationActivity,
    };
  }
  return {
    type: 'unavailable',
    reason:
      result.reason.type === 'mismatched'
        ? { kind: 'mismatched' }
        : { kind: 'notFound', searchedAll: result.reason.searchedAll },
    newConversationActivity: state.newConversationActivity,
  };
}
