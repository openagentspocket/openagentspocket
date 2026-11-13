// OpenCode's background subagents as the Background Work every program shares. OpenCode 2 runs a
// subagent in a child session: the `subagent` call returns at once with `metadata.status` `running`
// and the child's id in `metadata.sessionID`, and each time the child goes idle OpenCode writes a
// `synthetic` row into the parent whose metadata says `source: "subagent"`, the child's id
// (`childID`) and the job's status (`state`: `completed`, `error` or `cancelled`). A later call
// naming the same child continues it, as Claude Code's `SendMessage` resumes a Subagent. When the
// child goes idle with background work of its own still running, OpenCode writes the row anyway and
// marks its text `state="running"`: that child (or its own children) can still ask for permission,
// so the row ends nothing. (OpenCode `tool/plugin/subagent.ts`, `session/subagent-completion.ts`.)

import { backgroundWorkItem } from '../model/factories';
import { followAgent } from '../model/transcript';
import type {
  BackgroundWorkState,
  ChatBackgroundWorkAgent,
  ChatBackgroundWorkItem,
  ChatTranscript,
} from '../model/types';
import { dateOf, offsetOf } from './projection-parts';
import type { OpenCodeNote, OpenCodeRow, OpenCodeTool } from './record';
import { toolKindOf } from './tool-summary';

/** The child a call left working in the background, or null. */
function backgroundChild(tool: OpenCodeTool): string | null {
  if (toolKindOf(tool.name) !== 'agent' || tool.status !== 'completed') return null;
  if (tool.metadata?.status !== 'running') return null;
  const child = tool.metadata.sessionID;
  return child === null || child === '' ? null : child;
}

const STILL_RUNNING = /^\s*<subagent\b[^>]*\bstate="running"/;

function endState(state: string | null): BackgroundWorkState {
  switch (state) {
    case 'error':
      return 'failed';
    case 'cancelled':
      return 'stopped';
    default:
      return 'completed';
  }
}

/** Collects one read's launches and completions, then sets them on the transcript. */
export class OpenCodeBackgroundWork {
  private readonly items: ChatBackgroundWorkItem[] = [];
  private readonly agents: Record<string, ChatBackgroundWorkAgent> = {};
  /** Children launched in these rows. */
  private readonly launched = new Set<string>();

  /** A subagent call that left its child working: a new item, or a resume of one these rows hold. */
  launch(tool: OpenCodeTool, row: OpenCodeRow): void {
    const child = backgroundChild(tool);
    if (child === null || tool.callID === null || tool.callID === '') return;
    const offset = offsetOf(row.seq);
    const at = dateOf(row.created);
    if (this.launched.has(child)) {
      this.agent(child).resume = { callID: tool.callID, offset, resumedAt: at };
      return;
    }
    this.launched.add(child);
    this.items.push(
      backgroundWorkItem({
        id: tool.callID,
        kind: 'subagent',
        title: tool.input.description ?? 'Subagent',
        subtitle: tool.input.agent ?? tool.input.subagentType,
        launchOffset: offset,
        launchedAt: at,
        agentID: child,
      }),
    );
  }

  /** A row saying a child went idle. */
  end(note: OpenCodeNote, row: OpenCodeRow): void {
    if (note.source !== 'subagent' || note.childID === null || note.childID === '') return;
    if (STILL_RUNNING.test(note.text ?? '')) return;
    this.agent(note.childID).notifications.push({
      state: endState(note.state),
      offset: offsetOf(row.seq),
      endedAt: dateOf(row.created),
      usage: null,
    });
  }

  /** The items as the rows leave them, and what the rows say of each child for work launched above them. */
  apply(transcript: ChatTranscript): void {
    for (const agent of Object.values(this.agents)) {
      const { resume } = agent;
      agent.resumeEnd =
        resume === null
          ? null
          : (agent.notifications.find((end) => end.offset > resume.offset) ?? null);
    }
    transcript.backgroundWork = this.items.map((item) =>
      followAgent(item, item.agentID === null ? undefined : this.agents[item.agentID]),
    );
    transcript.backgroundWorkAgents = this.agents;
  }

  private agent(child: string): ChatBackgroundWorkAgent {
    let agent = this.agents[child];
    if (!agent) {
      agent = { resume: null, resumeEnd: null, notifications: [] };
      this.agents[child] = agent;
    }
    return agent;
  }
}
