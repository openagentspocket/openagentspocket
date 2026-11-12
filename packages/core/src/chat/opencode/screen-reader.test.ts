import '../programs';
// OpenCode 2.0.32's input box as captured live at 180 and 62 columns (Swift
// OpenCodeInputBoxDetectorTests). Only an empty box in a conversation with no turn running takes a
// message; the home screen, drafts, popups, pickers, shell mode, the subagent panel and a running
// turn hold it with what the terminal can resolve.

import { describe, expect, it } from 'vitest';
import { decodeAnsiScreen } from '../../blocked/ansi-decoder';
import { textWidth } from '../../blocked/cell-width';
import { screenFixtures } from '../../blocked/golden-fixtures.testkit';
import { detectInputBox } from '../send/detect';
import { type InputBoxState, preSendCheck } from '../send/input-box';
import { sendPolicyFor } from '../send/registry';
import { SGR, syntheticScreen } from '../send/send.testkit';
import { type OpenCodeRoute, readOpenCodeScreen } from './screen-reader';

const policy = sendPolicyFor('opencode');
const fixtures = new Map(screenFixtures('opencode').map((fixture) => [fixture.name, fixture]));
const screenOf = (stem: string) => {
  const fixture = fixtures.get(stem);
  if (!fixture) throw new Error(`no capture ${stem}`);
  return fixture;
};
const detect = (stem: string) => detectInputBox(screenOf(stem).screen, policy);

const HOME =
  'OpenCode is on its home screen, where a message starts a new conversation. Open this conversation in the terminal first.';
const PANEL =
  'OpenCode shows its subagent panel instead of the input box. Close it in the terminal first.';
const WORKING = "OpenCode is working. Send once it's idle, or steer from the terminal.";
const AGENTS_COMMAND = '/agents       Switch agent';
const OPENCODE_SKILL =
  '@opencode Use this skill for any question about OpenCode itself, including how OpenCode works, using or configuring it, migrating from V1 to V2, troubleshooting it, de  skill';
const RECALLED =
  'Use the task tool with a general subagent to run ls -la in this directory and summarize it, then reply in one line.';
const WRAPPED = [
  'Reply with the word kiwi, then name three fruits that',
  'grow on trees in warm climates, one per line.',
  'Keep the whole answer short.',
].join('\n');

interface Expected {
  route: OpenCodeRoute | null;
  state: InputBoxState;
}
/** A prompt in the box's place has no route: the Blocked parser reads it before the box is looked for. */
const dialog: Expected = { route: null, state: { kind: 'dialog', title: null } };
const empty: Expected = { route: 'session', state: { kind: 'empty', placeholder: null } };
const text = (value: string): Expected => ({
  route: 'session',
  state: { kind: 'text', text: value },
});
const noComposer = (route: OpenCodeRoute, reason: string): Expected => ({
  route,
  state: { kind: 'noComposer', reason },
});
const overlay = (row: string): Expected => ({ route: 'session', state: { kind: 'overlay', row } });
const working: Expected = { route: 'session', state: { kind: 'disabled', reason: WORKING } };
const shell: Expected = { route: 'session', state: { kind: 'shellMode', command: '' } };

