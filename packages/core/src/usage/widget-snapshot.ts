import { message, renderText, sourceText, type Translate } from '../errors/text';
import { limitsReadings, parseInstant, unavailableMessage, windowName } from './limits';
import { programDisplayName, type Summary, type UsageProgram, type UsageReport } from './report';
import { exclusionFor, exclusionText, type HostReading, type UsageExclusion } from './scope';

/**
 * The file the Usage widgets read (Swift `UsageWidgetSnapshot`, schema version 1). Dates are
 * instants here; `encodeWidgetSnapshot` writes them the way Swift's default `JSONEncoder` does.
 */
export const WIDGET_SNAPSHOT_VERSION = 1;
export const WIDGET_SNAPSHOT_FILE = 'usage-widgets.json';
/** The kinds the app asks WidgetKit to reload after a write (match the extension's widgets). */
export const WIDGET_KINDS = [
  'com.openagentspocket.usage',
  'com.openagentspocket.usage-limits',
] as const;

export interface WidgetSummary {
  readonly cost: number | null;
  readonly tokens: number;
}

export interface WidgetWindow {
  readonly id: string;
  readonly name: string;
  readonly usedPercent: number | null;
  readonly resetsAt: Date | null;
  readonly expired: boolean;
}

export interface WidgetLimits {
  readonly program: string;
  readonly name: string;
  readonly account: string | null;
  readonly accountID: string | null;
  readonly message: string | null;
  readonly isLastReading: boolean;
  readonly source: 'program' | 'lastSession' | null;
  readonly observedAt: Date | null;
  readonly windows: readonly WidgetWindow[];
}

export interface WidgetProgram {
  readonly program: string;
  readonly name: string;
  readonly today: WidgetSummary;
  readonly last7Days: WidgetSummary;
  readonly last30Days: WidgetSummary;
  readonly days: readonly { readonly date: string; readonly summary: WidgetSummary }[];
}

export interface WidgetHost {
  /** A UUID: the Swift widgets key a Host by one. */
  readonly id: string;
  readonly name: string;
  readonly readAt: Date | null;
  readonly excludedReason: string | null;
  readonly excludedCode: UsageExclusion | null;
  readonly timeZone: string | null;
  readonly programs: readonly WidgetProgram[];
  readonly limits: readonly WidgetLimits[];
}

