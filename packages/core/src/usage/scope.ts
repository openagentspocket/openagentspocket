import { type Message, message } from '../errors/text';
import type {
  Daily,
  DirectoryUsage,
  ModelUsage,
  Summary,
  Tokens,
  Totals,
  UsageProgram,
  UsageReport,
} from './report';
import { accountDisplayName, isReadableAccount } from './report';

export type UsageRange = 'today' | 'last7Days' | 'last30Days';
export const USAGE_RANGES: readonly UsageRange[] = ['today', 'last7Days', 'last30Days'];
/** How many of the newest days a range covers. */
export const RANGE_DAY_COUNT: Readonly<Record<UsageRange, number>> = {
  today: 1,
  last7Days: 7,
  last30Days: 30,
};

export const ZERO_TOKENS: Tokens = {
  input: 0,
  cacheRead: 0,
  cacheWrite: 0,
  output: 0,
  reasoning: 0,
  total: 0,
};

export function sumTokens(list: readonly Tokens[]): Tokens {
  return list.reduce<Tokens>(
    (sum, next) => ({
      input: sum.input + next.input,
      cacheRead: sum.cacheRead + next.cacheRead,
      cacheWrite: sum.cacheWrite + next.cacheWrite,
      output: sum.output + next.output,
      reasoning: sum.reasoning + next.reasoning,
      total: sum.total + next.total,
    }),
    ZERO_TOKENS,
  );
}

/** Adds summaries up. Unpriced throughout stays unpriced (null) rather than becoming $0. */
export function sumSummaries(list: readonly Summary[]): Summary {
  const priced = list.flatMap((s) => (s.estimatedCostUSD === null ? [] : [s.estimatedCostUSD]));
  return {
    tokens: sumTokens(list.map((s) => s.tokens)),
    estimatedCostUSD:
      priced.length === 0 && list.length > 0 ? null : priced.reduce((a, b) => a + b, 0),
    unpricedTokens: list.reduce((a, s) => a + s.unpricedTokens, 0),
  };
}

export const rangeSummary = (totals: Totals, range: UsageRange): Summary => totals[range];

/** Why a Host cannot be added up. */
export type UsageExclusion =
  | 'notConnected'
  | 'notReadYet'
  | 'needsPlugin'
  | 'notSupportedOnWindows'
  | 'noAgentActivity'
  | 'updateAgentico'
  | 'couldNotRead';

/** Catalog entries for each exclusion (Swift `UsageExclusion.text`). */
export const exclusionText = (exclusion: UsageExclusion): Message =>
  message(
    {
      notConnected: 'Not connected',
      notReadYet: 'Not read yet',
      needsPlugin: 'Needs the Agentico plugin',
      notSupportedOnWindows: 'Not supported on Windows',
      noAgentActivity: 'No Agent activity yet',
      updateAgentico: 'Update Agentico',
      couldNotRead: 'Could not read Usage',
    }[exclusion],
  );

/** What one Host's Usage store holds. */
export type UsageHostState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'available'; readonly report: UsageReport }
  /** The Host's plugin is missing, off or too old; `note` says what to do. */
  | { readonly kind: 'requirement'; readonly note?: Message }
  | { readonly kind: 'unsupportedPlatform' }
  | { readonly kind: 'runtimeMissing' }
  | { readonly kind: 'updateRequired' }
  | { readonly kind: 'failed'; readonly detail: string };

export interface HostReading {
  readonly id: string;
  readonly name: string;
  readonly state: UsageHostState;
  readonly refreshFailure?: string | null;
  readonly isRetryingRefresh?: boolean;
  /** Usage borrows the Console's connection: a Host without one cannot answer. */
  readonly isConnected?: boolean;
}

export interface IncludedHost {
  readonly id: string;
  readonly name: string;
  readonly report: UsageReport;
  readonly refreshFailure: string | null;
  readonly isRetryingRefresh: boolean;
  /** Every ok program's 30-day totals on this Host. */
  readonly last30Days: Summary;
}

export interface ExcludedHost {
  readonly id: string;
  readonly name: string;
  readonly exclusion: UsageExclusion;
}

export interface ScopeDirectory {
  readonly hostName: string;
  readonly directory: DirectoryUsage;
}

export interface ScopeProgram {
  readonly program: string;
  readonly totals: Totals;
  readonly daily: readonly Daily[];
  readonly models: readonly ModelUsage[];
  readonly directories: readonly ScopeDirectory[];
}

export interface AccountUsage {
  readonly id: string;
  readonly name: string;
  /** null when its Token Usage could not be read; zero when none recorded yet. */
  readonly summary: Summary | null;
}

export interface UsageScope {
  readonly included: readonly IncludedHost[];
  readonly excluded: readonly ExcludedHost[];
  /** Hosts still answering their first read. */
  readonly loading: readonly HostReading[];
  readonly programs: readonly ScopeProgram[];
}

export function exclusionFor(state: UsageHostState): UsageExclusion {
  switch (state.kind) {
    case 'requirement':
      return 'needsPlugin';
    case 'unsupportedPlatform':
      return 'notSupportedOnWindows';
    case 'runtimeMissing':
      return 'noAgentActivity';
    case 'updateRequired':
      return 'updateAgentico';
    default:
      return 'couldNotRead';
  }
}

const okTotals = (program: UsageProgram): Totals | null =>
  program.tokenUsage.state === 'ok' ? program.tokenUsage.totals : null;

