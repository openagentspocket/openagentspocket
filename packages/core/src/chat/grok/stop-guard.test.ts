import { describe, expect, it } from 'vitest';
import type { ChatAgentActivity } from '../model/types';
import type { StopVerdict } from '../send/policy';
import { readGrokScreen } from './screen';
import { capture, grokScreen } from './screen.testkit';
import { grokStopVerdict } from './stop-guard';

const NOT_WORKING =
  "Agentico can't see Grok Build working, so Stop pressed nothing. Stop it in the terminal with Ctrl+C.";
const OTHER_VIEW =
  'Grok Build is showing a menu or another view, so Stop pressed nothing. Close it in the terminal first.';
const AGENT_VIEW =
  'Grok Build is showing an agent from its dashboard, so Stop pressed nothing. Stop it in the terminal with Ctrl+C.';
const ASKING =
  'Grok Build is asking something, so Stop pressed nothing. Answer it in Chat or the terminal.';
const UNFOCUSED =
  "Grok Build's input box doesn't have focus, so Stop pressed nothing. Stop it in the terminal.";
const DRAFT =
  "Grok Build's input box has text, and Ctrl+C would only clear it. Stop it in the terminal.";

const WORKING = ['Shift+Tab:mode', 'Ctrl+c:cancel', 'Ctrl+.:shortcuts'];
const PRESS: StopVerdict = { kind: 'press' };
const refuse = (reason: string): StopVerdict => ({ kind: 'refuse', reason });

const verdict = (
  screen: ReturnType<typeof capture>,
  activity: ChatAgentActivity = 'working',
): StopVerdict => grokStopVerdict({ screen, activity });

const queued = (columns: number, footer?: string) =>
  grokScreen({
    columns,
    status: {
      label: 'Sleep 40 seconds then echo two…',
      phase: '15s',
      turn: '18s ⇣25.8k',
      buttons: ' [↓][stop]',
    },
    dock: ['   ▾ Queued 1', '     #1 After that, reply with the word three.'],
    hints: [
      'Enter:send now',
      'Shift+Tab:mode',
      'Ctrl+c:cancel',
      'Ctrl+b:send to bg',
      'Ctrl+;:queue',
      'Ctrl+.:shortcuts',
    ],
    footer,
  });

const CARDS = new Set([
  'grok-12-permission-command',
  'grok-13-permission-compound',
  'grok-14-permission-edit',
  'grok-15-question',
  'grok-16-subagent-panel',
  'grok-23-rewind-confirm',
  'grok-25-fork-question',
]);

