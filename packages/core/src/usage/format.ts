import { type Message, message } from '../errors/text';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const UNIT_NAMES = { d: 'day', h: 'hour', m: 'minute' } as const;

/** One unit of a countdown in the locale's narrow style ("2h", "14min"); plain "2h" if Intl lacks units. */
function unitText(count: number, unit: keyof typeof UNIT_NAMES, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: UNIT_NAMES[unit],
      unitDisplay: 'narrow',
    }).format(count);
  } catch {
    return `${count}${unit}`;
  }
}

/** The time left before a reset as "1h 48m" or "3d 16h": two units at most, rounded down, 1 min floor. */
export function countdown(reset: Date, now: Date, locale = 'en'): string {
  let left = Math.max(reset.getTime() - now.getTime(), MINUTE);
  const parts: string[] = [];
  for (const [size, unit] of [
    [DAY, 'd'],
    [HOUR, 'h'],
    [MINUTE, 'm'],
  ] as const) {
    const count = Math.floor(left / size);
    left -= count * size;
    if (count > 0 && parts.length < 2) parts.push(unitText(count, unit, locale));
    else if (parts.length > 0) break;
  }
  return parts.join(' ');
}

/** "resets in 2h 14m" within a day, else the reset's weekday and time. */
export function resetText(reset: Date, now: Date, locale: string, timeZone?: string): Message {
  if (reset.getTime() - now.getTime() < DAY)
    return message('resets in %@', countdown(reset, now, locale));
  const when = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(reset);
  return message('resets %@', when);
}

/** The age of a reading, short: "10 min. ago". */
export function relativeAge(from: Date, now: Date, locale: string): string {
  const seconds = Math.max(0, Math.round((now.getTime() - from.getTime()) / 1000));
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'short' });
  if (seconds < 3_600) return rtf.format(-Math.max(1, Math.round(seconds / 60)), 'minute');
  if (seconds < 86_400) return rtf.format(-Math.round(seconds / 3_600), 'hour');
  return rtf.format(-Math.round(seconds / 86_400), 'day');
}

/** Estimated cost in USD; null is unpriced (the caller words it). Tiny amounts read "< $0.01". */
export function formatCost(value: number, locale: string): string {
  const fmt = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' });
  if (value > 0 && value < 0.01) return `< ${fmt.format(0.01)}`;
  return fmt.format(value);
}

/** Whole dollars once a figure is large enough that cents are noise. */
export function formatShortCost(value: number, locale: string): string {
  if (value < 1_000) return formatCost(value, locale);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

/** 12.4k, 1.2M: up to three significant digits. */
export function formatTokens(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumSignificantDigits: 3,
  }).format(value);
}

export function formatShare(part: number, whole: number, locale: string): string {
  const share = whole > 0 ? part / whole : 0;
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(
    share,
  );
}

/** A report day (`YYYY-MM-DD`) in the reader's locale. Folded already: formatted in UTC, never shifted. */
export function formatDay(
  day: string,
  locale: string,
  options: { includesYear?: boolean; includesWeekday?: boolean } = {},
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  const [year, month, dom] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, dom));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== dom) return day;
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: options.includesYear ? 'numeric' : undefined,
    weekday: options.includesWeekday ? 'short' : undefined,
  }).format(date);
}