export interface WidgetSnapshot {
  readonly version: number;
  readonly hosts: readonly WidgetHost[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A Host id as the widgets' UUID: kept when it is one, else a stable UUID derived from it. */
export function widgetHostId(id: string): string {
  if (UUID.test(id)) return id.toUpperCase();
  let hash = 0xcbf29ce4;
  let raw = '';
  for (let round = 0; round < 4; round += 1) {
    for (const char of `${round}:${id}`) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193);
    raw += (hash >>> 0).toString(16).padStart(8, '0');
  }
  const variant = ((Number.parseInt(raw.charAt(16), 16) & 0x3) | 0x8).toString(16);
  const uuid = `${raw.slice(0, 8)}-${raw.slice(8, 12)}-4${raw.slice(13, 16)}-${variant}${raw.slice(17, 20)}-${raw.slice(20, 32)}`;
  return uuid.toUpperCase();
}

const toSummary = (summary: Summary): WidgetSummary => ({
  cost: summary.estimatedCostUSD,
  tokens: summary.tokens.total,
});

function toProgram(program: UsageProgram): WidgetProgram[] {
  const { tokenUsage } = program;
  if (tokenUsage.state !== 'ok' || !tokenUsage.totals) return [];
  return [
    {
      program: program.program,
      name: programDisplayName(program.program),
      today: toSummary(tokenUsage.totals.today),
      last7Days: toSummary(tokenUsage.totals.last7Days),
      last30Days: toSummary(tokenUsage.totals.last30Days),
      days: tokenUsage.daily.map((day) => ({ date: day.date, summary: toSummary(day) })),
    },
  ];
}

function toLimits(report: UsageReport, translate: Translate): WidgetLimits[] {
  return limitsReadings(report).flatMap((card): WidgetLimits[] => {
    if (card.kind === 'claudeToggle') return [];
    if (card.kind === 'unread') {
      return [
        {
          program: 'claude',
          name: programDisplayName('claude'),
          account: card.account,
          accountID: card.accountId,
          message: renderText(card.reason, translate),
          isLastReading: false,
          source: null,
          observedAt: null,
          windows: [],
        },
      ];
    }
    const { limits, program } = card;
    const shown = limits.state === 'ok' || limits.state === 'throttled';
    const windows = shown ? limits.windows : [];
    let text: string | null = null;
    if (!shown) {
      text =
        limits.state === 'unavailable' && limits.reason === 'notReadYet'
          ? renderText(message('Open Agentico to read Usage Limits.'), translate)
          : renderText(unavailableMessage(limits, program), translate);
    } else if (windows.length === 0) {
      text = renderText(message('No Usage Limits windows reported.'), translate);
    }
    return [
      {
        program,
        name: programDisplayName(program),
        account: card.account,
        accountID: card.accountId,
        message: text,
        isLastReading: limits.state === 'throttled',
        source: shown ? (limits.source === 'lastSession' ? 'lastSession' : 'program') : null,
        observedAt: parseInstant(limits.observedAt),
        windows: windows.map((window) => ({
          id: window.id,
          name: renderText(windowName(window, program), translate),
          usedPercent: window.usedPercent,
          resetsAt: parseInstant(window.resetsAt),
          expired: window.expired,
        })),
      },
    ];
  });
}

function excludedHost(
  reading: HostReading,
  code: UsageExclusion,
  translate: Translate,
): WidgetHost {
  return {
    id: widgetHostId(reading.id),
    name: reading.name,
    readAt: null,
    excludedReason: renderText(exclusionText(code), translate),
    excludedCode: code,
    timeZone: null,
    programs: [],
    limits: [],
  };
}

/**
 * The snapshot after `readings`, in their order. A Host the app has no newer report for keeps what
 * `previous` holds, so a launch or a dropped connection does not empty the widgets; a Host that
 * answered it cannot report loses its figures.
 */
export function buildWidgetSnapshot(
  readings: readonly HostReading[],
  options: {
    readonly previous?: WidgetSnapshot | null;
    readonly now?: Date;
    readonly translate?: Translate;
  } = {},
): WidgetSnapshot {
  const { previous = null, now = new Date(), translate = sourceText } = options;
  const hosts = readings.map((reading): WidgetHost => {
    const id = widgetHostId(reading.id);
    const kept = previous?.hosts.find((host) => host.id === id && host.readAt !== null);
    const { state } = reading;
    switch (state.kind) {
      case 'available':
        return {
          id,
          name: reading.name,
          readAt: now,
          excludedReason: null,
          excludedCode: null,
          timeZone: state.report.timeZone,
          programs: state.report.programs.flatMap(toProgram),
          limits: toLimits(state.report, translate),
        };
      case 'idle':
      case 'loading':
      case 'failed': {
        if (kept) return { ...kept, name: reading.name };
        let code: UsageExclusion = 'notReadYet';
        if (reading.isConnected === false) code = 'notConnected';
        else if (state.kind === 'failed') code = exclusionFor(state);
        return excludedHost(reading, code, translate);
      }
      default:
        return excludedHost(reading, exclusionFor(state), translate);
    }
  });
  return { version: WIDGET_SNAPSHOT_VERSION, hosts };
}

/** Seconds since 2001-01-01 UTC: what Swift's default `Date` coding reads and writes. */
const REFERENCE_DATE_MS = Date.UTC(2001, 0, 1);

/** Dates become reference-date seconds and nulls are dropped, as Swift's synthesized coding does. */
function toWire(value: unknown): unknown {
  if (value instanceof Date) return (value.getTime() - REFERENCE_DATE_MS) / 1000;
  if (Array.isArray(value)) return value.map(toWire);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, field]) => field !== null && field !== undefined)
        .map(([key, field]) => [key, toWire(field)]),
    );
  }
  return value;
}

/** The JSON the Swift widgets decode. */
export const encodeWidgetSnapshot = (snapshot: WidgetSnapshot): string =>
  JSON.stringify(toWire(snapshot));
