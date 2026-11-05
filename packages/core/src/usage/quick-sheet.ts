import { type Message, message, renderText, type Text } from '../errors/text';
import { relativeAge } from './format';
import {
  cardId,
  elapsedPercent,
  type LimitsCard,
  limitLevel,
  limitsReadings,
  parseInstant,
  type UsageLimitLevel,
  type UsagePace,
  unavailableMessage,
  usagePace,
  windowName,
} from './limits';
import { type LimitWindow, programDisplayName, type UsageLimits } from './report';
import { buildUsageScope, exclusionText, type HostReading, type IncludedHost } from './scope';

/** Old figures read as stale after this long (the widget's refresh interval). */
export const STALE_INTERVAL_MS = 15 * 60_000;

export interface QuickWindow {
  readonly id: string;
  readonly name: Text;
  /** The share used, while the window runs and reports one. */
  readonly usedPercent: number | null;
  /** The window reset since it was read: its figure no longer holds. */
  readonly isExpired: boolean;
  readonly resetsAt: Date | null;
  /** Where an even pace would stand now, 0-100: the bar's tick. */
  readonly elapsedPercent: number | null;
  readonly pace: UsagePace | null;
  readonly level: UsageLimitLevel | null;
}

export type QuickBody =
  | { readonly kind: 'windows'; readonly windows: readonly QuickWindow[] }
  /** The plugin is still reading them. */
  | { readonly kind: 'reading' }
  /** Claude Code limits are off on this device for this Host. */
  | { readonly kind: 'limitsOff' }
  /** `off`: the program's limits are switched off, not failing. */
  | { readonly kind: 'message'; readonly text: Message; readonly off?: true }
  /** A Claude Code Account that adds nothing, and why. */
  | { readonly kind: 'uncounted'; readonly reason: Message };

export interface QuickCard {
  readonly id: string;
  readonly hostId: string;
  readonly hostName: string;
  readonly cardId: string;
  readonly program: string;
  /** The Claude Code Account, named when its Host has several. */
  readonly account: string | null;
  readonly plan: string | null;
  readonly observedAt: Date | null;
  /** Figures from the program's last session; a refresh does not bring them forward. */
  readonly isLastSession: boolean;
  readonly isStale: boolean;
  readonly staleNote: Message | null;
  readonly isConnected: boolean;
  readonly body: QuickBody;
}

export type QuickEmpty =
  | { readonly kind: 'noHosts' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'unavailable'; readonly reasons: readonly Text[] };

export interface QuickContent {
  readonly cards: readonly QuickCard[];
  /** null while there are cards. */
  readonly empty: QuickEmpty | null;
}

/** "Claude Code · devbox". */
export const cardTitle = (card: QuickCard): string =>
  `${programDisplayName(card.program)} · ${card.hostName}`;

/** The Account, why the card is stale, and how old its figures are: "work · updated 4 min ago". */
export function cardSubtitle(
  card: QuickCard,
  now: Date,
  locale: string,
  translate: (key: string, args: readonly string[]) => string,
): string {
  const parts: string[] = [];
  if (card.account) parts.push(card.account);
  if (card.staleNote) parts.push(renderText(card.staleNote, translate));
  if (card.observedAt) {
    const justNow = now.getTime() - card.observedAt.getTime() < 60_000;
    const age = justNow ? '' : relativeAge(card.observedAt, now, locale);
    const key = `${card.isLastSession ? 'last session' : 'updated'} ${justNow ? 'just now' : '%@'}`;
    parts.push(translate(key, justNow ? [] : [age]));
  }
  return parts.join(' · ');
}

