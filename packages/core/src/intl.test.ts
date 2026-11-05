import { afterEach, describe, expect, it } from 'vitest';
import { deviceTimeZone, formatDate, formatNumber, formatRelative, isTimeZone } from './intl';
import {
  formatCost,
  formatDay,
  formatShare,
  formatTokens,
  relativeAge,
  resetText,
} from './usage/format';

const realIntl = globalThis.Intl;
const withoutIntl = (shape: Record<string, unknown> | undefined) => {
  Object.defineProperty(globalThis, 'Intl', { configurable: true, writable: true, value: shape });
};
afterEach(() => withoutIntl(realIntl as unknown as Record<string, unknown>));

describe('Intl fallbacks (a Hermes without RelativeTimeFormat)', () => {
  it('words a relative age without RelativeTimeFormat', () => {
    withoutIntl({ NumberFormat: realIntl.NumberFormat, DateTimeFormat: realIntl.DateTimeFormat });
    expect(formatRelative(-10, 'minute', 'en', { style: 'short' })).toBe('10 min. ago');
    expect(formatRelative(-3, 'hour', 'en')).toBe('3 hours ago');
    expect(formatRelative(0, 'day', 'en', { numeric: 'auto' })).toBe('today');
    const now = new Date('2026-11-05T12:00:00Z');
    expect(relativeAge(new Date(now.getTime() - 10 * 60_000), now, 'en')).toBe('10 min. ago');
  });

  it('never throws with no Intl at all', () => {
    withoutIntl(undefined);
    const now = new Date('2026-11-05T15:30:00Z');
    expect(formatCost(1.5, 'en')).toBe('$1.50');
    expect(formatCost(0.001, 'en')).toBe('< $0.01');
    expect(formatTokens(12_400, 'en')).toBe('12.4K');
    expect(formatShare(62, 100, 'en')).toBe('62%');
    expect(formatDay('2026-11-05', 'en', { includesWeekday: true })).toBe('Thu, Nov 5');
    expect(formatDate(now, 'en', { timeZone: 'UTC', timeStyle: 'short' })).toBe('3:30 PM');
    expect(resetText(new Date(now.getTime() + 3 * 86_400_000), now, 'en', 'UTC')).toBeTruthy();
    expect(formatNumber(5, 'en')).toBe('5');
    expect(isTimeZone('Not/AZone')).toBe(true);
    expect(deviceTimeZone()).toBe('UTC');
  });

  it('survives an Intl whose constructors throw or reject options', () => {
    const boom = function boom() {
      throw new RangeError('bad option');
    };
    withoutIntl({ NumberFormat: boom, DateTimeFormat: boom, RelativeTimeFormat: boom });
    expect(formatRelative(-2, 'day', 'en')).toBe('2 days ago');
    expect(formatNumber(0.5, 'en', { style: 'percent' })).toBe('50%');
    expect(isTimeZone('Europe/Paris')).toBe(false);
  });

  it('still uses the real Intl where it exists', () => {
    expect(formatNumber(1234.5, 'en')).toBe('1,234.5');
    expect(isTimeZone('Europe/Paris')).toBe(true);
    expect(isTimeZone('Nope/Zone')).toBe(false);
  });
});
