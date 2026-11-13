// The one line over Chat's Composer: how long the running turn has worked, what the Agent is doing
// as its records show it, and how much Background Work runs, with what finished folded into counts.
// Built from the projected rows and the Background Work presentation, so it reads the same for
// every program: a program that records no reasoning or running calls shows only the time.

import { message, type Text } from '../../errors/text';
import { formatDuration } from '../../format/duration';
import { type ChatRow, rowID } from '../timeline/row';
import { toolLine } from '../timeline/tool-line';
import type { BackgroundWorkPresentation, BackgroundWorkStatus } from './presentation';

/** What the running turn's newest record says the Agent does. */
export type ChatTurnDoing =
  | { kind: 'thinking' }
  /** A call that has not returned: its one line, as its tool row says it. */
  | { kind: 'tool'; title: string }
  /** A call waits for the user's approval. */
  | { kind: 'waiting' };

/** The running turn, as the projection's live header and the rows under it show it. */
export interface ChatLiveTurn {
  /** When the turn started, on the Host's clock. */
  since: string;
  doing: ChatTurnDoing | null;
}

export type ChatStatusLineState = BackgroundWorkStatus | 'waiting';

export interface ChatStatusLine {
  state: ChatStatusLineState;
  text: Text;
  accessibilityValue: Text;
  /** The line holds a moving time. */
  ticks: boolean;
}

const RUNNING_CALL: ReadonlySet<string> = new Set(['running', 'started']);

function doingOf(live: readonly ChatRow[]): ChatTurnDoing | null {
  if (
    live.some(
      (row) => row.content.type === 'tool' && row.content.tool.status === 'awaitingApproval',
    )
  )
    return { kind: 'waiting' };
  const last = live.at(-1)?.content;
  if (last?.type === 'reasoning') return { kind: 'thinking' };
  if (last?.type === 'tool' && RUNNING_CALL.has(last.tool.status))
    return { kind: 'tool', title: toolLine(last.tool).title };
  return null;
}

/** The running turn of projected rows; null when none runs. */
export function liveTurnOf(rows: readonly ChatRow[]): ChatLiveTurn | null {
  const start = rows.findIndex((row) => row.id === rowID.liveTurn);
  const head = rows[start]?.content;
  if (head?.type !== 'turnHeader' || head.header.state.kind !== 'working') return null;
  // Calls inside an open group are earlier ones (a running group keeps its newest call outside),
  // and Chat's own echoes are not what the Agent does.
  const live = rows
    .slice(start + 1)
    .filter((row) => !row.isNested && row.content.type !== 'pending');
  return { since: head.header.state.since, doing: doingOf(live) };
}

/** The transcript's rows: the running turn's header shows as the status line, not as a row. */
export const withoutLiveTurn = (rows: readonly ChatRow[]): ChatRow[] =>
  rows.filter((row) => row.id !== rowID.liveTurn);

export function sameLiveTurn(a: ChatLiveTurn | null, b: ChatLiveTurn | null): boolean {
  if (a === null || b === null) return a === b;
  const title = (turn: ChatLiveTurn) => (turn.doing?.kind === 'tool' ? turn.doing.title : null);
  return a.since === b.since && a.doing?.kind === b.doing?.kind && title(a) === title(b);
}

export interface ChatStatusLineOptions {
  /** Epoch milliseconds. */
  now: number;
  /** herdr reports the Agent Blocked: it waits on the user. */
  isBlocked: boolean;
}

const n = (value: number) => String(value);

/**
 * The status line; null with no turn running and no work unfinished. Finished work shows only as
 * counts here: the sheet the line opens lists it.
 */
export function chatStatusLine(
  turn: ChatLiveTurn | null,
  work: BackgroundWorkPresentation,
  { now, isBlocked }: ChatStatusLineOptions,
): ChatStatusLine | null {
  if (turn === null && work.unfinished.length === 0) return null;
  const shown: Text[] = [];
  const spoken: Text[] = [];
  const both = (text: Text) => {
    shown.push(text);
    spoken.push(text);
  };
  const waiting = isBlocked || turn?.doing?.kind === 'waiting';
  if (turn) {
    const seconds = Math.max(0, (now - Date.parse(turn.since)) / 1000);
    shown.push(message('Working for %@', formatDuration(seconds)));
    spoken.push(message('Working for %@', formatDuration(seconds, 'wide')));
  }
  if (waiting) both(message('Needs you'));
  else if (turn?.doing?.kind === 'thinking') both(message('Thinking'));
  else if (turn?.doing?.kind === 'tool') both(turn.doing.title);
  const count = (...statuses: BackgroundWorkStatus[]) =>
    work.rows.filter((row) => statuses.includes(row.status)).length;
  const running = count('running');
  const notUpdating = count('unconfirmed', 'quiet');
  for (const [value, key] of [
    [running, '%lld running'],
    [notUpdating, '%lld not updating'],
    [count('completed'), '%lld done'],
    [count('failed'), '%lld failed'],
    [count('stopped'), '%lld stopped'],
  ] as const) {
    if (value > 0) both(message(key, n(value)));
  }
  const state: ChatStatusLineState = waiting
    ? 'waiting'
    : turn !== null || running > 0
      ? 'running'
      : 'unconfirmed';
  return {
    state,
    text: { join: shown, separator: ' · ' },
    accessibilityValue: { join: spoken, separator: ', ' },
    ticks: turn !== null || work.ticks,
  };
}
