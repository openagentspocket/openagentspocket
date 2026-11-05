import { describe, expect, it } from 'vitest';
import { renderText } from '../errors/text';
import { formatDuration } from './duration';

describe('formatDuration', () => {
  it.each([
    [0, '0s', '0 seconds'],
    [38.9, '38s', '38 seconds'],
    [138, '2m 18s', '2 minutes, 18 seconds'],
    [3900, '1h 5m', '1 hour, 5 minutes'],
    [3600, '1h', '1 hour'],
    [-5, '0s', '0 seconds'],
    [Number.NaN, '0s', '0 seconds'],
  ])('reads %s seconds', (seconds, narrow, wide) => {
    expect(formatDuration(seconds)).toBe(narrow);
    // The source language renders the catalog keys with their placeholders in order.
    expect(
      renderText(formatDuration(seconds, 'wide'), (key, args) =>
        key
          .replace('%lld', args[0] ?? '')
          .replace(/ (hour|minute|second)s$/, (_m, unit) =>
            args[0] === '1' ? ` ${unit}` : ` ${unit}s`,
          ),
      ),
    ).toBe(wide);
  });
});