/** Token Usage adds up across Hosts; Usage Limits never do (two Hosts may share an account). */
export function buildUsageScope(readings: readonly HostReading[]): UsageScope {
  const included: IncludedHost[] = [];
  const excluded: ExcludedHost[] = [];
  const loading: HostReading[] = [];
  for (const reading of readings) {
    const { state } = reading;
    if (state.kind === 'available') {
      const totals = state.report.programs.flatMap((p) => okTotals(p)?.last30Days ?? []);
      included.push({
        id: reading.id,
        name: reading.name,
        report: state.report,
        refreshFailure: reading.refreshFailure ?? null,
        isRetryingRefresh: reading.isRetryingRefresh ?? false,
        last30Days: sumSummaries(totals),
      });
    } else if (reading.isConnected === false) {
      excluded.push({ id: reading.id, name: reading.name, exclusion: 'notConnected' });
    } else if (state.kind === 'idle' || state.kind === 'loading') {
      loading.push(reading);
    } else {
      excluded.push({ id: reading.id, name: reading.name, exclusion: exclusionFor(state) });
    }
  }
  return { included, excluded, loading, programs: scopePrograms(included) };
}

function scopePrograms(hosts: readonly IncludedHost[]): ScopeProgram[] {
  const order: string[] = [];
  const byProgram = new Map<string, { hostName: string; program: UsageProgram }[]>();
  for (const host of hosts) {
    for (const program of host.report.programs) {
      if (!okTotals(program)) continue;
      if (!byProgram.has(program.program)) {
        order.push(program.program);
        byProgram.set(program.program, []);
      }
      byProgram.get(program.program)?.push({ hostName: host.name, program });
    }
  }
  return order.map((name) => {
    const usages = byProgram.get(name) ?? [];
    const totals = usages.flatMap((u) => okTotals(u.program) ?? []);
    const days = new Map<string, Summary[]>();
    const models = new Map<string, ModelUsage[]>();
    for (const { program } of usages) {
      for (const day of program.tokenUsage.daily)
        days.set(day.date, [...(days.get(day.date) ?? []), day]);
      for (const model of program.tokenUsage.models)
        models.set(model.model, [...(models.get(model.model) ?? []), model]);
    }
    return {
      program: name,
      totals: {
        today: sumSummaries(totals.map((t) => t.today)),
        last7Days: sumSummaries(totals.map((t) => t.last7Days)),
        last30Days: sumSummaries(totals.map((t) => t.last30Days)),
      },
      daily: [...days.keys()]
        .sort()
        .map((date) => ({ date, ...sumSummaries(days.get(date) ?? []) })),
      models: [...models.entries()]
        .map(([model, entries]) => ({
          model,
          priced: entries.every((e) => e.priced),
          ...sumSummaries(entries),
        }))
        .sort((a, b) => b.tokens.total - a.tokens.total),
      // The same path on two Hosts is two directories.
      directories: usages
        .flatMap(({ hostName, program }) =>
          program.tokenUsage.directories.map((directory) => ({ hostName, directory })),
        )
        .sort((a, b) => b.directory.tokens.total - a.directory.tokens.total),
    };
  });
}

export const scopeIsEmpty = (scope: UsageScope): boolean => scope.included.length === 0;

export const scopeRefreshing = (scope: UsageScope): boolean =>
  scope.included.some((h) => h.report.refreshing === true);

/** The days' time zones, in Host order. */
export function scopeTimeZones(scope: UsageScope): string[] {
  const zones: string[] = [];
  for (const host of scope.included) {
    const zone = host.report.timeZone;
    if (zone && !zones.includes(zone)) zones.push(zone);
  }
  return zones;
}

export function scopeDayNote(scope: UsageScope): Message | null {
  const zones = scopeTimeZones(scope);
  if (zones.length > 1) return message('Days follow each Host’s time zone (%@).', zones.join(', '));
  return zones[0] ? message('Days shown in %@.', zones[0]) : null;
}

export function scopeTotal(scope: UsageScope, range: UsageRange): Summary {
  return sumSummaries(scope.programs.map((p) => rangeSummary(p.totals, range)));
}

export function scopeDay(scope: UsageScope, date: string): Summary {
  return sumSummaries(scope.programs.flatMap((p) => p.daily.filter((d) => d.date === date)));
}

/** The dates any program reported, oldest first. */
export function scopeDates(scope: UsageScope): string[] {
  return [...new Set(scope.programs.flatMap((p) => p.daily.map((d) => d.date)))].sort();
}

/**
 * The readable Accounts that make up `program` for a range, when the scope is one Host with more
 * than one. Accounts belong to their Host, so several Hosts keep program totals only.
 */
export function scopeAccounts(
  scope: UsageScope,
  program: string,
  range: UsageRange,
): AccountUsage[] {
  const [host, ...rest] = scope.included;
  if (!host || rest.length > 0) return [];
  const readable = (host.report.programs.find((p) => p.program === program)?.accounts ?? []).filter(
    isReadableAccount,
  );
  if (readable.length < 2) return [];
  return readable.map((account) => {
    const usage = account.tokenUsage;
    let summary: Summary | null = null;
    if (usage?.state === 'ok' && usage.totals) summary = rangeSummary(usage.totals, range);
    else if (usage?.state === 'noData')
      summary = { tokens: ZERO_TOKENS, estimatedCostUSD: 0, unpricedTokens: 0 };
    return { id: account.id, name: accountDisplayName(account), summary };
  });
}
