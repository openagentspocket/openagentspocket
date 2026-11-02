/**
 * The plugin's `usage` v1 response. Unknown fields are ignored so a newer plugin can add data
 * without breaking an older app. Mirrors the Swift `AgentUsageReport`.
 */
export interface Tokens {
  readonly input: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly output: number;
  /** Informative only: already included in output for programs that report it. */
  readonly reasoning: number;
  readonly total: number;
}

export interface Summary {
  readonly tokens: Tokens;
  /** null when nothing was priced. */
  readonly estimatedCostUSD: number | null;
  readonly unpricedTokens: number;
}

export interface Totals {
  readonly today: Summary;
  readonly last7Days: Summary;
  readonly last30Days: Summary;
}

export interface Daily extends Summary {
  /** `YYYY-MM-DD`, already folded into the report's time zone. */
  readonly date: string;
}

export interface ModelUsage extends Summary {
  readonly model: string;
  readonly priced: boolean;
}

export interface DirectoryUsage extends Summary {
  readonly path: string;
}

export interface TokenUsage {
  readonly state: string;
  readonly reason: string | null;
  readonly totals: Totals | null;
  readonly daily: readonly Daily[];
  readonly models: readonly ModelUsage[];
  readonly directories: readonly DirectoryUsage[];
}

export interface LimitWindow {
  readonly id: string;
  readonly label: string | null;
  readonly durationMinutes: number | null;
  readonly usedPercent: number | null;
  readonly resetsAt: string | null;
  readonly expired: boolean;
}

export interface UsageLimits {
  readonly state: string;
  readonly reason: string | null;
  readonly source: string | null;
  readonly observedAt: string | null;
  readonly retryAt: string | null;
  readonly plan: string | null;
  readonly windows: readonly LimitWindow[];
}

export type AccountState =
  | 'ok'
  | 'missing'
  | 'duplicate'
  | 'overLimit'
  | { readonly other: string };

export interface ClaudeAccount {
  /** `default` for the Default Account; otherwise the Account file's id. */
  readonly id: string;
  readonly isDefault: boolean;
  readonly name: string | null;
  readonly directory: string;
  readonly state: AccountState;
  readonly tokenUsage: TokenUsage | null;
  readonly usageLimits: UsageLimits | null;
}

export interface AccountSuggestion {
  readonly directory: string;
  readonly name: string;
  readonly source: 'agent' | 'home' | { readonly other: string };
}

export interface UsageProgram {
  readonly program: string;
  readonly tokenUsage: TokenUsage;
  readonly usageLimits: UsageLimits;
  /** null from older plugins and for programs other than Claude Code. */
  readonly accounts: readonly ClaudeAccount[] | null;
  readonly accountSuggestions: readonly AccountSuggestion[] | null;
}

export interface UsageScan {
  readonly state: string;
  readonly coveredFrom: string | null;
  readonly coveredThrough: string | null;
  readonly skippedArchives: number;
  readonly unreadableFiles: number | null;
}

export interface UsageReport {
  readonly version: 1;
  readonly runtime: 'recorded' | 'missing';
  readonly generatedAt: string | null;
  readonly timeZone: string | null;
  readonly refreshing: boolean | null;
  readonly pricingVersion: string | null;
  readonly scan: UsageScan | null;
  readonly programs: readonly UsageProgram[];
}

export type UsageReportErrorReason = 'unsupportedVersion' | 'invalidReport';

export class UsageReportError extends Error {
  override readonly name = 'UsageReportError';
  constructor(readonly reason: UsageReportErrorReason) {
    super(reason);
  }
}

export const DEFAULT_ACCOUNT_ID = 'default';

type Obj = Readonly<Record<string, unknown>>;

const invalid = (): never => {
  throw new UsageReportError('invalidReport');
};
const isObj = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const obj = (value: unknown): Obj => (isObj(value) ? value : invalid());
const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : invalid();
const str = (value: unknown): string => (typeof value === 'string' ? value : invalid());
const bool = (value: unknown): boolean => (typeof value === 'boolean' ? value : invalid());
const arr = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : invalid());
const optStr = (value: unknown): string | null =>
  value === undefined || value === null ? null : str(value);
const optNum = (value: unknown): number | null =>
  value === undefined || value === null ? null : num(value);

function tokens(value: unknown): Tokens {
  const o = obj(value);
  return {
    input: num(o.input),
    cacheRead: num(o.cacheRead),
    cacheWrite: num(o.cacheWrite),
    output: num(o.output),
    reasoning: num(o.reasoning),
    total: num(o.total),
  };
}

function summaryFields(o: Obj): Summary {
  return {
    tokens: tokens(o.tokens),
    estimatedCostUSD: optNum(o.estimatedCostUSD),
    unpricedTokens: optNum(o.unpricedTokens) ?? 0,
  };
}

