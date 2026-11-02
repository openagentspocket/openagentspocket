// A Workflow's agents as its journal records them (Swift ChatWorkflowProgress).

export type WorkflowAgentState = 'running' | 'done' | 'failed';

export interface ChatWorkflowAgent {
  /** The program's key for the agent, kept when it runs again. */
  id: string;
  label: string | null;
  phase: string | null;
  state: WorkflowAgentState;
}

export interface ChatWorkflowProgress {
  agents: ChatWorkflowAgent[];
  /** When the Host last wrote the journal, as of the last look, on its own clock (ISO 8601). */
  updatedAt: string | null;
}

export function workflowCounts(progress: ChatWorkflowProgress): {
  done: number;
  failed: number;
  /** The agents started so far; a running Workflow may start more. */
  started: number;
} {
  const count = (state: WorkflowAgentState) =>
    progress.agents.filter((agent) => agent.state === state).length;
  return { done: count('done'), failed: count('failed'), started: progress.agents.length };
}
