// Finds the Pi or Oh My Pi conversation's session file (the `locate` step for these programs).

import type { LocateState, Location } from '../engine/locate';
import { PiTranscriptLocator } from './locator';

export async function locatePiTranscript(state: LocateState): Promise<Location> {
  const { reference } = state;
  const unavailable = (reason: Extract<Location, { type: 'unavailable' }>['reason']): Location => ({
    type: 'unavailable',
    reason,
    newConversationActivity: state.newConversationActivity,
  });
  const result = await new PiTranscriptLocator(state.files).locate(reference, state.directories);
  if (result.ok) {
    return {
      type: 'found',
      path: result.path,
      segments: [],
      newConversationActivity: state.newConversationActivity,
    };
  }
  const why = result.reason;
  switch (why.type) {
    case 'notFound':
      return unavailable({ kind: 'notFound', searchedAll: why.searchedAll });
    case 'notWritten':
      // A file shown before, or saved on the device, that is gone now is not a conversation still to start.
      return unavailable(
        state.hasHistory
          ? { kind: 'notFound', searchedAll: true }
          : { kind: 'awaitingFirstMessage', program: reference.program },
      );
    case 'mismatched':
      return unavailable({ kind: 'mismatched' });
    case 'unsupportedVersion': {
      const name = reference.program === 'omp' ? 'Oh My Pi' : 'Pi';
      return unavailable({
        kind: 'unsupportedFormat',
        format: `${name} session version ${why.version}`,
      });
    }
  }
}
