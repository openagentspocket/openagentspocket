import type {
  ChatAgentActivity,
  ChatAgentView,
  ChatProgram,
  ConsoleRow,
  herdr,
} from '@openagentspocket/core';

const PROGRAMS: readonly ChatProgram[] = ['claude', 'codex', 'pi', 'omp', 'grok', 'opencode'];

function activityOf(status: string): ChatAgentActivity {
  switch (status) {
    case 'working':
    case 'blocked':
      return status;
    case 'idle':
    case 'done':
      return 'idle';
    default:
      return 'unknown';
  }
}

/** What Chat follows of a Console row: the program, what herdr reports it doing, where, and its session. */
export function chatAgentView(row: ConsoleRow): ChatAgentView {
  return chatAgentViewOf(row.agent);
}

/** The same, from herdr's record of the Agent (a Console row's, or a fresh `agent.get`). */
export function chatAgentViewOf(agent: herdr.AgentInfo): ChatAgentView {
  const named = agent.agent ?? null;
  const reported = agent.agent_session ?? null;
  const program =
    PROGRAMS.find((candidate) => candidate === named || candidate === reported?.agent) ?? 'claude';
  return {
    program,
    activity: activityOf(agent.agent_status),
    cwd: agent.cwd ?? null,
    foregroundCwd: agent.foreground_cwd ?? null,
    session: reported,
    terminalTitle: agent.terminal_title_stripped ?? null,
  };
}