/** Builds the Usage sheet from the readings the Usage stores hold: one card per reading card. */
export function quickContent(readings: readonly HostReading[], now: Date): QuickContent {
  if (readings.length === 0) return { cards: [], empty: { kind: 'noHosts' } };
  const scope = buildUsageScope(readings);
  const connected = new Map(readings.map((r) => [r.id, r.isConnected ?? true]));
  const cards: QuickCard[] = [];
  const silent: string[] = [];
  for (const host of scope.included) {
    const hostCards = limitsReadings(host.report).flatMap((card) => {
      const built = buildCard(card, host, connected.get(host.id) ?? false, now);
      return built ? [built] : [];
    });
    if (hostCards.length === 0) silent.push(host.name);
    cards.push(...hostCards);
  }
  if (cards.length > 0) return { cards, empty: null };
  if (scope.loading.length > 0) return { cards: [], empty: { kind: 'loading' } };
  const reasons: Text[] = [
    ...scope.excluded.map((e) => ({
      join: [e.name, exclusionText(e.exclusion)],
      separator: ' · ',
    })),
    ...silent.map((name) => message('%@ · No Usage Limits reported', name)),
  ];
  return { cards: [], empty: { kind: 'unavailable', reasons } };
}

function buildCard(
  card: LimitsCard,
  host: IncludedHost,
  isConnected: boolean,
  now: Date,
): QuickCard | null {
  const base = { hostId: host.id, hostName: host.name, cardId: cardId(card), isConnected };
  const id = `${host.id}/${base.cardId}`;
  if (card.kind === 'claudeToggle') return null;
  if (card.kind === 'unread') {
    return {
      ...base,
      id,
      program: 'claude',
      account: card.account,
      plan: null,
      observedAt: null,
      isLastSession: false,
      isStale: false,
      staleNote: null,
      body: { kind: 'uncounted', reason: card.reason },
    };
  }
  const { limits } = card;
  if (limits.reason === 'programMissing') return null;
  const observedAt = parseInstant(limits.observedAt);
  const isLastSession = limits.source === 'lastSession';
  const body = quickBody(limits, card.program, now);
  let isStale = false;
  let staleNote: Message | null = null;
  if (body.kind === 'windows') {
    staleNote =
      noteFor(isConnected, host.refreshFailure) ??
      (limits.state === 'throttled' ? message('Last reading') : null);
    const isOld =
      !isLastSession &&
      observedAt !== null &&
      now.getTime() - observedAt.getTime() >= STALE_INTERVAL_MS;
    isStale = staleNote !== null || isOld;
  }
  return {
    ...base,
    id,
    program: card.program,
    account: card.account,
    plan: limits.plan,
    observedAt,
    isLastSession,
    isStale,
    staleNote,
    body,
  };
}

function noteFor(isConnected: boolean, refreshFailure: string | null): Message | null {
  if (!isConnected) return message('Not connected');
  return refreshFailure === null ? null : message('Last refresh failed');
}

function quickBody(limits: UsageLimits, program: string, now: Date): QuickBody {
  switch (limits.state) {
    case 'ok':
    case 'throttled':
      return limits.windows.length === 0
        ? { kind: 'message', text: message('No Usage Limits windows reported.') }
        : { kind: 'windows', windows: limits.windows.map((w) => quickWindow(w, program, now)) };
    case 'disabled':
      if (program === 'claude') return { kind: 'limitsOff' };
      break;
    case 'unavailable':
      if (limits.reason === 'notReadYet') return { kind: 'reading' };
      break;
  }
  return {
    kind: 'message',
    text: unavailableMessage(limits, program),
    ...(limits.state === 'disabled' ? { off: true as const } : {}),
  };
}

function quickWindow(window: LimitWindow, program: string, now: Date): QuickWindow {
  const reset = parseInstant(window.resetsAt);
  // The plugin decides expiry when it answers; a reset that passed since expires the reading here.
  const isExpired = window.expired || (reset !== null && reset <= now);
  const used = isExpired ? null : window.usedPercent;
  const elapsed = isExpired ? null : elapsedPercent(window.durationMinutes, reset, now);
  return {
    id: window.id,
    name: windowName(window, program),
    usedPercent: used,
    isExpired,
    resetsAt: isExpired ? null : reset,
    elapsedPercent: elapsed,
    pace: used !== null && elapsed !== null ? usagePace(used, elapsed) : null,
    level: used === null ? null : limitLevel(used),
  };
}
