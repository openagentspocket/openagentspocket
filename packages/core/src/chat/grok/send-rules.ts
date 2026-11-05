// What Grok Build's input box does with `/` beyond Chat's menu, and the prompt log that names the
// session that took a send (Swift GrokSlashCommands and GrokPromptHistoryWitness). Pure rules: the
// composer wires them in when it learns about per-program send policies.

import type { ComposerRefusal } from '../../composer/policy';
import { decodeUtf8 } from '../../events/utf8';
import { groupDirectoryOfTranscript } from './locator-paths';

/**
 * Every command and alias Grok Build 1.0.62 reserves, lowercased: those its slash-command guide
 * lists, and those its pager keeps without listing them, such as `/help` and `/tasks`. Grok offers
 * a skill named like one only under a qualified name such as `/local:plan`, so a bare `/plan` runs
 * the built-in. Regenerate on version bumps.
 */
export const GROK_BUILT_INS: ReadonlySet<string> = new Set([
  'agents',
  'agents-dashboard',
  'always-approve',
  'announcements',
  'auto',
  'btw',
  'cd',
  'changelog',
  'chat',
  'clear',
  'cloud',
  'compact',
  'compact-mode',
  'config',
  'config-agents',
  'context',
  'context-window',
  'copy',
  'cost',
  'dashboard',
  'debug',
  'deep-research',
  'delete',
  'density',
  'docs',
  'doctor',
  'dream',
  'edit-prompt',
  'effort',
  'exit',
  'expand',
  'export',
  'feedback',
  'find',
  'flush',
  'fork',
  'full',
  'fullscreen',
  'gboom',
  'goal',
  'guides',
  'help',
  'history',
  'home',
  'hooks',
  'hooks-add',
  'hooks-list',
  'hooks-remove',
  'hooks-trust',
  'hooks-untrust',
  'howto',
  'imagine',
  'imagine-video',
  'import-claude',
  'info',
  'jump',
  'log',
  'login',
  'logout',
  'loop',
  'm',
  'marketplace',
  'mcps',
  'mem',
  'memory',
  'minimal',
  'ml',
  'model',
  'multiline',
  'new',
  'onboarding',
  'personas',
  'plan',
  'plan-view',
  'plugin',
  'plugins',
  'preferences',
  'prefs',
  'privacy',
  'queue',
  'quit',
  'recap',
  'release-notes',
  'reload-plugins',
  'remember',
  'rename',
  'resume',
  'rewind',
  'session-info',
  'sessions',
  'settings',
  'share',
  'show-plan',
  'skills',
  'status',
  'summarize',
  't',
  'tasks',
  'terminal-check',
  'terminal-info',
  'terminal-setup',
  'theme',
  'timeline',
  'timestamps',
  'title',
  'toggle-mouse-reporting',
  'tour',
  'transcript',
  'tutorial',
  'undo',
  'usage',
  'view-plan',
  'vim-mode',
  'voice',
  'welcome',
  'workflow',
  'workflows',
  'yolo',
]);

/** What Rust's `u8::is_ascii_whitespace` accepts: Grok tests the byte before a `/` with it. */
const ASCII_WHITESPACE = new Set([' ', '\t', '\n', '\f', '\r']);
const isWhitespace = (char: string) => /\s/u.test(char);

/**
 * The lowercased names of the `/` tokens in `text` after its start. A token is `/` at the start or
 * after ASCII whitespace, then everything up to the next whitespace (`slash/mod.rs`
 * `scan_inline_slash_tokens`), so `/btw,` names `btw,`. A token with only whitespace before it
 * leads the message, which the menu reads.
 */
function tokenNamesAfterTheStart(text: string): Set<string> {
  const scalars = [...text];
  const leading = scalars.findIndex((char) => !isWhitespace(char));
  const names = new Set<string>();
  let index = 0;
  while (index < scalars.length) {
    if (
      scalars[index] !== '/' ||
      !(index === 0 || ASCII_WHITESPACE.has(scalars[index - 1] as string))
    ) {
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < scalars.length && !isWhitespace(scalars[end] as string)) end += 1;
    if (end > index + 1 && index !== leading)
      names.add(
        scalars
          .slice(index + 1, end)
          .join('')
          .toLowerCase(),
      );
    index = end;
  }
  return names;
}

/** A leading `/compact` with text after it, read the way the menu reads a leading command. */
function isCompactWithFocus(trimmed: string): boolean {
  if (!trimmed.startsWith('/')) return false;
  const afterSlash = trimmed.slice(1);
  const name = /^\S*/u.exec(afterSlash)?.[0] ?? '';
  return name === 'compact' && afterSlash.slice(name.length).trim() !== '';
}

/**
 * What Grok Build's input box reads as more than a message, after the shared rules and its exit
 * words and before the menu: `/goal` or `/btw` after the message's start, and `/compact` with a
 * focus.
 */
export function grokSlashRefusal(clean: string, trimmed: string): ComposerRefusal | null {
  const tokens = tokenNamesAfterTheStart(clean);
  // Grok checks `/goal` first: it refuses the message and leaves it in its input box.
  if (tokens.has('goal')) {
    return {
      kind: 'unsafeText',
      reason:
        "Grok Build runs /goal only at the start of a message and wouldn't send this. Set goals in the terminal.",
    };
  }
  // It asks the rest of the message as a side question, which never reaches the conversation.
  if (tokens.has('btw')) {
    return {
      kind: 'unsafeText',
      reason:
        'Grok Build would treat this as a /btw side question and keep it out of the conversation. Rephrase it, or ask in the terminal.',
    };
  }
  // Grok 1.0.62 answers `/compact` with text after it with the toast "/compact takes no
  // arguments." and keeps the text in its box.
  if (isCompactWithFocus(trimmed)) {
    return {
      kind: 'commandUnavailable',
      reason: "Grok Build's /compact takes no focus. Send /compact on its own.",
    };
  }
  return null;
}

/** Where Grok appends `{timestamp, session_id, prompt, is_bash}` for each prompt it submits: beside the session's group. */
export const promptHistoryPath = (transcriptPath: string): string =>
  `${groupDirectoryOfTranscript(transcriptPath)}/prompt_history.jsonl`;

/** One line of the prompt log as the prompt and the session that took it; null for a shell command (`!command`) or an unreadable line. */
export function promptHistoryEntry(line: Uint8Array): { prompt: string; sessionID: string } | null {
  try {
    const record = JSON.parse(decodeUtf8(line)) as Record<string, unknown>;
    if (typeof record.prompt !== 'string' || typeof record.session_id !== 'string') return null;
    if (record.is_bash === true) return null;
    return { prompt: record.prompt, sessionID: record.session_id };
  } catch {
    return null;
  }
}
