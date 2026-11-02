import type {
  ChatAgentActivity,
  ChatAgentView,
  ChatProgram,
  ConsoleRow,
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
  const { agent } = row;
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
  };
}
