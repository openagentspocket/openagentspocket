import { describe, expect, it } from 'vitest';
import type * as herdr from '../protocol/herdr-types.generated';
import { type ConsoleRow, rowKey } from './row';
import {
  inboxChips,
  inboxTitle,
  nextTransition,
  type StatusInboxSection,
  statusInboxItems,
} from './status-inbox';
import type { StatusStamp } from './status-stamp';
import { agentInfo } from './testing';

const NOW = 800_000_000_000;
const SECOND = 1000;

function row(
  paneId: string,
  status: herdr.AgentStatus,
  over: Partial<Omit<ConsoleRow, 'agent'>> & { agent?: Partial<herdr.AgentInfo> } = {},
): ConsoleRow {
  const { agent, ...rest } = over;
  return {
    hostId: 'devbox-id',
    hostName: 'devbox',
    hostUsername: 'root',
    workspaceLabel: 'Proj',
    workspaceTabCount: 1,
    tabPaneCount: 1,
    agent: agentInfo(paneId, status, { cwd: '/root/agentico', ...agent }),
    ...rest,
  };
}

function stamp(
  target: ConsoleRow,
  secondsAgo: number,
  over: Partial<StatusStamp> & { workEndedSecondsAgo?: number } = {},
): StatusStamp {
  const { workEndedSecondsAgo, ...rest } = over;
  return {
    status: target.agent.agent_status,
    since: NOW - secondsAgo * SECOND,
    isApproximate: false,
    lastWorkEndedAt:
      workEndedSecondsAgo === undefined ? undefined : NOW - workEndedSecondsAgo * SECOND,
    terminalId: target.agent.terminal_id,
    dismissed: false,
    ...rest,
  };
}

interface ProjectOptions {
  stamps?: Map<string, StatusStamp>;
  pins?: Map<string, number>;
  messages?: Map<string, string>;
  saved?: Set<string>;
  recentWindowMs?: number;
}

function project(rows: ConsoleRow[], options: ProjectOptions = {}) {
  return statusInboxItems({
    rows,
    stamps: (key) => options.stamps?.get(key),
    pinRank: (target) => options.pins?.get(rowKey(target)),
    lastMessage: (key) => options.messages?.get(key),
    savedKeys: options.saved ?? new Set(),
    now: NOW,
    recentWindowMs: options.recentWindowMs,
  });
}

const paneIds = (sections: ReturnType<typeof project>, section: StatusInboxSection): string[] =>
  sections[section]?.map((entry) => entry.row.agent.pane_id) ?? [];

