import { describe, expect, it } from 'vitest';
import { emptyBox } from '../send/input-box';
import {
  GROK_DASHBOARD_REASON,
  GROK_EDITING_QUEUED_REASON,
  GROK_MULTILINE_REASON,
  GROK_REMEMBER_REASON,
  GROK_SENDABLE_WAIT_REASON,
  GROK_UNFOCUSED_REASON,
  readGrokInputBox,
} from './input-box';
import { readGrokScreen } from './screen';
import { capture, grokScreen } from './screen.testkit';

const WORKING = ['Shift+Tab:mode', 'Ctrl+c:cancel', 'Ctrl+.:shortcuts'];

describe('Grok Build input box', () => {
  it('reads an empty box with prompt focus', () => {
    expect(readGrokInputBox(capture('grok-01-idle-empty'))).toEqual(emptyBox(null));
  });

  it.each([
    ['grok-02-idle-draft', 'hello draft'],
    ['grok-04-working-draft', 'draft while working'],
    ['grok-24-restored-draft', 'Reply with the word kiwi.'],
  ])('reads the draft of %s', (stem, text) => {
    expect(readGrokInputBox(capture(stem))).toEqual({ kind: 'text', text });
  });

  it('keeps the lines of a draft on several rows, and never counts ghost text as typed', () => {
    expect(readGrokInputBox(grokScreen({ typed: 'first line\nsecond line' }))).toEqual({
      kind: 'text',
      text: 'first line\nsecond line',
    });
    const ghost = grokScreen({
      typed: 'Run the',
      ghost: ' tests again',
      hints: ['Enter:send', 'Tab/→:accept suggestion', 'Shift+Tab:mode'],
    });
    expect(readGrokScreen(ghost).composer?.ghost).toBe('tests again');
    expect(readGrokInputBox(ghost)).toEqual({ kind: 'text', text: 'Run the' });
  });

  it('holds an unfocused prompt, with the placeholder read as empty', () => {
    for (const footer of [
      'Space:prompt  │  Ctrl+.:shortcuts',
      'q/Esc:back  │  Ctrl+c:cancel  │  Ctrl+.:shortcuts',
    ]) {
      const screen = grokScreen({ placeholder: 'Build anything', footer });
      expect(readGrokScreen(screen).composer?.draft).toBe('');
      expect(readGrokInputBox(screen)).toEqual({ kind: 'disabled', reason: GROK_UNFOCUSED_REASON });
    }
    for (const stem of ['grok-31-scrollback-62x20', 'grok-33-working-scrollback-62x20']) {
      expect(readGrokInputBox(capture(stem))).toEqual({
        kind: 'disabled',
        reason: GROK_UNFOCUSED_REASON,
      });
    }
  });

  it('reads shell and remember modes', () => {
    expect(
      readGrokInputBox(
        grokScreen({ glyph: '!', typed: 'ls -la', bottomLabel: 'Run shell command' }),
      ),
    ).toEqual({ kind: 'shellMode', command: 'ls -la' });
    expect(readGrokInputBox(grokScreen({ glyph: '!', bottomLabel: 'Run shell command' }))).toEqual({
      kind: 'shellMode',
      command: '',
    });
    expect(
      readGrokInputBox(
        grokScreen({ glyph: '#', typed: 'Prefer tabs', bottomLabel: 'Save memory note' }),
      ),
    ).toEqual({ kind: 'disabled', reason: GROK_REMEMBER_REASON });
  });

  it('has no composer on the dashboard', () => {
    expect(readGrokInputBox(capture('grok-11-dashboard'))).toEqual({
      kind: 'noComposer',
      reason: GROK_DASHBOARD_REASON,
    });
  });

  it.each([
    'grok-40-agent-view-other-62',
    'grok-41-agent-view-this-62',
    'grok-42-agent-view-dispatched-62',
  ])("reads the dashboard's view of an agent through its own box (%s)", (stem) => {
    const screen = capture(stem);
    expect(readGrokScreen(screen).isDashboardOverlay).toBe(true);
    expect(readGrokInputBox(screen)).toEqual(emptyBox(null));
  });

  it.each([
    ['grok-07-slash-popup', '❯ /memory'],
    ['grok-08-at-popup', '❯ README.md'],
    ['grok-09-model-picker', '❯ 256k Default'],
    ['grok-10-btw', '╭─ /btw Quick aside'],
    ['grok-21-resume-picker', '┌─ Resume session'],
    ['grok-22-rewind-picker', 'Rewind to which turn?'],
  ])('holds the send under the overlay of %s', (stem, shown) => {
    const state = readGrokInputBox(capture(stem));
    expect(state.kind).toBe('overlay');
    if (state.kind === 'overlay') expect(state.row).toContain(shown);
  });

  it('holds while Grok waits for a second key press', () => {
    expect(readGrokInputBox(grokScreen({ footer: 'Ctrl+c:press again to quit' }))).toEqual({
      kind: 'disabled',
      reason:
        'Grok Build is waiting for a second key press (“Ctrl+c:press again to quit”). Wait a second, then send again.',
    });
  });

  it('holds during every wait a message would end', () => {
    const waits = [
      capture('grok-26-waiting-subagent'),
      grokScreen({
        status: { label: 'Waiting for subagent…' },
        dock: ['   ▾ Subagents 1', '   ⋅ Subagent List workspace files · Waiting for response…'],
        hints: WORKING,
      }),
      grokScreen({ columns: 40, status: { label: 'Waiting for 2 subagents…' }, hints: WORKING }),
      grokScreen({ status: { label: 'Waiting on task output…' }, hints: WORKING }),
      grokScreen({ status: { label: 'Waiting on tasks…' }, hints: WORKING }),
      grokScreen({ status: { label: 'Sleeping…' }, hints: WORKING }),
      grokScreen({
        status: { label: 'Build the docs…', queued: ' · 1 queued, Enter to send now' },
        hints: WORKING,
      }),
      grokScreen({ cue: 'waiting · send a message to interrupt' }),
    ];
    for (const screen of waits) {
      expect(readGrokInputBox(screen)).toEqual({
        kind: 'disabled',
        reason: GROK_SENDABLE_WAIT_REASON,
      });
    }
  });

  it('does not hold for other waits, toasts or queue rows', () => {
    const others = [
      grokScreen({ status: { label: 'Waiting for response…' }, hints: WORKING }),
      grokScreen({
        status: { label: 'Waiting for the agent to accept the prompt…' },
        hints: WORKING,
      }),
      grokScreen({ cue: '1 command still running', hints: WORKING }),
      capture('grok-05-queued'),
      capture('grok-06-esc-toast'),
    ];
    for (const screen of others) expect(readGrokInputBox(screen)).toEqual(emptyBox(null));
  });

  it('finds the spinner row above the dock rows, whatever the footer shows', () => {
    for (const [stem, label, dock] of [
      ['grok-05-queued', 'Sleep 40 seconds then echo two…', 'Queued 1'],
      ['grok-26-waiting-subagent', 'Waiting for subagent…', 'Subagents 1'],
    ] as const) {
      const grok = readGrokScreen(capture(stem));
      expect(grok.statusRow?.label).toBe(label);
      expect(grok.dockSections).toEqual([dock]);
    }
    expect(readGrokScreen(grokScreen({ status: { label: 'Cancelling…' } })).isCancelling).toBe(
      true,
    );
    expect(readGrokScreen(capture('grok-03-working')).isCancelling).toBe(false);
  });

  it('holds in multiline mode and while editing a queued message', () => {
    expect(readGrokInputBox(grokScreen({ multiline: true }))).toEqual({
      kind: 'disabled',
      reason: GROK_MULTILINE_REASON,
    });
    const editing = { kind: 'disabled', reason: GROK_EDITING_QUEUED_REASON };
    expect(
      readGrokInputBox(
        grokScreen({
          typed: 'After that',
          bottomLabel: 'editing queued #1',
          hints: ['Enter:save', 'Esc:cancel'],
        }),
      ),
    ).toEqual(editing);
    expect(
      readGrokInputBox(grokScreen({ typed: 'After that', topLabel: 'editing queued #2' })),
    ).toEqual(editing);
  });
});