const EXPECTED: Record<string, Expected> = {
  'opencode-01-home-empty-180': noComposer('home', HOME),
  'opencode-02-session-empty-180': empty,
  'opencode-03-session-draft-180': text('A draft line that is not sent'),
  'opencode-04-slash-popup-180': overlay(AGENTS_COMMAND),
  'opencode-05-slash-space-180': text('/'),
  'opencode-06-at-popup-180': overlay(OPENCODE_SKILL),
  'opencode-07-shell-mode-180': shell,
  'opencode-08-working-180': working,
  'opencode-09-armed-180': working,
  'opencode-10-permission-180': dialog,
  'opencode-11-permission-right1-180': dialog,
  'opencode-12-permission-right2-180': dialog,
  'opencode-13-question-180': dialog,
  'opencode-14-session-picker-180': overlay('Sessions for proj'),
  'opencode-15-subagent-panel-180': noComposer('subagentPanel', PANEL),
  'opencode-16-child-view-180': noComposer('subagentPanel', PANEL),
  'opencode-17-recalled-draft-180': text(RECALLED),
  'opencode-18-home-after-new-180': noComposer('home', HOME),
  'opencode-19-undo-draft-180': text('Reply with exactly: three.'),
  'opencode-20-pasted-lines-180': text('[Pasted ~1 lines]'),
  'opencode-21-done-interrupted-180': empty,
  'opencode-22-home-draft-180': {
    route: 'home',
    state: { kind: 'text', text: 'Reply with the word kiwi' },
  },
  'opencode-23-at-space-180': text('@'),
  'opencode-24-after-ctrl-u-180': empty,
  'opencode-25-reject-feedback-180': dialog,
  'opencode-26-session-command-draft-180': text('/new'),
  'opencode-27-permission-shell-180': dialog,
  'opencode-28-permission-shell-right1-180': dialog,
  'opencode-29-permission-shell-next-180': dialog,
  'opencode-30-home-empty-62': noComposer('home', HOME),
  'opencode-31-home-draft-62': {
    route: 'home',
    state: { kind: 'text', text: 'Reply with the word kiwi' },
  },
  'opencode-32-session-empty-62': empty,
  'opencode-33-wrapped-draft-62': text(WRAPPED),
  'opencode-34-pasted-lines-62': text('[Pasted ~3 lines]'),
  'opencode-35-working-62': working,
  'opencode-36-armed-62': working,
  'opencode-37-permission-long-62': dialog,
  'opencode-38-question-long-62': dialog,
  'opencode-39-slash-popup-62': overlay(AGENTS_COMMAND),
  'opencode-40-shell-mode-62': shell,
  'opencode-41-subagent-panel-62': noComposer('subagentPanel', PANEL),
  'opencode-42-reject-feedback-62': dialog,
  'opencode-43-queued-dock-62': working,
};