describe('Status Inbox sections', () => {
  it('puts each status in its section, a known time ahead of none, unknown statuses in idle', () => {
    const blocked = row('p1', 'blocked');
    const working = row('p2', 'working');
    const done = row('p3', 'done');
    const recent = row('p4', 'idle');
    const idle = row('p5', 'idle');
    const unknown = row('p6', 'unknown');
    const future = row('p7', 'thinking');
    const sections = project([blocked, working, done, recent, idle, unknown, future], {
      stamps: new Map([[rowKey(recent), stamp(recent, 60, { workEndedSecondsAgo: 60 })]]),
    });
    expect(paneIds(sections, 'needsYou')).toEqual(['p1']);
    expect(paneIds(sections, 'working')).toEqual(['p2']);
    expect(paneIds(sections, 'doneRecent')).toEqual(['p4', 'p3']);
    expect(new Set(paneIds(sections, 'idle'))).toEqual(new Set(['p5', 'p6', 'p7']));
  });

  it('omits empty sections', () => {
    expect(Object.keys(project([row('p1', 'working')]))).toEqual(['working']);
    expect(project([])).toEqual({});
  });

  it('files a saved entry under idle whatever its status', () => {
    const saved = row('p1', 'blocked');
    const sections = project([saved], { saved: new Set([rowKey(saved)]) });
    expect(paneIds(sections, 'idle')).toEqual(['p1']);
    expect(sections.needsYou).toBeUndefined();
  });

  it('includes the Recent window edge', () => {
    const atEdge = row('p1', 'idle');
    const past = row('p2', 'idle');
    const sections = project([atEdge, past], {
      recentWindowMs: 3600 * SECOND,
      stamps: new Map([
        [rowKey(atEdge), stamp(atEdge, 3600, { workEndedSecondsAgo: 3600 })],
        [rowKey(past), stamp(past, 3601, { workEndedSecondsAgo: 3601 })],
      ]),
    });
    expect(paneIds(sections, 'doneRecent')).toEqual(['p1']);
    expect(paneIds(sections, 'idle')).toEqual(['p2']);
  });

  it('hides a dismissed Done or Recent entry but never a Blocked one', () => {
    const done = row('p1', 'done');
    const recent = row('p2', 'idle');
    const blocked = row('p3', 'blocked');
    const sections = project([done, recent, blocked], {
      stamps: new Map([
        [rowKey(done), stamp(done, 10, { dismissed: true })],
        [rowKey(recent), stamp(recent, 10, { workEndedSecondsAgo: 10, dismissed: true })],
        [rowKey(blocked), stamp(blocked, 10, { dismissed: true })],
      ]),
    });
    expect(sections.doneRecent).toBeUndefined();
    expect(new Set(paneIds(sections, 'idle'))).toEqual(new Set(['p1', 'p2']));
    expect(paneIds(sections, 'needsYou')).toEqual(['p3']);
  });

  it('keeps an Idle that just left Working in Working for the hysteresis', () => {
    const flapping = row('p1', 'idle');
    const settled = row('p2', 'idle');
    const fromDone = row('p3', 'idle');
    const sections = project([flapping, settled, fromDone], {
      stamps: new Map([
        [
          rowKey(flapping),
          stamp(flapping, 2.9, { previousStatus: 'working', workEndedSecondsAgo: 2.9 }),
        ],
        [rowKey(settled), stamp(settled, 3, { previousStatus: 'working', workEndedSecondsAgo: 3 })],
        [rowKey(fromDone), stamp(fromDone, 1, { previousStatus: 'done', workEndedSecondsAgo: 1 })],
      ]),
    });
    expect(paneIds(sections, 'working')).toEqual(['p1']);
    expect(new Set(paneIds(sections, 'doneRecent'))).toEqual(new Set(['p2', 'p3']));
  });

  it('advances a stale stamp the way the clock store will', () => {
    const reused = row('p1', 'idle');
    const justIdle = row('p2', 'idle');
    const justBlocked = row('p3', 'blocked');
    const sections = project([reused, justIdle, justBlocked], {
      stamps: new Map([
        [rowKey(reused), stamp(reused, 10, { workEndedSecondsAgo: 10, terminalId: 'term_old' })],
        [rowKey(justIdle), stamp(justIdle, 120, { status: 'working' })],
        [rowKey(justBlocked), stamp(justBlocked, 120, { status: 'working' })],
      ]),
    });
    expect(paneIds(sections, 'idle')).toEqual(['p1']);
    expect(sections.idle?.[0]?.isApproximate).toBe(true);
    expect(paneIds(sections, 'working')).toEqual(['p2']);
    expect(sections.needsYou?.[0]).toMatchObject({ since: NOW, isApproximate: false });
  });

  it('gives an Agent without a stamp no age', () => {
    const item = project([row('p1', 'blocked')]).needsYou?.[0];
    expect(item?.since).toBeUndefined();
    expect(item?.isApproximate).toBe(true);
  });
});

