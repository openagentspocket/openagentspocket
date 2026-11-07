import {
  type ApprovalApplyRequest,
  type ApprovalDecision,
  type ApprovalLedger,
  type ApprovalOutcome,
  answerApproval,
  type StoredApprovalOptIns,
} from '../notifications/approval-action';
import type { ApprovalAskReading } from '../notifications/approval-script';
import type { NotificationKeyStore, RandomBytes } from '../notifications/key-store';
import { sealContent } from './content';
import type { LiveActivityController } from './controller';
import { openActivity } from './envelope';
import type { ActivityAsk, ActivityDesire, ActivityResult } from './types';

/**
 * A tap on a Live Activity's Approve or Deny, as its link names it. A link can come from anywhere,
 * so this only selects: every word of the answer comes from what the Host reports at that moment.
 */
export interface ActivityTap {
  readonly hostId: string;
  readonly paneId: string;
  readonly episodeId: string;
  readonly decision: ApprovalDecision;
}

export interface ActivityTapGates {
  /** The Host's Live Activity toggle. */
  readonly isActivityOn: (hostId: string) => boolean;
  readonly optIns: Pick<StoredApprovalOptIns, 'isEnabled' | 'setEnabled'>;
  readonly ledger: ApprovalLedger;
  readonly nowSeconds: () => number;
  /** Reads the Host now; never an earlier reading. */
  readonly readAsks: (hostId: string) => Promise<ApprovalAskReading>;
  /** Device owner authentication, for Approve; true only on a fresh success. */
  readonly authenticate: (request: ApprovalApplyRequest) => Promise<boolean>;
  /** Runs the apply on the Host: the result it printed, a throw only if it never started. */
  readonly apply: (hostId: string, request: ApprovalApplyRequest) => Promise<string>;
}

function payloadOf(paneId: string, ask: ActivityAsk) {
  return {
    paneId,
    status: 'blocked',
    timestamp: ask.timestamp,
    episodeId: ask.episodeId,
    act: ask.denyOnly ? 2 : 1,
    prompt: ask.prompt,
    options: ask.options,
  };
}

/** Approve or Deny from an activity: the notification's gates, over a prompt read just now. */
export async function runActivityTap(
  tap: ActivityTap,
  gates: ActivityTapGates,
): Promise<ApprovalOutcome> {
  const { hostId, paneId, episodeId, decision } = tap;
  if (!gates.isActivityOn(hostId) || !gates.optIns.isEnabled(hostId)) return 'optedOut';
  let reading: ApprovalAskReading;
  try {
    reading = await gates.readAsks(hostId);
  } catch {
    return 'unreachable';
  }
  if (reading.kind !== 'read') return 'pluginOutdated';
  const ask = reading.asks.get(paneId);
  if (!ask || ask.episodeId !== episodeId) {
    return reading.unread.includes(paneId) ? 'unreachable' : 'promptChanged';
  }
  return answerApproval({
    hostId,
    payload: payloadOf(paneId, ask),
    decision,
    ledger: gates.ledger,
    nowSeconds: gates.nowSeconds(),
    authenticate: gates.authenticate,
    apply: gates.apply,
  });
}

/** What the activity says for an outcome. An ignored tap there means the prompt was answered. */
export function activityResultOf(outcome: ApprovalOutcome): ActivityResult {
  switch (outcome) {
    case 'answered':
      return 'sent';
    case 'ignored':
      return 'answered';
    case 'expired':
      return 'expired';
    case 'optedOut':
      return 'opted_out';
    case 'notAnswerable':
    case 'promptChanged':
      return 'prompt_changed';
    case 'promptCut':
    case 'denyOnly':
      return 'approve_in_app';
    case 'pluginOutdated':
      return 'update_plugin';
    case 'unreachable':
      return 'unreachable';
    case 'sendFailed':
      return 'may_have_sent';
    case 'timedOut':
      return 'timed_out';
    case 'notAuthenticated':
      return 'unlock_to_approve';
  }
}

export interface ActivityFeedbackDeps {
  readonly controller: LiveActivityController;
  readonly keys: Pick<NotificationKeyStore, 'record'>;
  readonly randomBytes: RandomBytes;
}

/**
 * Writes what a tap came to on the Host's running activity, resealed under its key. Only an activity
 * that still shows the same prompt for the same pane is touched.
 */
export async function markActivityResult(
  deps: ActivityFeedbackDeps,
  tap: Pick<ActivityTap, 'hostId' | 'paneId' | 'episodeId'>,
  result: ActivityResult,
): Promise<void> {
  const key = deps.keys.record(tap.hostId)?.key;
  if (!key) return;
  const handles = await deps.controller.currentActivities();
  for (const handle of handles.filter(({ hostId }) => hostId === tap.hostId)) {
    const state = await deps.controller.currentContent(handle.id);
    if (!state?.envelope) continue;
    let details: ReturnType<typeof openActivity>;
    try {
      details = openActivity({ ...state.envelope }, key);
    } catch {
      continue;
    }
    const answered = ({ paneId, ask }: ActivityDesire['agents'][number]) =>
      paneId === tap.paneId && ask?.episodeId === tap.episodeId;
    if (!details.agents.some(answered)) continue;
    const agents = details.agents.map((agent) =>
      answered(agent) && agent.ask ? { ...agent, ask: { ...agent.ask, result } } : agent,
    );
    const content = sealContent(
      { ...details, agents, counts: state.counts },
      key,
      deps.randomBytes,
    );
    if (content) deps.controller.update(handle.id, content);
  }
}

export interface ActivityTapRunnerOptions extends ActivityFeedbackDeps {
  readonly gates: ActivityTapGates;
}

/** Runs taps one per prompt, showing "Sending…" and then the result on the activity. */
export class ActivityTapRunner {
  private readonly running = new Set<string>();

  constructor(private readonly o: ActivityTapRunnerOptions) {}

  isRunning(hostId: string, paneId: string, episodeId: string): boolean {
    return this.running.has(JSON.stringify([hostId, paneId, episodeId]));
  }

  /** The outcome; null when the same prompt's tap is still running. */
  async run(tap: ActivityTap): Promise<ApprovalOutcome | null> {
    const id = JSON.stringify([tap.hostId, tap.paneId, tap.episodeId]);
    if (this.running.has(id)) return null;
    this.running.add(id);
    try {
      await markActivityResult(this.o, tap, 'sending');
      const outcome = await runActivityTap(tap, this.o.gates);
      await markActivityResult(this.o, tap, activityResultOf(outcome));
      return outcome;
    } finally {
      this.running.delete(id);
    }
  }
}
