import { agentKind, agentTitle, nonEmpty } from '../console/agent-fields';
import { sortBucket } from '../console/ordering';
import type { ConsoleRow } from '../console/row';
import { prefixGraphemes } from './graphemes';
import type { ActivityAgentDetail, ActivityAsk, ActivityDesire } from './types';

export const MAX_TITLE_GRAPHEMES = 80;
export const MAX_HOST_GRAPHEMES = 80;
export const MAX_AGENTS = 5;
/** Blocked Agents that carry their prompt, first in envelope order. */
export const MAX_ASKS = 2;

export function isEligible(status: string): boolean {
  return status === 'working' || status === 'blocked' || status === 'done';
}

function byteOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Pinned first by pin index (most recent = 0), then blocked > done > working, then pane id. */
function sorted(rows: readonly ConsoleRow[], pinned: readonly string[]): ConsoleRow[] {
  return [...rows].sort((left, right) => {
    const l = pinned.indexOf(left.agent.pane_id);
    const r = pinned.indexOf(right.agent.pane_id);
    if (l >= 0 && r >= 0 && l !== r) return l - r;
    if (l >= 0 && r < 0) return -1;
    if (l < 0 && r >= 0) return 1;
    const bucket = sortBucket(left.agent.agent_status) - sortBucket(right.agent.agent_status);
    return bucket !== 0 ? bucket : byteOrder(left.agent.pane_id, right.agent.pane_id);
  });
}

function detail(row: ConsoleRow): ActivityAgentDetail {
  const title = prefixGraphemes(agentTitle(row.agent), MAX_TITLE_GRAPHEMES);
  const name = nonEmpty(row.agent.display_agent) ?? nonEmpty(row.agent.name);
  const workspace = nonEmpty(row.workspaceLabel);
  return {
    paneId: row.agent.pane_id,
    kind: agentKind(row.agent) || 'unknown',
    ...(name ? { name: prefixGraphemes(name, MAX_TITLE_GRAPHEMES) } : {}),
    ...(workspace ? { workspace: prefixGraphemes(workspace, MAX_TITLE_GRAPHEMES) } : {}),
    status: row.agent.agent_status,
    ...(title ? { title } : {}),
  };
}

export interface DesireInput {
  readonly rows: readonly ConsoleRow[];
  readonly hostName: string;
  /** Most recently pinned first. */
  readonly pinnedPaneIds?: readonly string[];
  /** The prompts this device may answer, by pane id. */
  readonly asks?: ReadonlyMap<string, ActivityAsk>;
}

/**
 * The Host's desired activity content, or null when no Agent is working, blocked or done (the end
 * signal). Pins reorder the visible rows and never change eligibility or counts.
 */
export function buildDesire(input: DesireInput): ActivityDesire | null {
  const eligible = input.rows.filter((row) => isEligible(row.agent.agent_status));
  if (eligible.length === 0) return null;
  const count = (status: string) =>
    eligible.filter((row) => row.agent.agent_status === status).length;
  let asked = 0;
  const agents = sorted(eligible, input.pinnedPaneIds ?? [])
    .slice(0, MAX_AGENTS)
    .map((row) => {
      const base = detail(row);
      const ask = input.asks?.get(base.paneId);
      if (base.status !== 'blocked' || !ask || asked >= MAX_ASKS) return base;
      asked += 1;
      return { ...base, ask };
    });
  return {
    counts: { working: count('working'), blocked: count('blocked'), done: count('done') },
    hostName: prefixGraphemes(input.hostName, MAX_HOST_GRAPHEMES),
    agents,
  };
}

/**
 * `desire` with each prompt's tap result taken from `shown` where the same pane still shows the
 * same episode. A new episode starts without one; "sending" stays only while its action runs.
 */
export function keepingResults(
  desire: ActivityDesire,
  shown: readonly ActivityAgentDetail[],
  isSending: (paneId: string, episodeId: string) => boolean,
): ActivityDesire {
  return {
    ...desire,
    agents: desire.agents.map((agent) => {
      const ask = agent.ask;
      const previous = shown.find((s) => s.paneId === agent.paneId)?.ask;
      if (!ask || ask.result || !previous || previous.episodeId !== ask.episodeId) return agent;
      const result = previous.result;
      if (!result || (result === 'sending' && !isSending(agent.paneId, ask.episodeId))) {
        return agent;
      }
      return { ...agent, ask: { ...ask, result } };
    }),
  };
}
