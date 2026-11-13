import {
  agentDisplayName,
  agentKindLabel,
  type ConsoleRow,
  rowDirectory,
} from '@openagentspocket/core';
import type { Surface } from './surface';

const tail = (path: string | undefined) => path?.split('/').filter(Boolean).at(-1);

/**
 * The title block. The terminal names the Agent under its Host and program; Chat names the
 * conversation (the Agent when its program records no title) with the program and Host under it.
 */
export function headerTitles(
  row: ConsoleRow,
  surface: Surface,
  conversationTitle: string | null,
): { eyebrow?: string; title: string; subtitle?: string } {
  if (surface === 'chat') {
    return {
      title: conversationTitle?.trim() || agentDisplayName(row.agent),
      subtitle: [agentKindLabel(row.agent.agent ?? ''), row.hostName].filter(Boolean).join(' · '),
    };
  }
  return {
    eyebrow: [row.hostName, row.agent.agent].filter(Boolean).join(' · '),
    title: agentDisplayName(row.agent),
    subtitle: [row.workspaceLabel, tail(rowDirectory(row))].filter(Boolean).join(' · '),
  };
}
