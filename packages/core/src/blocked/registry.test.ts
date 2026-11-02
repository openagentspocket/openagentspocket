import { describe, expect, it } from 'vitest';
import { message } from '../errors/text';
import { loadScreen } from './golden-fixtures.testkit';
import { makePlan, refuse } from './plan-types';
import { parseBlockedDialog, planDialogAction, registerBlockedProgram } from './programs';
import { type BlockedDialog, NO_DIALOG } from './types';

function foreignDialog(): BlockedDialog {
  const parsed = parseBlockedDialog(loadScreen('claude-02-c1-bash-blocked'), 'claude');
  if (parsed.kind !== 'dialog') throw new Error('expected a dialog');
  return { ...parsed.dialog, kind: 'grokPermission', program: 'grok' };
}

describe('the hooks for the other programs (P2.10)', () => {
  it('shows no dialog and refuses to plan for a program without a parser', () => {
    expect(parseBlockedDialog(loadScreen('claude-02-c1-bash-blocked'), 'grok')).toEqual(NO_DIALOG);
    expect(planDialogAction(foreignDialog(), { kind: 'dismiss' }).ok).toBe(false);
  });

  it('routes a registered program to its own parser and planner', () => {
    registerBlockedProgram('grok', {
      parse: () => NO_DIALOG,
      plan: (_dialog, action, toolUseID) =>
        action.kind === 'dismiss'
          ? makePlan([{ kind: 'keys', keys: ['esc'] }], { kind: 'toolResult', id: toolUseID ?? '' })
          : refuse({ kind: 'unsupported', reason: message('Not a Codex dialog.') }),
    });
    const stopped = planDialogAction(foreignDialog(), { kind: 'dismiss' }, 'toolu_1');
    expect(stopped.ok && stopped.plan.confirmation).toEqual({ kind: 'toolResult', id: 'toolu_1' });
    expect(planDialogAction(foreignDialog(), { kind: 'choose', ordinal: 1 }).ok).toBe(false);
  });
});
