import type { SkillSuggestionTrigger } from '../composer/suggestions';
import { foldedContains } from '../snippets/snippet';
import { type AgentSkill, skillCommand } from './agent-skill';

/** What the user typed after the prefix; the filter text. */
export function triggerQuery(trigger: SkillSuggestionTrigger): string {
  return trigger.query;
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
