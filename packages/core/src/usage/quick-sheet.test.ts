import { describe, expect, it } from 'vitest';
import { renderText, type Text } from '../errors/text';
import { countdown, resetText } from './format';
import { elapsedPercent, limitLevel, usagePace, windowName } from './limits';
import { type QuickCard, type QuickWindow, quickContent, STALE_INTERVAL_MS } from './quick-sheet';
import type { HostReading } from './scope';
import { limitsJson, limitsReport, type WindowSpec } from './test-builders';

const NOW = new Date('2026-10-31T12:00:00Z');
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);
const HOUR = 3600;

const spec = (
  id: string,
  minutes: number | null,
  used: number,
  resetsInSeconds: number,
  label?: string,
): WindowSpec => ({ id, minutes, used, resetsAt: at(resetsInSeconds), label });

const reading = (
  report: ReturnType<typeof limitsReport>,
  rest: Partial<HostReading> = {},
): HostReading => ({
  id: 'h1',
  name: 'devbox',
  state: { kind: 'available', report },
  ...rest,
});

const text = (value: Text | null) => (value === null ? null : renderText(value));

function windowsOf(card: QuickCard | undefined): readonly QuickWindow[] {
  if (card?.body.kind !== 'windows') throw new Error(`not windows: ${card?.body.kind}`);
  return card.body.windows;
}

describe('pace and level', () => {
  it('compares use with the time elapsed within one tolerance', () => {
    expect(usagePace(62, 58)).toBe('onPace');
    expect(usagePace(38, 44)).toBe('under');
    expect(usagePace(71, 61)).toBe('ahead');
    // The tolerance itself still reads on pace, either side.
    expect(usagePace(55, 50)).toBe('onPace');
    expect(usagePace(45, 50)).toBe('onPace');
    expect(usagePace(55.1, 50)).toBe('ahead');
    expect(usagePace(44.9, 50)).toBe('under');
  });

  it('turns warning at 80 and danger at 95', () => {
    expect([0, 79.9, 80, 94.9, 95, 100].map(limitLevel)).toEqual([
      'normal',
      'normal',
      'warning',
      'warning',
      'danger',
      'danger',
    ]);
  });

  it('puts the tick where the window time has reached', () => {
    // A 5-hour window resetting in 2 h 15 min is 55% through.
    expect(elapsedPercent(300, at(2 * HOUR + 15 * 60), NOW)).toBeCloseTo(55, 5);
    // A reset further away than the window's length reads as its start.
    expect(elapsedPercent(300, at(6 * HOUR), NOW)).toBe(0);
    // No length, no reset, or a reset already passed: no tick.
    expect(elapsedPercent(null, at(60), NOW)).toBeNull();
    expect(elapsedPercent(300, null, NOW)).toBeNull();
    expect(elapsedPercent(300, NOW, NOW)).toBeNull();
  });

  it('names windows by label, known Claude id, then length', () => {
    const base = {
      id: 'x',
      label: null,
      durationMinutes: null,
      usedPercent: null,
      resetsAt: null,
      expired: false,
    };
    const name = (w: object, program = 'codex') => text(windowName({ ...base, ...w }, program));
    expect(name({ label: 'Opus' })).toBe('Opus');
    expect(name({ id: 'sevenDayOpus' }, 'claude')).toBe('Weekly · Opus');
    expect(name({ durationMinutes: 300 })).toBe('5-hour');
    expect(name({ durationMinutes: 10_080 })).toBe('Weekly');
    expect(name({ durationMinutes: 4_320 })).toBe('3-day');
    expect(name({ durationMinutes: 45 })).toBe('45-minute');
    expect(name({})).toBe('Usage window');
  });
});

