import { type Locale, pluralCategory } from './plural';

/**
 * A small ICU MessageFormat runtime: exactly the subset the converted catalogs use, so the app
 * needs no Intl.PluralRules polyfill. Supported: `{name}`, `{name, number}`,
 * `{name, plural, =N {...} one {...} many {...} other {...}}` with `#`, and ICU apostrophe
 * quoting (`''` is a quote; `'{'` is a literal brace). Tests pin it against intl-messageformat.
 */
export type MessageArgs = readonly unknown[] | Readonly<Record<string, unknown>>;

type Part =
  | string
  | { kind: 'arg'; name: string; number: boolean }
  | { kind: 'plural'; name: string; options: Readonly<Record<string, Part[]>> }
  | { kind: 'pound' };

export class MessageSyntaxError extends Error {
  constructor(message: string, source: string) {
    super(`${message} in ${JSON.stringify(source)}`);
    this.name = 'MessageSyntaxError';
  }
}

const NAME = /[A-Za-z0-9_]/;
const SELECTOR = /[A-Za-z0-9_=]/;

class Parser {
  private i = 0;
  constructor(private readonly source: string) {}

  parse(): Part[] {
    const parts = this.message(false);
    if (this.i < this.source.length) this.fail('unexpected "}"');
    return parts;
  }

  private fail(message: string): never {
    throw new MessageSyntaxError(`${message} at ${this.i}`, this.source);
  }

  private message(inPlural: boolean): Part[] {
    const parts: Part[] = [];
    let text = '';
    while (this.i < this.source.length) {
      const char = this.source.charAt(this.i);
      if (char === '}') break;
      if (char === "'") {
        text += this.quoted(inPlural);
      } else if (char === '{' || (char === '#' && inPlural)) {
        if (text) parts.push(text);
        text = '';
        if (char === '#') {
          parts.push({ kind: 'pound' });
          this.i++;
        } else {
          parts.push(this.argument());
        }
      } else {
        text += char;
        this.i++;
      }
    }
    if (text) parts.push(text);
    return parts;
  }

  /** ICU apostrophe rules: `''` is one quote; `'` before syntax opens a literal section. */
  private quoted(inPlural: boolean): string {
    const next = this.source.charAt(this.i + 1);
    if (next === "'") {
      this.i += 2;
      return "'";
    }
    if (next !== '{' && next !== '}' && !(inPlural && next === '#')) {
      this.i++;
      return "'";
    }
    this.i++;
    let text = '';
    while (this.i < this.source.length) {
      const char = this.source.charAt(this.i);
      if (char === "'") {
        if (this.source.charAt(this.i + 1) === "'") {
          text += "'";
          this.i += 2;
          continue;
        }
        this.i++;
        return text;
      }
      text += char;
      this.i++;
    }
    return text;
  }

  private skipSpace() {
    while (/\s/.test(this.source.charAt(this.i))) this.i++;
  }

  private word(pattern: RegExp): string {
    this.skipSpace();
    const start = this.i;
    while (this.i < this.source.length && pattern.test(this.source.charAt(this.i))) this.i++;
    const word = this.source.slice(start, this.i);
    this.skipSpace();
    return word;
  }

  private expect(char: string) {
    if (this.source.charAt(this.i) !== char) this.fail(`expected "${char}"`);
    this.i++;
  }

  private argument(): Part {
    this.expect('{');
    const name = this.word(NAME);
    if (!name) this.fail('missing argument name');
    if (this.source.charAt(this.i) === '}') {
      this.i++;
      return { kind: 'arg', name, number: false };
    }
    this.expect(',');
    const type = this.word(NAME);
    if (type === 'number') {
      this.expect('}');
      return { kind: 'arg', name, number: true };
    }
    if (type !== 'plural') this.fail(`unsupported argument type "${type}"`);
    this.expect(',');
    const options: Record<string, Part[]> = {};
    for (;;) {
      this.skipSpace();
      if (this.source.charAt(this.i) === '}') break;
      const selector = this.word(SELECTOR);
      if (!selector) this.fail('missing plural selector');
      this.expect('{');
      options[selector] = this.message(true);
      this.expect('}');
    }
    this.i++;
    if (!options.other) this.fail('plural without "other"');
    return { kind: 'plural', name, options };
  }
}

const parsed = new Map<string, Part[]>();

/** Parses (and caches) an ICU message; throws MessageSyntaxError on anything unsupported. */
function parse(message: string): Part[] {
  let parts = parsed.get(message);
  if (!parts) {
    parts = new Parser(message).parse();
    parsed.set(message, parts);
  }
  return parts;
}

/** The arguments a message reads: name → `number` (number or plural) or `string`. */
export function messageArguments(message: string): Map<string, 'number' | 'string'> {
  const found = new Map<string, 'number' | 'string'>();
  const visit = (parts: readonly Part[]) => {
    for (const part of parts) {
      if (typeof part === 'string' || part.kind === 'pound') continue;
      const kind = part.kind === 'plural' || part.number ? 'number' : 'string';
      if (found.get(part.name) !== 'number') found.set(part.name, kind);
      if (part.kind === 'plural') for (const option of Object.values(part.options)) visit(option);
    }
  };
  visit(parse(message));
  return found;
}

const numberFormats = new Map<string, Intl.NumberFormat | null>();

function formatNumber(value: number, numberLocale: string): string {
  let format = numberFormats.get(numberLocale);
  if (format === undefined) {
    try {
      format = new Intl.NumberFormat(numberLocale);
    } catch {
      format = null;
    }
    numberFormats.set(numberLocale, format);
  }
  return format ? format.format(value) : String(value);
}

function argValue(args: MessageArgs | undefined, name: string): unknown {
  if (!args) return undefined;
  if (Array.isArray(args)) return /^\d+$/.test(name) ? args[Number(name)] : undefined;
  return (args as Record<string, unknown>)[name];
}

function render(
  parts: readonly Part[],
  args: MessageArgs | undefined,
  locale: Locale,
  numberLocale: string,
  count?: number,
): string {
  let out = '';
  for (const part of parts) {
    if (typeof part === 'string') {
      out += part;
      continue;
    }
    if (part.kind === 'pound') {
      out += count === undefined ? '#' : formatNumber(count, numberLocale);
      continue;
    }
    const value = argValue(args, part.name);
    if (value === undefined || value === null) {
      out += `{${part.name}}`;
    } else if (part.kind === 'arg') {
      out +=
        part.number && typeof value === 'number'
          ? formatNumber(value, numberLocale)
          : String(value);
    } else {
      const n = Number(value);
      const option =
        part.options[`=${n}`] ??
        part.options[pluralCategory(locale, n)] ??
        part.options.other ??
        [];
      out += render(option, args, locale, numberLocale, n);
    }
  }
  return out;
}

/**
 * Formats an ICU message. `locale` picks plural rules; `numberLocale` (a BCP 47 tag, default the
 * locale) formats numbers, as Foundation formats `%lld` with the device's region. A missing
 * argument renders as `{name}` rather than throwing.
 */
export function formatMessage(
  message: string,
  args: MessageArgs | undefined,
  locale: Locale,
  numberLocale: string = locale,
): string {
  return render(parse(message), args, locale, numberLocale);
}
