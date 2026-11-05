// What OpenCode's input box reads as more than a message, beyond the shared rules and its exit
// words (OpenCode 2.0.32; Swift OpenCodeSendRules).
//
// herdr delivers a message as one paste, and OpenCode turns a paste that is only paths to image,
// PDF or SVG files into attachments instead of text. Chat cannot tell from here which paths name
// such files, so it refuses every draft that is only paths, read the way OpenCode reads a paste.
// OpenCode also names a command by its file's path under `commands/`, so a leading `/name` with a
// slash in it, which the shared rules leave to prose such as `/usr/bin/env`, is refused too.

import type { ComposerRefusal } from '../../composer/policy';

const PATH_ONLY_REFUSAL: ComposerRefusal = {
  kind: 'unsafeText',
  reason:
    "OpenCode can take a message that is only a file path as an attachment instead of text. Start with a few words, such as what to do with the file, and OpenCode's agent can read it from its path.",
};

/** The most paths OpenCode reads from one paste; more is text. */
const MAXIMUM_PATHS = 32;
/** The extensions of the files OpenCode attaches. */
const ATTACHABLE = ['.avif', '.gif', '.jpeg', '.jpg', '.pdf', '.png', '.svg', '.webp'];
/** Starts that make a token a path wherever it points. */
const PATH_PREFIXES = ['~/', './', '../', 'file://'];

const isSpace = (character: string) => /\s/u.test(character);

/**
 * The refusal of a draft without its invisible characters that, trimmed, is only paths or starts
 * with a command path; undefined for any other.
 */
export function openCodeRefusal(_clean: string, trimmed: string): ComposerRefusal | undefined {
  if (isOnlyPaths(trimmed)) return PATH_ONLY_REFUSAL;
  const name = commandPath(trimmed);
  if (name !== null) {
    return {
      kind: 'unsafeText',
      reason: `OpenCode can run a message starting with /${name} as one of its commands. Start with another word, or open the terminal to run it.`,
    };
  }
  return undefined;
}

/** The first word of a draft starting with `/` when it has another slash (`git/commit`); null otherwise. */
function commandPath(trimmed: string): string | null {
  if (!trimmed.startsWith('/')) return null;
  const rest = [...trimmed.slice(1)];
  const end = rest.findIndex(isSpace);
  const name = (end === -1 ? rest : rest.slice(0, end)).join('');
  return name.includes('/') ? name : null;
}

/**
 * Whether OpenCode could read the trimmed draft as paths rather than text: 1 to 32 tokens that each
 * look like a path, or the whole draft as one path to an attachable file (which catches a path with
 * spaces).
 */
function isOnlyPaths(trimmed: string): boolean {
  const tokens = pathTokens(trimmed);
  if (tokens !== null && tokens.length > 0 && tokens.every(isPathLike)) return true;
  const whole = wholePath(trimmed);
  return startsLikeAPath(whole) && hasAttachableExtension(whole);
}

/**
 * The text split the way OpenCode splits a paste into paths: whitespace separates, quotes group, a
 * backslash escapes the next character outside quotes and inside double ones, and a `file://` URL
 * becomes its path. With a `file://` URL in the text, lines starting with `#` are comments. Null
 * when a quote is left open or there are more than 32 tokens, which OpenCode reads as no paths.
 */
function pathTokens(text: string): string[] | null {
  let input = text;
  if (input.includes('file://')) {
    input = input
      .split(/\r\n|\n/u)
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');
  }
  const tokens: string[] = [];
  let current = '';
  let quote: string | null = null;
  let escaping = false;
  const push = () => {
    if (current === '') return;
    tokens.push(fileUrlPath(current) ?? current);
    current = '';
  };
  for (const character of input) {
    if (escaping) {
      current += character;
      escaping = false;
    } else if (quote !== null) {
      if (character === quote) quote = null;
      else if (character === '\\' && quote === '"') escaping = true;
      else current += character;
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (character === '\\') {
      escaping = true;
    } else if (isSpace(character)) {
      push();
      if (tokens.length > MAXIMUM_PATHS) return null;
    } else {
      current += character;
    }
  }
  if (quote !== null) return null;
  // A backslash at the very end escapes nothing and stays.
  if (escaping) current += '\\';
  push();
  return tokens.length > MAXIMUM_PATHS ? null : tokens;
}

/** Whether a token looks like a path: it starts like one, or names an attachable file and is no link with another scheme. */
function isPathLike(token: string): boolean {
  return (
    startsLikeAPath(token) ||
    (!/^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(token) && hasAttachableExtension(token))
  );
}

/** `~/`, `./`, `../`, `file://`, or an absolute path of more than one segment: `/name` is left to the command rules. */
function startsLikeAPath(text: string): boolean {
  return (
    PATH_PREFIXES.some((prefix) => text.startsWith(prefix)) ||
    (text.startsWith('/') && text.slice(1).includes('/'))
  );
}

function hasAttachableExtension(text: string): boolean {
  const lowered = text.toLowerCase();
  return ATTACHABLE.some((extension) => lowered.endsWith(extension));
}

/**
 * The whole text read as one path, as OpenCode first tries a paste: quotes at either end dropped,
 * then a `file://` URL decoded, or else backslash escapes removed.
 */
function wholePath(text: string): string {
  const unquoted = text.replace(/^['"]+|['"]+$/gu, '');
  const url = fileUrlPath(unquoted);
  if (url !== null) return url;
  let path = '';
  let escaping = false;
  for (const character of unquoted) {
    if (escaping) {
      // An escaped line break stays as it is.
      if (/[\n\r\v\f\u0085\p{Zl}\p{Zp}]/u.test(character)) path += '\\';
      path += character;
      escaping = false;
    } else if (character === '\\') {
      escaping = true;
    } else {
      path += character;
    }
  }
  if (escaping) path += '\\';
  return path;
}

/**
 * The path a `file://` URL names, percent escapes decoded; null for a URL that names a host other
 * than `localhost`, encodes a slash or a backslash, or does not decode, which OpenCode keeps as typed.
 */
function fileUrlPath(text: string): string | null {
  if (!text.startsWith('file://')) return null;
  let rest = text.slice('file://'.length);
  // The query and fragment are not part of the path.
  const end = rest.search(/[?#]/u);
  if (end !== -1) rest = rest.slice(0, end);
  const slash = rest.indexOf('/');
  const host = slash === -1 ? rest : rest.slice(0, slash);
  if (host !== '' && host.toLowerCase() !== 'localhost') return null;
  const path = slash === -1 ? '' : rest.slice(slash);
  if (/%2f|%5c/iu.test(path)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return null;
  }
  return decoded === '' ? '/' : decoded;
}