describe('countdown units', () => {
  it('localizes the unit suffixes (Spanish minutes read "min")', () => {
    expect(countdown(at(2 * HOUR + 14 * 60), NOW, 'es')).toBe('2h 14min');
    expect(countdown(at(3 * 86_400 + 16 * HOUR), NOW, 'es')).toBe('3d 16h');
  });

  it('falls back to d/h/m when Intl has no unit formatting', () => {
    const real = Intl.NumberFormat;
    Intl.NumberFormat = (() => {
      throw new RangeError('unsupported');
    }) as unknown as typeof Intl.NumberFormat;
    try {
      expect(countdown(at(2 * HOUR + 14 * 60), NOW, 'es')).toBe('2h 14m');
    } finally {
      Intl.NumberFormat = real;
    }
  });
});

describe('reset line', () => {
  it('counts down within a day and names the day for a later reset', () => {
    expect(countdown(at(2 * HOUR + 14 * 60), NOW)).toBe('2h 14m');
    expect(countdown(at(3 * 86_400 + 16 * HOUR), NOW)).toBe('3d 16h');
    expect(countdown(at(5), NOW)).toBe('1m');
    expect(countdown(at(86_400 + 60), NOW)).toBe('1d');
    expect(text(resetText(at(2 * HOUR + 14 * 60), NOW, 'en'))).toBe('resets in 2h 14m');
    const later = text(resetText(new Date('2026-11-05T09:00:00Z'), NOW, 'en', 'UTC'));
    expect(later).toMatch(/^resets Thu/);
    expect(later).toContain('9:00');
  });
});

