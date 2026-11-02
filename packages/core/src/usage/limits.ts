import { type Message, message, type Text } from '../errors/text';
import {
  accountDisplayName,
  type ClaudeAccount,
  isReadableAccount,
  type LimitWindow,
  programDisplayName,
  type UsageLimits,
  type UsageProgram,
  type UsageReport,
} from './report';

/** Shares of a limit where a bar turns to warning, then to danger. */
export const WARNING_PERCENT = 80;
export const DANGER_PERCENT = 95;

export type UsageLimitLevel = 'normal' | 'warning' | 'danger';

export function limitLevel(percent: number): UsageLimitLevel {
  if (percent >= DANGER_PERCENT) return 'danger';
  if (percent >= WARNING_PERCENT) return 'warning';
  return 'normal';
}

/**
 * How a window's use compares with the share of it that has passed. Used faster than its time
 * runs, a window reaches its limit before it resets.
 */
export type UsagePace = 'under' | 'onPace' | 'ahead';

/** Percentage points use may sit from the time elapsed, either way, and still read on pace. */
export const PACE_TOLERANCE = 5;

export function usagePace(usedPercent: number, elapsedPercent: number): UsagePace {
  const lead = usedPercent - elapsedPercent;
  if (lead > PACE_TOLERANCE) return 'ahead';
  if (lead < -PACE_TOLERANCE) return 'under';
  return 'onPace';
}

export const paceTitle = (pace: UsagePace): Message =>
  message({ under: 'Under pace', onPace: 'On pace', ahead: 'Ahead of pace' }[pace]);

/** The share of a window that has passed, 0-100; null when its length or reset is unknown or past. */
export function elapsedPercent(
  durationMinutes: number | null,
  resetsAt: Date | null,
  now: Date,
): number | null {
  if (!durationMinutes || durationMinutes <= 0 || !resetsAt || resetsAt <= now) return null;
  const length = durationMinutes * 60_000;
  const elapsed = (length - (resetsAt.getTime() - now.getTime())) / length;
  return Math.min(Math.max(elapsed, 0), 1) * 100;
}

/** An ISO-8601 instant, or null when absent or unparsable. */
export function parseInstant(value: string | null | undefined): Date | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms);
}

/** The window's display name: its label, a known Claude name, or its length. */
export function windowName(window: LimitWindow, program: string): Text {
  if (window.label) return window.label;
  if (program === 'claude') {
    if (window.id === 'sevenDayOpus') return message('Weekly · Opus');
    if (window.id === 'sevenDaySonnet') return message('Weekly · Sonnet');
  }
  const minutes = window.durationMinutes;
  if (!minutes || minutes <= 0) return message('Usage window');
  if (minutes === 10_080) return message('Weekly');
  if (minutes === 1_440) return message('Daily');
  if (minutes % 1_440 === 0) return message('%lld-day', String(minutes / 1_440));
  if (minutes % 60 === 0) return message('%lld-hour', String(minutes / 60));
  return message('%lld-minute', String(minutes));
}

/** Why a program's Usage Limits have no windows to show. */
export function unavailableMessage(limits: UsageLimits, program: string): Message {
  const name = programDisplayName(program);
  if (limits.state === 'disabled') return message('Usage Limits are off.');
  switch (limits.reason) {
    case 'programMissing':
      return message('%@ is not installed or cannot run on this Host.', name);
    case 'programTooOld':
      return message('Update %@ on this Host to read Usage Limits.', name);
    case 'notSignedIn':
      return message('Sign in to %@ on this Host to read Usage Limits.', name);
    case 'noPlanLimits':
      return message('This sign-in has no plan Usage Limits.');
    case 'keychainUnavailable':
      return message(
        '%@ could not use this Mac’s keychain. Start herdr from a terminal on the Mac, then refresh.',
        name,
      );
    default:
      return message('Usage Limits could not be read. Try refreshing.');
  }
}

/** Why an Account adds nothing, under its directory; null while it counts. */
export function accountStateLine(account: ClaudeAccount): Message | null {
  if (account.state === 'ok') return null;
  if (account.state === 'missing') return message('Directory not found');
  if (account.state === 'duplicate') return message('Same directory as another Account');
  return message('Not counted');
}

/**
 * One card of Usage Limits: a program's windows, or one Claude Code Account's on a Host with
 * several. `unread` is an Account that adds nothing; `claudeToggle` stands for Claude Code while
 * its limits are off.
 */
export type LimitsCard =
  | {
      readonly kind: 'limits';
      readonly accountId: string | null;
      readonly program: string;
      readonly account: string | null;
      readonly limits: UsageLimits;
    }
  | {
      readonly kind: 'unread';
      readonly accountId: string;
      readonly account: string;
      readonly reason: Message;
    }
  | { readonly kind: 'claudeToggle' };

export function cardId(card: LimitsCard): string {
  switch (card.kind) {
    case 'limits':
      return card.accountId ? `${card.program}.${card.accountId}` : card.program;
    case 'unread':
      return `claude.${card.accountId}`;
    case 'claudeToggle':
      return 'claude.toggle';
  }
}

const UNKNOWN_LIMITS: UsageLimits = {
  state: 'error',
  reason: null,
  source: null,
  observedAt: null,
  retryAt: null,
  plan: null,
  windows: [],
};

function claudeCards(program: UsageProgram): LimitsCard[] {
  if (program.usageLimits.state === 'disabled') return [];
  const accounts = program.accounts ?? [];
  if (accounts.length <= 1) {
    return [
      {
        kind: 'limits',
        accountId: null,
        program: 'claude',
        account: null,
        limits: program.usageLimits,
      },
    ];
  }
  // An Account the plugin counts always reports limits; without them it reads as a failed reading.
  const counted: LimitsCard[] = accounts.filter(isReadableAccount).map((a) => ({
    kind: 'limits',
    accountId: a.id,
    program: 'claude',
    account: accountDisplayName(a),
    limits: a.usageLimits ?? (a.isDefault ? program.usageLimits : UNKNOWN_LIMITS),
  }));
  const uncounted: LimitsCard[] = accounts
    .filter((a) => !isReadableAccount(a))
    .map((a) => ({
      kind: 'unread',
      accountId: a.id,
      account: accountDisplayName(a),
      reason: accountStateLine(a) ?? message('Not counted'),
    }));
  return [...counted, ...uncounted];
}

/** The cards that carry a reading, no toggle; Claude Code as one card while its limits are off. */
export function limitsReadings(report: UsageReport): LimitsCard[] {
  return report.programs.flatMap((program): LimitsCard[] => {
    const whole: LimitsCard = {
      kind: 'limits',
      accountId: null,
      program: program.program,
      account: null,
      limits: program.usageLimits,
    };
    if (program.program !== 'claude') return [whole];
    const cards = claudeCards(program);
    return cards.length === 0 ? [whole] : cards;
  });
}

/** Whether the card ends with the Claude Code limits toggle and the way to the Host's Accounts. */
export const carriesToggle = (card: LimitsCard): boolean =>
  card.kind === 'claudeToggle' ||
  (card.kind === 'limits' && card.program === 'claude' && card.accountId === null);

/** Every card of the Usage Limits page, the toggle card included. */
export function limitsCards(report: UsageReport): LimitsCard[] {
  return report.programs.flatMap((program): LimitsCard[] => {
    if (program.program !== 'claude') {
      return [
        {
          kind: 'limits',
          accountId: null,
          program: program.program,
          account: null,
          limits: program.usageLimits,
        },
      ];
    }
    const cards = claudeCards(program);
    return cards.some(carriesToggle) ? cards : [...cards, { kind: 'claudeToggle' }];
  });
}
