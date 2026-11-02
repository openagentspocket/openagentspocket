// Ported from Swift ChatConversationStatus behavior (titles, retry, banner lines, surface).

import { describe, expect, it } from 'vitest';
import type { TransportError } from '../../errors';
import { renderText } from '../../errors/text';
import type { EventsSessionStatus } from '../../events/types';
import {
  bannerIcon,
  bannerId,
  bannerLines,
  bannerShowsProgress,
  bannerText,
  type ChatBannerLine,
  type ChatConversationFacts,
  surfacePresentation,
} from './banners';
import type { ChatUnavailableReason } from './reasons';
import { reasonExplanation, reasonIcon, reasonOffersRetry, reasonTitle } from './status';

const facts = (
  phase: ChatConversationFacts['phase'],
  extra: Partial<ChatConversationFacts> = {},
): ChatConversationFacts => ({
  phase,
  transcript: { entries: [] },
  isFromCache: false,
  readFailure: null,
  ...extra,
});
const unavailable = (reason: ChatUnavailableReason) => ({ kind: 'unavailable', reason }) as const;
const saved = { entries: [{}] };
const connected: EventsSessionStatus = { kind: 'connected' };
const codexWait: ChatUnavailableReason = { kind: 'noSession', program: 'codex' };
const following = { kind: 'following', path: 'p' } as const;

describe('reasons', () => {
  it('titles each reason and swaps in the launch notice only for a waiting Codex', () => {
    expect(reasonTitle(codexWait)).toEqual({ key: 'Waiting for Conversation' });
    expect(reasonTitle(codexWait, 'codexSharedServer').key).toBe('Codex Started Without %@');
    expect(reasonExplanation(codexWait, 'codexSharedServer').key).toBe(
      'Exit Codex, then run codex %@ resume.',
    );
    const claude: ChatUnavailableReason = { kind: 'noSession', program: 'claude' };
    expect(reasonTitle(claude, 'codexSharedServer')).toEqual({ key: 'Waiting for Conversation' });
    expect(reasonIcon(codexWait, 'codexSharedServer')).toBe('alertBubble');
    expect(reasonIcon(codexWait)).toBe('conversation');
  });

  it('treats a missing session store like a missing transcript', () => {
    const missing: ChatUnavailableReason = {
      kind: 'sessionStore',
      program: 'opencode',
      problem: { kind: 'sessionMissing', otherStores: [] },
    };
    expect(reasonTitle(missing)).toEqual({ key: 'Conversation Not Found' });
    expect(reasonIcon(missing)).toBe('notFound');
    expect(reasonOffersRetry(missing)).toBe(true);
    const old: ChatUnavailableReason = {
      kind: 'sessionStore',
      program: 'opencode',
      problem: { kind: 'olderOpenCode' },
    };
    expect(reasonTitle(old)).toEqual({ key: 'Conversation Not Readable' });
    expect(reasonOffersRetry(old)).toBe(false);
  });

  it('words the first-message wait by program', () => {
    const text = (program: 'claude' | 'pi') =>
      renderText(reasonExplanation({ kind: 'awaitingFirstMessage', program }));
    expect(text('pi')).toBe(
      'Pi saves this conversation after its first reply. Send a message to start it.',
    );
    expect(text('claude')).toBe(
      'Claude Code saves this conversation once it has a first message. Send a message to start it.',
    );
  });

  it('offers retry only where looking again can help', () => {
    expect(reasonOffersRetry({ kind: 'mismatched' })).toBe(true);
    expect(reasonOffersRetry({ kind: 'startScreen', program: 'opencode' })).toBe(true);
    expect(reasonOffersRetry({ kind: 'compressed' })).toBe(false);
    expect(reasonOffersRetry({ kind: 'unsupportedFormat', format: 'x' })).toBe(false);
  });
});

