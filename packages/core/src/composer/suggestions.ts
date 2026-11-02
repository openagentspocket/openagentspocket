/** A Skill (or command) the Composer can suggest; `command` is the full invocation, prefix included. */
export interface ComposerSkill {
  readonly name: string;
  readonly command: string;
  readonly commandPrefix: string;
  readonly description?: string;
}

/** The token at the end of the draft that a suggestion menu completes. */
export interface SkillSuggestionTrigger {
  /** The whole typed token, prefix included. */
  readonly token: string;
  /** The invocation prefix the token was recognized by. */
  readonly prefix: string;
  /** What the user typed after the prefix; the filter text. */
  readonly query: string;
}

/**
 * The last token of the draft when it starts with one of the prefixes, longest prefix winning so
 * `/skill:` beats `/`. A token starts at the draft's beginning or after whitespace, so `path/to`
 * never triggers.
 */
export function detectSkillTrigger(
  draft: string,
  prefixes: readonly string[],
): SkillSuggestionTrigger | undefined {
  const boundary = draft.search(/\s\S*$/);
  const token = boundary === -1 ? draft : draft.slice(boundary + 1);
  if (token.length === 0) return undefined;
  const prefix = [...prefixes]
    .sort((a, b) => b.length - a.length)
    .find((candidate) => token.startsWith(candidate));
  if (prefix === undefined) return undefined;
  return { token, prefix, query: token.slice(prefix.length) };
}

/**
 * The skills worth suggesting: those whose full command continues the token (so `/sk` already
 * offers `/skill:web`) and, once a query exists, same-prefix skills whose name or description
 * contains it. Skills on another prefix never match a foreign token.
 */
export function matchingSkills(
  trigger: SkillSuggestionTrigger,
  skills: readonly ComposerSkill[],
): ComposerSkill[] {
  const token = trigger.token.toLowerCase();
  const query = trigger.query.toLowerCase();
  return skills.filter((skill) => {
    if (skill.command.toLowerCase().startsWith(token)) return true;
    if (skill.commandPrefix !== trigger.prefix || query.length === 0) return false;
    return (
      skill.name.toLowerCase().includes(query) ||
      (skill.description?.toLowerCase().includes(query) ?? false)
    );
  });
}
