import {
  type AgentSource,
  type AgentStatus,
  agentDisplayName,
  type ConsoleAgent,
  type herdr,
  nonEmpty,
} from '@openagentspocket/core';
import type { HerdrApi } from './herdr-api';

const STATUSES: readonly AgentStatus[] = ['blocked', 'done', 'working', 'idle', 'unknown'];

function statusOf(wire: string): AgentStatus {
  return STATUSES.find((status) => status === wire) ?? 'unknown';
}

export function consoleAgentFrom(
  host: { readonly id: string; readonly name: string },
  agent: herdr.AgentInfo,
): ConsoleAgent {
  return {
    hostId: host.id,
    hostName: host.name,
    paneId: agent.pane_id,
    name: agentDisplayName(agent),
    status: statusOf(agent.agent_status),
    summary: nonEmpty(agent.terminal_title_stripped ?? agent.title),
    stateChangeSeq: agent.state_change_seq,
  };
}

/** The Home screen's `AgentSource` over a live Host connection (`agent.list`). */
export function agentSource(
  api: HerdrApi,
  host: { readonly id: string; readonly name: string },
): AgentSource {
  return {
    listAgents: async () => (await api.listAgents()).map((agent) => consoleAgentFrom(host, agent)),
  };
}
