import { type Message, message } from '../errors/text';

export type ArgumentError =
  | 'danglingEscape'
  | 'unclosedSingleQuote'
  | 'unclosedDoubleQuote'
  | 'controlCharacter';

export type ParsedArguments =
  | { readonly ok: true; readonly arguments: readonly string[] }
  | { readonly ok: false; readonly error: ArgumentError };

const ARGUMENT_MESSAGES: Readonly<Record<ArgumentError, Message>> = {
  danglingEscape: message('Arguments end with an unfinished escape.'),
  unclosedSingleQuote: message('Arguments contain an unclosed single quote.'),
  unclosedDoubleQuote: message('Arguments contain an unclosed double quote.'),
  controlCharacter: message('Arguments contain an unsupported control character.'),
};

export const argumentErrorMessage = (error: ArgumentError): Message => ARGUMENT_MESSAGES[error];

const isControl = (char: string) => {
  const code = char.codePointAt(0) ?? 0;
  return code < 0x20 || (code >= 0x7f && code <= 0x9f);
};

/**
 * Parses a shell-like argument string into argv without ever passing it through a shell. Quotes
 * group whitespace, adjacent quoted and unquoted segments join one argument, and a backslash
 * escapes the next character. Empty quoted arguments are kept.
 */
export function parseArguments(input: string): ParsedArguments {
  const result: string[] = [];
  let current = '';
  let hasCurrent = false;
  let quote: "'" | '"' | undefined;
  let escaping = false;
  const fail = (error: ArgumentError): ParsedArguments => ({ ok: false, error });

  for (const char of input) {
    if (escaping) {
      if (isControl(char)) return fail('controlCharacter');
      current += char;
      hasCurrent = true;
      escaping = false;
      continue;
    }
    if (quote === "'") {
      if (char === "'") quote = undefined;
      else if (isControl(char)) return fail('controlCharacter');
      else current += char;
      hasCurrent = true;
    } else if (quote === '"') {
      if (char === '"') quote = undefined;
      else if (char === '\\') escaping = true;
      else if (isControl(char)) return fail('controlCharacter');
      else current += char;
      hasCurrent = true;
    } else if (char === "'" || char === '"') {
      quote = char;
      hasCurrent = true;
    } else if (char === '\\') {
      escaping = true;
      hasCurrent = true;
    } else if (/\s/u.test(char)) {
      if (hasCurrent) {
        result.push(current);
        current = '';
        hasCurrent = false;
      }
    } else if (isControl(char)) {
      return fail('controlCharacter');
    } else {
      current += char;
      hasCurrent = true;
    }
  }
  if (escaping) return fail('danglingEscape');
  if (quote === "'") return fail('unclosedSingleQuote');
  if (quote === '"') return fail('unclosedDoubleQuote');
  if (hasCurrent) result.push(current);
  return { ok: true, arguments: result };
}

const SMART_PUNCTUATION: Readonly<Record<string, string>> = {
  '“': '"',
  '”': '"',
  '‘': "'",
  '’': "'",
  '—': '--',
  '–': '-',
};

/**
 * Smart punctuation that arrives through paste or a third-party keyboard (curly quotes, the em
 * dash iOS writes for "--") back to ASCII. A parse-boundary fallback, never an edit-time write.
 */
export function normalizeSmartPunctuation(text: string): string {
  return text.replace(/[“”‘’—–]/g, (char) => SMART_PUNCTUATION[char] ?? char);
}
