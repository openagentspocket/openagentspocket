import type { Text } from '../errors/text';
import type { ComposerRoute } from './policy';

/** How far the Agent got with a delivered message, from status pushes alone. */
export type ComposerProgress = 'acknowledged' | 'agentBusy' | 'working' | 'done';

export type ComposerDelivery =
  | { readonly kind: 'sending' }
  | { readonly kind: 'delivered'; readonly progress: ComposerProgress }
  | { readonly kind: 'failed'; readonly text: Text }
  /** `agent.prompt` succeeded but the text stayed in the Agent's input box. Never resent. */
  | { readonly kind: 'undelivered' };

export interface ComposerMessage {
  readonly id: string;
  readonly text: string;
  readonly route: ComposerRoute;
  readonly state: ComposerDelivery;
}

export interface Tracking {
  workingAtSend: boolean;
  revisionAtSend: number;
  observedWorking: boolean;
  /** Attach-inserted drafts are acked by the PTY write and do not claim Working/Done later. */
  tracksProgress: boolean;
}

/** What a status push does to one delivered message: it never claims progress the Agent did not make for it. */
export function advanceMessage(
  message: ComposerMessage,
  tracking: Tracking | undefined,
  status: string,
  revision: number,
): ComposerMessage {
  if (!tracking?.tracksProgress) return message;
  if (status === 'working' && tracking.revisionAtSend !== revision) {
    tracking.observedWorking = true;
  }
  if (message.state.kind !== 'delivered') return message;
  const { progress } = message.state;
  let next: ComposerProgress | undefined;
  if (status === 'working' && progress !== 'done' && tracking.observedWorking) next = 'working';
  else if (status === 'done' && (tracking.observedWorking || !tracking.workingAtSend)) {
    next = 'done';
  } else if (status === 'idle' && tracking.observedWorking) next = 'done';
  return next ? { ...message, state: { kind: 'delivered', progress: next } } : message;
}

/** The progress to show the moment `agent.prompt` is acknowledged, from the statuses seen since the send. */
export function progressAfterAck(
  tracking: Tracking | undefined,
  status: string,
  revision: number,
): ComposerProgress {
  if (!tracking) return 'acknowledged';
  if (tracking.observedWorking) {
    if (status === 'working') return 'working';
    if (status === 'done' || status === 'idle') return 'done';
  } else if (!tracking.workingAtSend && tracking.revisionAtSend !== revision && status === 'done') {
    // The status stream keeps only the newest event: a fast working-to-done pair can arrive as Done alone.
    return 'done';
  }
  return tracking.workingAtSend ? 'agentBusy' : 'acknowledged';
}
