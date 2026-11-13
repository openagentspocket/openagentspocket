import '.';
// A command shortcut on each surface (apps/mobile useAgentShortcuts): a command that runs in the
// conversation goes into Chat's draft and passes the program's send rules; any other moves to the
// Agent's terminal, typed in the form the program runs.

import { describe, expect, it } from 'vitest';
import { CHAT_PROGRAMS } from '../model/types';
import { chatCommands } from '../send/command-menu';
import { type CommandShortcut, commandShortcutDraft } from '../send/command-shortcut';
import { sendPolicyFor } from '../send/registry';
import { createSendRules } from '../send/rules';
import { programShortcuts } from './registry';

type Program = (typeof CHAT_PROGRAMS)[number];

const commandsOf = (program: Program): CommandShortcut[] =>
  programShortcuts(program).flatMap((shortcut) => (shortcut.kind === 'command' ? [shortcut] : []));

const rulesOf = (program: Program) => {
  const policy = sendPolicyFor(program);
  return createSendRules(policy, chatCommands([], true, policy));
};

describe('command shortcuts', () => {
  it('lets /compact through Chat for every program', () => {
    for (const program of CHAT_PROGRAMS) {
      const compact = commandsOf(program).find((shortcut) => shortcut.command === '/compact');
      if (!compact) continue;
      expect(compact.runsIn).toBe('conversation');
      expect(rulesOf(program).validate(`${compact.command} `)).toBeUndefined();
    }
  });

  // Found by the agent lab (2026-11-13): the menu put every command into Chat's draft, where the
  // send rules refuse all but /compact, and typed `/name ` on the terminal, which OpenCode 2.1.3
  // answers as a prompt (seen live with `/sessions `). The skipped test it replaces expected Chat
  // to send every command; that would push pickers and dialogs through Chat, so it asked for the
  // wrong thing.
  it('keeps in Chat only what Chat sends, and sends the rest to the terminal', () => {
    for (const program of CHAT_PROGRAMS) {
      const policy = sendPolicyFor(program);
      const rules = rulesOf(program);
      for (const shortcut of commandsOf(program)) {
        const draft = commandShortcutDraft(shortcut, 'chat', policy);
        if (shortcut.runsIn === 'conversation') {
          expect(draft.surface).toBe('chat');
          expect(rules.validate(draft.text)).toBeUndefined();
        } else {
          expect(draft.surface).toBe('terminal');
          // Chat would refuse it: the terminal is the only place it goes.
          expect(rules.validate(`${shortcut.command} `)).toBeDefined();
        }
      }
    }
  });

  it('types a command on the terminal in the form the program runs', () => {
    const typed = (program: Program, command: string) => {
      const shortcut = commandsOf(program).find((s) => s.command === command);
      if (!shortcut) throw new Error(`${program} has no ${command}`);
      return commandShortcutDraft(shortcut, 'terminal', sendPolicyFor(program));
    };
    // OpenCode runs a command bare from its popup; a space makes it a prompt.
    expect(typed('opencode', '/sessions')).toEqual({ surface: 'terminal', text: '/sessions' });
    expect(typed('opencode', '/compact')).toEqual({ surface: 'terminal', text: '/compact' });
    expect(typed('omp', '/compact').text).toBe('/compact');
    // The others take the trailing space that closes their completion popup.
    expect(typed('claude', '/model')).toEqual({ surface: 'terminal', text: '/model ' });
    expect(typed('codex', '/review').text).toBe('/review ');
  });

  it("sends /compact from Chat in the program's own form", () => {
    for (const program of ['opencode', 'claude'] as const) {
      const compact = commandsOf(program).find((s) => s.command === '/compact');
      if (!compact) throw new Error('no /compact');
      const draft = commandShortcutDraft(compact, 'chat', sendPolicyFor(program));
      expect(draft).toEqual({ surface: 'chat', text: '/compact ' });
      const sent = rulesOf(program).outgoingText(draft.text);
      expect(sent).toBe(program === 'opencode' ? '/compact' : '/compact ');
    }
  });

  it('moves every command to the terminal for a program Chat does not send to', () => {
    const compact = commandsOf('claude').find((s) => s.command === '/compact');
    if (!compact) throw new Error('no /compact');
    expect(commandShortcutDraft(compact, 'chat', null)).toEqual({
      surface: 'terminal',
      text: '/compact ',
    });
  });
});
