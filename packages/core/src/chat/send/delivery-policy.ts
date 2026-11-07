// Chat's delivery (Swift ComposerDeliveryPolicy.chat, ADR 0024). Text the rules refuse stays a
// draft. Otherwise the Agent's screen is read first, and the message goes only into an input box
// read as empty; a second read after `agent.prompt` tells whether Enter took it. Both reads go
// through `agent.read`, and a Blocked Agent refuses: nothing here touches the Attach PTY.

import type { AnsiScreen } from '../../blocked/screen';
import type { ComposerDeliveryPolicy, ComposerRefusal } from '../../composer/policy';
import { userFacingDescription } from '../../errors/presentation';
import { TransportFailure } from '../../errors/transport-error';
import type { Clock } from '../../hosts/cancellation';
import type { ChatAgentActivity } from '../model/types';
import { detectInputBox, holdReason } from './detect';
import { DELIVERY_CHECK_DELAY_MS, deliveryVerdict, preSendCheck } from './input-box';
import type { ProgramSendPolicy } from './policy';
import type { SendRules } from './rules';

export interface ChatDeliveryDeps {
  readonly rules: SendRules;
  /** What herdr reports the Agent doing when asked, not when the view last rendered. */
  readonly activity: () => ChatAgentActivity;
  readonly readScreen: () => Promise<AnsiScreen>;
  /**
   * For a program that can leave its conversation without herdr reporting it: why the message would
   * land outside the conversation Chat shows, or null to go on. Runs before the screen read.
   */
  readonly confirmSession?: () => Promise<string | null>;
  /** Gets the text as sent and the screen the box passed on; may hold the message for what Chat knows beyond the box. */
  readonly sendConcern?: (outgoing: string, screen: AnsiScreen) => string | null;
  /** The conversation shows a question waiting for an answer, whatever herdr reports. */
  readonly questionOpen?: () => boolean;
  /** Runs just before the first read, once the Agent is not Blocked. */
  readonly willReadScreen?: () => void;
  /** Times the check after the send. */
  readonly clock: Clock;
}

const unreadable = (error: unknown): string => {
  const prefix = "Agentico couldn't check the Agent's input box.";
  return error instanceof TransportFailure ? `${prefix} ${userFacingDescription(error)}` : prefix;
};

export function chatDeliveryPolicy(
  policy: ProgramSendPolicy,
  deps: ChatDeliveryDeps,
): ComposerDeliveryPolicy {
  const { rules, activity, readScreen } = deps;
  const pause = (ms: number) => new Promise<void>((resolve) => deps.clock.setTimeout(resolve, ms));
  const notReady = (reason: string): ComposerRefusal => ({ kind: 'inputNotReady', reason });
  return {
    route: 'chat',
    insertsIntoAttachWhenBlocked: false,
    outgoingText: (text) => rules.outgoingText(text),
    validate: (text) => rules.validate(text),
    preflight: async (text) => {
      if (activity() === 'blocked') return { kind: 'agentBlocked' };
      if (deps.confirmSession) {
        const reason = await deps.confirmSession();
        if (reason !== null) return notReady(reason);
      }
      deps.willReadScreen?.();
      let screen: AnsiScreen;
      try {
        screen = await readScreen();
      } catch (error) {
        return notReady(unreadable(error));
      }
      const decision = preSendCheck(detectInputBox(screen, policy), activity());
      switch (decision.kind) {
        case 'send': {
          const concern = deps.sendConcern?.(rules.outgoingText(text), screen) ?? null;
          return concern === null ? undefined : notReady(concern);
        }
        case 'holdBlocked':
          return { kind: 'agentBlocked' };
        case 'hold':
          // The box is away and a question is open: Chat answers it, the terminal need not.
          return deps.questionOpen?.()
            ? { kind: 'agentBlocked' }
            : notReady(holdReason(decision.state, policy));
      }
    },
    verify: async (sent) => {
      await pause(DELIVERY_CHECK_DELAY_MS);
      // A screen that cannot be read says nothing; the message stays marked as sent.
      let screen: AnsiScreen;
      try {
        screen = await readScreen();
      } catch {
        return true;
      }
      const verdict = deliveryVerdict(detectInputBox(screen, policy), activity(), {
        mayRefillAfterSend: policy.mayRefillInputBoxAfterSend,
        sent,
      });
      return verdict.kind !== 'notDelivered';
    },
  };
}