function tokenUsage(value: unknown): TokenUsage {
  const o = obj(value);
  const totals = o.totals === undefined || o.totals === null ? null : obj(o.totals);
  return {
    state: str(o.state),
    reason: optStr(o.reason),
    totals: totals && {
      today: summaryFields(obj(totals.today)),
      last7Days: summaryFields(obj(totals.last7Days)),
      last30Days: summaryFields(obj(totals.last30Days)),
    },
    daily: (o.daily === undefined ? [] : arr(o.daily)).map((d) => {
      const day = obj(d);
      return { date: str(day.date), ...summaryFields(day) };
    }),
    models: (o.models === undefined ? [] : arr(o.models)).map((m) => {
      const model = obj(m);
      return { model: str(model.model), priced: bool(model.priced), ...summaryFields(model) };
    }),
    directories: (o.directories === undefined ? [] : arr(o.directories)).map((d) => {
      const dir = obj(d);
      return { path: str(dir.path), ...summaryFields(dir) };
    }),
  };
}

function usageLimits(value: unknown): UsageLimits {
  const o = obj(value);
  return {
    state: str(o.state),
    reason: optStr(o.reason),
    source: optStr(o.source),
    observedAt: optStr(o.observedAt),
    retryAt: optStr(o.retryAt),
    plan: optStr(o.plan),
    windows: (o.windows === undefined || o.windows === null ? [] : arr(o.windows)).map((w) => {
      const window = obj(w);
      return {
        id: str(window.id),
        label: optStr(window.label),
        durationMinutes: optNum(window.durationMinutes),
        usedPercent: optNum(window.usedPercent),
        resetsAt: optStr(window.resetsAt),
        expired: bool(window.expired),
      };
    }),
  };
}

function accountState(value: string): AccountState {
  return value === 'ok' || value === 'missing' || value === 'duplicate' || value === 'overLimit'
    ? value
    : { other: value };
}

function account(value: unknown): ClaudeAccount {
  const o = obj(value);
  return {
    id: str(o.id),
    isDefault: o.isDefault === undefined ? false : bool(o.isDefault),
    name: optStr(o.name),
    directory: str(o.directory),
    state: accountState(str(o.state)),
    tokenUsage:
      o.tokenUsage === undefined || o.tokenUsage === null ? null : tokenUsage(o.tokenUsage),
    usageLimits:
      o.usageLimits === undefined || o.usageLimits === null ? null : usageLimits(o.usageLimits),
  };
}

function suggestion(value: unknown): AccountSuggestion {
  const o = obj(value);
  const source = optStr(o.source) ?? '';
  return {
    directory: str(o.directory),
    name: str(o.name),
    source: source === 'agent' || source === 'home' ? source : { other: source },
  };
}

function program(value: unknown): UsageProgram {
  const o = obj(value);
  return {
    program: str(o.program),
    tokenUsage: tokenUsage(o.tokenUsage),
    usageLimits: usageLimits(o.usageLimits),
    accounts: o.accounts === undefined || o.accounts === null ? null : arr(o.accounts).map(account),
    accountSuggestions:
      o.accountSuggestions === undefined || o.accountSuggestions === null
        ? null
        : arr(o.accountSuggestions).map(suggestion),
  };
}

/**
 * Decodes the plugin's JSON text. The version is checked before anything else; a recorded report
 * must carry every field the app reads, a `missing` one only says the plugin has no runtime.
 */
export function decodeUsageReport(text: string): UsageReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return invalid();
  }
  const o = obj(parsed);
  if (o.version !== 1) throw new UsageReportError('unsupportedVersion');
  const runtime = o.runtime;
  if (runtime === 'missing') {
    return {
      version: 1,
      runtime,
      generatedAt: null,
      timeZone: null,
      refreshing: null,
      pricingVersion: null,
      scan: null,
      programs: [],
    };
  }
  if (runtime !== 'recorded') return invalid();
  const scan = obj(o.scan);
  return {
    version: 1,
    runtime,
    generatedAt: str(o.generatedAt),
    timeZone: str(o.timeZone),
    refreshing: bool(o.refreshing),
    pricingVersion: optStr(o.pricingVersion),
    scan: {
      state: str(scan.state),
      coveredFrom: optStr(scan.coveredFrom),
      coveredThrough: optStr(scan.coveredThrough),
      skippedArchives: num(scan.skippedArchives),
      unreadableFiles: optNum(scan.unreadableFiles),
    },
    programs: arr(o.programs).map(program),
  };
}

export function programDisplayName(id: string): string {
  if (id === 'claude') return 'Claude Code';
  if (id === 'codex') return 'Codex';
  return id;
}

export function accountDisplayName(account: ClaudeAccount): string {
  return account.name ?? 'Default';
}

export function isReadableAccount(account: ClaudeAccount): boolean {
  return account.state === 'ok';
}

export function claudeProgram(report: UsageReport): UsageProgram | undefined {
  return report.programs.find((p) => p.program === 'claude');
}

/** A device that opted out must never show a reading another query cached. */
export function withClaudeLimits(
  report: UsageReport,
  state: 'disabled' | 'unavailable' | 'error',
  reason: string | null,
): UsageReport {
  const limits: UsageLimits = {
    state,
    reason,
    source: null,
    observedAt: null,
    retryAt: null,
    plan: null,
    windows: [],
  };
  return {
    ...report,
    programs: report.programs.map((p) =>
      p.program !== 'claude'
        ? p
        : {
            ...p,
            usageLimits: limits,
            accounts:
              p.accounts?.map((a) =>
                isReadableAccount(a) || a.usageLimits ? { ...a, usageLimits: limits } : a,
              ) ?? null,
          },
    ),
  };
}
