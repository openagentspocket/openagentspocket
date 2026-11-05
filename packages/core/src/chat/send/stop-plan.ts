// Chat's Stop (Swift ChatStopPlan): the program's keys, an optional screen guard that reads before
// pressing, and the wait after. The plan itself is data on the policy (`StopPlanSpec`); this builds
// the Composer's interrupt from it.

import { type AgentInterruptOutcome, type AgentStopWait, ESCAPE_WAIT } from '../../composer/stop';
import type { AgentKeysQueue } from './agent-keys';
import type { StopContext, StopPlanSpec } from './policy';

export const ESCAPE_HINT = 'Presses Esc to interrupt the Agent';

/** One Esc, pressed without reading the screen, with Esc's wait and hint. */
export const ESCAPE_STOP: StopPlanSpec = {
  keys: ['esc'],
  wait: ESCAPE_WAIT,
  accessibilityHint: ESCAPE_HINT,
};

/** The request failed, so the keys may not have arrived. */
export const STOP_UNREACHABLE = "Couldn't reach the Agent, so it may still be working.";
/** A guard had no screen to decide on, so nothing was pressed. */
export const STOP_UNREADABLE_SCREEN =
  "Agentico couldn't check the Agent's screen, so Stop pressed nothing.";

/** One surface's Stop: what a tap does, the wait after it, and its hint. */
export interface ComposerInterrupt {
  readonly wait: AgentStopWait;
  readonly accessibilityHint: string;
  perform(): Promise<AgentInterruptOutcome>;
}

/**
 * The Composer's Stop for a plan, in line with the Agent page's keys. A tap delivers the plan's keys
 * through `keys`. Without a guard there is no check and nothing is read. With one, the check runs
 * inside the keys queue: `context()` (a throw gives `STOP_UNREADABLE_SCREEN`), then the guard
 * (`refuse` gives its reason, shown beside Stop).
 */
export function composerInterrupt(
  plan: StopPlanSpec,
  deps: { context: () => Promise<StopContext>; keys: AgentKeysQueue },
): ComposerInterrupt {
  const { screenGuard } = plan;
  const check = screenGuard
    ? async (): Promise<string | null> => {
        let context: StopContext;
        try {
          context = await deps.context();
        } catch {
          return STOP_UNREADABLE_SCREEN;
        }
        const verdict = screenGuard(context);
        return verdict.kind === 'refuse' ? verdict.reason : null;
      }
    : undefined;
  return {
    wait: plan.wait,
    accessibilityHint: plan.accessibilityHint,
    perform: async () => {
      const delivery = await deps.keys.deliver(plan.keys, check);
      switch (delivery.kind) {
        case 'sent':
          return { kind: 'sent' };
        case 'withheld':
          return { kind: 'failed', message: delivery.reason };
        case 'failed':
          return { kind: 'failed', message: STOP_UNREACHABLE };
      }
    },
  };
}
