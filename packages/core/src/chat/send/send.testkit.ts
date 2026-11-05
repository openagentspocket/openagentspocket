// Test support for the send side: skills, rules and menus built from a program's registered policy.

import { decodeAnsiScreen } from '../../blocked/ansi-decoder';
import type { AgentSkill } from '../../skills/agent-skill';
import { makeSkill } from '../../skills/agent-skill';
import type { ChatProgram } from '../model/types';
import { chatCommands } from './command-menu';
import type { ProgramSendPolicy } from './policy';
import { sendPolicyFor } from './registry';
import { createSendRules, type SendRules } from './rules';

export const SKILLS: readonly AgentSkill[] = [
  makeSkill({ scope: 'project', name: 'review', description: 'Review the diff' }),
  makeSkill({ scope: 'global', name: 'compact', description: 'A skill named like the command' }),
  makeSkill({ scope: 'global', name: 'deploy' }),
];

/** Rules and menu for a program (or an explicit policy) over `SKILLS` invoked with `prefix`. */
export function rulesFor(
  program: ChatProgram | ProgramSendPolicy,
  options: { idle?: boolean; prefix?: string; skills?: readonly AgentSkill[] } = {},
): SendRules {
  const policy = typeof program === 'string' ? sendPolicyFor(program) : program;
  const prefix = options.prefix ?? (policy.program === 'codex' ? '$' : '/');
  const skills = (options.skills ?? SKILLS).map((skill) => ({ ...skill, commandPrefix: prefix }));
  return createSendRules(policy, chatCommands(skills, options.idle ?? true, policy));
}

/** SGR sequences for synthetic screens (Swift tests' `SGR`). */
export const SGR = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  italic: '\u001b[3m',
  reverse: '\u001b[7m',
  fg: (r: number, g: number, b: number) => `\u001b[38;2;${r};${g};${b}m`,
  bg: (r: number, g: number, b: number) => `\u001b[48;2;${r};${g};${b}m`,
  claudeInactive: '\u001b[38;2;153;153;153m',
  /** A Claude input-box rule `width` cells wide. */
  claudeRule: (width: number) => `\u001b[0m\u001b[38;2;136;136;136m${'─'.repeat(width)}\u001b[0m`,
} as const;

/** A screen from rows of text with SGR sequences. */
export const syntheticScreen = (rows: readonly string[]) => decodeAnsiScreen(rows.join('\n'));