describe('quickContent', () => {
  it('gives every Account a card with its windows, tick and pace', () => {
    const observed = at(-30);
    const five = spec('fiveHour', 300, 58, 2 * HOUR + 15 * 60);
    const week = spec('sevenDay', 10_080, 38, 3 * 86_400);
    const opus = spec('claude:model:Opus', null, 71, 3 * 86_400, 'Opus');
    const accounts = [
      {
        id: 'default',
        isDefault: true,
        directory: '~/.claude',
        state: 'ok',
        usageLimits: limitsJson(observed, [five, week, opus]),
      },
      {
        id: 'c2',
        name: 'work',
        directory: '~/.claude-work',
        state: 'ok',
        usageLimits: limitsJson(observed, [spec('fiveHour', 300, 96, HOUR)], { plan: 'pro' }),
      },
      { id: 'gone', name: 'old', directory: '~/.claude-old', state: 'missing' },
    ];
    const report = limitsReport({
      claude: limitsJson(observed, [five]),
      accounts,
      codex: limitsJson(observed, [spec('primary', 300, 20, 4 * HOUR)]),
    });
    const { cards, empty } = quickContent([reading(report)], NOW);
    expect(empty).toBeNull();
    expect(cards.map((c) => c.program)).toEqual(['claude', 'claude', 'claude', 'codex']);
    expect(cards.map((c) => c.account)).toEqual(['Default', 'work', 'old', null]);
    expect(cards.map((c) => c.plan)).toEqual(['max', 'pro', null, 'max']);

    const first = windowsOf(cards[0]);
    expect(first.map((w) => text(w.name))).toEqual(['5-hour', 'Weekly', 'Opus']);
    expect(first.map((w) => w.usedPercent)).toEqual([58, 38, 71]);
    expect(first.map((w) => w.pace)).toEqual(['onPace', 'under', null]);
    expect(first[0]?.elapsedPercent).toBeCloseTo(55, 5);
    expect(first[2]?.elapsedPercent).toBeNull();
    expect(first.map((w) => w.level)).toEqual(['normal', 'normal', 'normal']);

    const work = windowsOf(cards[1]);
    expect(work.map((w) => w.level)).toEqual(['danger']);
    expect(work.map((w) => w.pace)).toEqual(['ahead']);

    expect(cards[2]?.body).toMatchObject({ kind: 'uncounted' });
    expect(cards[2]?.body.kind === 'uncounted' && text(cards[2].body.reason)).toBe(
      'Directory not found',
    );
    expect(cards.every((c) => !c.isStale)).toBe(true);
  });

  it('shows the Claude limits switch, a reading state, a reason, and nothing for a missing program', () => {
    const off = limitsReport({
      claude: { state: 'disabled' },
      codex: { state: 'unavailable', reason: 'programMissing' },
    });
    const offContent = quickContent([reading(off)], NOW);
    expect(offContent.cards).toHaveLength(1);
    expect(offContent.cards[0]?.body.kind).toBe('limitsOff');

    const pending = limitsReport({ claude: { state: 'unavailable', reason: 'notReadYet' } });
    expect(quickContent([reading(pending)], NOW).cards[0]?.body.kind).toBe('reading');

    const signedOut = limitsReport({ claude: { state: 'unavailable', reason: 'notSignedIn' } });
    const body = quickContent([reading(signedOut)], NOW).cards[0]?.body;
    expect(body?.kind === 'message' && text(body.text)).toBe(
      'Sign in to Claude Code on this Host to read Usage Limits.',
    );
  });

  it('shows an expired window with no figure, tick or pace', () => {
    const passed = limitsReport({
      claude: limitsJson(NOW, [spec('fiveHour', 300, 90, -60)]),
    });
    const [window] = windowsOf(quickContent([reading(passed)], NOW).cards[0]);
    expect(window).toMatchObject({
      isExpired: true,
      usedPercent: null,
      elapsedPercent: null,
      pace: null,
      level: null,
    });
  });

  it('reads old figures as stale but a last-session reading as fresh', () => {
    const reset = spec('fiveHour', 300, 10, HOUR);
    const aged = (ms: number) =>
      limitsReport({ claude: limitsJson(new Date(NOW.getTime() - ms), [reset]) });
    const lastSession = limitsReport({
      claude: { state: 'disabled' },
      codex: limitsJson(at(-86_400), [spec('primary', 300, 10, HOUR)], { source: 'lastSession' }),
    });
    const last = (report: ReturnType<typeof limitsReport>, rest: Partial<HostReading> = {}) =>
      quickContent([reading(report, rest)], NOW).cards.at(-1);

    expect(last(aged(STALE_INTERVAL_MS - 60_000))?.isStale).toBe(false);
    expect(last(aged(STALE_INTERVAL_MS))?.isStale).toBe(true);
    expect(last(lastSession)?.isStale).toBe(false);
    expect(last(lastSession)?.isLastSession).toBe(true);
    const fresh = aged(0);
    expect(last(fresh, { isConnected: false })?.isStale).toBe(true);
    expect(text(last(fresh, { isConnected: false })?.staleNote ?? null)).toBe('Not connected');
    expect(text(last(fresh, { refreshFailure: 'Timed out' })?.staleNote ?? null)).toBe(
      'Last refresh failed',
    );
  });

  it('has an empty state for no Hosts, loading and unreadable Hosts', () => {
    expect(quickContent([], NOW).empty).toEqual({ kind: 'noHosts' });
    expect(
      quickContent([{ id: 'a', name: 'devbox', state: { kind: 'loading' } }], NOW).empty,
    ).toEqual({
      kind: 'loading',
    });
    const unreadable = quickContent(
      [
        { id: 'a', name: 'devbox', state: { kind: 'failed', detail: 'Timed out' } },
        { id: 'b', name: 'laptop', state: { kind: 'idle' }, isConnected: false },
      ],
      NOW,
    );
    expect(unreadable.cards).toEqual([]);
    expect(
      unreadable.empty?.kind === 'unavailable' &&
        unreadable.empty.reasons.map((r) => renderText(r)),
    ).toEqual(['devbox · Could not read Usage', 'laptop · Not connected']);
    const silent = limitsReport({ claude: { state: 'unavailable', reason: 'programMissing' } });
    const named = quickContent([reading(silent)], NOW).empty;
    expect(named?.kind === 'unavailable' && named.reasons.map((r) => renderText(r))).toEqual([
      'devbox · No Usage Limits reported',
    ]);
  });
});
