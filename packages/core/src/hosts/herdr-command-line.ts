import type { HerdrEndpoint } from './herdr-endpoint';
import { trimSpaces } from './text';

/** herdr session-name characters plus `:`, literal anywhere in sh, bash, zsh and fish. */
const SHELL_SAFE = /^[A-Za-z0-9._:-]+$/;

/**
 * One shell word that reads the same in sh, bash, zsh and fish. Inside single
 * quotes fish reads `\'` and `\\` as escapes and POSIX shells read neither, so
 * each `'` and `\` goes outside the quotes, escaped. Walks code points, so a
 * combining mark cannot hide a quote.
 */
export function shellWord(value: string): string {
  if (value === '') return "''";
  if (SHELL_SAFE.test(value)) return value;
  let quoted = '';
  let inside = false;
  for (const char of value) {
    if (char === "'" || char === '\\') {
      if (inside) quoted += "'";
      inside = false;
      quoted += `\\${char}`;
    } else {
      if (!inside) quoted += "'";
      inside = true;
      quoted += char;
    }
  }
  return inside ? `${quoted}'` : quoted;
}

/**
 * A herdr command line for the user to run on a Host, aimed at the herdr
 * instance the Host targets: `herdr <args>` for the default session,
 * `herdr --session <name> <args>` for a named one (herdr reads `--session`
 * anywhere before `--`). An endpoint overrides the session: its socket,
 * launcher and arguments go to a POSIX wrapper as separate words.
 */
export function renderHerdrCommand(
  session: string,
  endpoint: HerdrEndpoint | null,
  args: readonly string[],
): string {
  if (endpoint) {
    const words = [endpoint.socketPath, endpoint.executablePath, ...args].map(shellWord);
    return `/bin/sh -c 'export HERDR_SOCKET_PATH="$1"; shift; exec "$@"' herdr ${words.join(' ')}`;
  }
  const name = trimSpaces(session);
  const scope = name === '' ? [] : ['--session', name];
  return ['herdr', ...[...scope, ...args].map(shellWord)].join(' ');
}

const VALUE_OPTIONS = ['--session', '--remote', '--remote-keybindings'];

/**
 * Whether herdr takes `word` as one of its own options wherever it appears
 * before `--`, however it was quoted. Such a word cannot be passed as an
 * argument, so a caller offers no command for it.
 */
export function readsAsHerdrGlobalOption(word: string): boolean {
  return (
    word === '--handoff' ||
    VALUE_OPTIONS.some((option) => word === option || word.startsWith(`${option}=`))
  );
}
