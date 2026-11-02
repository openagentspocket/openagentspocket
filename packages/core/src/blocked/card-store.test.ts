import { describe, expect, it } from 'vitest';
import type { ChatProgram } from '../chat/model/types';
import { FakeClock } from '../hosts/cancellation';
import { BlockedCardStore } from './card-store';
import type { BlockedScreenIO } from './card-support';
import { loadScreen } from './golden-fixtures.testkit';
import type { AnsiScreen } from './screen';

const BASH = 'claude-02-c1-bash-blocked';
const AFTER = 'claude-29-c3-after-immediate';

/** A pane that shows one screen and swaps it when specific keys arrive. */
class FakePane implements BlockedScreenIO {
  keys: string[][] = [];
  pastes: string[] = [];
  private screen: AnsiScreen;
  private reactions = new Map<string, AnsiScreen>();
  failSend = false;

  constructor(stem: string) {
    this.screen = loadScreen(stem);
  }

  show(stem: string): void {
    this.screen = loadScreen(stem);
  }

  react(key: string, stem: string): void {
    this.reactions.set(key, loadScreen(stem));
  }

  async readScreen(): Promise<AnsiScreen> {
    return this.screen;
  }

  async sendKeys(keys: readonly string[]): Promise<void> {
    if (this.failSend) throw new Error('lost');
    this.keys.push([...keys]);
    const next = this.reactions.get(keys.join(','));
    if (next) this.screen = next;
  }

  async paste(text: string): Promise<void> {
    this.pastes.push(text);
  }
}

function setup(stem: string, program: ChatProgram = 'claude') {
  const pane = new FakePane(stem);
  const clock = new FakeClock();
  const store = new BlockedCardStore({ program, io: pane, clock });
  return { pane, clock, store };
}

/** Runs `work` while moving the fake clock, so the card's waits elapse. */
async function withTime<V>(clock: FakeClock, work: Promise<V>): Promise<V> {
  let done = false;
  const guarded = work.finally(() => {
    done = true;
  });
  while (!done) await clock.advance(50);
  return guarded;
}

async function blocked(stem: string, program: ChatProgram = 'claude') {
  const world = setup(stem, program);
  world.store.setActivity('blocked');
  await world.store.refresh();
  return world;
}

