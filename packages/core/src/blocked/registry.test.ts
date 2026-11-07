import { describe, expect, it } from 'vitest';
import { message } from '../errors/text';
import { loadScreen } from './golden-fixtures.testkit';
import { makePlan, refuse } from './plan-types';
import {
  blockedSupportFor,
  parseBlockedDialog,
  planDialogAction,
  planGenericOption,
  registerBlockedProgram,
} from './programs';
import { type BlockedDialog, NO_DIALOG } from './types';

function foreignDialog(): BlockedDialog {
  const parsed = parseBlockedDialog(loadScreen('claude-02-c1-bash-blocked'), 'claude');
  if (parsed.kind !== 'dialog') throw new Error('expected a dialog');
  return { ...parsed.dialog, kind: 'grokPermission', program: 'pi' };
}

describe('the hooks for the other programs (P2.10)', () => {
  it('shows no dialog and refuses to plan for a program without a parser', () => {
    expect(parseBlockedDialog(loadScreen('claude-02-c1-bash-blocked'), 'pi')).toEqual(NO_DIALOG);
    expect(planDialogAction(foreignDialog(), { kind: 'dismiss' }).ok).toBe(false);
  });

  it('routes a registered program to its own parser and planner', () => {
    registerBlockedProgram('pi', {
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

describe('the generic card options', () => {
  const excerpt = () => {
    const screen = loadScreen('claude-02-c1-bash-blocked');
    const parsed = parseBlockedDialog(screen, 'claude');
    if (parsed.kind !== 'dialog') throw new Error('expected a dialog');
    return {
      numbered: new Set([1, 2]),
      rows: screen.rows,
      fingerprint: parsed.dialog.fingerprint,
    } as never;
  };

  it('are offered by Claude and Codex, which declare them', () => {
    expect(blockedSupportFor('claude')?.genericOptions?.refusesWhileCursorInField).toBe(true);
    expect(blockedSupportFor('codex')?.genericOptions?.confirmation).toEqual({
      kind: 'fingerprintChangeOrUnblocked',
    });
    expect(planGenericOption(2, excerpt(), 'codex').ok).toBe(true);
  });

  it('are refused for a program that declares none, and offered once it does', () => {
    const own = excerpt();
    expect(planGenericOption(1, own, 'pi')).toMatchObject({
      ok: false,
      error: { kind: 'unsupported' },
    });
    registerBlockedProgram('pi', {
      parse: () => NO_DIALOG,
      plan: () => {
        throw new Error('unused');
      },
      genericOptions: { confirmation: { kind: 'fingerprintChange' } },
    });
    const plan = planGenericOption(1, own, 'pi');
    expect(plan.ok && plan.plan.confirmation).toEqual({ kind: 'fingerprintChange' });
    expect(plan.ok && plan.plan.steps).toEqual([{ kind: 'keys', keys: ['1'] }]);
    expect(planGenericOption(7, own, 'pi')).toMatchObject({
      ok: false,
      error: { kind: 'noSuchOption' },
    });
  });
});
