import '../programs';
// OpenCode on the send side: rules, menu, stop plan and guard, terminal title and holds (Swift
// ChatSendRulesTests, ChatStopPlanTests, ChatDeliveryPolicyTests and OpenCodeChatStoreTests'
// terminal-title test, OpenCode parts).

import { describe, expect, it } from 'vitest';
import { screenFixtures } from '../../blocked/golden-fixtures.testkit';
import { detectInputBox, holdReason } from '../send/detect';
import { sendPolicyFor } from '../send/registry';
import { rulesFor } from '../send/send.testkit';
import { openCodeStopGuard } from './stop-guard';
import { expectedOpenCodeTitle, openCodeTitleVerdict } from './terminal-title';

const policy = sendPolicyFor('opencode');
const screens = new Map(
  screenFixtures('opencode').map((fixture) => [fixture.name, fixture.screen]),
);
const screen = (stem: string) => {
  const found = screens.get(stem);
  if (!found) throw new Error(`no capture ${stem}`);
  return found;
};
const unsafe = (reason: string) => ({ kind: 'unsafeText', reason });
const rules = () => rulesFor('opencode', { skills: [] });

const PATH_ONLY = unsafe(
  "OpenCode can take a message that is only a file path as an attachment instead of text. Start with a few words, such as what to do with the file, and OpenCode's agent can read it from its path.",
);

describe('OpenCode send policy', () => {
  it('declares its flags', () => {
    expect(policy).toMatchObject({
      program: 'opencode',
      chatName: 'OpenCode',
      echoesByEntry: true,
      echoClockStopsWhileWorking: false,
      recordsCompactionBeforeNextPrompt: true,
      stopReturnsUntakenSends: false,
      mayRefillInputBoxAfterSend: false,
      terminalStop: true,
    });
    expect(policy.terminalTitle).toBeDefined();
  });

  it.each(['exit', 'quit', ':q', '  QUIT \n', ':wq!'])('never sends the exit word %j', (draft) => {
    expect(rules().validate(draft)).toEqual(
      unsafe('Sending this would exit OpenCode. Open the terminal to exit.'),
    );
  });

  it('sends /compact bare and refuses instructions', () => {
    const r = rules();
    expect(r.validate('/compact')).toBeUndefined();
    expect(r.outgoingText('/compact')).toBe('/compact');
    expect(r.outgoingText('  /compact \n')).toBe('/compact');
    expect(r.validate('/compact keep the API notes')).toEqual({
      kind: 'commandUnavailable',
      reason: "OpenCode's /compact takes no instructions. Send /compact alone.",
    });
  });

  it('offers no skills or commands but /compact', () => {
    const r = rulesFor('opencode');
    expect(r.commands.map((command) => command.name)).toEqual(['compact']);
    expect(r.validate('/review the diff')).toEqual({ kind: 'unknownCommand', name: 'review' });
    for (const name of ['new', 'sessions', 'undo', 'btw', 'cd', 'rename']) {
      expect(r.validate(`/${name}`)).toEqual({ kind: 'unknownCommand', name });
    }
  });

  it.each([
    '/home/dev/shot.png',
    "'/home/dev/My Shots/a.JPG'",
    'file:///home/dev/doc.pdf',
    'a.png b.webp',
    'shot.svg',
    '~/notes.txt',
    './build.log',
    '../README.md',
    '/home/dev/notes.txt',
    '/home/dev/My\\ Shots/a.png',
    '/home/dev/My Great Shots/a.png',
  ])('refuses a draft of only paths: %j', (draft) => {
    expect(rules().validate(draft)).toEqual(PATH_ONLY);
    expect(rules().validate(`what is in ${draft}`)).toBeUndefined();
  });

  it.each([
    ['/git/commit fix the typo', 'git/commit'],
    ['/usr/bin/env python3 is missing', 'usr/bin/env'],
    ['/review/pr\n12', 'review/pr'],
  ])('refuses a leading command path: %j', (draft, name) => {
    expect(rules().validate(draft)).toEqual(
      unsafe(
        `OpenCode can run a message starting with /${name} as one of its commands. Start with another word, or open the terminal to run it.`,
      ),
    );
    expect(rules().validate('/git/commit')).toBeDefined();
  });

  it.each([
    'look at /home/dev/shot.png',
    'a.png is broken',
    'https://example.invalid/a.png',
    'notes.txt',
  ])('sends paths inside text: %j', (draft) => {
    expect(rules().validate(draft)).toBeUndefined();
    expect(rules().outgoingText(draft)).toBe(`${draft} `);
  });

  it.each(['add @MainActor', 'cc @alice', 'mail a@b.c'])(
    'ends a send with one space: %j',
    (draft) => {
      expect(rules().validate(draft)).toBeUndefined();
      expect(rules().outgoingText(draft)).toBe(`${draft} `);
    },
  );
});

describe('OpenCode holds', () => {
  it('names undo and history beside a draft', () => {
    expect(holdReason({ kind: 'text', text: 'draft' }, policy)).toBe(
      "The Agent's input box already has text, such as a draft, a prompt /undo put back, or one recalled with Up. Send or clear it in the terminal first.",
    );
  });

  it('holds home and a working turn with their own reasons', () => {
    expect(holdReason(detectInputBox(screen('opencode-01-home-empty-180'), policy), policy)).toBe(
      'OpenCode is on its home screen, where a message starts a new conversation. Open this conversation in the terminal first.',
    );
    expect(holdReason(detectInputBox(screen('opencode-08-working-180'), policy), policy)).toBe(
      "The Agent isn't taking messages: OpenCode is working. Send once it's idle, or steer from the terminal.",
    );
  });
});

