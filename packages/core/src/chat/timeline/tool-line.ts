// What a tool row says on its one line. A command reads as what it is for when its program records
// that (`purpose`), else as a short form of itself; the command line as run shows once the row opens.
// The same for every program: each adapter fills `purpose` and `command`, the row never asks which.

import { isAssignment, RESERVED_WORDS, simpleCommands } from '../model/shell-words';
import type { ChatToolActivity } from '../model/types';

export interface ToolLine {
  /** The row's title: a description, a short command, or the call's own title. */
  title: string;
  /** The title is a command (short or whole), drawn monospaced. */
  isCommand: boolean;
  /** The command line its open row shows, when the title does not already show it whole. */
  command: string | null;
}

const MAX_WORDS = 4;
const MAX_CHARACTERS = 48;
const LONG_WORD = 24;
const ELLIPSIS = '…';

/** Commands that only set the stage for the one that does the work. */
const SETUP: ReadonlySet<string> = new Set([
  'cd',
  'pushd',
  'popd',
  'export',
  'set',
  'source',
  '.',
  'true',
  'done',
  'fi',
  'esac',
  'then',
  'else',
]);

/** A word without the prefix that only repeats a context: a long path reads as its last part. */
function readable(word: string): string {
  if (word.length <= LONG_WORD || !word.includes('/')) return word;
  const equals = word.startsWith('-') ? word.indexOf('=') + 1 : 0;
  const parts = word.slice(equals).split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  return last === undefined ? word : `${word.slice(0, equals)}${last}`;
}

function cap(text: string): string {
  const chars = Array.from(text);
  return chars.length <= MAX_CHARACTERS
    ? text
    : `${chars.slice(0, MAX_CHARACTERS).join('')}${ELLIPSIS}`;
}

/**
 * The first words of the command that does the work, past variable assignments and `cd`s, with
 * long paths cut to their last part: `S=/private/tmp/x; cd "$S" && pnpm test --filter core -- --run`
 * reads `pnpm test --filter core …`.
 */
export function shortCommand(line: string): string {
  const commands = simpleCommands(line)
    .map((words) => {
      let start = 0;
      while (
        start < words.length &&
        (RESERVED_WORDS.has(words[start] as string) || isAssignment(words[start] as string))
      )
        start += 1;
      return words.slice(start);
    })
    .filter((words) => words.length > 0);
  const working = commands.filter((words) => !SETUP.has(words[0] as string));
  const chosen = working[0] ?? commands[0];
  const firstLine = line.trim().split('\n')[0] ?? '';
  if (chosen === undefined) return cap(firstLine);
  const shown = cap(chosen.slice(0, MAX_WORDS).map(readable).join(' '));
  const more = chosen.length > MAX_WORDS || working.length > 1;
  return more && !shown.endsWith(ELLIPSIS) ? `${shown} ${ELLIPSIS}` : shown;
}

export function toolLine(
  tool: Pick<ChatToolActivity, 'kind' | 'title' | 'subtitle' | 'purpose' | 'command'>,
): ToolLine {
  if (tool.kind !== 'command') {
    return { title: tool.subtitle ?? tool.title, isCommand: false, command: null };
  }
  // A cache written before these fields existed holds neither.
  const whole = tool.command ?? tool.title;
  const purpose = tool.purpose ?? null;
  if (purpose !== null && purpose !== '')
    return { title: purpose, isCommand: false, command: whole };
  const short = shortCommand(whole);
  return { title: short, isCommand: true, command: short === whole.trim() ? null : whole };
}
