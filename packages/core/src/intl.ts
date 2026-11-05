/**
 * The only place that touches `Intl`. Hermes ships a partial Intl: NumberFormat and DateTimeFormat
 * exist (with fewer options than V8), while RelativeTimeFormat, PluralRules, ListFormat, DisplayNames
 * and Segmenter may not exist at all, and `new Intl.Missing()` throws "undefined cannot be used as a
 * constructor", which closes a Release build. Every helper tries Intl and falls back to plain English
 * text, so a missing or half-working Intl degrades the wording and never throws. `scripts/check-intl.mjs`
 * keeps `Intl.` out of the rest of the source.
 */

type Constructable = new (...args: never[]) => unknown;

/** `Intl[name]` when it is a constructor, else null. */
function intlConstructor(name: string): Constructable | null {
  const intl = (globalThis as { Intl?: Record<string, unknown> }).Intl;
  const ctor = intl?.[name];
  return typeof ctor === 'function' ? (ctor as Constructable) : null;
}

function attempt<T>(run: () => T): T | null {
  try {
    return run();
  } catch {
    return null;
  }
}

export interface GraphemeSegmenter {
  segment(text: string): Iterable<{ segment: string }>;
}

/** An `Intl.Segmenter` for graphemes, or undefined where it does not exist (Hermes). */
export function graphemeSegmenter(): GraphemeSegmenter | undefined {
  const ctor = intlConstructor('Segmenter');
  if (!ctor) return undefined;
  return (
    attempt(
      () =>
        new (
          ctor as unknown as new (
            l: undefined,
            o: { granularity: 'grapheme' },
          ) => GraphemeSegmenter
        )(undefined, { granularity: 'grapheme' }),
    ) ?? undefined
  );
}

export interface NumberOptions {
  style?: 'decimal' | 'percent' | 'currency' | 'unit';
  currency?: string;
  unit?: string;
  unitDisplay?: 'short' | 'narrow' | 'long';
  notation?: 'standard' | 'compact';
  maximumFractionDigits?: number;
  maximumSignificantDigits?: number;
}

function roundTo(value: number, digits: number): string {
  const factor = 10 ** digits;
  return String(Math.round(value * factor) / factor);
}

/** The fallback: English digits, `%`, `$`, `k/M/B` for compact. */
function plainNumber(value: number, options: NumberOptions): string {
  if (!Number.isFinite(value)) return String(value);
  if (options.style === 'percent') return `${Math.round(value * 100)}%`;
  if (options.style === 'currency') {
    const digits = options.maximumFractionDigits ?? 2;
    const symbol = options.currency === 'USD' || options.currency === undefined ? '$' : '';
    return `${symbol}${value.toFixed(digits)}`;
  }
  if (options.notation === 'compact') {
    const steps: [number, string][] = [
      [1e9, 'B'],
      [1e6, 'M'],
      [1e3, 'K'],
    ];
    for (const [size, suffix] of steps) {
      if (Math.abs(value) >= size) {
        const scaled = value / size;
        const digits = options.maximumSignificantDigits
          ? Math.max(
              0,
              options.maximumSignificantDigits - String(Math.floor(Math.abs(scaled))).length,
            )
          : (options.maximumFractionDigits ?? 1);
        return `${roundTo(scaled, digits)}${suffix}`;
      }
    }
  }
  return roundTo(value, options.maximumFractionDigits ?? 3);
}

/** A number in `locale`; plain English text where Intl.NumberFormat is missing or rejects the options. */
export function formatNumber(
  value: number,
  locale: string | undefined,
  options: NumberOptions = {},
): string {
  const ctor = intlConstructor('NumberFormat');
  if (ctor) {
    const text = attempt(() => {
      const format = new (
        ctor as unknown as new (
          l: string | undefined,
          o: NumberOptions,
        ) => {
          format(n: number): string;
        }
      )(locale, options);
      return format.format(value);
    });
    if (text !== null) return text;
  }
  return plainNumber(value, options);
}

