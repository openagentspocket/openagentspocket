// OpenCode's keys for a card action (Swift OpenCodeDialogPlanner). A permission's options sit in a
// row: Left and Right move focus, one checked step at a time, and Enter picks the focused option. A
// question's digit picks its answer and submits.

import { message } from '../errors/text';
import { type DialogAction, type DialogActionPlan, makePlan, refuse } from './plan-types';
import { digitKey, StepBuilder } from './step-builder';
import { type BlockedDialog, optionAt } from './types';

const UNBLOCKED: { readonly kind: 'fingerprintChangeOrUnblocked' } = {
  kind: 'fingerprintChangeOrUnblocked',
};

const unsupported = (key: string, ...args: string[]) =>
  refuse({ kind: 'unsupported', reason: message(key, ...args) });

const ownAnswer = () => unsupported('Type your own answer in the terminal.');

/**
 * Plans OpenCode's cards. `toolUseID` is the matched call of the session on screen: OpenCode draws
 * its subagents' requests there too, and Esc on a subagent's permission asks what to do differently
 * instead of rejecting, so Esc goes only for a matched call.
 */
export function planOpenCodeAction(
  dialog: BlockedDialog,
  action: DialogAction,
  toolUseID: string | null,
): DialogActionPlan {
  switch (dialog.kind) {
    case 'openCodePermission':
      return permission(dialog, action, toolUseID);
    case 'openCodeQuestion':
      return question(dialog, action, toolUseID);
    default:
      return unsupported('Not an OpenCode dialog.');
  }
}

function rejection(toolUseID: string | null): DialogActionPlan {
  if (toolUseID === null) {
    return unsupported(
      "Reject this in the terminal: OpenCode asks why when a subagent's request is rejected.",
    );
  }
  return makePlan([{ kind: 'keys', keys: ['esc'] }], UNBLOCKED);
}

/** `Allow once` has focus when the request shows, so it takes Enter alone; `Always allow` is one step to the right. Esc rejects. */
function permission(
  dialog: BlockedDialog,
  action: DialogAction,
  toolUseID: string | null,
): DialogActionPlan {
  switch (action.kind) {
    case 'choose': {
      const option = optionAt(dialog, action.ordinal);
      if (!option) return refuse({ kind: 'noSuchOption', ordinal: action.ordinal });
      switch (option.role) {
        case 'approve':
        case 'approvePersistent': {
          const builder = new StepBuilder(dialog);
          builder.move(action.ordinal, 'horizontal');
          builder.keys('enter');
          return makePlan(builder.steps, UNBLOCKED);
        }
        case 'decline':
          return rejection(toolUseID);
        default:
          return refuse({ kind: 'noSuchOption', ordinal: action.ordinal });
      }
    }
    case 'dismiss':
      return rejection(toolUseID);
    case 'amend':
    case 'respond':
    case 'approvePlan':
      return unsupported(
        'OpenCode takes no note with a permission; reject, then tell OpenCode in the composer.',
      );
    default:
      return unsupported('The permission has no such action.');
  }
}

/** A digit picks its answer and submits it. Agentico doesn't type into OpenCode's own answer row. Esc dismisses the question. */
function question(
  dialog: BlockedDialog,
  action: DialogAction,
  toolUseID: string | null,
): DialogActionPlan {
  switch (action.kind) {
    case 'choose': {
      const option = optionAt(dialog, action.ordinal);
      if (!option) return refuse({ kind: 'noSuchOption', ordinal: action.ordinal });
      if (option.role !== 'answer') return ownAnswer();
      const digit = digitKey(option.number);
      if (digit === null) {
        return unsupported(
          'Option %lld has no digit key. Answer it in the terminal.',
          String(action.ordinal),
        );
      }
      return makePlan([{ kind: 'keys', keys: [digit] }], UNBLOCKED);
    }
    case 'dismiss':
      if (toolUseID === null) {
        return unsupported(
          "Dismiss this question in the terminal: Agentico can't match it to OpenCode's call.",
        );
      }
      return makePlan([{ kind: 'keys', keys: ['esc'] }], UNBLOCKED);
    case 'respond':
    case 'amend':
      return ownAnswer();
    default:
      return unsupported('The question has no such action.');
  }
}
