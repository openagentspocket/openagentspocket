// What takes the conversation's place and the lines over it (Swift ChatSurfacePresentation,
// ChatBannerLine, showsTimeline). Wording is returned as catalog messages for the UI to translate.

import { explanation, presentation, type TransportError } from '../../errors';
import { type Message, message } from '../../errors/text';
import type { EventsSessionStatus } from '../../events/types';
import { type ChatLaunchNotice, type ChatUnavailableReason, hidesConversation } from './reasons';
import {
  type ChatStatusIcon,
  launchNoticeFor,
  reasonBannerText,
  reasonIcon,
  reasonIsWaiting,
} from './status';

const m = (key: string, ...args: string[]): Message => message(key, ...args);

/** What the status reads of the conversation engine's snapshot (the engine's type satisfies it). */
export interface ChatConversationFacts {
  phase:
    | { kind: 'locating' }
    | { kind: 'following'; path: string }
    | { kind: 'unavailable'; reason: ChatUnavailableReason };
  transcript: { readonly entries: readonly unknown[] };
  isFromCache: boolean;
  readFailure: TransportError | null;
}

/**
 * Whether the timeline is up rather than a placeholder: it has entries, or messages sent from this
 * device the program hasn't recorded yet, and no reason hides them.
 */
export function showsTimeline(
  conversation: ChatConversationFacts,
  hasPendingEchoes: boolean,
): boolean {
  if (conversation.phase.kind === 'unavailable' && hidesConversation(conversation.phase.reason)) {
    return false;
  }
  return conversation.transcript.entries.length > 0 || hasPendingEchoes;
}

/** What takes the conversation's place, if anything, under the banners. */
export type ChatSurfacePresentation =
  | { kind: 'timeline' }
  /** Searching the Host for the transcript, with nothing saved to show. */
  | { kind: 'locating' }
  /** Nothing saved to show, and the Host to search isn't connected. */
  | { kind: 'awaitingHost' }
  | { kind: 'empty' }
  | { kind: 'unavailable'; reason: ChatUnavailableReason }
  /** The Host is not in the catalog, so there is no Chat to read. */
  | { kind: 'disconnected' };

/**
 * `conversation` is null while there is no Chat to read. `checkingLaunch` keeps a wait the launch
 * may explain looking until the launch is read.
 */
export function surfacePresentation(input: {
  conversation: ChatConversationFacts | null;
  hasPendingEchoes: boolean;
  isHostConnected: boolean;
  checkingLaunch?: boolean;
}): ChatSurfacePresentation {
  const { conversation, hasPendingEchoes, isHostConnected, checkingLaunch = false } = input;
  if (conversation === null) return { kind: 'disconnected' };
  if (showsTimeline(conversation, hasPendingEchoes)) return { kind: 'timeline' };
  const phase = conversation.phase;
  switch (phase.kind) {
    case 'locating':
      return { kind: isHostConnected ? 'locating' : 'awaitingHost' };
    case 'following':
      return { kind: 'empty' };
    case 'unavailable': {
      const mayBeNotice = launchNoticeFor(phase.reason, 'codexSharedServer') !== null;
      return checkingLaunch && mayBeNotice && isHostConnected
        ? { kind: 'locating' }
        : { kind: 'unavailable', reason: phase.reason };
    }
  }
}

/** One line over Chat's conversation, before the view adds its action. */
export type ChatBannerLine =
  | { kind: 'connecting'; showingSavedMessages: boolean }
  | { kind: 'notConnected'; showingSavedMessages: boolean }
  | { kind: 'readFailure'; failure: TransportError }
  | { kind: 'unavailable'; reason: ChatUnavailableReason; showingSavedMessages: boolean }
  | { kind: 'launch'; notice: ChatLaunchNotice };

/** Lines of one kind replace each other: `host`, `read`, `unavailable`, `launch`. */
export function bannerId(line: ChatBannerLine): string {
  switch (line.kind) {
    case 'connecting':
    case 'notConnected':
      return 'host';
    case 'readFailure':
      return 'read';
    default:
      return line.kind;
  }
}

/**
 * The lines over the conversation, top to bottom. Saved messages are transcript entries this device
 * kept; messages sent from it and not yet recorded are not.
 */
export function bannerLines(input: {
  hostStatus: EventsSessionStatus | null | undefined;
  conversation: ChatConversationFacts | null;
  hasPendingEchoes: boolean;
  launchNotice?: ChatLaunchNotice | null;
}): ChatBannerLine[] {
  const { hostStatus, conversation, hasPendingEchoes, launchNotice = null } = input;
  const showingSaved = (conversation?.transcript.entries.length ?? 0) > 0;
  switch (hostStatus?.kind) {
    case 'connected':
      break;
    case 'connecting':
    case 'reconnecting':
      return [{ kind: 'connecting', showingSavedMessages: showingSaved }];
    default:
      return [{ kind: 'notConnected', showingSavedMessages: showingSaved }];
  }
  if (conversation === null) return [];
  const lines: ChatBannerLine[] = [];
  if (conversation.readFailure)
    lines.push({ kind: 'readFailure', failure: conversation.readFailure });
  const timeline = showsTimeline(conversation, hasPendingEchoes);
  if (conversation.phase.kind === 'unavailable' && timeline) {
    lines.push({
      kind: 'unavailable',
      reason: conversation.phase.reason,
      showingSavedMessages: conversation.transcript.entries.length > 0,
    });
  }
  // Over a conversation, or the search for one. A placeholder saying why there is none shows no
  // conversation to warn about, and Waiting for Conversation explains the notice itself.
  if (launchNotice !== null) {
    if (conversation.phase.kind !== 'unavailable' || timeline) {
      lines.push({ kind: 'launch', notice: launchNotice });
    }
  }
  return lines;
}

export function bannerText(line: ChatBannerLine): Message {
  switch (line.kind) {
    // A Host that accepts the connection and never answers keeps this line up, so it says the rows
    // below are the saved ones.
    case 'connecting':
      return line.showingSavedMessages
        ? m('Connecting to the Host… Showing saved messages.')
        : m('Connecting to the Host…');
    case 'notConnected':
      return line.showingSavedMessages
        ? m('Not connected. Showing saved messages.')
        : m('Not connected.');
    case 'readFailure':
      return m("Couldn't read the conversation. %@", explanation(presentation(line.failure)));
    case 'unavailable':
      return reasonBannerText(line.reason, line.showingSavedMessages);
    case 'launch':
      return m("This may be another terminal's conversation.");
  }
}

export function bannerIcon(line: ChatBannerLine): ChatStatusIcon {
  switch (line.kind) {
    case 'connecting':
      return 'wifi';
    case 'notConnected':
      return 'wifiOff';
    case 'readFailure':
      return 'warning';
    case 'unavailable':
      return reasonIcon(line.reason);
    case 'launch':
      return 'alertBubble';
  }
}

export function bannerShowsProgress(line: ChatBannerLine): boolean {
  switch (line.kind) {
    case 'connecting':
      return true;
    case 'unavailable':
      return reasonIsWaiting(line.reason);
    default:
      return false;
  }
}
