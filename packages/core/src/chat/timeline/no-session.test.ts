import '../programs';
import { describe, expect, it } from 'vitest';
import type { ComposerMessage } from '../../composer/progress';
import { CODEX_HOOK_REVIEW } from '../codex/terminal-waits';
import { noSessionNotice, promptTaken } from './no-session';
import { reasonExplanation } from './status';

const sent = (progress: 'acknowledged' | 'agentBusy' | 'working' | 'done'): ComposerMessage => ({
  id: progress,
  text: 'hi',
  route: 'chat',
  state: { kind: 'delivered', progress },
});

describe('what Chat says while herdr reports no session', () => {
  const codex = { kind: 'noSession', program: 'codex' } as const;

  it('keeps the plain wait until it can tell more', () => {
    expect(noSessionNotice(codex, { terminalWait: null, promptTaken: false })).toBeNull();
  });

  it('names a wait the terminal answers, before anything else', () => {
    const notice = noSessionNotice(codex, { terminalWait: CODEX_HOOK_REVIEW, promptTaken: true });
    expect(notice?.kind).toBe('terminalWait');
    expect(notice?.title).toEqual(CODEX_HOOK_REVIEW.title());
    expect(notice?.explanation).toEqual(CODEX_HOOK_REVIEW.explanation());
  });

  it('after a prompt the Agent took, says the integration is not reporting, not to send one', () => {
    const notice = noSessionNotice(codex, { terminalWait: null, promptTaken: true });
    expect(notice?.kind).toBe('notReporting');
    expect(notice?.explanation).not.toEqual(reasonExplanation(codex));
    const opencode = noSessionNotice(
      { kind: 'noSession', program: 'opencode' },
      { terminalWait: null, promptTaken: true },
    );
    expect(opencode?.kind).toBe('notReporting');
    expect(opencode?.explanation).not.toEqual(notice?.explanation);
  });

  it('counts a prompt as taken once the Agent worked on it', () => {
    expect(promptTaken([sent('acknowledged'), sent('agentBusy')])).toBe(false);
    expect(promptTaken([sent('working')])).toBe(true);
    expect(promptTaken([sent('done')])).toBe(true);
    expect(promptTaken([{ id: 'x', text: 'x', route: 'chat', state: { kind: 'sending' } }])).toBe(
      false,
    );
  });

  it('says nothing more for another reason', () => {
    const facts = { terminalWait: CODEX_HOOK_REVIEW, promptTaken: true };
    expect(noSessionNotice({ kind: 'compressed' }, facts)).toBeNull();
  });
});
