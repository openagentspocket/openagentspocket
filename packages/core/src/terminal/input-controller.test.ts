import { describe, expect, it } from 'vitest';
import { TerminalInputController } from './input-controller';
import { BRACKETED_PASTE_END, BRACKETED_PASTE_START, encodePaste } from './text-safety';

const bytes = (text: string) => new TextEncoder().encode(text);

function setup(options?: ConstructorParameters<typeof TerminalInputController>[0]) {
  const writes: Uint8Array[] = [];
  const controller = new TerminalInputController(options);
  const begin = () =>
    controller.beginSession({ write: (data) => writes.push(data), scroll: () => {} });
  return { controller, writes, begin };
}
const framed = (text: string) => encodePaste(text, true);

describe('TerminalInputController', () => {
  it('inserts a single-line paste at once', () => {
    const { controller, writes, begin } = setup();
    begin();
    expect(controller.requestPaste('git status')).toEqual({ kind: 'inserted' });
    expect(writes).toEqual([bytes('git status')]);
    expect(controller.pendingPaste).toBeNull();
  });

  it('reviews a multiline paste and confirms it as one write', () => {
    const { controller, writes, begin } = setup();
    begin();
    const text = 'printf one\nprintf two\n';
    const result = controller.requestPaste(text);
    expect(result.kind).toBe('requiresReview');
    expect(controller.pendingPaste).toMatchObject({
      lineCount: 3,
      characterCount: text.length,
      preview: text,
    });
    expect(writes).toEqual([]);
    expect(controller.confirmPaste()).toBe(true);
    expect(writes).toEqual([bytes(text)]);
    expect(controller.pendingPaste).toBeNull();
  });

  it('keeps a reviewed paste for the replacement writer and submits it once', () => {
    const { controller, writes, begin } = setup();
    const old: Uint8Array[] = [];
    const first = controller.beginSession({ write: (d) => old.push(d), scroll: () => {} });
    const text = 'git status\ngit diff';
    controller.requestPaste(text, true);
    const review = controller.pendingPaste;
    controller.detachSessionForReplacement();
    controller.endSession(first, { preservingPendingPaste: true });
    expect(controller.canConfirmPaste).toBe(false);
    expect(controller.confirmPaste()).toBe(false);
    expect(controller.pendingPaste).toEqual(review);
    begin();
    expect(controller.confirmPaste()).toBe(true);
    expect(writes).toEqual([framed(text)]);
    expect(controller.confirmPaste()).toBe(false);
    expect(old).toEqual([]);
  });

  it('cancels a reviewed paste when a session ends normally', () => {
    const { controller, begin } = setup();
    const generation = begin();
    controller.requestPaste('a\nb');
    controller.endSession(generation);
    expect(controller.pendingPaste).toBeNull();
    expect(controller.canConfirmPaste).toBe(false);
  });

  it('makes cancel the safe default', () => {
    const { controller, writes, begin } = setup();
    begin();
    controller.requestPaste('one\ntwo');
    controller.cancelPaste();
    expect(controller.pendingPaste).toBeNull();
    expect(writes).toEqual([]);
  });

  it.each([
    'nul\u0000hidden',
    'escape\u001b[31m',
    'control\u001fhidden',
    'delete\u007fhidden',
    'c1\u0085hidden',
  ])('rejects unsafe clipboard text %j', (text) => {
    const { controller, writes, begin } = setup();
    begin();
    expect(controller.requestPaste(text)).toEqual({ kind: 'rejected' });
    expect(controller.pasteError).not.toBeNull();
    expect(controller.pendingPaste).toBeNull();
    expect(writes).toEqual([]);
  });

  it('blocks a paste without a live session', () => {
    const { controller } = setup();
    expect(controller.requestPaste('x')).toEqual({ kind: 'blocked' });
  });

  it('bounds the preview without changing the confirmed content', () => {
    const { controller, writes, begin } = setup();
    begin();
    const text = `${'x'.repeat(3000)}\nsecond`;
    controller.requestPaste(text);
    const preview = controller.pendingPaste?.preview ?? '';
    expect(preview.length).toBeLessThan(text.length);
    expect(preview.endsWith('…')).toBe(true);
    controller.confirmPaste();
    expect(writes).toEqual([bytes(text)]);
  });

  it('frames a reviewed paste with the mode captured at request time', () => {
    const { controller, writes, begin } = setup();
    begin();
    controller.requestPaste('one\ntwo\nthree', true);
    controller.confirmPaste();
    expect(writes).toEqual([framed('one\ntwo\nthree')]);
  });

  it('sends snippets whole and never with a submit byte', () => {
    const { controller, writes, begin } = setup();
    begin();
    expect(controller.insertSnippet('run the tests', true)).toBe(true);
    expect(writes).toEqual([bytes('run the tests')]);
    expect(writes.some((w) => w.includes(0x0d))).toBe(false);
  });

  it('frames multiline snippets only when the remote asked', () => {
    const { controller, writes, begin } = setup();
    begin();
    controller.insertSnippet('first\nsecond', true);
    controller.insertSnippet('first\nsecond', false);
    expect(writes).toEqual([framed('first\nsecond'), bytes('first\nsecond')]);
    expect(writes[0]?.slice(0, BRACKETED_PASTE_START.length)).toEqual(BRACKETED_PASTE_START);
    expect(writes[0]?.slice(-BRACKETED_PASTE_END.length)).toEqual(BRACKETED_PASTE_END);
  });

  it('refuses unsafe snippets and snippets without a session', () => {
    const { controller, writes, begin } = setup();
    expect(controller.insertSnippet('continue', true)).toBe(false);
    begin();
    expect(controller.insertSnippet('escape\u001b[31m', true)).toBe(false);
    expect(writes).toEqual([]);
  });

  it('sends raw bytes only to a live session', () => {
    const { controller, writes, begin } = setup();
    expect(controller.send(bytes('n'))).toBe(false);
    begin();
    expect(controller.send(new Uint8Array())).toBe(false);
    expect(controller.send(bytes('n'))).toBe(true);
    expect(writes).toEqual([bytes('n')]);
  });

  it('reports each outgoing write with its source', () => {
    const seen: string[] = [];
    const { controller, begin } = setup({ observeOutgoing: (_d, source) => seen.push(source) });
    begin();
    controller.send(bytes('a'));
    controller.sendEscapeKey();
    controller.insertComposerDraft('draft');
    controller.insertSnippet('s', false);
    controller.requestPaste('p');
    expect(seen).toEqual(['keystroke', 'escapeKey', 'composerInsert', 'snippet', 'paste']);
  });

  it('resets per-session state when the writer is replaced or ends', () => {
    let resets = 0;
    const { controller, begin } = setup({ sessionDidReset: () => (resets += 1) });
    const generation = begin();
    controller.endSession(generation);
    begin();
    expect(resets).toBe(3);
  });

  it('ignores an end from a stale session', () => {
    const { controller, begin } = setup();
    const first = begin();
    begin();
    controller.endSession(first);
    expect(controller.hasWriter).toBe(true);
  });

  describe('recordSubmitted', () => {
    const recording = () => {
      const recorded: string[] = [];
      return { recorded, ...setup({ observeSubmitted: (text) => recorded.push(text) }) };
    };

    it('passes on a delivery made against the live session, writing nothing', () => {
      const { controller, recorded, writes, begin } = recording();
      const generation = begin();
      expect(controller.liveGeneration).toBe(generation);
      controller.recordSubmitted('sent through agent.prompt', generation);
      expect(recorded).toEqual(['sent through agent.prompt']);
      expect(writes).toEqual([]);
    });

    it('drops a delivery that outlived its session', () => {
      const { controller, recorded, begin } = recording();
      const stale = begin();
      controller.endSession(stale);
      expect(controller.liveGeneration).toBeNull();
      controller.recordSubmitted('sent to the old session', stale);
      begin();
      controller.recordSubmitted('sent to the old session', stale);
      expect(recorded).toEqual([]);
    });
  });

  describe('held references', () => {
    it('waits for output and flushes once, in order', () => {
      const { controller, writes, begin } = setup();
      const generation = begin();
      expect(controller.insertReferenceWhenLive('a ')).toBe(true);
      expect(controller.insertReferenceWhenLive('b ')).toBe(true);
      expect(writes).toEqual([]);
      controller.sessionDidBecomeLive(generation);
      controller.sessionDidBecomeLive(generation);
      expect(writes).toEqual([bytes('a b ')]);
    });

    it('survives replacement and ignores an old live signal', () => {
      const { controller, writes, begin } = setup();
      const old = begin();
      controller.insertReferenceWhenLive('ref ');
      const next = begin();
      controller.sessionDidBecomeLive(old);
      expect(writes).toEqual([]);
      controller.sessionDidBecomeLive(next);
      expect(writes).toEqual([bytes('ref ')]);
    });

    it('types at once into an already live session and is discarded on departure', () => {
      const { controller, writes, begin } = setup();
      const generation = begin();
      controller.sessionDidBecomeLive(generation);
      controller.insertReferenceWhenLive('now ');
      expect(writes).toEqual([bytes('now ')]);
      controller.endSession(generation);
      controller.insertReferenceWhenLive('later ');
      controller.discardHeldInsertion();
      controller.sessionDidBecomeLive(begin());
      expect(writes).toHaveLength(1);
    });

    it.each(['file\rname ', 'file\nname ', 'file\tname ', 'file\u001bname ', 'file\u0085name '])(
      'rejects control characters in %j',
      (text) => {
        const { controller, begin } = setup();
        begin();
        expect(controller.insertReferenceWhenLive(text)).toBe(false);
      },
    );
  });
});