describe('Status Inbox next transition', () => {
  it('is the earliest hysteresis end or Recent window close, and none when nothing pends', () => {
    const flapping = row('p1', 'idle');
    const recent = row('p2', 'idle');
    const expired = row('p3', 'idle');
    const window = 600 * SECOND;
    const stamps = new Map([
      [rowKey(flapping), stamp(flapping, 1, { previousStatus: 'working', workEndedSecondsAgo: 1 })],
      [rowKey(recent), stamp(recent, 500, { workEndedSecondsAgo: 500 })],
      [rowKey(expired), stamp(expired, 700, { workEndedSecondsAgo: 700 })],
    ]);
    const lookup = (key: string) => stamps.get(key);
    expect(nextTransition([flapping, recent, expired], lookup, NOW, window)).toBe(NOW + 2 * SECOND);
    expect(nextTransition([recent, expired], lookup, NOW, window)).toBe(NOW + 101 * SECOND);
    expect(nextTransition([expired, row('p4', 'working')], lookup, NOW, window)).toBeUndefined();
  });
});

describe('Status Inbox ordering', () => {
  it('lists Needs you longest-waiting first and the others newest first, unknown age last', () => {
    const blockedNew = row('b1', 'blocked');
    const blockedOld = row('b2', 'blocked');
    const blockedUnknown = row('b0', 'blocked');
    const workingNew = row('w1', 'working');
    const workingOld = row('w2', 'working');
    const doneOld = row('d1', 'done');
    const doneNew = row('d2', 'done');
    const stamps = new Map([
      [rowKey(blockedNew), stamp(blockedNew, 30)],
      [rowKey(blockedOld), stamp(blockedOld, 300)],
      [rowKey(workingNew), stamp(workingNew, 5)],
      [rowKey(workingOld), stamp(workingOld, 500)],
      [rowKey(doneOld), stamp(doneOld, 900)],
      [rowKey(doneNew), stamp(doneNew, 9)],
    ]);
    const sections = project(
      [blockedNew, blockedOld, blockedUnknown, workingNew, workingOld, doneOld, doneNew],
      { stamps },
    );
    expect(paneIds(sections, 'needsYou')).toEqual(['b2', 'b1', 'b0']);
    expect(paneIds(sections, 'working')).toEqual(['w1', 'w2']);
    expect(paneIds(sections, 'doneRecent')).toEqual(['d2', 'd1']);
  });

  it('lets a pin lead its own section only', () => {
    const blocked = row('b1', 'blocked');
    const pinned = row('w1', 'working');
    const other = row('w2', 'working');
    const sections = project([blocked, pinned, other], {
      stamps: new Map([
        [rowKey(pinned), stamp(pinned, 900)],
        [rowKey(other), stamp(other, 1)],
      ]),
      pins: new Map([[rowKey(pinned), 0]]),
    });
    expect(paneIds(sections, 'needsYou')).toEqual(['b1']);
    expect(paneIds(sections, 'working')).toEqual(['w1', 'w2']);
    expect(sections.working?.map((entry) => entry.isPinned)).toEqual([true, false]);
  });

  it('orders pins by rank', () => {
    const first = row('w1', 'working');
    const second = row('w2', 'working');
    const sections = project([first, second], {
      pins: new Map([
        [rowKey(first), 1],
        [rowKey(second), 0],
      ]),
    });
    expect(paneIds(sections, 'working')).toEqual(['w2', 'w1']);
  });

  it('falls back to Host, workspace and pane when ages tie', () => {
    const laptop = row('p1', 'idle', { hostId: 'laptop-id', hostName: 'laptop' });
    const devboxB = row('p2', 'idle', { workspaceLabel: 'B' });
    const devboxA2 = row('p4', 'idle', { workspaceLabel: 'A' });
    const devboxA1 = row('p3', 'idle', { workspaceLabel: 'A' });
    const sections = project([laptop, devboxB, devboxA2, devboxA1], {
      stamps: new Map([[rowKey(laptop), stamp(laptop, 1_000_000)]]),
    });
    expect(paneIds(sections, 'idle')).toEqual(['p3', 'p4', 'p2', 'p1']);
  });
});

