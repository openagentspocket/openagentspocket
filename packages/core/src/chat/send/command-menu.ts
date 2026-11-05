// Chat's `/` menu for every program (Swift ChatCommandMenu, ADR 0024): the Host's skills plus
// `/compact`. Commands that open pickers or end sessions are left out; the terminal still runs
// them. Which skills a program is offered is the policy's (`offersSkill`).

import type { AgentSkill } from '../../skills/agent-skill';
import type { ChatCommand, ProgramSendPolicy } from './policy';

/** The prefix a skill typed in its qualified form carries. */
export const SKILL_COMMAND_PREFIX = '/skill:';

export function chatCommands(
  skills: readonly AgentSkill[],
  agentIsIdle: boolean,
  policy: ProgramSendPolicy,
): ChatCommand[] {
  const commands: ChatCommand[] = [
    {
      name: 'compact',
      summary: 'Summarize the conversation to free up context',
      kind: { type: 'compact' },
      isEnabled: agentIsIdle,
    },
  ];
  const names = new Set(['compact']);
  // Filtered before the dedupe, so a template listed first cannot hide the skill of the same name.
  for (const skill of skills) {
    if (!policy.offersSkill(skill) || names.has(skill.name)) continue;
    names.add(skill.name);
    commands.push({
      name: skill.name,
      summary: skill.description ?? null,
      kind: { type: 'skill', prefix: skill.commandPrefix },
      isEnabled: true,
    });
  }
  return commands;
}

/** `name` without the `skill:` it was typed with, when `command` is a skill invoked that way. */
function skillFormName(name: string, command: ChatCommand): string | null {
  const typedPrefix = SKILL_COMMAND_PREFIX.slice(1);
  if (
    command.kind.type !== 'skill' ||
    command.kind.prefix !== SKILL_COMMAND_PREFIX ||
    !name.startsWith(typedPrefix)
  ) {
    return null;
  }
  return name.slice(typedPrefix.length);
}

/**
 * The entries to suggest for a draft, or null when the menu stays closed: it opens only while a
 * leading `/` is followed by a partial name, before any space. A `/skill:` skill also matches when
 * typed in that form.
 */
export function commandSuggestions(
  draft: string,
  commands: readonly ChatCommand[],
): ChatCommand[] | null {
  if (!draft.startsWith('/')) return null;
  const query = draft.slice(1);
  if (/\s/u.test(query) || query.includes('/')) return null;
  const needle = query.toLowerCase();
  return commands.filter((command) => {
    const typed = skillFormName(needle, command) ?? needle;
    return typed === '' || command.name.toLowerCase().startsWith(typed);
  });
}

/** The command `name` names: its own entry, or a `/skill:` skill typed with the prefix. */
export function commandNamed(name: string, commands: readonly ChatCommand[]): ChatCommand | null {
  return (
    commands.find((command) => command.name === name) ??
    commands.find((command) => skillFormName(name, command) === command.name) ??
    null
  );
}

/** A skill as Chat's Composer takes it: `/name`, which the send turns into the program's own form. */
export const chatInsertionText = (skill: AgentSkill): string => `/${skill.name} `;
