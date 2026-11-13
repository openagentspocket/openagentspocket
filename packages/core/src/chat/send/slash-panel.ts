// The Composer's `/` panel on both surfaces: the program's own commands (its definition's menu)
// above the Agent's skills (the Host's), both filtered by what follows the `/`, best matches
// first. Picking an entry only writes a draft: a command goes where `commandShortcutDraft` says
// it runs, so Chat keeps only what its send rules let through; nothing is sent on its own.

import type { ComposerRoute } from '../../composer/policy';
import type { Message } from '../../errors/text';
import { type AgentSkill, skillCommand, skillInsertionText } from '../../skills/agent-skill';
import { type ProgramCommand, programCommands } from '../programs/registry';
import type { CommandArgument } from '../programs/shortcuts';
import { SKILL_COMMAND_PREFIX } from './command-menu';
import { commandShortcutDraft } from './command-shortcut';
import type { ChatCommand, ProgramSendPolicy } from './policy';

/** A program command in the panel, with the draft picking it writes and where. */
export interface PanelCommand {
  /** `/model`. */
  readonly name: string;
  readonly title: Message;
  readonly argument: CommandArgument;
  /** The surface the draft goes to; not the user's surface means the panel takes them there. */
  readonly surface: ComposerRoute;
  readonly text: string;
  /** False while Chat holds the command (`/compact` mid-turn): picking it does nothing. */
  readonly enabled: boolean;
}

/** A skill in the panel: the invocation it shows and the text picking it writes. */
export interface PanelSkill {
  readonly name: string;
  readonly description: string | null;
  readonly text: string;
}

export interface SlashPanel {
  readonly commands: readonly PanelCommand[];
  readonly skills: readonly PanelSkill[];
}

export interface SlashPanelInput {
  readonly draft: string;
  /** The surface the Composer is on. */
  readonly surface: ComposerRoute;
  /** The Agent's program, as herdr reports it. */
  readonly program: string;
  /** The program's send policy; null for a program Chat does not send to. */
  readonly policy: ProgramSendPolicy | null;
  /** Chat's own menu (`chatCommands`): which skills Chat offers, and what waits for idle. */
  readonly chatMenu: readonly ChatCommand[];
  /** The Host's skills for the Agent, which the terminal offers as the program types them. */
  readonly skills: readonly AgentSkill[];
  /** The Composer can take the user to the terminal; without it a command that runs there is left out. */
  readonly terminalReachable: boolean;
}

/** What follows a leading `/`, or null when the panel stays closed (a space or a path typed). */
function slashQuery(draft: string): string | null {
  if (!draft.startsWith('/')) return null;
  const query = draft.slice(1);
  return /\s/u.test(query) || query.includes('/') ? null : query.toLowerCase();
}

/** How well `name` and its words match the query: lower is better, null is no match. */
function rank(name: string, words: string, query: string): number | null {
  if (query === '') return 0;
  const lower = name.toLowerCase();
  if (lower === query) return 0;
  if (lower.startsWith(query)) return 1;
  if (lower.includes(query)) return 2;
  return words.toLowerCase().includes(query) ? 3 : null;
}

/** Entries that match, best first; equal ranks keep the list's order (shortcuts lead). */
function ranked<T>(entries: readonly T[], score: (entry: T) => number | null): T[] {
  return entries
    .map((entry, index) => ({ entry, index, score: score(entry) }))
    .filter((item): item is { entry: T; index: number; score: number } => item.score !== null)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((item) => item.entry);
}

/** The skills a surface offers: Chat's menu on Chat, the Host's list as typed on the terminal. */
function surfaceSkills(input: SlashPanelInput): (PanelSkill & { prefix: string })[] {
  if (input.surface === 'chat') {
    return input.chatMenu.flatMap((entry) =>
      entry.kind.type === 'skill'
        ? [
            {
              name: `/${entry.name}`,
              description: entry.summary,
              text: `/${entry.name} `,
              prefix: entry.kind.prefix,
            },
          ]
        : [],
    );
  }
  const seen = new Set<string>();
  return input.skills.flatMap((skill) => {
    const name = skillCommand(skill);
    if (!skill.isUserInvocable || seen.has(name)) return [];
    seen.add(name);
    return [
      {
        name,
        description: skill.description ?? null,
        text: skillInsertionText(skill),
        prefix: skill.commandPrefix,
      },
    ];
  });
}

/** The bare name a skill is matched on: `/pdf`, `$pdf` and `/skill:pdf` all match `pdf`. */
const bareSkillName = (skill: PanelSkill & { prefix: string }): string =>
  skill.name.slice(skill.name.startsWith(skill.prefix) ? skill.prefix.length : 1);

/** A skill typed in its `/skill:` form matches by the name after it. */
function skillQuery(query: string, prefix: string): string {
  const typed = SKILL_COMMAND_PREFIX.slice(1);
  return prefix === SKILL_COMMAND_PREFIX && query.startsWith(typed)
    ? query.slice(typed.length)
    : query;
}

function panelCommand(command: ProgramCommand, input: SlashPanelInput): PanelCommand {
  const draft = commandShortcutDraft(command, input.surface, input.policy);
  const held = input.chatMenu.find((entry) => `/${entry.name}` === command.command);
  return {
    name: command.command,
    title: command.title,
    argument: command.argument,
    surface: draft.surface,
    text: draft.text,
    enabled: draft.surface !== 'chat' || (held?.isEnabled ?? true),
  };
}

/**
 * The `/` panel for a draft, or null while it stays closed. Commands come from the program's
 * definition (none for a program Chat does not know), skills from the Host; a skill named like a
 * command hides the command, as the program runs the skill. Chat without a send policy offers no
 * skills, as before.
 */
export function slashPanel(input: SlashPanelInput): SlashPanel | null {
  const query = slashQuery(input.draft);
  if (query === null) return null;
  const skills = input.surface === 'chat' && !input.policy ? [] : surfaceSkills(input);
  const skillNames = new Set(skills.map(bareSkillName));
  const commands = programCommands(input.program)
    .filter((command) => !skillNames.has(command.command.slice(1)))
    .map((command) => panelCommand(command, input))
    .filter((command) => command.surface === input.surface || input.terminalReachable);
  return {
    commands: ranked(commands, (command) => rank(command.name.slice(1), command.title.key, query)),
    skills: ranked(skills, (skill) =>
      rank(bareSkillName(skill), skill.description ?? '', skillQuery(query, skill.prefix)),
    ).map(({ prefix: _prefix, ...skill }) => skill),
  };
}
