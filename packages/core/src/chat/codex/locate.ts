import type { LocateState, Location } from '../engine/locate';
import type { ChatUnavailableReason } from '../timeline/reasons';
import { CodexTranscriptLocator, liveSegment } from './locator';

export async function locateCodexTranscript(state: LocateState): Promise<Location> {
  const { reference } = state;
  const remembered = state.newConversationActivity;
  const unavailable = (reason: ChatUnavailableReason): Location => ({
    type: 'unavailable',
    reason,
    newConversationActivity: remembered,
  });
  const result = await new CodexTranscriptLocator(state.files, state.now).locate(
    reference.sessionID,
  );
  if (!result.ok) {
    return unavailable(
      result.reason === 'notFound'
        ? { kind: 'notFound', searchedAll: true }
        : { kind: result.reason },
    );
  }
  const live = liveSegment(result.location);
  if (!live) return unavailable({ kind: 'notFound', searchedAll: true });
  return {
    type: 'found',
    path: live.path,
    segments: result.location.segments,
    newConversationActivity: remembered,
  };
}