describe('OpenCode input box captures', () => {
  it('has every capture', () => {
    expect([...fixtures.keys()].sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  describe.each(Object.entries(EXPECTED))('%s', (stem, expected) => {
    it('reads as its state', () => {
      expect(detect(stem)).toEqual(expected.state);
      if (expected.route)
        expect(readOpenCodeScreen(screenOf(stem).screen).route).toBe(expected.route);
    });
  });

  it('holds a working session with the footer, whatever herdr reports', () => {
    for (const stem of [
      'opencode-08-working-180',
      'opencode-09-armed-180',
      'opencode-35-working-62',
      'opencode-36-armed-62',
    ]) {
      const state = detect(stem);
      expect(state).toEqual({ kind: 'disabled', reason: WORKING });
      for (const activity of ['working', 'idle', 'unknown'] as const) {
        expect(preSendCheck(state, activity)).toEqual({ kind: 'hold', state });
      }
    }
  });

  it('reads the footer for a running turn and an armed Esc', () => {
    const captures: [string, boolean, boolean][] = [
      ['opencode-02-session-empty-180', false, false],
      ['opencode-07-shell-mode-180', false, false],
      ['opencode-08-working-180', true, false],
      ['opencode-09-armed-180', true, true],
      ['opencode-21-done-interrupted-180', false, false],
      ['opencode-32-session-empty-62', false, false],
      ['opencode-35-working-62', true, false],
      ['opencode-36-armed-62', true, true],
      ['opencode-43-queued-dock-62', true, false],
    ];
    for (const [stem, running, armed] of captures) {
      const read = readOpenCodeScreen(screenOf(stem).screen);
      expect([stem, read.isRunning, read.isArmed]).toEqual([stem, running, armed]);
    }
  });

  it('finds the box by its text and layout, with no color at all', () => {
    for (const [stem, fixture] of fixtures) {
      const colourless = fixture.ansi.replace(SGR_PATTERN, '');
      expect([stem, readOpenCodeScreen(decodeAnsiScreen(colourless))]).toEqual([
        stem,
        readOpenCodeScreen(fixture.screen),
      ]);
    }
  });
});

// A synthetic conversation in OpenCode's default dark theme, as the captures draw it.
const SCREEN_FILL = SGR.bg(10, 10, 10);
const BOX_FILL = SGR.bg(30, 30, 30);
const BUILD_ACCENT = SGR.fg(92, 156, 245);
const SHELL_ACCENT = SGR.fg(250, 178, 131);
const TEXT = SGR.fg(238, 238, 238);
const MUTED = SGR.fg(128, 128, 128);
const COLUMNS = 62;
// biome-ignore lint/suspicious/noControlCharactersInRegex: SGR sequences start with ESC
const SGR_PATTERN = /\u001b\[[0-9;]*m/gu;
const strip = (styled: string) => styled.replace(SGR_PATTERN, '');

const BUILD_LABEL = `${BUILD_ACCENT}Build ${MUTED}· ${TEXT}GPT-6 Astra`;
const footer = (content: string) => `${SCREEN_FILL}  ${content}${SGR.reset}`;
const IDLE_FOOTER = footer(`${MUTED}~/project:main  ${TEXT}ctrl+p ${MUTED}commands`);

function boxRow(content = '', accent = BUILD_ACCENT): string {
  const inner = content === '' ? '' : `  ${content}`;
  const padding = ' '.repeat(COLUMNS - 5 - textWidth(strip(inner)));
  return `${SCREEN_FILL}  ${accent}┃${BOX_FILL}${inner}${BOX_FILL}${padding}${SCREEN_FILL}  ${SGR.reset}`;
}

function edge(accent = BUILD_ACCENT): string {
  return `${SCREEN_FILL}  ${accent}╹${SGR.fg(30, 30, 30)}${'▀'.repeat(COLUMNS - 5)}${SGR.fg(255, 255, 255)}  ${SGR.reset}`;
}

function prompt(
  options: { input?: string[]; label?: string; accent?: string; footer?: string } = {},
) {
  const accent = options.accent ?? BUILD_ACCENT;
  const box = [
    boxRow('', accent),
    ...(options.input ?? ['']).map((row) => boxRow(row, accent)),
    boxRow('', accent),
    boxRow(options.label ?? BUILD_LABEL, accent),
  ];
  return syntheticScreen(['   Done.', '', ...box, edge(accent), options.footer ?? IDLE_FOOTER, '']);
}

describe('OpenCode prompt, synthetic', () => {
  it('reads the home placeholder as home, and the same words in the text color as a draft', () => {
    const words = 'Ask anything… "Fix a TODO in the codebase"';
    const placeholder = readOpenCodeScreen(prompt({ input: [MUTED + words] }));
    expect(placeholder.route).toBe('home');
    expect(placeholder.state).toEqual({ kind: 'noComposer', reason: HOME });
    const typed = readOpenCodeScreen(prompt({ input: [TEXT + words] }));
    expect(typed.route).toBe('session');
    expect(typed.state).toEqual({ kind: 'text', text: words });
  });

  it('reads shell mode with the command typed so far, and its own home placeholder', () => {
    const shellFooter = footer(`${MUTED}~/project:main  ${TEXT}esc ${MUTED}exit shell mode`);
    const label = `${SHELL_ACCENT}Shell`;
    const typed = prompt({
      input: [`${TEXT}ls -la`],
      label,
      accent: SHELL_ACCENT,
      footer: shellFooter,
    });
    expect(readOpenCodeScreen(typed).state).toEqual({ kind: 'shellMode', command: 'ls -la' });
    const home = prompt({
      input: [`${MUTED}Run a command… "git diff"`],
      label,
      accent: SHELL_ACCENT,
      footer: shellFooter,
    });
    expect(readOpenCodeScreen(home).route).toBe('home');
    expect(readOpenCodeScreen(home).state).toEqual({ kind: 'shellMode', command: '' });
  });

  it('reads no box without the edge row, and no recognized box with an edge alone', () => {
    const transcript = syntheticScreen(["   I'll check the tests.", '', '   Done.', '']);
    expect(readOpenCodeScreen(transcript)).toMatchObject({
      route: 'unknown',
      state: { kind: 'unknown', reason: "OpenCode's input box is not on screen." },
    });
    const edgeOnly = syntheticScreen(['   Done.', '', edge(), IDLE_FOOTER, '']);
    expect(readOpenCodeScreen(edgeOnly)).toMatchObject({
      route: 'unknown',
      state: { kind: 'unknown', reason: "OpenCode's input box is not recognized." },
    });
  });

  it('reads `[⋯]` as a running turn with animations off', () => {
    const still = readOpenCodeScreen(
      prompt({ footer: footer(`${TEXT}[⋯] esc...rupt  ${MUTED}ctrl+p commands`) }),
    );
    expect(still.isRunning).toBe(true);
    expect(still.isArmed).toBe(false);
    expect(still.state).toEqual({ kind: 'disabled', reason: WORKING });
  });
});
