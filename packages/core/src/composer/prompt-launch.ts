import type { Clock } from '../hosts/cancellation';
import { isApiCode } from './failure';

const DEFAULT_RETRY_MS = 500;
const DEFAULT_BUDGET_MS = 10_000;

interface LaunchWait {
  readonly prompt: (params: { target: string; text: string }) => Promise<void>;
  readonly clock: Clock;
  readonly notReadyRetryMs?: number;
  readonly notReadyBudgetMs?: number;
}

/**
 * One `agent.prompt`, waiting out a fresh launch's `agent_not_ready` rejections first: herdr
 * answers `agent.start` while the agent is still booting, so the first prompt can beat its
 * registration. Retries that code alone, at a fixed pace inside a bounded budget; a genuinely
 * absent Agent (`agent_not_found`) still fails at once.
 */
export async function promptWaitingOutLaunch(
  wait: LaunchWait,
  params: { target: string; text: string },
): Promise<void> {
  const { clock } = wait;
  const delay = wait.notReadyRetryMs ?? DEFAULT_RETRY_MS;
  const deadline = clock.monotonicMs() + (wait.notReadyBudgetMs ?? DEFAULT_BUDGET_MS);
  for (;;) {
    try {
      await wait.prompt(params);
      return;
    } catch (error) {
      if (!isApiCode(error, 'agent_not_ready') || clock.monotonicMs() + delay >= deadline) {
        throw error;
      }
      await new Promise<void>((resolve) => clock.setTimeout(resolve, delay));
    }
  }
}
