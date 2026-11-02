import { foldedContains } from '../snippets/snippet';
import { type AgentSkill, skillCommand } from './agent-skill';

/**
 * An invocation token at the end of the Composer draft: `/rev`, `$pdf`, `/skill:web`. Detection
 * is suffix-based on purpose: editing earlier text never opens suggestions.
 */
export interface SkillSuggestionTrigger {
  /** The whole typed token, prefix included. */
  readonly token: string;
  /** The invocation prefix the token was recognized by. */
  readonly prefix: string;
}

/** What the user typed after the prefix; the filter text. */
export function triggerQuery(trigger: SkillSuggestionTrigger): string {
  return trigger.token.slice(trigger.prefix.length);
}

/**
 * The token at the end of the draft when it starts with one of the prefixes, the longest prefix
 * winning so `/skill:` beats `/`. A token starts at the draft's beginning or after whitespace:
 * `path/to` never triggers.
 */
export function detectSkillTrigger(
  draft: string,
  prefixes: readonly string[],
): SkillSuggestionTrigger | undefined {
  const boundary = draft.search(/\s\S*$/u);
  const token = boundary < 0 ? draft : draft.slice(boundary + 1);
  if (token === '') return undefined;
  const prefix = [...prefixes]
    .sort((a, b) => b.length - a.length)
    .find((candidate) => token.startsWith(candidate));
  return prefix === undefined ? undefined : { token, prefix };
}

/**
 * The skills worth suggesting: those whose full command continues the token (so `/sk` already
 * offers `/skill:web`) and, once a query exists, same-prefix skills whose name or description
 * contains it. Skills on another prefix never match a foreign token.
 */
export function skillsMatchingTrigger(
  trigger: SkillSuggestionTrigger,
  skills: readonly AgentSkill[],
): AgentSkill[] {
  const query = triggerQuery(trigger);
  return skills.filter((skill) => {
    if (skillCommand(skill).toLowerCase().startsWith(trigger.token.toLowerCase())) return true;
    if (skill.commandPrefix !== trigger.prefix || query === '') return false;
    return (
      foldedContains(skill.name, query) ||
      (skill.description !== undefined && foldedContains(skill.description, query))
    );
  });
}
