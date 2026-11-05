// What a Chat draft sends to the Agent's input box (Swift ChatSendRules, ADR 0024). The text
// arrives as one bracketed paste and Enter, exactly as if typed, so anything the program's input
// box would treat as more than a message is refused rather than sent: a `!` shell escape, control
// bytes, `/` commands the menu does not offer, and what the program's `SendProfile` adds.

import type { ComposerRefusal } from '../../composer/policy';
import { containsOnlySafeScalars, normalizingNewlines } from '../../terminal/text-safety';
import { commandNamed } from './command-menu';
import type { ChatCommand, ProgramSendPolicy } from './policy';

export type DraftReading =
  | { readonly kind: 'text' }
  | { readonly kind: 'command'; readonly command: ChatCommand; readonly arguments: string }
  | { readonly kind: 'refused'; readonly refusal: ComposerRefusal };

/**
 * Whether a code point is one Claude Code strips before it submits, where any removal cancels the
 * submit: tag characters, bidirectional controls, zero-width characters and variation selectors.
 */
function isInvisible(code: number): boolean {
  return (
    (code >= 0xe0000 && code <= 0xe007f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069) ||
    code === 0x200e ||
    code === 0x200f ||
    code === 0x061c ||
    (code >= 0x200b && code <= 0x200d) ||
    code === 0x2060 ||
    code === 0xfeff ||
    (code >= 0xfe00 && code <= 0xfe0f) ||
    (code >= 0xe0100 && code <= 0xe01ef)
  );
}

export function removingInvisibles(text: string): string {
  let out = '';
  for (const character of text) {
    if (!isInvisible(character.codePointAt(0) as number)) out += character;
  }
  return out;
}

export const trimmingTrailingWhitespace = (text: string): string => text.replace(/\s+$/u, '');

const unsafe = (reason: string): ComposerRefusal => ({ kind: 'unsafeText', reason });

export interface SendRules {
  readonly policy: ProgramSendPolicy;
  readonly commands: readonly ChatCommand[];
  read(draft: string): DraftReading;
  /** The refusal for a draft, or undefined when it may go. */
  validate(draft: string): ComposerRefusal | undefined;
  /**
   * The text to send for a draft `validate` accepted: invisible characters removed, a menu command
   * in the program's own form, and exactly one trailing space, which keeps a final `/name` or
   * `@path` from leaving a completion popup open when Enter arrives. A command the profile submits
   * bare goes alone, without the space.
   */
  outgoingText(draft: string): string;
}

export function createSendRules(
  policy: ProgramSendPolicy,
  commands: readonly ChatCommand[],
): SendRules {
  const { profile } = policy;
  const submissionOf = (command: ChatCommand) => profile.submission?.(command) ?? null;

  const read = (draft: string): DraftReading => {
    const clean = removingInvisibles(draft);
    const trimmed = clean.trim();
    if (!containsOnlySafeScalars(clean)) {
      return {
        kind: 'refused',
        refusal: unsafe('The message contains terminal control characters.'),
      };
    }
    if (trimmed.startsWith('!')) {
      return {
        kind: 'refused',
        refusal: unsafe(
          'A message starting with ! runs a shell command. Open the terminal to run one.',
        ),
      };
    }
    if (profile.exitWords.has(trimmed.toLowerCase())) {
      return {
        kind: 'refused',
        refusal: unsafe(`Sending this would exit ${policy.chatName}. Open the terminal to exit.`),
      };
    }
    const own = profile.refusal?.(clean, trimmed);
    if (own) return { kind: 'refused', refusal: own };
    if (!trimmed.startsWith('/')) return { kind: 'text' };
    const afterSlash = trimmed.slice(1);
    const name = afterSlash.match(/^\S*/u)?.[0] ?? '';
    // `/usr/bin/env` is a path in prose, not a command.
    if (name.includes('/')) return { kind: 'text' };
    const command = commandNamed(name, commands);
    if (!command) return { kind: 'refused', refusal: { kind: 'unknownCommand', name } };
    if (!command.isEnabled)
      return { kind: 'refused', refusal: { kind: 'commandAwaitsIdle', name } };
    const args = afterSlash.slice(name.length).trim();
    const submission = submissionOf(command);
    if (submission?.kind === 'bare' && args !== '') {
      return {
        kind: 'refused',
        refusal: { kind: 'commandUnavailable', reason: submission.argumentsRefusal },
      };
    }
    return { kind: 'command', command, arguments: args };
  };

  return {
    policy,
    commands,
    read,
    validate: (draft) => {
      const reading = read(draft);
      return reading.kind === 'refused' ? reading.refusal : undefined;
    },
    outgoingText: (draft) => {
      const clean = normalizingNewlines(removingInvisibles(draft));
      const reading = read(draft);
      let body = clean;
      if (reading.kind === 'command') {
        const { command } = reading;
        const prefix = command.kind.type === 'compact' ? '/' : command.kind.prefix;
        // `read` refuses a bare command with arguments.
        if (submissionOf(command)?.kind === 'bare') return prefix + command.name;
        body =
          reading.arguments === ''
            ? prefix + command.name
            : `${prefix}${command.name} ${reading.arguments}`;
      }
      return `${trimmingTrailingWhitespace(body)} `;
    },
  };
}