describe('BlockedCardStore', () => {
  it('shows a Blocked Agent dialog as a card', async () => {
    const { store } = await blocked(BASH);
    const { content, progress } = store.getState();
    expect(content.kind).toBe('card');
    if (content.kind === 'card') expect(content.dialog.kind).toBe('claudeBash');
    expect(progress).toBe('ready');
  });

  it('waits out the grace, then sends the option digit exactly once', async () => {
    const { store, pane, clock } = await blocked(BASH);
    pane.react('1', AFTER);
    await withTime(clock, store.perform({ kind: 'choose', ordinal: 1 }));
    expect(pane.keys).toEqual([['1']]);
    expect(store.getState().progress).toBe('ready');
    expect(store.getState().notice).toBeNull();
    store.setActivity('working');
    expect(store.getState().content.kind).toBe('none');
  });

  it('sends nothing when the dialog changed before the tap', async () => {
    const { store, pane, clock } = await blocked('claude-30-par-first');
    pane.show('claude-31-par-second');
    await withTime(clock, store.perform({ kind: 'choose', ordinal: 1 }));
    expect(pane.keys).toEqual([]);
    expect(store.getState().notice).toMatchObject({ key: expect.any(String) });
    const { content } = store.getState();
    expect(content.kind).toBe('card');
    if (content.kind === 'card') expect(content.dialog.subject.command).toBe('touch par-b.txt');
  });

  it('stops at a step the dialog ignores and falls back to the generic card, still answerable', async () => {
    const { store, pane, clock } = await blocked(BASH);
    await withTime(clock, store.perform({ kind: 'amend', ordinal: 4, note: 'Skip it' }));
    // The first arrow never moved focus, so nothing follows it.
    expect(pane.keys).toEqual([['down']]);
    expect(pane.pastes).toEqual([]);
    const { content } = store.getState();
    expect(content.kind).toBe('generic');
    if (content.kind === 'generic') expect(content.excerpt.numbered.get(4)).toBe('No');

    pane.react('4', AFTER);
    await withTime(clock, store.press(4));
    expect(pane.keys).toEqual([['down'], ['4']]);
    expect(store.getState().progress).toBe('ready');
  });

  it('never resends: no effect keeps answers off until the screen changes', async () => {
    const { store, pane, clock } = await blocked(BASH);
    await withTime(clock, store.perform({ kind: 'choose', ordinal: 1 }));
    expect(pane.keys).toEqual([['1']]);
    expect(store.getState().progress).toBe('unconfirmed');
    expect(store.canStop).toBe(true);

    // The same dialog: the key may still land, so a tap sends nothing.
    await store.refresh();
    expect(store.getState().progress).toBe('unconfirmed');
    await withTime(clock, store.perform({ kind: 'choose', ordinal: 1 }));
    expect(pane.keys).toEqual([['1']]);

    pane.show('claude-31-par-second');
    await store.refresh();
    expect(store.getState().progress).toBe('ready');
  });

  it('still lets Stop go after an answer showed no effect', async () => {
    const { store, pane, clock } = await blocked(BASH);
    await withTime(clock, store.perform({ kind: 'choose', ordinal: 1 }));
    pane.react('esc', AFTER);
    await withTime(clock, store.perform({ kind: 'dismiss' }));
    expect(pane.keys).toEqual([['1'], ['esc']]);
    expect(store.getState().progress).toBe('ready');
  });

  it('releases an unconfirmed answer once a call that waited resolves', async () => {
    const { store, clock } = setup(BASH);
    store.setCalls({ waiting: new Set(['a']), resolved: new Set() });
    store.setActivity('blocked');
    await store.refresh();
    await withTime(clock, store.perform({ kind: 'choose', ordinal: 1 }));
    expect(store.getState().progress).toBe('unconfirmed');
    // A call that only starts waiting proves nothing.
    store.setCalls({ waiting: new Set(['a', 'b']), resolved: new Set() });
    expect(store.getState().progress).toBe('unconfirmed');
    store.setCalls({ waiting: new Set(['b']), resolved: new Set(['a']) });
    expect(store.getState().progress).toBe('ready');
  });

  it('takes one action at a time', async () => {
    const { store, pane, clock } = await blocked(BASH);
    pane.react('1', AFTER);
    await withTime(
      clock,
      Promise.all([
        store.perform({ kind: 'choose', ordinal: 1 }),
        store.perform({ kind: 'choose', ordinal: 1 }),
      ]),
    );
    expect(pane.keys).toEqual([['1']]);
  });

  it('confirms a Claude answer by the call result', async () => {
    const { store, pane, clock } = await blocked(BASH);
    const toolId = 'toolu_1';
    const withId = new BlockedCardStore({
      program: 'claude',
      io: pane,
      clock,
      toolUseIdFor: () => toolId,
    });
    withId.setActivity('blocked');
    await withId.refresh();
    withId.setCalls({ waiting: new Set([toolId]), resolved: new Set() });
    // The dialog stays and the result shows up: the answer took.
    pane.react('1', BASH);
    const run = withId.perform({ kind: 'choose', ordinal: 1 });
    await clock.advance(200);
    withId.setCalls({ waiting: new Set(), resolved: new Set([toolId]) });
    await withTime(clock, run);
    expect(pane.keys).toEqual([['1']]);
    expect(withId.getState().progress).toBe('ready');
    expect(store.getState().content.kind).toBe('card');
  });

  it('says it cannot read the screen only after a moment', async () => {
    const { store, clock } = setup('claude-01-ready');
    store.setActivity('blocked');
    await store.refresh();
    expect(store.getState().content.kind).toBe('none');
    await clock.advance(2_000);
    await store.refresh();
    expect(store.getState().content.kind).toBe('unreadable');
    store.setActivity('idle');
    expect(store.getState().content.kind).toBe('none');
    await store.refresh();
    expect(store.getState().content.kind).toBe('none');
  });

  it('leaves nothing behind when an answered dialog lingers Blocked', async () => {
    const { store, pane, clock } = setup(BASH);
    pane.react('1', AFTER);
    store.setActivity('blocked');
    await clock.advance(5_000);
    await store.refresh();
    await withTime(clock, store.perform({ kind: 'choose', ordinal: 1 }));
    await store.refresh();
    expect(store.getState().content.kind).toBe('none');
  });

  it('reads an idle Claude that has an open question call', async () => {
    const { store } = setup(BASH);
    store.setActivity('idle');
    await store.refresh();
    expect(store.getState().content.kind).toBe('none');
    store.setCalls({ waiting: new Set(), resolved: new Set(), openQuestion: true });
    await store.refresh();
    expect(store.getState().content.kind).toBe('card');
  });

  it('unfolds a collapsed card when another dialog shows', async () => {
    const { store, pane } = await blocked('claude-30-par-first');
    store.setCollapsed(true);
    await store.refresh();
    expect(store.getState().isCollapsed).toBe(true);
    pane.show('claude-31-par-second');
    await store.refresh();
    expect(store.getState().isCollapsed).toBe(false);
  });

  it('sends key pad keys as they are, then reads again', async () => {
    const { store, pane, clock } = await blocked(BASH);
    pane.react('down', 'claude-03-c1-focus-no');
    await withTime(clock, store.sendKeys(['down']));
    expect(pane.keys).toEqual([['down']]);
    const { content } = store.getState();
    if (content.kind !== 'card') throw new Error('expected a card');
    expect(content.dialog.focus.focusedOrdinal).toBe(4);
  });

  it('reports a failed send without sending anything more', async () => {
    const { store, pane, clock } = await blocked(BASH);
    pane.failSend = true;
    await withTime(clock, store.perform({ kind: 'choose', ordinal: 1 }));
    expect(pane.keys).toEqual([]);
    expect(store.getState().notice).not.toBeNull();
    expect(store.getState().progress).toBe('ready');
  });

  it('hands the turn to the composer after a Codex decline', async () => {
    const { store, pane, clock } = await blocked('codex-02-x2-patch', 'codex');
    pane.react('esc', 'codex-03-x2-after-esc');
    await withTime(clock, store.perform({ kind: 'dismiss' }));
    expect(store.getState().composerFocusRequest).toBe(1);
  });

  it('watches while shown and Blocked, and stops when hidden', async () => {
    const { store, pane, clock } = setup(BASH);
    store.show();
    store.setActivity('blocked');
    await clock.advance(10);
    expect(store.getState().content.kind).toBe('card');
    store.hide();
    pane.show('claude-31-par-second');
    await clock.advance(3_000);
    const { content } = store.getState();
    if (content.kind !== 'card') throw new Error('expected a card');
    expect(content.dialog.subject.command).not.toBe('touch par-b.txt');
  });
});
