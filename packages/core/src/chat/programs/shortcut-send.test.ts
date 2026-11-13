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
import { programCommands } from './registry';

type Program = (typeof CHAT_PROGRAMS)[number];

// The program's whole menu: the shortcuts and every command the `/` panel lists.
const commandsOf = (program: Program): readonly CommandShortcut[] => programCommands(program);

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

  it("sends Claude Code's /context from Chat while idle, and holds it while the Agent works", () => {
    const policy = sendPolicyFor('claude');
    const context = commandsOf('claude').find((s) => s.command === '/context');
    if (!context) throw new Error('no /context');
    expect(commandShortcutDraft(context, 'chat', policy)).toEqual({
      surface: 'chat',
      text: '/context ',
    });
    const idle = createSendRules(policy, chatCommands([], true, policy));
    expect(idle.outgoingText('/context')).toBe('/context ');
    expect(idle.outgoingText('/context all')).toBe('/context all ');
    const busy = createSendRules(policy, chatCommands([], false, policy));
    expect(busy.validate('/context')).toEqual({ kind: 'commandAwaitsIdle', name: 'context' });
    // Only Claude Code records the command and its output; elsewhere it stays in the terminal.
    for (const program of CHAT_PROGRAMS) {
      if (program === 'claude') continue;
      expect(rulesOf(program).validate('/context')?.kind).not.toBeUndefined();
    }
  });

  // A typed command gets what a tapped one gets: the terminal, in the form the program runs.
  describe('a command typed in Chat that its menu does not offer', () => {
    const refusalFor = (program: Program, draft: string) => {
      const refusal = rulesOf(program).validate(draft);
      if (refusal?.kind !== 'unknownCommand') throw new Error(`${program} did not refuse ${draft}`);
      return refusal;
    };

    it('carries the same terminal text a tapped shortcut types, for every program', () => {
      for (const program of CHAT_PROGRAMS) {
        for (const shortcut of commandsOf(program)) {
          if (shortcut.runsIn === 'conversation') continue;
          const refusal = refusalFor(program, shortcut.command);
          const tapped = commandShortcutDraft(shortcut, 'chat', sendPolicyFor(program));
          expect(refusal.terminalText).toBe(tapped.text);
          expect(refusal.known).toBe(true);
        }
      }
    });

    it('is never sent through Chat, with or without arguments', () => {
      for (const program of CHAT_PROGRAMS) {
        for (const shortcut of commandsOf(program)) {
          if (shortcut.runsIn === 'conversation') continue;
          for (const draft of [shortcut.command, `${shortcut.command} `, `${shortcut.command} x`]) {
            expect(rulesOf(program).validate(draft)?.kind).toBe('unknownCommand');
          }
        }
      }
    });

    it('keeps the arguments typed, in the form each program accepts', () => {
      expect(refusalFor('opencode', '/sessions').terminalText).toBe('/sessions');
      expect(refusalFor('opencode', '/sessions all').terminalText).toBe('/sessions all');
      expect(refusalFor('claude', '/model').terminalText).toBe('/model ');
      expect(refusalFor('claude', '/model opus').terminalText).toBe('/model opus');
      expect(refusalFor('codex', '/review  main  ').terminalText).toBe('/review main');
    });

    it('says whether the program lists the command', () => {
      expect(refusalFor('claude', '/model').known).toBe(true);
      expect(refusalFor('claude', '/Model').known).toBe(true);
      expect(refusalFor('claude', '/frobnicate').known).toBe(false);
      expect(refusalFor('claude', '/frobnicate').terminalText).toBe('/frobnicate ');
    });
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
