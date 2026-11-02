import { type Message, message } from '../errors/text';

const AGENT_NAME = /^[a-z][a-z0-9_-]{0,31}$/;

/**
 * The server's agent-name rule (`^[a-z][a-z0-9_-]{0,31}$`) checked before a round trip. Shared
 * by the new-agent form and the rename sheet. Empty is invalid here as on the server; callers
 * intercept emptiness first when it carries meaning.
 */
export function agentNameError(name: string): Message | undefined {
  return AGENT_NAME.test(name)
    ? undefined
    : message(
        'Agent names are 1–32 characters: lowercase letters, digits, - or _, starting with a lowercase letter.',
      );
}

/** The fallback for an empty name field: the kind, then `kind-2`, `kind-3`, ... skipping names in use. */
export function defaultAgentName(kind: string, taken: ReadonlySet<string>): string {
  if (!taken.has(kind)) return kind;
  let suffix = 2;
  while (taken.has(`${kind}-${suffix}`)) suffix += 1;
  return `${kind}-${suffix}`;
}

const FORBIDDEN_CHARACTERS = '~^:?*[\\ ';

function hasForbiddenCharacter(name: string): boolean {
  for (const char of name) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f || FORBIDDEN_CHARACTERS.includes(char)) return true;
  }
  return false;
}

/**
 * The `git check-ref-format --branch` rules that matter for a hand-typed branch. herdr folds
 * every `worktree.create` failure but `not_git_worktree` into one code with raw git stderr, so
 * this explains the common mistakes first; the server's message stays the fallback.
 */
export function gitBranchNameError(name: string): Message | undefined {
  if (name === '' || name === '@') return message('Enter a branch name.');
  if (name.startsWith('-')) return message('Branch names cannot start with "-".');
  if (hasForbiddenCharacter(name)) {
    return message(
      'Branch names cannot contain spaces, control characters, or any of ~ ^ : ? * [ \\.',
    );
  }
  if (name.includes('..') || name.includes('@{')) {
    return message('Branch names cannot contain ".." or "@{".');
  }
  if (name.startsWith('/') || name.endsWith('/') || name.includes('//')) {
    return message('Branch names cannot start or end with "/" or contain "//".');
  }
  if (name.endsWith('.')) return message('Branch names cannot end with ".".');
  if (name.split('/').some((part) => part.startsWith('.') || part.endsWith('.lock'))) {
    return message('Branch name components cannot start with "." or end with ".lock".');
  }
  return undefined;
}