describe('surfacePresentation', () => {
  const base = { hasPendingEchoes: false, isHostConnected: true };
  const kindOf = (input: Parameters<typeof surfacePresentation>[0]) =>
    surfacePresentation(input).kind;

  it('is disconnected without a conversation', () => {
    expect(kindOf({ ...base, conversation: null })).toBe('disconnected');
  });

  it('shows the timeline over saved entries or pending echoes, unless the reason hides them', () => {
    expect(kindOf({ ...base, conversation: facts(following, { transcript: saved }) })).toBe(
      'timeline',
    );
    expect(kindOf({ ...base, hasPendingEchoes: true, conversation: facts(following) })).toBe(
      'timeline',
    );
    const start = facts(unavailable({ kind: 'startScreen', program: 'opencode' }), {
      transcript: saved,
    });
    expect(kindOf({ ...base, conversation: start })).toBe('unavailable');
  });

  it('locates, waits for the Host, or is empty', () => {
    const locating = facts({ kind: 'locating' });
    expect(kindOf({ ...base, conversation: locating })).toBe('locating');
    expect(kindOf({ ...base, isHostConnected: false, conversation: locating })).toBe(
      'awaitingHost',
    );
    expect(kindOf({ ...base, conversation: facts(following) })).toBe('empty');
  });

  it('keeps looking while the launch is read for a wait it may explain', () => {
    const conversation = facts(unavailable(codexWait));
    const checking = { ...base, checkingLaunch: true };
    expect(kindOf({ ...checking, conversation })).toBe('locating');
    expect(kindOf({ ...checking, isHostConnected: false, conversation })).toBe('unavailable');
    const claude = facts(unavailable({ kind: 'noSession', program: 'claude' }));
    expect(kindOf({ ...checking, conversation: claude })).toBe('unavailable');
  });
});

describe('bannerLines', () => {
  const input = { hasPendingEchoes: false };
  const line = (lines: ChatBannerLine[], index: number): ChatBannerLine => {
    const found = lines[index];
    if (!found) throw new Error(`no banner line ${index}`);
    return found;
  };

  it('reports the Host first, saying saved messages show', () => {
    const conversation = facts({ kind: 'locating' }, { transcript: saved });
    const lines = bannerLines({ ...input, hostStatus: { kind: 'connecting' }, conversation });
    expect(lines).toEqual([{ kind: 'connecting', showingSavedMessages: true }]);
    expect(bannerShowsProgress(line(lines, 0))).toBe(true);
    expect(bannerLines({ ...input, hostStatus: null, conversation: null })).toEqual([
      { kind: 'notConnected', showingSavedMessages: false },
    ]);
    const suspended = bannerLines({ ...input, hostStatus: { kind: 'suspended' }, conversation });
    expect(suspended[0]?.kind).toBe('notConnected');
  });

  it('adds a read failure and the unavailable reason over a timeline', () => {
    const failure: TransportError = { kind: 'channelFailed', detail: 'x' };
    const conversation = facts(unavailable({ kind: 'compressed' }), {
      transcript: saved,
      readFailure: failure,
    });
    const lines = bannerLines({ ...input, hostStatus: connected, conversation });
    expect(lines.map(bannerId)).toEqual(['read', 'unavailable']);
    expect(renderText(bannerText(line(lines, 1)))).toBe(
      "Chat can't read this transcript now. Showing saved messages.",
    );
    expect(bannerIcon(line(lines, 0))).toBe('warning');
    // Without a timeline the placeholder explains the reason, so no banner repeats it.
    const bare = facts(unavailable({ kind: 'compressed' }));
    expect(bannerLines({ ...input, hostStatus: connected, conversation: bare })).toEqual([]);
  });

  it('shows the launch notice over a conversation or its search, not over a placeholder', () => {
    const launchNotice = 'codexSharedServer' as const;
    const base = { ...input, hostStatus: connected, launchNotice };
    expect(bannerLines({ ...base, conversation: facts(following) })).toEqual([
      { kind: 'launch', notice: launchNotice },
    ]);
    expect(bannerLines({ ...base, conversation: facts(unavailable(codexWait)) })).toEqual([]);
    const over = facts(unavailable(codexWait), { transcript: saved });
    expect(bannerLines({ ...base, conversation: over }).map(bannerId)).toEqual([
      'unavailable',
      'launch',
    ]);
  });
});
