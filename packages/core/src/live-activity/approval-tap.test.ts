import { describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../hosts/known-hosts';
import { ApprovalLedger, StoredApprovalOptIns } from '../notifications/approval-action';
import type { ApprovalAskReading } from '../notifications/approval-script';
import { MemoryNotificationKeyStore } from '../notifications/key-store';
import {
  type ActivityLink,
  type ActivityTap,
  type ActivityTapGates,
  ActivityTapRunner,
  activityResultOf,
  markActivityResult,
  reviewActivityLink,
  runActivityTap,
} from './approval-tap';
import { sealContent } from './content';
import { openActivity } from './envelope';
import { FakeLiveActivityController } from './fake-controller';
import type { ActivityAsk, ActivityDesire } from './types';

const NOW = 1_000_000;
const PANE = 'w1:p1';
const BID = 'abcdefghijk';
const KEY = new Uint8Array(32).fill(7);
const ASK: ActivityAsk = {
  episodeId: BID,
  denyOnly: false,
  prompt: 'Run ls?',
  options: ['Yes', "Yes, and don't ask again", 'No'],
  timestamp: NOW - 10,
};
const LINK: ActivityLink = { hostId: 'h1', paneId: PANE, episodeId: BID };
const APPROVE: ActivityTap = { ...LINK, decision: 'approve', shown: ASK };
const DENY: ActivityTap = { ...APPROVE, decision: 'deny' };

const reading = (ask: ActivityAsk = ASK, unread: string[] = []): ApprovalAskReading => ({
  kind: 'read',
  asks: new Map([[PANE, ask]]),
  unread,
});

function gates(overrides: Partial<ActivityTapGates> = {}) {
  const storage = new MemoryStorage();
  const optIns = new StoredApprovalOptIns(storage);
  optIns.setEnabled(true, 'h1');
  const apply = vi.fn(async (): Promise<string> => 'sent');
  const authenticate = vi.fn(async () => true);
  const readAsks = vi.fn(async (): Promise<ApprovalAskReading> => reading());
  const all: ActivityTapGates = {
    isActivityOn: () => true,
    optIns,
    ledger: new ApprovalLedger(storage),
    nowSeconds: () => NOW,
    readAsks,
    authenticate,
    apply,
    ...overrides,
  };
  return { all, apply, authenticate, readAsks };
}

describe('runActivityTap', () => {
  it('presses the one-time Yes of the prompt the Host reports, after the owner confirmed', async () => {
    const { all, apply, authenticate } = gates();
    expect(await runActivityTap(APPROVE, all)).toBe('answered');
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith('h1', {
      pane: PANE,
      episodeId: BID,
      timestamp: ASK.timestamp,
      decision: 'approve',
      prompt: 'Run ls?',
      label: 'Yes',
      option: 1,
    });
  });

  it('Deny presses No and asks the owner nothing, like the notification', async () => {
    const { all, apply, authenticate } = gates();
    expect(await runActivityTap(DENY, all)).toBe('answered');
    expect(authenticate).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalledWith('h1', expect.objectContaining({ label: 'No', option: 3 }));
  });

  it('an owner who does not confirm sends nothing and leaves the episode unspent', async () => {
    const { all, apply, authenticate } = gates();
    authenticate.mockResolvedValueOnce(false);
    expect(await runActivityTap(APPROVE, all)).toBe('notAuthenticated');
    expect(apply).not.toHaveBeenCalled();
    expect(await runActivityTap(APPROVE, all)).toBe('answered');
  });

  it('an authenticator that throws counts as not confirmed', async () => {
    const { all, apply, authenticate } = gates();
    authenticate.mockRejectedValueOnce(new Error('no'));
    expect(await runActivityTap(APPROVE, all)).toBe('notAuthenticated');
    expect(apply).not.toHaveBeenCalled();
  });

  it('a tap answers once: the ledger spends the episode', async () => {
    const { all, apply } = gates();
    await runActivityTap(APPROVE, all);
    expect(await runActivityTap(DENY, all)).toBe('ignored');
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a pane the Host does not report', { ...APPROVE, paneId: 'w1:p9' }],
    ['another episode', { ...APPROVE, episodeId: 'zzzzzzzzzzz' }],
  ])('a forged link naming %s sends nothing', async (_name, tap) => {
    const { all, apply, authenticate } = gates();
    expect(await runActivityTap(tap, all)).toBe('promptChanged');
    expect(authenticate).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it('nothing in the link reaches the Host but what the Host itself reported', async () => {
    const { all, apply } = gates();
    await runActivityTap({ ...DENY, ...{ prompt: 'forged', option: 1 } }, all);
    expect(apply).toHaveBeenCalledWith(
      'h1',
      expect.objectContaining({ prompt: 'Run ls?', option: 3 }),
    );
  });

  it('a prompt that is not the one on the sheet sends nothing', async () => {
    const { all, apply, authenticate } = gates({
      readAsks: async () => reading({ ...ASK, prompt: 'Run rm?' }),
    });
    expect(await runActivityTap(APPROVE, all)).toBe('promptChanged');
    const labels = { ...APPROVE, shown: { ...ASK, options: ['Yes', 'No'] } };
    expect(await runActivityTap(labels, gates().all)).toBe('promptChanged');
    expect(authenticate).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it('holds to the Host opt-ins', async () => {
    const off = gates({ isActivityOn: () => false });
    expect(await runActivityTap(APPROVE, off.all)).toBe('optedOut');
    expect(off.readAsks).not.toHaveBeenCalled();
    const optedOut = gates();
    optedOut.all.optIns.setEnabled(false, 'h1');
    expect(await runActivityTap(APPROVE, optedOut.all)).toBe('optedOut');
    expect(optedOut.apply).not.toHaveBeenCalled();
  });

  it('holds to the time to live', async () => {
    const { all, apply } = gates({ nowSeconds: () => NOW + 31 * 60 });
    expect(await runActivityTap(DENY, all)).toBe('expired');
    expect(apply).not.toHaveBeenCalled();
  });

  it('never approves a Deny only prompt, and asks no owner for it', async () => {
    const { all, apply, authenticate } = gates({
      readAsks: async () => reading({ ...ASK, denyOnly: true }),
    });
    expect(await runActivityTap(APPROVE, all)).toBe('denyOnly');
    expect(authenticate).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it('never approves a cut prompt', async () => {
    const { all, apply } = gates({
      readAsks: async () => reading({ ...ASK, prompt: 'x'.repeat(121) }),
    });
    const shown = { ...ASK, prompt: 'x'.repeat(121) };
    expect(await runActivityTap({ ...APPROVE, shown }, all)).toBe('promptCut');
    expect(apply).not.toHaveBeenCalled();
  });

  it('a Host it cannot read sends nothing and leaves the episode unspent', async () => {
    const { all, apply, readAsks } = gates();
    readAsks.mockRejectedValueOnce(new Error('offline'));
    expect(await runActivityTap(DENY, all)).toBe('unreachable');
    expect(apply).not.toHaveBeenCalled();
    expect(await runActivityTap(DENY, all)).toBe('answered');
  });

  it('a pane the Host could not read is unreachable, not a changed prompt', async () => {
    const { all, apply, readAsks } = gates();
    readAsks.mockResolvedValueOnce({ kind: 'read', asks: new Map(), unread: [PANE] });
    expect(await runActivityTap(DENY, all)).toBe('unreachable');
    expect(apply).not.toHaveBeenCalled();
    expect(await runActivityTap(DENY, all)).toBe('answered');
  });

  it('a plugin that cannot answer asks for an update, not a changed prompt', async () => {
    const { all, apply, readAsks } = gates();
    readAsks.mockResolvedValueOnce({ kind: 'pluginUnavailable' });
    expect(await runActivityTap(DENY, all)).toBe('pluginOutdated');
    expect(apply).not.toHaveBeenCalled();
  });

  it('an apply that never reached the Host keeps the buttons working', async () => {
    const { all, apply } = gates();
    apply.mockRejectedValueOnce(new Error('offline'));
    expect(activityResultOf(await runActivityTap(DENY, all))).toBe('unreachable');
    expect(activityResultOf(await runActivityTap(DENY, all))).toBe('sent');
  });

  it('a timed out apply can be tapped again and never reads as answered', async () => {
    const { all, apply } = gates();
    apply.mockResolvedValueOnce('too_slow').mockResolvedValueOnce('claimed');
    expect(activityResultOf(await runActivityTap(DENY, all))).toBe('timed_out');
    expect(activityResultOf(await runActivityTap(DENY, all))).toBe('prompt_changed');
  });

  it('an apply that may have sent the key keeps the episode spent', async () => {
    const { all, apply } = gates();
    apply.mockResolvedValueOnce('failed');
    expect(activityResultOf(await runActivityTap(DENY, all))).toBe('may_have_sent');
    await runActivityTap(DENY, all);
    expect(apply).toHaveBeenCalledTimes(1);
  });
});

describe('reviewActivityLink', () => {
  it('gives the prompt and the options the Host reports, and answers nothing', async () => {
    const { all, apply, authenticate, readAsks } = gates();
    expect(await reviewActivityLink(LINK, all)).toEqual({
      kind: 'ask',
      ask: ASK,
      approve: 'Yes',
      deny: 'No',
      approveRefusal: null,
    });
    expect(readAsks).toHaveBeenCalledWith('h1');
    expect(authenticate).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    expect(all.ledger.isSpent('h1', BID, NOW)).toBe(false);
  });

  it.each([
    ['a Deny only prompt', { denyOnly: true }, 'denyOnly'],
    ['a cut prompt', { prompt: 'x'.repeat(121) }, 'promptCut'],
  ])('offers only Deny for %s', async (_name, change, approveRefusal) => {
    const { all } = gates({ readAsks: async () => reading({ ...ASK, ...change }) });
    expect(await reviewActivityLink(LINK, all)).toMatchObject({
      kind: 'ask',
      approve: null,
      deny: 'No',
      approveRefusal,
    });
  });

  it.each([
    ['an unknown pane', { ...LINK, paneId: 'w1:p9' }],
    ['a stale episode', { ...LINK, episodeId: 'zzzzzzzzzzz' }],
  ])('%s has nothing to answer', async (_name, link) => {
    const { all } = gates();
    expect(await reviewActivityLink(link, all)).toEqual({
      kind: 'nothing',
      outcome: 'promptChanged',
    });
  });

  it('an episode already spent here has nothing to answer', async () => {
    const { all } = gates();
    all.ledger.claim('h1', BID, NOW);
    expect(await reviewActivityLink(LINK, all)).toEqual({ kind: 'nothing', outcome: 'ignored' });
  });

  it('a prompt past its time to live has nothing to answer', async () => {
    const { all } = gates({ nowSeconds: () => NOW + 31 * 60 });
    expect(await reviewActivityLink(LINK, all)).toEqual({ kind: 'nothing', outcome: 'expired' });
  });

  it('keeps the reasons a read failed apart from a prompt that went away', async () => {
    const { all, readAsks } = gates();
    readAsks.mockRejectedValueOnce(new Error('offline'));
    expect(await reviewActivityLink(LINK, all)).toMatchObject({ outcome: 'unreachable' });
    readAsks.mockResolvedValueOnce({ kind: 'read', asks: new Map(), unread: [PANE] });
    expect(await reviewActivityLink(LINK, all)).toMatchObject({ outcome: 'unreachable' });
    readAsks.mockResolvedValueOnce({ kind: 'pluginUnavailable' });
    expect(await reviewActivityLink(LINK, all)).toMatchObject({ outcome: 'pluginOutdated' });
  });

  it('reads nothing for a Host with the toggles off', async () => {
    const { all, readAsks } = gates({ isActivityOn: () => false });
    expect(await reviewActivityLink(LINK, all)).toMatchObject({ outcome: 'optedOut' });
    expect(readAsks).not.toHaveBeenCalled();
  });
});

const DESIRE: ActivityDesire = {
  counts: { working: 0, blocked: 1, done: 0 },
  hostName: 'mbp',
  agents: [{ paneId: PANE, kind: 'claude', status: 'blocked', ask: ASK }],
};

function shownActivity() {
  const controller = new FakeLiveActivityController();
  const keys = new MemoryNotificationKeyStore();
  keys.save({ hostId: 'h1', hostName: 'mbp', key: KEY });
  const randomBytes = (length: number) => new Uint8Array(length).fill(1);
  controller.seed('a1', 'h1');
  const content = sealContent(DESIRE, KEY, randomBytes);
  if (!content) throw new Error('not sealed');
  controller.setContent('a1', content);
  const shown = () => {
    const update = controller.updates.at(-1)?.content;
    return openActivity({ ...update?.envelope } as never, KEY).agents[0]?.ask?.result;
  };
  return { controller, keys, randomBytes, shown };
}

describe('markActivityResult', () => {
  it('writes the result on the prompt the tap answered', async () => {
    const { controller, keys, randomBytes, shown } = shownActivity();
    await markActivityResult({ controller, keys, randomBytes }, APPROVE, 'sent');
    expect(shown()).toBe('sent');
  });

  it('leaves a newer prompt and another Host alone', async () => {
    const { controller, keys, randomBytes } = shownActivity();
    const deps = { controller, keys, randomBytes };
    await markActivityResult(deps, { ...APPROVE, episodeId: 'zzzzzzzzzzz' }, 'sent');
    await markActivityResult(deps, { ...APPROVE, hostId: 'h2' }, 'sent');
    expect(controller.updates).toHaveLength(0);
  });
});

describe('ActivityTapRunner', () => {
  it('shows sending while it runs, then the result, and tracks what is in flight', async () => {
    const { controller, keys, randomBytes, shown } = shownActivity();
    let release: (result: string) => void = () => undefined;
    const { all, apply } = gates();
    apply.mockImplementation(() => new Promise<string>((resolve) => (release = resolve)));
    const runner = new ActivityTapRunner({ controller, keys, randomBytes, gates: all });

    const running = runner.run(APPROVE);
    await vi.waitFor(() => expect(apply).toHaveBeenCalled());
    expect(shown()).toBe('sending');
    expect(runner.isRunning('h1', PANE, BID)).toBe(true);

    release('sent');
    expect(await running).toBe('answered');
    expect(shown()).toBe('sent');
    expect(runner.isRunning('h1', PANE, BID)).toBe(false);
  });

  it('a review writes nothing on the activity', async () => {
    const { controller, keys, randomBytes } = shownActivity();
    const runner = new ActivityTapRunner({ controller, keys, randomBytes, gates: gates().all });
    expect(await runner.review(LINK)).toMatchObject({ kind: 'ask' });
    expect(controller.updates).toHaveLength(0);
  });

  it('a second tap while one runs starts nothing', async () => {
    const { controller, keys, randomBytes } = shownActivity();
    const { all, authenticate } = gates();
    const runner = new ActivityTapRunner({ controller, keys, randomBytes, gates: all });
    const first = runner.run(APPROVE);
    expect(await runner.run(APPROVE)).toBeNull();
    await first;
    expect(authenticate).toHaveBeenCalledTimes(1);
  });
});

describe('activityResultOf', () => {
  it.each([
    ['answered', 'sent'],
    ['ignored', 'answered'],
    ['expired', 'expired'],
    ['optedOut', 'opted_out'],
    ['notAnswerable', 'prompt_changed'],
    ['promptChanged', 'prompt_changed'],
    ['promptCut', 'approve_in_app'],
    ['denyOnly', 'approve_in_app'],
    ['pluginOutdated', 'update_plugin'],
    ['unreachable', 'unreachable'],
    ['sendFailed', 'may_have_sent'],
    ['timedOut', 'timed_out'],
    ['notAuthenticated', 'unlock_to_approve'],
  ] as const)('%s reads as %s', (outcome, result) => {
    expect(activityResultOf(outcome)).toBe(result);
  });
});