describe('Status Inbox title, chips and detail', () => {
  it('falls back through the titles to the Agent name', () => {
    const titled = row('p1', 'working', {
      agent: { terminal_title_stripped: '  Fix auth tests ' },
    });
    const untitled = row('p2', 'working', {
      agent: { terminal_title_stripped: '', title: 'Pane title' },
    });
    const bare = row('p3', 'working', {
      agent: { terminal_title_stripped: undefined, name: 'Codex', agent: 'codex' },
    });
    expect(inboxTitle(titled)).toBe('Fix auth tests');
    expect(inboxTitle(untitled)).toBe('Pane title');
    expect(inboxTitle(bare)).toBe('Codex');
  });

  it('qualifies a shared title with the program only when programs differ', () => {
    const claude = row('p1', 'working', {
      agent: { agent: 'claude', terminal_title_stripped: 'Review' },
    });
    const codex = row('p2', 'working', {
      agent: { agent: 'codex', terminal_title_stripped: 'Review' },
    });
    const unique = row('p3', 'working', {
      agent: { agent: 'codex', terminal_title_stripped: 'Other' },
    });
    const twin = row('p4', 'working', {
      agent: { agent: 'codex', terminal_title_stripped: 'Other' },
    });
    const items = project([claude, codex, unique, twin]).working ?? [];
    const qualifier = (pane: string) =>
      items.find((i) => i.row.agent.pane_id === pane)?.titleQualifier;
    expect(qualifier('p1')).toBeDefined();
    expect(qualifier('p2')).toBeDefined();
    expect(qualifier('p1')).not.toBe(qualifier('p2'));
    expect(qualifier('p3')).toBeUndefined();
    expect(qualifier('p4')).toBeUndefined();
  });

  it('shows Host, folder and model, omitting what is missing', () => {
    const full = row('p1', 'working', { agent: { tokens: { model: 'opus' } } });
    const home = row('p2', 'working', { agent: { cwd: '/root' } });
    const noFolder = row('p3', 'working', { agent: { cwd: '' } });
    const blankModel = row('p4', 'working', {
      agent: { cwd: '/srv/app/', tokens: { model: '  ' } },
    });
    expect(inboxChips(full)).toEqual([
      { kind: 'host', text: 'devbox' },
      { kind: 'folder', text: 'agentico' },
      { kind: 'model', text: 'opus' },
    ]);
    expect(inboxChips(home).map((chip) => chip.text)).toEqual(['devbox', '~']);
    expect(inboxChips(noFolder).map((chip) => chip.kind)).toEqual(['host']);
    expect(inboxChips(blankModel).map((chip) => chip.text)).toEqual(['devbox', 'app']);
  });

  it('details the question for Blocked and the last message for Done only', () => {
    const blocked = row('p1', 'blocked', { lastOutputSnippet: ' Allow Claude to run rm -rf? ' });
    const blockedBlank = row('p2', 'blocked', { lastOutputSnippet: '   ' });
    const done = row('p3', 'done', { lastOutputSnippet: 'ignored' });
    const working = row('p4', 'working', { lastOutputSnippet: 'ignored' });
    const sections = project([blocked, blockedBlank, done, working], {
      messages: new Map([
        [rowKey(done), 'All tests pass.'],
        [rowKey(working), 'not shown'],
      ]),
    });
    const detail = (pane: string) =>
      sections.needsYou?.find((i) => i.row.agent.pane_id === pane)?.detail;
    expect(detail('p1')).toBe('Allow Claude to run rm -rf?');
    expect(detail('p2')).toBeUndefined();
    expect(sections.doneRecent?.[0]?.detail).toBe('All tests pass.');
    expect(sections.working?.[0]?.detail).toBeUndefined();
  });

  it('takes the age and its approximation from the stamp', () => {
    const observed = row('p1', 'working');
    const firstSeen = row('p2', 'working');
    const sections = project([observed, firstSeen], {
      stamps: new Map([
        [rowKey(observed), stamp(observed, 60)],
        [rowKey(firstSeen), stamp(firstSeen, 30, { isApproximate: true })],
      ]),
    });
    const item = (pane: string) => sections.working?.find((i) => i.row.agent.pane_id === pane);
    expect(item('p1')).toMatchObject({ since: NOW - 60 * SECOND, isApproximate: false });
    expect(item('p2')?.isApproximate).toBe(true);
  });
});
