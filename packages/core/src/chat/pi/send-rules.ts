// What Oh My Pi's input box reads as more than a message (Swift ChatSendRules.ompRefusal and the
// profile entries for `.pi` and `.omp`), and how it takes `/compact`.

import type { ComposerRefusal } from '../../composer/policy';
import { normalizingNewlines } from '../../terminal/text-safety';
import type { ChatCommand, CommandSubmission } from '../send/policy';
import { TRAILING_SPACE } from '../send/policy';
import { trimmingTrailingWhitespace } from '../send/rules';

/** Oh My Pi quits for these whole inputs, in any case, before the conversation's first message. */
export const OMP_EXIT_WORDS: ReadonlySet<string> = new Set(['exit', 'quit', 'q']);

/** Oh My Pi offers a paste of this many lines as an attachment menu, whose Enter picks an entry. */
const OMP_LARGE_PASTE_LINES = 100;

const unsafe = (reason: string): ComposerRefusal => ({ kind: 'unsafeText', reason });

/** Oh My Pi runs `$ code` and `$$ code` as Python, without asking; `$HOME` and `$5` stay text. */
function runsPython(trimmed: string): boolean {
  if (!trimmed.startsWith('$')) return false;
  let rest = trimmed.slice(1);
  if (rest.startsWith('$')) rest = rest.slice(1);
  return /^\s/u.test(rest);
}

/** What Oh My Pi's input box reads as more than a message, besides its exit words. */
export function ompRefusal(clean: string, trimmed: string): ComposerRefusal | undefined {
  const lowered = trimmed.toLowerCase();
  if (runsPython(trimmed)) {
    return unsafe(
      'A message starting with $ runs Python in Oh My Pi. Open the terminal to run it.',
    );
  }
  if (trimmed === '.' || lowered === 'c') {
    return unsafe('Oh My Pi reads this as Continue. Open the terminal to continue.');
  }
  if (trimmed.startsWith('->') || trimmed.startsWith('=>')) {
    return unsafe(
      'Oh My Pi queues a message starting with -> or => for later. Open the terminal to queue one.',
    );
  }
  const lines = trimmingTrailingWhitespace(normalizingNewlines(clean)).split('\n');
  if (lines.length >= OMP_LARGE_PASTE_LINES) {
    return unsafe(
      'Oh My Pi opens a menu for pastes of 100 lines or more. Shorten the message or paste it in the terminal.',
    );
  }
  return undefined;
}

/**
 * Oh My Pi completes `/compact ` to `/compact soft ` rather than running it; without the space,
 * Enter runs it at once. Its modes come up as completions once a space follows, so a focus would
 * not reach it as typed.
 */
const COMPACT_BARE: CommandSubmission = {
  kind: 'bare',
  argumentsRefusal: 'Add compaction focus in the Agent terminal.',
};

export const ompSubmission = (command: ChatCommand): CommandSubmission =>
  command.kind.type === 'compact' ? COMPACT_BARE : TRAILING_SPACE;
