import { setLocale } from '@openagentspocket/i18n';
import { ageSpoken, ageText, inboxAge } from './inboxAge';

const NOW = 1_000_000_000;
const ago = (seconds: number, approximate = false) =>
  inboxAge(NOW - seconds * 1000, NOW, approximate);

describe('inboxAge', () => {
  beforeEach(() => setLocale('en'));

  it.each([
    [10, 'now'],
    [59, 'now'],
    [60, '1m'],
    [3599, '59m'],
    [3600, '1h'],
    [86_399, '23h'],
    [86_400, '1d'],
    [-5, 'now'],
  ])('prints %i seconds as %s', (seconds, text) => {
    expect(ageText(ago(seconds))).toBe(text);
  });

  it('leads an approximate age with at-least', () => {
    expect(ageText(ago(180, true))).toBe('≥3m');
    expect(ageText(ago(5, true))).toBe('now');
  });

  it('speaks a different sentence per section and approximation', () => {
    const exact = ageSpoken(ago(180), 'needsYou');
    expect(ageSpoken(ago(180, true), 'needsYou')).not.toBe(exact);
    expect(ageSpoken(ago(180), 'working')).not.toBe(exact);
    expect(ageSpoken(ago(180), 'doneRecent')).not.toBe(exact);
    expect(ageSpoken(ago(5), 'needsYou')).not.toBe(ageSpoken(ago(5), 'doneRecent'));
  });
});
