// How Chat shows its Background Work (Swift ChatBackgroundWorkPresentation, ADR 0024): the rows
// over the Composer, the line they condense to while the Composer is open, and the sheet that lists
// everything. Work a read can't vouch for stops claiming to run: with the Host away or the read
// failing its row freezes, and work silent for longer than it runs says when it was last seen.
// Words are catalog keys (`Text`); the view renders them in its locale.

import { message, type Text } from '../../errors/text';
import { formatDuration } from '../../format/duration';
import type {
  BackgroundWorkKind,
  BackgroundWorkUsage,
  ChatBackgroundWorkItem,
} from '../model/types';
import type { ChatWorkflowProgress } from '../model/workflow-progress';
import type { BackgroundWorkRow, ChatBackgroundWork } from './work';

/** The rows the strip shows before "+N more". */
export const STRIP_LIMIT = 3;

export type BackgroundWorkStatus =
  /** Running, as a live read shows. */
  | 'running'
  /** Running as of the last read, which is not live now. */
  | 'unconfirmed'
  /** Running, with no sign of it for longer than such work runs. */
  | 'quiet'
  | 'completed'
  | 'failed'
  | 'stopped';

export const isFinishedStatus = (status: BackgroundWorkStatus) =>
  status === 'completed' || status === 'failed' || status === 'stopped';

export interface BackgroundWorkFraction {
  done: number;
  total: number;
}

export interface BackgroundWorkAgent {
  id: string;
  status: BackgroundWorkStatus;
  label: string;
  phase: string | null;
  accessibilityLabel: Text;
}

export interface BackgroundWorkPresentedRow {
  id: string;
  kind: BackgroundWorkKind;
  status: BackgroundWorkStatus;
  title: string;
  /** A Subagent's type, or the phase a Workflow is in. */
  caption: Text;
  /** What a Workflow says it does. */
  detail: string | null;
  /** A Workflow's agents done, of those started so far. */
  fraction: BackgroundWorkFraction | null;
  /** How long the work has run, or ran; null when the records don't say. */
  time: string | null;
  /** Why a running row shows no time. */
  note: Text | null;
  /** The note in the strip's room: a quiet row's day without its time unless it is today. */
  shortNote: Text | null;
  /** The counts the program reported as the work ended. */
  usage: Text | null;
  agents: BackgroundWorkAgent[];
  accessibilityLabel: Text;
}

export interface BackgroundWorkSummary {
  status: BackgroundWorkStatus;
  text: Text;
  accessibilityValue: Text;
}

export interface BackgroundWorkPresentation {
  rows: BackgroundWorkPresentedRow[];
  stripRows: BackgroundWorkPresentedRow[];
  overflow: number;
  unfinished: BackgroundWorkPresentedRow[];
  finished: BackgroundWorkPresentedRow[];
  /** Only running rows show a moving time. */
  ticks: boolean;
  /** The one line the rows condense to; null with nothing to list. */
  summary: BackgroundWorkSummary | null;
}

export interface BackgroundWorkPresentationOptions {
  isHostConnected: boolean;
  /** Epoch milliseconds. */
  now: number;
  /** BCP 47 tag for times of day; the platform's when omitted. */
  locale?: string;
  /** IANA zone for times of day; the device's when omitted. */
  timeZone?: string;
}

const join = (parts: Text[], separator: string): Text => ({ join: parts, separator });
const n = (value: number) => String(value);

function statusOf(row: BackgroundWorkRow, isLive: boolean): BackgroundWorkStatus {
  switch (row.item.state) {
    case 'running':
      return !isLive ? 'unconfirmed' : row.isStale ? 'quiet' : 'running';
    default:
      return row.item.state;
  }
}

/** The notification's counts once the Workflow ends; until then the journal's, whose total grows as agents start. */
function fractionOf(row: BackgroundWorkRow): BackgroundWorkFraction | null {
  if (row.item.kind !== 'workflow') return null;
  const usage = row.item.usage;
  const done = row.progress?.agents.filter((agent) => agent.state === 'done').length ?? 0;
  if (usage?.agents != null && usage.agents > 0) {
    return { done: usage.agentsDone ?? done, total: usage.agents };
  }
  const started = row.progress?.agents.length ?? 0;
  return started > 0 ? { done, total: started } : null;
}