describe('Grok Build Stop guard', () => {
  it.each([
    'grok-03-working',
    'grok-05-queued',
    'grok-26-waiting-subagent',
    'grok-32-working-62x20',
  ])('presses while Grok shows it working (%s)', (stem) => {
    expect(verdict(capture(stem))).toEqual(PRESS);
  });

  it('presses before the first output is written, and cancels a running compaction', () => {
    const accepting = grokScreen({
      scrollback: ['❯ Reply with the word kiwi.'],
      status: {
        label: 'Waiting for the agent to accept the prompt…',
        phase: null,
        turn: '0.2s',
        buttons: ' [stop]',
      },
      hints: WORKING,
    });
    const noStatusRowYet = grokScreen({
      scrollback: ['❯ Reply with the word kiwi.'],
      hints: WORKING,
    });
    expect(verdict(accepting)).toEqual(PRESS);
    expect(verdict(noStatusRowYet)).toEqual(PRESS);
    const compacting = capture('grok-27-compacting');
    expect(readGrokScreen(compacting).footer?.includes('Ctrl+c:cancel')).toBe(false);
    expect(verdict(compacting)).toEqual(PRESS);
  });

  it.each([62, 40])('accepts the spinner row when the footer is cut at %i columns', (columns) => {
    expect(verdict(queued(columns))).toEqual(PRESS);
    const cut = queued(columns, 'Enter:send now  │  Shift+Tab:mode');
    expect(readGrokScreen(cut).statusRow).not.toBeNull();
    expect(verdict(cut)).toEqual(PRESS);
  });

  it('refuses a draft, but not ghost text, and a draft whose hints cut the focus hints', () => {
    expect(verdict(capture('grok-04-working-draft'))).toEqual(refuse(DRAFT));
    const ghost = grokScreen({
      status: { label: 'Sleep 45 seconds then echo done…' },
      ghost: 'Run the tests again',
      hints: ['Tab/→:accept suggestion', 'Shift+Tab:mode', 'Ctrl+c:cancel', 'Ctrl+.:shortcuts'],
    });
    expect(verdict(ghost)).toEqual(PRESS);
    const cut = capture('grok-34-working-draft-62');
    expect(readGrokScreen(cut).composer?.draft).toBe('draft text');
    expect(verdict(cut)).toEqual(refuse(DRAFT));
  });

  it('refuses without a working cue', () => {
    for (const screen of [
      capture('grok-01-idle-empty'),
      grokScreen(),
      grokScreen({ cue: '1 command still running' }),
    ]) {
      expect(verdict(screen)).toEqual(refuse(NOT_WORKING));
    }
  });

  it.each(['idle', 'blocked', 'unknown'] as const)('refuses when herdr reports %s', (activity) => {
    expect(verdict(capture('grok-03-working'), activity)).toEqual(
      refuse(activity === 'blocked' ? ASKING : NOT_WORKING),
    );
  });

  it.each([
    'grok-12-permission-command',
    'grok-13-permission-compound',
    'grok-14-permission-edit',
    'grok-15-question',
    'grok-16-subagent-panel',
    'grok-23-rewind-confirm',
    'grok-25-fork-question',
    'grok-07-slash-popup',
    'grok-10-btw',
    'grok-11-dashboard',
    'grok-20-welcome',
    'grok-21-resume-picker',
    'grok-22-rewind-picker',
    'grok-28-welcome-62',
    'grok-29-welcome-40',
  ])('refuses over the card, menu or other view of %s', (stem) => {
    const screen = capture(stem);
    const isCard = CARDS.has(stem);
    expect(readGrokScreen(screen).card !== null).toBe(isCard);
    expect(verdict(screen)).toEqual(refuse(isCard ? ASKING : OTHER_VIEW));
  });

  it("refuses on the dashboard's view of an agent, and presses on the conversation's own", () => {
    const hints = ['Ctrl+\\:dashboard', 'Ctrl+x:stop', ...WORKING];
    const view = grokScreen({ status: { label: 'Thinking…' }, hints });
    expect(verdict(view)).toEqual(refuse(AGENT_VIEW));
    expect(verdict(capture('grok-41-agent-view-this-62'))).toEqual(refuse(AGENT_VIEW));
    expect(verdict(grokScreen({ status: { label: 'Thinking…' }, hints: WORKING }))).toEqual(PRESS);
  });

  it("names a pending press, a cancel or a draft on the dashboard's view of an agent", () => {
    const header = 'master ~/s/cap-grok-a/proj │ ‹ 2/3 › │ [Dashboard]';
    const hints = ['Ctrl+\\:dashboard', 'Ctrl+x:stop', ...WORKING];
    const cases: [ReturnType<typeof grokScreen>, string][] = [
      [
        grokScreen({
          status: { label: 'Sleep…' },
          hints: WORKING,
          footer: 'Ctrl+c:press again to quit',
          header,
        }),
        'Grok Build is waiting for a second key press to quit, so Stop pressed nothing.',
      ],
      [
        grokScreen({ status: { label: 'Cancelling…' }, hints, header }),
        'Grok Build is already cancelling the turn.',
      ],
      [
        grokScreen({ status: { label: 'Thinking…' }, typed: 'fix the tests', hints, header }),
        DRAFT,
      ],
    ];
    for (const [screen, reason] of cases) expect(verdict(screen)).toEqual(refuse(reason));
  });

  it('refuses without prompt focus, a pending cancel or shell mode', () => {
    const unfocused = grokScreen({
      status: { label: 'Thinking…' },
      placeholder: 'Build anything',
      footer: 'q/Esc:back  │  Ctrl+.:shortcuts',
    });
    expect(verdict(unfocused)).toEqual(refuse(UNFOCUSED));
    expect(verdict(grokScreen({ status: { label: 'Cancelling…' }, hints: WORKING }))).toEqual(
      refuse('Grok Build is already cancelling the turn.'),
    );
    expect(
      verdict(grokScreen({ glyph: '!', status: { label: 'Thinking…' }, hints: WORKING })),
    ).toEqual(refuse(OTHER_VIEW));
  });
});
