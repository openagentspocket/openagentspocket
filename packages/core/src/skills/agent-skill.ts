export type SkillScope = 'project' | 'global';

/**
 * One skill or custom slash command discovered for an Agent kind on a Host. For Claude Code these
 * are Agent Skills (`SKILL.md`); for other kinds, whatever that Agent calls its user-defined
 * commands. All are a name to insert and a description to read.
 */
export interface AgentSkill {
  readonly scope: SkillScope;
  /** The callable name: `code-review`, never `/code-review`. */
  readonly name: string;
  readonly description?: string;
  /** How the Agent invokes the name: `/`, `$` (Codex), `/skill:` (Pi, Kimi, omp). */
  readonly commandPrefix: string;
  /** Where the probe found the file on the Host, so the document can be fetched on demand. */
  readonly path: string;
  /** False when the frontmatter says `user-invocable: false`. */
  readonly isUserInvocable: boolean;
}

export function makeSkill(
  input: Pick<AgentSkill, 'scope' | 'name'> &
    Partial<Pick<AgentSkill, 'description' | 'commandPrefix' | 'path' | 'isUserInvocable'>>,
): AgentSkill {
  return {
    scope: input.scope,
    name: input.name,
    description: input.description,
    commandPrefix: input.commandPrefix ?? '/',
    path: input.path ?? '',
    isUserInvocable: input.isUserInvocable ?? true,
  };
}

/** The invocation as the composer expects it: `/code-review`, `$skill-name`, `/skill:pdf-tools`. */
export function skillCommand(skill: AgentSkill): string {
  return skill.commandPrefix + skill.name;
}

/** Stable identity across refreshes: commands are unique per scope after dedupe. */
export function skillId(skill: AgentSkill): string {
  return `${skill.scope}|${skillCommand(skill)}`;
}

/** What tapping the skill types into the terminal: the command and a space, never a submit. */
export function skillInsertionText(skill: AgentSkill): string {
  return `${skillCommand(skill)} `;
}
