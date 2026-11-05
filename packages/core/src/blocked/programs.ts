import type { ChatProgram } from '../chat/model/types';
import { message } from '../errors/text';
import { parseClaudeDialog } from './claude-parser';
import { planClaudeAction } from './claude-planner';
import { parseCodexDialog } from './codex-parser';
import { planCodexAction } from './codex-planner';
import { grokSupport } from './grok-support';
import { ompSupport } from './omp-support';
import { openCodeSupport } from './opencode-support';
import {
  attemptPlan,
  type ConfirmationRule,
  type DialogAction,
  type DialogActionPlan,
  makePlan,
  type PlanResult,
  refuse,
} from './plan-types';
import type { AnsiScreen } from './screen';
import { digitKey } from './step-builder';
import {
  type BlockedDialog,
  type DialogParseResult,
  type GenericDialogExcerpt,
  NO_DIALOG,
} from './types';

/**
 * What a program contributes to the Blocked card: its dialog parser and its action planner.
 * Claude and Codex are built in; P2.10 registers Pi/OMP, Grok and OpenCode with
 * `registerBlockedProgram`. A planner throws through `refuse` (see plan-types) and never plans a
 * resend: a card sends its keys once.
 */
export interface BlockedProgramSupport {
  parse(screen: AnsiScreen): DialogParseResult;
  plan(dialog: BlockedDialog, action: DialogAction, toolUseID: string | null): DialogActionPlan;
  /**
   * Present when the program's generic card (a dialog no parser names, shown as an excerpt) may press
   * the digit of a numbered option it lists. Absent: such a card has no option buttons.
   */
  readonly genericOptions?: {
    /** A reverse-video cursor on screen means a text field has focus, where a digit would be typed. */
    readonly refusesWhileCursorInField?: boolean;
    /** What shows the press worked. */
    readonly confirmation: ConfirmationRule;
  };
  /** The card keeps reading the screen while the Agent is idle with a question still open. */
  readonly readsScreenWhenIdleWithOpenQuestion?: boolean;
}

const registry = new Map<ChatProgram, BlockedProgramSupport>([
  [
    'claude',
    {
      parse: parseClaudeDialog,
      plan: planClaudeAction,
      genericOptions: {
        refusesWhileCursorInField: true,
        confirmation: { kind: 'fingerprintChange' },
      },
      readsScreenWhenIdleWithOpenQuestion: true,
    },
  ],
  [
    'codex',
    {
      parse: parseCodexDialog,
      plan: (dialog, action) => planCodexAction(dialog, action),
      genericOptions: { confirmation: { kind: 'fingerprintChangeOrUnblocked' } },
    },
  ],
]);

for (const [program, support] of [
  ['omp', ompSupport],
  ['grok', grokSupport],
  ['opencode', openCodeSupport],
] as const) {
  if (support) registry.set(program, support);
}

/** Adds or replaces a program's parser and planner (the hook for P2.10). */
export function registerBlockedProgram(program: ChatProgram, support: BlockedProgramSupport): void {
  registry.set(program, support);
}

const terminalOnly = () => message('Answer this dialog in the Agent terminal.');

/** What a program contributes to the Blocked card, or undefined for one with nothing. */
export function blockedSupportFor(program: ChatProgram): BlockedProgramSupport | undefined {
  return registry.get(program);
}

/** The parser for an Agent's program; programs without one show no dialog (Pi has none). */
export function parseBlockedDialog(screen: AnsiScreen, program: ChatProgram): DialogParseResult {
  return registry.get(program)?.parse(screen) ?? NO_DIALOG;
}

/**
 * Turns a card action into the keys, pastes and checks that perform it on the dialog as last
 * read, or refuses with the reason. `toolUseID` is the matched request's `tool_use` id: each
 * program's planner decides what it is for (Claude confirms by the request's result, Codex
 * ignores it).
 */
export function planDialogAction(
  dialog: BlockedDialog,
  action: DialogAction,
  toolUseID: string | null = null,
): PlanResult {
  return attemptPlan(() => {
    const support = registry.get(dialog.program);
    if (!support) return refuse({ kind: 'unsupported', reason: terminalOnly() });
    return support.plan(dialog, action, toolUseID);
  });
}

/** The generic card's option button: the digit of an option the excerpt lists. */
export function planGenericOption(
  number: number,
  excerpt: GenericDialogExcerpt,
  program: ChatProgram,
): PlanResult {
  return attemptPlan(() => {
    const options = registry.get(program)?.genericOptions;
    if (!options) return refuse({ kind: 'unsupported', reason: terminalOnly() });
    if (!excerpt.numbered.has(number)) return refuse({ kind: 'noSuchOption', ordinal: number });
    const digit = digitKey(number);
    if (digit === null) {
      return refuse({
        kind: 'unsupported',
        reason: message('Option %lld has no digit key.', String(number)),
      });
    }
    // A text field with the cursor would take the digit as typed text.
    if (
      options.refusesWhileCursorInField &&
      excerpt.rows.some((row) => row.runs.some((run) => run.style.isReverse))
    ) {
      return refuse({
        kind: 'unsupported',
        reason: message(
          'A text field in the dialog has the cursor, so a digit would be typed into it.',
        ),
      });
    }
    return makePlan([{ kind: 'keys', keys: [digit] }], options.confirmation);
  });
}
