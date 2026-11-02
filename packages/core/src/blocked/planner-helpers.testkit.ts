import { expect } from 'vitest';
import { loadScreen } from './golden-fixtures.testkit';
import type { DialogAction, DialogPlanError, DialogStep } from './plan-types';
import { parseBlockedDialog, planDialogAction } from './programs';
import type { BlockedDialog } from './types';

export function dialogOf(stem: string): BlockedDialog {
  const program = stem.startsWith('codex') ? 'codex' : 'claude';
  const result = parseBlockedDialog(loadScreen(stem), program);
  if (result.kind !== 'dialog') throw new Error(`${stem} did not parse as a dialog`);
  return result.dialog;
}

export function plan(action: DialogAction, stem: string, toolUseID: string | null = null) {
  const result = planDialogAction(dialogOf(stem), action, toolUseID);
  if (!result.ok) throw new Error(`${stem}: ${JSON.stringify(result.error)}`);
  return result.plan;
}

export function refusal(action: DialogAction, stem: string): DialogPlanError {
  const result = planDialogAction(dialogOf(stem), action);
  if (result.ok) throw new Error(`${stem}: expected a refusal`);
  return result.error;
}

export const keys = (...names: string[]): DialogStep => ({ kind: 'keys', keys: names });
export const focus = (ordinal: number): DialogStep => ({
  kind: 'expect',
  expectation: { kind: 'focus', ordinal },
});
export const page = (name: string): DialogStep => ({
  kind: 'expect',
  expectation: { kind: 'page', page: name },
});
export const paste = (text: string): DialogStep => ({ kind: 'paste', text });
export const inputText = (text: string): DialogStep => ({
  kind: 'expect',
  expectation: { kind: 'inputText', text },
});
export const unsupported = (key: string) =>
  expect.objectContaining({
    kind: 'unsupported',
    reason: expect.objectContaining({ key }),
  });

export const SELECTION_KEYS = new Set([
  'enter',
  'esc',
  'tab',
  'shift+tab',
  'up',
  'down',
  'left',
  'right',
]);