/** Running time from the launch, on the Host's clock, so a Host ahead of the phone reads zero. */
function secondsOf(
  item: ChatBackgroundWorkItem,
  status: BackgroundWorkStatus,
  now: number,
): number | null {
  if (status === 'running') {
    return item.launchedAt === null
      ? null
      : Math.max(0, (now - Date.parse(item.launchedAt)) / 1000);
  }
  if (status === 'unconfirmed' || status === 'quiet') return null;
  if (item.usage?.durationMilliseconds != null) return item.usage.durationMilliseconds / 1000;
  if (item.launchedAt === null || item.endedAt === null) return null;
  return Math.max(0, (Date.parse(item.endedAt) - Date.parse(item.launchedAt)) / 1000);
}

function usageText(usage: BackgroundWorkUsage | null): Text | null {
  if (usage === null) return null;
  const parts: Text[] = [];
  if (usage.tokens != null) {
    const compact = new Intl.NumberFormat('en', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(usage.tokens);
    parts.push(message('%@ tokens', compact));
  }
  if (usage.toolUses != null) {
    parts.push(
      usage.toolUses === 1 ? message('1 tool use') : message('%lld tool uses', n(usage.toolUses)),
    );
  }
  return parts.length === 0 ? null : join(parts, ' · ');
}

function statePhrase(status: BackgroundWorkStatus, lastSeen: string | null): Text {
  switch (status) {
    case 'running':
      return message('running');
    case 'unconfirmed':
      return message('not updating');
    case 'quiet':
      return lastSeen === null
        ? message('no recent updates')
        : message('no updates since %@', lastSeen);
    case 'completed':
      return message('done');
    case 'failed':
      return message('failed');
    case 'stopped':
      return message('stopped');
  }
}

class Style {
  constructor(
    private readonly options: BackgroundWorkPresentationOptions,
    private readonly isLive: boolean,
  ) {}

  /** A time of day, with its date unless it is today. */
  private time(iso: string): string {
    const { locale, timeZone, now } = this.options;
    const date = new Date(iso);
    const sameDay = this.sameDay(date, new Date(now));
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      ...(sameDay ? {} : { dateStyle: 'medium' as const }),
      timeStyle: 'short',
    }).format(date);
  }

  /** A time of day if it is today, otherwise only the day. */
  private day(iso: string): string {
    const { locale, timeZone, now } = this.options;
    const date = new Date(iso);
    if (this.sameDay(date, new Date(now))) return this.time(iso);
    return new Intl.DateTimeFormat(locale, { timeZone, month: 'short', day: 'numeric' }).format(
      date,
    );
  }

  private sameDay(a: Date, b: Date): boolean {
    const { locale, timeZone } = this.options;
    const key = new Intl.DateTimeFormat(locale, { timeZone, dateStyle: 'short' });
    return key.format(a) === key.format(b);
  }

  row(row: BackgroundWorkRow): BackgroundWorkPresentedRow {
    const { item } = row;
    const status = statusOf(row, this.isLive);
    const fraction = fractionOf(row);
    const seconds = secondsOf(item, status, this.options.now);
    const lastSeen = row.lastActivity === null ? null : this.time(row.lastActivity);
    let note: Text | null = null;
    if (status === 'unconfirmed') note = message('Not updating');
    if (status === 'quiet') {
      note =
        lastSeen === null ? message('No recent updates') : message('No updates since %@', lastSeen);
    }
    const shortNote =
      status === 'quiet' && row.lastActivity !== null
        ? message('Last seen %@', this.day(row.lastActivity))
        : note;
    const started = row.progress?.agents ?? [];
    const lastRunning = [...started].reverse().find((agent) => agent.state === 'running');
    const caption: Text =
      item.kind === 'subagent'
        ? (item.subtitle ?? message('Subagent'))
        : (lastRunning?.phase ?? started.at(-1)?.phase ?? message('Workflow'));
    const kindPhrase: Text =
      item.kind === 'subagent'
        ? item.subtitle === null
          ? message('Subagent')
          : message('%@ subagent', item.subtitle)
        : message('Workflow');
    const spoken: Text[] = [item.title, kindPhrase, statePhrase(status, lastSeen)];
    if (fraction)
      spoken.push(message('%lld of %lld agents done', n(fraction.done), n(fraction.total)));
    if (seconds !== null) spoken.push(formatDuration(seconds, 'wide'));
    return {
      id: item.id,
      kind: item.kind,
      status,
      title: item.title,
      caption,
      detail: item.kind === 'workflow' ? item.subtitle : null,
      fraction,
      time: seconds === null ? null : formatDuration(seconds),
      note,
      shortNote,
      usage: usageText(item.usage),
      agents: this.agents(row.progress, status),
      accessibilityLabel: join(spoken, ', '),
    };
  }

  private agents(
    progress: ChatWorkflowProgress | null,
    status: BackgroundWorkStatus,
  ): BackgroundWorkAgent[] {
    return (progress?.agents ?? []).map((agent, index) => {
      let agentStatus: BackgroundWorkStatus;
      if (agent.state === 'done') agentStatus = 'completed';
      else if (agent.state === 'failed') agentStatus = 'failed';
      // Work that ended took its running agents with it.
      else
        agentStatus = isFinishedStatus(status)
          ? 'stopped'
          : status === 'running'
            ? 'running'
            : 'unconfirmed';
      const label = agent.label === null || agent.label === '' ? null : agent.label;
      const spoken: Text[] = [label ?? message('Agent %lld', n(index + 1))];
      if (agent.phase !== null) spoken.push(agent.phase);
      spoken.push(statePhrase(agentStatus, null));
      return {
        id: agent.id,
        status: agentStatus,
        label: label ?? '',
        phase: agent.phase,
        accessibilityLabel: join(spoken, ', '),
      };
    });
  }
}

