import type { LocateState, Location } from '../engine/locate';
import type { ChatUnavailableReason } from '../timeline/reasons';
import { ClaudeTranscriptLocator } from './locator';

export async function locateClaudeTranscript(state: LocateState): Promise<Location> {
  const { reference } = state;
  let remembered = state.newConversationActivity;
  const unavailable = (reason: ChatUnavailableReason): Location => ({
    type: 'unavailable',
    reason,
    newConversationActivity: remembered,
  });
  const candidates = [...state.directories];
  if (state.relocatedDirectory !== null) {
    const at = candidates.indexOf(state.relocatedDirectory);
    if (at >= 0) candidates.splice(at, 1);
    candidates.unshift(state.relocatedDirectory);
  }
  const isNew = !state.lostAMessage && state.awaitingFirstMessage;
  const searchesEveryProject = !isNew || state.activity !== remembered;
  // Once per activity, so a search that fails is not repeated every pass.
  if (isNew && searchesEveryProject) remembered = state.activity;
  const result = await new ClaudeTranscriptLocator(state.files).locate({
    sessionID: reference.sessionID,
    directories: candidates,
    searchesEveryProject,
    accountDirectories: state.accountDirectories,
  });
  if (result.ok) {
    return {
      type: 'found',
      path: result.location.transcriptPath,
      segments: [],
      newConversationActivity: remembered,
    };
  }
  const why = result.reason;
  if (why.type === 'notFound') {
    return unavailable(
      searchesEveryProject
        ? { kind: 'notFound', searchedAll: why.searchedAll }
        : { kind: 'awaitingFirstMessage', program: 'claude' },
    );
  }
  if (why.type === 'mismatched') return unavailable({ kind: 'mismatched' });
  // notWritten: a file shown before, or saved on the device, that is gone is not a new conversation.
  if (state.hasHistory || state.lostAMessage) {
    return unavailable({ kind: 'notFound', searchedAll: true });
  }
  remembered = state.activity;
  return unavailable({ kind: 'awaitingFirstMessage', program: 'claude' });
}
