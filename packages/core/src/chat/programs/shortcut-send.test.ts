import '.';
// The shortcuts menu puts a command into the draft "for the user to send like any message"
// (apps/mobile useAgentShortcuts). On Chat's surface that send passes the program's send rules.

import { describe, expect, it } from 'vitest';
import { CHAT_PROGRAMS } from '../model/types';
import { chatCommands } from '../send/command-menu';
import { sendPolicyFor } from '../send/registry';
import { createSendRules } from '../send/rules';
import { programShortcuts } from './registry';

function refusedCommands(program: (typeof CHAT_PROGRAMS)[number]): string[] {
  const policy = sendPolicyFor(program);
  const rules = createSendRules(policy, chatCommands([], true, policy));
  return programShortcuts(program)
    .flatMap((shortcut) => (shortcut.kind === 'command' ? [shortcut.command] : []))
    .filter((command) => rules.validate(`${command} `) !== undefined);
}

describe('command shortcuts on the Chat surface', () => {
  it('lets /compact through for every program', () => {
    for (const program of CHAT_PROGRAMS) expect(refusedCommands(program)).not.toContain('/compact');
  });

  // Finding (agent lab, 2026-11-13): Chat's send rules refuse every `/` command outside its menu,
  // and the menu holds only /compact and the Host's skills, so a command shortcut inserted into
  // Chat's draft is refused as an unknown command when sent, for every program but /compact (seen
  // live: `/models` from Chat to OpenCode).
  // On the terminal surface it is sent as `/name ` with the trailing space the menu inserts, which
  // OpenCode 2.1.3 hands to the model as a prompt (seen live with `/sessions `). Not fixed here:
  // the commands need a submission form per program (OpenCode takes them bare) and a decision on
  // which ones Chat may send.
  it.skip('sends every command shortcut the menu offers', () => {
    for (const program of CHAT_PROGRAMS) expect(refusedCommands(program)).toEqual([]);
  });
});