function summaryOf(rows: BackgroundWorkPresentedRow[]): BackgroundWorkSummary | null {
  if (rows.length === 0) return null;
  const running = rows.filter((row) => row.status === 'running');
  // A Workflow's fraction says the most in one line.
  const first = running.find((row) => row.kind === 'workflow') ?? running[0];
  if (first) {
    const fraction = first.fraction;
    const count = n(running.length);
    return {
      status: 'running',
      text: join(
        [
          message('%lld running · %@', count, first.title),
          ...(fraction ? [` ${fraction.done}/${fraction.total}`] : []),
        ],
        '',
      ),
      accessibilityValue: join(
        [
          message('%lld running, %@', count, first.title),
          ...(fraction
            ? [message('%lld of %lld agents done', n(fraction.done), n(fraction.total))]
            : []),
        ],
        ', ',
      ),
    };
  }
  const count = (...statuses: BackgroundWorkStatus[]) =>
    rows.filter((row) => statuses.includes(row.status)).length;
  const notUpdating = count('unconfirmed', 'quiet');
  const completed = count('completed');
  const failed = count('failed');
  const stopped = count('stopped');
  const parts = [
    { count: notUpdating, text: message('%lld not updating', n(notUpdating)) },
    { count: completed, text: message('%lld done', n(completed)) },
    { count: failed, text: message('%lld failed', n(failed)) },
    { count: stopped, text: message('%lld stopped', n(stopped)) },
  ]
    .filter((part) => part.count > 0)
    .map((part) => part.text);
  const status: BackgroundWorkStatus =
    notUpdating > 0
      ? 'unconfirmed'
      : failed > 0
        ? 'failed'
        : completed > 0
          ? 'completed'
          : 'stopped';
  return { status, text: join(parts, ' · '), accessibilityValue: join(parts, ', ') };
}

export function presentBackgroundWork(
  work: ChatBackgroundWork,
  options: BackgroundWorkPresentationOptions,
): BackgroundWorkPresentation {
  const style = new Style(options, work.isLive && options.isHostConnected);
  const rows = work.rows.map((row) => style.row(row));
  return {
    rows,
    stripRows: rows.slice(0, STRIP_LIMIT),
    overflow: Math.max(0, rows.length - STRIP_LIMIT),
    unfinished: rows.filter((row) => !isFinishedStatus(row.status)),
    finished: rows.filter((row) => isFinishedStatus(row.status)),
    ticks: rows.some((row) => row.status === 'running'),
    summary: summaryOf(rows),
  };
}
