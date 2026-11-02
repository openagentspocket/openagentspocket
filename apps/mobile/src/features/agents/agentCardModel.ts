import {
  agentDisplayName,
  agentKind,
  type ConsoleRow,
  contextLowText,
  inboxTitle,
  rowDirectory,
} from '@openagentspocket/core';
import type { AgentCardModel } from '@openagentspocket/ui';
import { statusDot } from '../../console/agentStatus';

/**
 * The card of one Console row: workspace as the title, the Agent's own title under it. Inside a
 * workspace card the Agent is just its own title and status.
 */
export function agentCardModel(
  row: ConsoleRow,
  showHost: boolean,
  nested = false,
  qualify = false,
): AgentCardModel {
  const status = statusDot(row.agent.agent_status);
  const own = inboxTitle(row);
  const workspace = row.workspaceLabel;
  const diff = row.changeTotals;
  const contextLeft = contextLowText(row.contextUsage);
  if (nested) {
    return {
      title: own,
      program: agentKind(row.agent),
      status,
      blockedPrompt: status === 'blocked' ? row.lastOutputSnippet : undefined,
      diff,
      contextLeft,
    };
  }
  return {
    title: workspace ?? own,
    program: agentKind(row.agent),
    status,
    blockedPrompt: status === 'blocked' ? row.lastOutputSnippet : undefined,
    qualifier: qualify ? agentDisplayName(row.agent) : undefined,
    diff,
    contextLeft,
    subtitle: workspace !== undefined && workspace !== own ? own : undefined,
    host: showHost ? row.hostName : undefined,
    path: rowDirectory(row),
  };
}
