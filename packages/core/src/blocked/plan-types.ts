import type { Text } from '../errors/text';

/**
 * What the user asked a card to do. The planner turns it into keys for the dialog as last read,
 * or refuses with the reason.
 */
export type DialogAction =
  /** Picks an option: its digit when it has one, otherwise arrow keys and Enter. */
  | { readonly kind: 'choose'; readonly ordinal: number }
  /** Claude's Bash and file dialogs: Tab turns a Yes/No row into a note field, then the note. */
  | { readonly kind: 'amend'; readonly ordinal: number; readonly note: string }
  /** Types `text` into a text option and submits it. */
  | { readonly kind: 'respond'; readonly ordinal: number; readonly text: string }
  /** Claude plan: types `note` into the feedback row and approves with shift+tab. */
  | { readonly kind: 'approvePlan'; readonly note: string }
  /** Claude multi-select: leaves exactly these answers checked, then presses the button. */
  | { readonly kind: 'submitSelection'; readonly ordinals: readonly number[] }
  /** Esc: declines / interrupts / quits the trust dialog. */
  | { readonly kind: 'dismiss' }
  /** Codex: opens the questions folded above the composer. */
  | { readonly kind: 'expandQuestions' }
  /** Codex: skips the asynchronous question on screen. */
  | { readonly kind: 'skipQuestion' };

/** What a fresh read must show before the next step. */
export type DialogExpectation =
  | { readonly kind: 'focus'; readonly ordinal: number }
  | { readonly kind: 'feedbackMode'; readonly ordinal: number }
  | { readonly kind: 'inputText'; readonly text: string }
  | { readonly kind: 'notes'; readonly text: string }
  | { readonly kind: 'checked'; readonly ordinals: readonly number[] }
  | { readonly kind: 'page'; readonly page: string }
  | { readonly kind: 'queuedNotice'; readonly title: string };

/** One thing a card does to the pane, in order. */
export type DialogStep =
  /** `agent.send_keys` with these herdr key names. */
  | { readonly kind: 'keys'; readonly keys: readonly string[] }
  /** `pane.send_input` with text only. Selection keys never go this way. */
  | { readonly kind: 'paste'; readonly text: string }
  /** Re-read the screen until it shows this, polling briefly; when it never does, stop. */
  | { readonly kind: 'expect'; readonly expectation: DialogExpectation };

/** How a card knows its keys took effect. */
export type ConfirmationRule =
  | { readonly kind: 'toolResult'; readonly id: string }
  | { readonly kind: 'fingerprintChange' }
  | { readonly kind: 'fingerprintChangeOrUnblocked' }
  | { readonly kind: 'queuedNotice'; readonly title: string };

export interface DialogActionPlan {
  readonly steps: readonly DialogStep[];
  readonly confirmation: ConfirmationRule;
  /** Codex ends the turn on a decline or an interrupt, so the card focuses Chat's composer. */
  readonly focusesComposer: boolean;
}

/** Why the planner sent nothing. */
export type DialogPlanError =
  | { readonly kind: 'unsupported'; readonly reason: Text }
  | { readonly kind: 'noSuchOption'; readonly ordinal: number }
  | { readonly kind: 'noFocus' }
  | { readonly kind: 'textFieldNotEmpty' }
  | { readonly kind: 'needsText' }
  | { readonly kind: 'emptyText' }
  | { readonly kind: 'multilineText' }
  | { readonly kind: 'unsafeText' }
  | { readonly kind: 'emptySelection' }
  | { readonly kind: 'composerDraft' };

export type PlanResult =
  | { readonly ok: true; readonly plan: DialogActionPlan }
  | { readonly ok: false; readonly error: DialogPlanError };

/** Thrown inside the planners and turned into a `PlanResult` at their boundary. */
export class PlanRefusal extends Error {
  constructor(readonly error: DialogPlanError) {
    super(error.kind);
    this.name = 'PlanRefusal';
  }
}

export function refuse(error: DialogPlanError): never {
  throw new PlanRefusal(error);
}

/** Every key name the plan sends, in order. */
export const planKeys = (plan: DialogActionPlan): string[] =>
  plan.steps.flatMap((step) => (step.kind === 'keys' ? [...step.keys] : []));

export const makePlan = (
  steps: readonly DialogStep[],
  confirmation: ConfirmationRule,
  focusesComposer = false,
): DialogActionPlan => ({ steps, confirmation, focusesComposer });

/** Runs a planner body, turning a refusal into the error result. */
export function attemptPlan(body: () => DialogActionPlan): PlanResult {
  try {
    return { ok: true, plan: body() };
  } catch (error) {
    if (error instanceof PlanRefusal) return { ok: false, error: error.error };
    throw error;
  }
}
