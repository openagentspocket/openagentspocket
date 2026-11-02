/** How a Host's rows are ordered: by urgency, or by herdr's own space order. */
export type AgentPanelSort = 'priority' | 'spaces';

/** What the Console comparator reads; rows and the legacy flat Agent both fit. */
export interface SortKey {
  readonly hostId: string;
  readonly hostName: string;
  readonly status: string;
  /** Monotonic per Host; comparable only within one Host. */
  readonly stateChangeSeq?: number;
  readonly snapshotOrder?: number;
  readonly workspaceLabel?: string;
  readonly paneId: string;
}

/** Blocked leads: it is the only status the user can act on. Unrecognized statuses sort last. */
export function sortBucket(status: string): number {
  switch (status) {
    case 'blocked':
      return 0;
    case 'done':
      return 1;
    case 'working':
      return 2;
    case 'idle':
      return 3;
    default:
      return 4;
  }
}

export interface SortOptions<T> {
  /** A Host without an entry is `priority`. */
  readonly sortByHost?: ReadonlyMap<string, AgentPanelSort>;
  /** Lower ranks first; unranked items follow every ranked one. */
  readonly pinRank?: (item: T) => number | undefined;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareHosts(a: SortKey, b: SortKey): number {
  return compareText(a.hostName, b.hostName) || compareText(a.hostId, b.hostId);
}

function comparePins(a: number | undefined, b: number | undefined): number {
  if (a === undefined) return b === undefined ? 0 : 1;
  return b === undefined ? -1 : a - b;
}

/**
 * Console order: pin rank, status bucket, Host, newest state change, workspace, pane id. Space
 * order is meaningful only within a Host; if any Host uses it, Hosts compare before local policy,
 * since picking a comparator from one operand would break transitivity across mixed Hosts.
 */
export function sortConsole<T>(
  items: readonly T[],
  keyOf: (item: T) => SortKey,
  options: SortOptions<T> = {},
): T[] {
  const policies = options.sortByHost;
  const policyOf = (hostId: string): AgentPanelSort => policies?.get(hostId) ?? 'priority';
  const usesSpaceOrder = items.some((item) => policyOf(keyOf(item).hostId) === 'spaces');
  const pinRank = options.pinRank;
  return [...items].sort((left, right) => {
    const a = keyOf(left);
    const b = keyOf(right);
    const byPin = pinRank ? comparePins(pinRank(left), pinRank(right)) : 0;
    if (byPin !== 0) return byPin;
    if (usesSpaceOrder && a.hostId !== b.hostId) return compareHosts(a, b);
    const policy = policyOf(a.hostId);
    if (!usesSpaceOrder || policy === 'priority') {
      const byBucket = sortBucket(a.status) - sortBucket(b.status);
      if (byBucket !== 0) return byBucket;
    }
    const byHost = compareHosts(a, b);
    if (byHost !== 0) return byHost;
    if (policy === 'priority') {
      const bySeq = (b.stateChangeSeq ?? 0) - (a.stateChangeSeq ?? 0);
      if (bySeq !== 0) return bySeq;
    }
    const byOrder =
      (a.snapshotOrder ?? Number.MAX_SAFE_INTEGER) - (b.snapshotOrder ?? Number.MAX_SAFE_INTEGER);
    if (byOrder !== 0) return byOrder;
    return (
      compareText(a.workspaceLabel ?? '', b.workspaceLabel ?? '') || compareText(a.paneId, b.paneId)
    );
  });
}

/** The comparator keys of a Console row. */
export function rowSortKey(row: {
  readonly hostId: string;
  readonly hostName: string;
  readonly agent: {
    readonly agent_status: string;
    readonly state_change_seq?: number;
    readonly pane_id: string;
  };
  readonly snapshotOrder?: number;
  readonly workspaceLabel?: string;
}): SortKey {
  return {
    hostId: row.hostId,
    hostName: row.hostName,
    status: row.agent.agent_status,
    stateChangeSeq: row.agent.state_change_seq,
    snapshotOrder: row.snapshotOrder,
    workspaceLabel: row.workspaceLabel,
    paneId: row.agent.pane_id,
  };
}