describe('OpenCode Stop', () => {
  const NOTICE =
    'Esc went twice, but OpenCode still shows Working. If a message was waiting during this turn, OpenCode runs it after a stop; tap Stop again to stop that too. In the terminal, use Esc, not Ctrl+C, which exits OpenCode when its input is empty.';
  const verdict = (
    stem: string,
    activity: 'working' | 'idle' | 'blocked' | 'unknown' = 'working',
  ) => openCodeStopGuard({ screen: screen(stem), activity });

  it('presses Esc twice behind a guard, never Ctrl+C', () => {
    expect(policy.stop.keys).toEqual(['esc', 'esc']);
    expect(policy.stop.screenGuard).toBeDefined();
    expect(policy.stop.wait).toEqual({ windowMs: 3000, unconfirmedNotice: NOTICE });
    expect(policy.stop.accessibilityHint).toBe('Presses Esc twice to interrupt OpenCode');
    expect(policy.stop.keys.every((key) => key === 'esc')).toBe(true);
  });

  it.each([
    'opencode-08-working-180',
    'opencode-09-armed-180',
    'opencode-35-working-62',
    'opencode-36-armed-62',
    'opencode-43-queued-dock-62',
  ])('presses on a running turn: %s', (stem) => {
    expect(verdict(stem)).toEqual({ kind: 'press' });
  });

  const ANSWER =
    'OpenCode is asking for an answer, and Esc would reject it. Answer the card, or stop in the terminal.';
  const MENU =
    "A menu is open over OpenCode's prompt, and Esc would only close it. Close it in the terminal first.";
  const SHELL =
    "OpenCode's prompt is in shell mode, where Esc only leaves it. Stop it in the terminal.";
  const ELSEWHERE =
    "OpenCode isn't showing this conversation's prompt, so Stop pressed nothing. Stop it in the terminal.";
  const IDLE = "OpenCode's screen shows no running turn, so Stop pressed nothing.";

  it.each([
    ['opencode-10-permission-180', ANSWER],
    ['opencode-13-question-180', ANSWER],
    ['opencode-25-reject-feedback-180', ANSWER],
    ['opencode-37-permission-long-62', ANSWER],
    ['opencode-38-question-long-62', ANSWER],
    ['opencode-04-slash-popup-180', MENU],
    ['opencode-06-at-popup-180', MENU],
    ['opencode-14-session-picker-180', MENU],
    ['opencode-39-slash-popup-62', MENU],
    ['opencode-07-shell-mode-180', SHELL],
    ['opencode-40-shell-mode-62', SHELL],
    ['opencode-15-subagent-panel-180', ELSEWHERE],
    ['opencode-41-subagent-panel-62', ELSEWHERE],
    ['opencode-01-home-empty-180', ELSEWHERE],
    ['opencode-30-home-empty-62', ELSEWHERE],
    ['opencode-21-done-interrupted-180', IDLE],
    ['opencode-32-session-empty-62', IDLE],
  ])('refuses where Esc would do something else: %s', (stem, reason) => {
    expect(verdict(stem)).toEqual({ kind: 'refuse', reason });
  });

  it.each(['idle', 'blocked', 'unknown'] as const)(
    'refuses when herdr reports %s, whatever the footer shows',
    (activity) => {
      expect(verdict('opencode-08-working-180', activity)).toEqual({
        kind: 'refuse',
        reason: 'The turn already ended, so Stop pressed nothing.',
      });
    },
  );
});

describe('OpenCode terminal title', () => {
  const LONG = 'Summarize the directory listing and its subfolders in one short paragraph';
  const FALLBACK = 'New session - 2026-10-20T08:15:30.123Z';

  it('truncates like OpenCode', () => {
    const forty = 'a'.repeat(40);
    const fortyOne = 'b'.repeat(41);
    // The emoji takes UTF-16 units 36 and 37: the cut after 37 splits it.
    const emoji = 'abcdefghijklmnopqrstuvwxyz0123456789\u{1F600}tail';
    expect(expectedOpenCodeTitle('Apple')).toBe('OC | Apple');
    expect(expectedOpenCodeTitle(forty)).toBe(`OC | ${forty}`);
    expect(expectedOpenCodeTitle(fortyOne)).toBe(`OC | ${'b'.repeat(37)}…`);
    expect(expectedOpenCodeTitle(LONG)).toBe('OC | Summarize the directory listing and i…');
    expect(expectedOpenCodeTitle(emoji)).toBe('OC | abcdefghijklmnopqrstuvwxyz0123456789�…');
    for (const untitled of [null, '', FALLBACK, 'Child session - 2026-10-20T08:15:30.123Z']) {
      expect(expectedOpenCodeTitle(untitled)).toBe('OpenCode');
    }
    expect(expectedOpenCodeTitle('New session - today')).toBe('OC | New session - today');
  });

  it('says which conversation the TUI shows', () => {
    expect(openCodeTitleVerdict('OC | Apple', 'Apple')).toEqual({ kind: 'matches' });
    expect(openCodeTitleVerdict('OC | Summarize the directory listing and i…', LONG)).toEqual({
      kind: 'matches',
    });
    expect(openCodeTitleVerdict('OC | Other', 'Apple')).toEqual({
      kind: 'differs',
      title: 'Other',
    });
    expect(openCodeTitleVerdict('OC | Apple', null)).toEqual({ kind: 'differs', title: 'Apple' });
    // The home screen writes `OpenCode` too, so it never matches.
    for (const title of ['OpenCode', null, 'zsh', 'OC |']) {
      expect(openCodeTitleVerdict(title, null)).toEqual({ kind: 'saysNothing' });
      expect(openCodeTitleVerdict(title, 'Apple')).toEqual({ kind: 'saysNothing' });
    }
    expect(policy.terminalTitle?.verdict('OC | Apple', 'Apple')).toEqual({ kind: 'matches' });
  });
});