export interface DateOptions {
  timeZone?: string;
  weekday?: 'narrow' | 'short' | 'long';
  month?: 'short' | 'long' | 'numeric';
  day?: 'numeric';
  year?: 'numeric';
  hour?: 'numeric';
  minute?: '2-digit';
  dateStyle?: 'short' | 'medium';
  timeStyle?: 'short';
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The fallback: English names; UTC fields for a UTC zone, the device's otherwise (no zone database). */
function plainDate(date: Date, options: DateOptions): string {
  const utc = options.timeZone === 'UTC';
  const get = {
    year: utc ? date.getUTCFullYear() : date.getFullYear(),
    month: utc ? date.getUTCMonth() : date.getMonth(),
    day: utc ? date.getUTCDate() : date.getDate(),
    weekday: utc ? date.getUTCDay() : date.getDay(),
    hour: utc ? date.getUTCHours() : date.getHours(),
    minute: utc ? date.getUTCMinutes() : date.getMinutes(),
  };
  const parts: string[] = [];
  const wantsTime = options.timeStyle !== undefined || options.hour !== undefined;
  const wantsDate =
    options.dateStyle !== undefined ||
    options.month !== undefined ||
    options.day !== undefined ||
    options.year !== undefined;
  if (options.weekday) {
    const name = WEEKDAYS[get.weekday] ?? '';
    parts.push(options.weekday === 'narrow' ? name.charAt(0) : name);
  }
  if (wantsDate) {
    if (options.dateStyle === 'short') {
      parts.push(`${get.month + 1}/${get.day}/${String(get.year).slice(-2)}`);
    } else {
      const month = MONTHS[get.month] ?? '';
      const text = options.day || options.dateStyle ? `${month} ${get.day}` : month;
      parts.push(options.year || options.dateStyle === 'medium' ? `${text}, ${get.year}` : text);
    }
  }
  if (wantsTime) {
    const hour = get.hour % 12 === 0 ? 12 : get.hour % 12;
    parts.push(`${hour}:${String(get.minute).padStart(2, '0')} ${get.hour < 12 ? 'AM' : 'PM'}`);
  }
  return parts.join(', ');
}

/** A date in `locale`; plain English text where Intl.DateTimeFormat is missing or rejects the options. */
export function formatDate(date: Date, locale: string | undefined, options: DateOptions): string {
  const ctor = intlConstructor('DateTimeFormat');
  if (ctor) {
    const text = attempt(() => {
      const format = new (
        ctor as unknown as new (
          l: string | undefined,
          o: DateOptions,
        ) => {
          format(d: Date): string;
        }
      )(locale, options);
      return format.format(date);
    });
    if (text !== null) return text;
  }
  return plainDate(date, options);
}

/** The same date-time format as a reusable key (a day's identity), or a plain fallback key. */
export function dateKey(date: Date, locale: string | undefined, timeZone?: string): string {
  return formatDate(date, locale, { timeZone, dateStyle: 'short' });
}

export type RelativeUnit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year' | 'second';

export interface RelativeOptions {
  /** `auto` words 0 and 1 ("yesterday", "now"); `always` keeps the number. */
  numeric?: 'always' | 'auto';
  style?: 'long' | 'short';
}

const SHORT_UNITS: Record<RelativeUnit, string> = {
  second: 'sec.',
  minute: 'min.',
  hour: 'hr.',
  day: 'day',
  week: 'wk.',
  month: 'mo.',
  year: 'yr.',
};

/** The fallback: "10 min. ago", "3 hours ago", "in 2 days"; `auto` words 0 as "now". */
function plainRelative(value: number, unit: RelativeUnit, options: RelativeOptions): string {
  const count = Math.abs(value);
  if (options.numeric === 'auto' && count === 0) return unit === 'day' ? 'today' : 'now';
  const short = options.style === 'short';
  const name = short && unit !== 'day' ? SHORT_UNITS[unit] : `${unit}${count === 1 ? '' : 's'}`;
  return value < 0 ? `${count} ${name} ago` : `in ${count} ${name}`;
}

/** "10 min. ago" in `locale`; plain English where Intl.RelativeTimeFormat does not exist (Hermes). */
export function formatRelative(
  value: number,
  unit: RelativeUnit,
  locale: string | undefined,
  options: RelativeOptions = {},
): string {
  const ctor = intlConstructor('RelativeTimeFormat');
  if (ctor) {
    const text = attempt(() => {
      const format = new (
        ctor as unknown as new (
          l: string | undefined,
          o: RelativeOptions,
        ) => {
          format(v: number, u: RelativeUnit): string;
        }
      )(locale, options);
      return format.format(value, unit);
    });
    if (text !== null) return text;
  }
  return plainRelative(value, unit, options);
}

/** Whether `identifier` names a time zone. Without Intl nothing can check it: the caller's grammar decides. */
export function isTimeZone(identifier: string): boolean {
  const ctor = intlConstructor('DateTimeFormat');
  if (!ctor) return true;
  return (
    attempt(() => {
      new (ctor as unknown as new (l: string | undefined, o: { timeZone: string }) => unknown)(
        'en',
        {
          timeZone: identifier,
        },
      );
      return true;
    }) ?? false
  );
}

/** The device's time zone, 'UTC' when the engine cannot tell. */
export function deviceTimeZone(): string {
  const ctor = intlConstructor('DateTimeFormat');
  const zone = ctor
    ? attempt(
        () =>
          new (
            ctor as unknown as new () => {
              resolvedOptions(): { timeZone?: string };
            }
          )().resolvedOptions().timeZone,
      )
    : null;
  return zone || 'UTC';
}
