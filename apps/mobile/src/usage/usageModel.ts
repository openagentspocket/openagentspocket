import {
  formatDate,
  formatDay,
  programDisplayName,
  type ScopeProgram,
  scopeDates,
  type UsageScope,
} from '@openagentspocket/core';
import { metricValue, type UsageMetric } from './usageText';

/** Days the calendar and the chart cover, ending on the newest reported day. */
export const CALENDAR_DAYS = 30;

const DAY_MS = 86_400_000;
const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const parseDay = (day: string): number => Date.parse(`${day}T00:00:00Z`);

export interface ChartData {
  /** One entry per program, `points` aligned to `dates`. */
  series: { key: string; label: string; program: string; points: number[] }[];
  dates: string[];
}

/** Daily figures per program over the last reported days. */
export function chartData(
  scope: UsageScope,
  metric: UsageMetric,
  count = CALENDAR_DAYS,
): ChartData {
  const dates = scopeDates(scope).slice(-count);
  const series = scope.programs.map((program) => ({
    key: program.program,
    label: programDisplayName(program.program),
    program: program.program,
    points: dates.map((date) => {
      const day = program.daily.find((d) => d.date === date);
      return day ? metricValue(day, metric) : 0;
    }),
  }));
  return { series, dates };
}

export interface HeatModel {
  days: { date: string; value: number; recorded: boolean }[];
  today: string;
  first: string;
}

/** The calendar: 30 calendar days ending on the newest reported day, Monday first. */
export function heatModel(scope: UsageScope, metric: UsageMetric): HeatModel | null {
  const reported = scopeDates(scope);
  const last = reported.at(-1);
  if (!last) return null;
  const end = parseDay(last);
  const known = new Set(reported);
  const values = new Map<string, number>();
  for (const date of reported) {
    let sum = 0;
    for (const program of scope.programs) {
      const day = program.daily.find((d) => d.date === date);
      if (day) sum += metricValue(day, metric);
    }
    values.set(date, sum);
  }
  const span = Array.from({ length: CALENDAR_DAYS }, (_, index) =>
    isoDay(end - (CALENDAR_DAYS - 1 - index) * DAY_MS),
  );
  const first = span[0] ?? last;
  // getUTCDay counts Sunday as 0: shift so Monday is the first column.
  const lead = (new Date(parseDay(first)).getUTCDay() + 6) % 7;
  // The week's earlier days draw hatched ("Not recorded") rather than as empty cells.
  const days = Array.from({ length: lead + CALENDAR_DAYS }, (_, index) => {
    const date = isoDay(parseDay(first) - (lead - index) * DAY_MS);
    return { date, value: values.get(date) ?? 0, recorded: known.has(date) };
  });
  return { days, today: last, first };
}

/** Cell label: the day of the month, with the month on the first cell and on the first of a month. */
export function heatLabel(date: string, locale: string, withMonth: boolean): string {
  return withMonth ? formatDay(date, locale) : String(Number(date.slice(8, 10)));
}

/** Seven narrow weekday letters, Monday first, in `locale`. */
export function weekdayLetters(locale: string): string[] {
  const monday = Date.UTC(2026, 10, 2);
  return Array.from({ length: 7 }, (_, index) =>
    formatDate(new Date(monday + index * DAY_MS), locale, { weekday: 'narrow', timeZone: 'UTC' }),
  );
}

/** A program's 30-day token kinds, in the split bar's order. */
export function programSplit(program: ScopeProgram) {
  const { input, cacheRead, cacheWrite, output } = program.totals.last30Days.tokens;
  return { input, cacheRead, cacheWrite, output };
}
