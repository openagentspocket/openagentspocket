import type { AgentInfo } from './agent-fields';

/**
 * When an Agent entered its current status, as far as this device knows. Times are epoch
 * milliseconds. `isApproximate` marks a time that is only a lower bound (first sighting, or a
 * change seen after a gap).
 */
export interface StatusStamp {
  readonly status: string;
  readonly since: number;
  readonly isApproximate: boolean;
  readonly previousStatus?: string;
  /** When work (Working or Done) last ended in Idle; drives the Recent window. */
  readonly lastWorkEndedAt?: number;
  readonly terminalId: string;
  /** The last state-change sequence seen with this status. */
  readonly stateChangeSeq?: number;
  /** The sequence that came with the transition this stamp already counted. */
  readonly staleSeq?: number;
  /** The user cleared the entry; a new transition revives it. */
  readonly dismissed: boolean;
}

export function firstSeen(agent: AgentInfo, now: number): StatusStamp {
  return {
    status: agent.agent_status,
    since: now,
    isApproximate: true,
    terminalId: agent.terminal_id,
    stateChangeSeq: agent.state_change_seq,
    dismissed: false,
  };
}

const endsWork = (status: string) => status === 'working' || status === 'done';

/** Folds one observation of the live Agent into the stamp. */
export function observing(stamp: StatusStamp, agent: AgentInfo, now: number): StatusStamp {
  if (agent.terminal_id !== stamp.terminalId) return firstSeen(agent, now);
  if (agent.agent_status === stamp.status) {
    const seq = agent.state_change_seq;
    if (seq === undefined || seq === stamp.stateChangeSeq || seq === stamp.staleSeq) return stamp;
    return { ...stamp, stateChangeSeq: seq, staleSeq: undefined };
  }
  return {
    ...stamp,
    previousStatus: stamp.status,
    status: agent.agent_status,
    since: now,
    isApproximate: false,
    stateChangeSeq: undefined,
    staleSeq: agent.state_change_seq,
    // Opening a Done Agent turns it Idle (herdr clears Done on focus): that is the user reading
    // it, not new work, so a Clear stands.
    dismissed: stamp.dismissed && stamp.status === 'done' && agent.agent_status === 'idle',
    lastWorkEndedAt:
      agent.agent_status === 'idle'
        ? endsWork(stamp.status)
          ? now
          : undefined
        : stamp.lastWorkEndedAt,
  };
}

/**
 * Catches a stamp up after a gap in observation (app was away, Host reconnected): any change
 * since is only known approximately, and an Idle after the gap means work ended unseen.
 */
export function reconciled(stamp: StatusStamp, agent: AgentInfo, now: number): StatusStamp {
  if (agent.terminal_id !== stamp.terminalId) return firstSeen(agent, now);
  const sequenceMoved =
    stamp.stateChangeSeq !== undefined &&
    agent.state_change_seq !== undefined &&
    agent.state_change_seq !== stamp.stateChangeSeq;
  const changed = agent.agent_status !== stamp.status || sequenceMoved;
  const base: StatusStamp = changed
    ? {
        ...stamp,
        status: agent.agent_status,
        since: now,
        isApproximate: true,
        previousStatus: undefined,
        dismissed: false,
        lastWorkEndedAt: agent.agent_status === 'idle' ? now : stamp.lastWorkEndedAt,
      }
    : stamp;
  return { ...base, stateChangeSeq: agent.state_change_seq, staleSeq: undefined };
}
