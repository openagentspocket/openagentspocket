import '../chat/programs';
import { describe, expect, it } from 'vitest';
import { screenFixtures } from './golden-fixtures.testkit';
import { planImage } from './golden-image.testkit';
import type { DialogAction } from './plan-types';
import { parseBlockedDialog, planDialogAction, planGenericOption } from './programs';

const TOOL_USE_ID = 'toolu_golden';

/** Reads the Swift golden's action image back into an action. */
function actionFromImage(image: unknown): DialogAction {
  if (image === 'dismiss' || image === 'expandQuestions' || image === 'skipQuestion') {
    return { kind: image };
  }
  const entry = Object.entries(image as Record<string, Record<string, unknown> | number[]>)[0];
  if (!entry) throw new Error('empty action');
  const [name, payload] = entry;
  if (Array.isArray(payload)) return { kind: 'submitSelection', ordinals: payload };
  switch (name) {
    case 'choose':
      return { kind: 'choose', ordinal: Number(payload.ordinal) };
    case 'amend':
      return { kind: 'amend', ordinal: Number(payload.ordinal), note: String(payload.note) };
    case 'respond':
      return { kind: 'respond', ordinal: Number(payload.ordinal), text: String(payload.text) };
    case 'approvePlan':
      return { kind: 'approvePlan', note: String(payload.note) };
    default:
      throw new Error(`unknown action ${name}`);
  }
}

describe.each(['claude', 'codex'] as const)(
  '%s action planners against the Swift goldens',
  (program) => {
    describe.each(screenFixtures(program).map((fixture) => [fixture.name, fixture] as const))(
      '%s',
      (_name, fixture) => {
        const result = parseBlockedDialog(fixture.screen, program);

        it('plans every card action as Swift does, with and without a matched request', () => {
          if (result.kind === 'dialog') {
            for (const entry of fixture.golden.plans) {
              const action = actionFromImage(entry.action);
              expect(
                planImage(planDialogAction(result.dialog, action)),
                JSON.stringify(entry.action),
              ).toEqual(entry.result);
              expect(
                planImage(planDialogAction(result.dialog, action, TOOL_USE_ID)),
                `${JSON.stringify(entry.action)} with a tool use`,
              ).toEqual(entry.resultWithToolUseID ?? entry.result);
            }
          } else if (result.kind === 'unrecognized') {
            for (const entry of fixture.golden.plans) {
              expect(
                planImage(planGenericOption(Number(entry.number), result.excerpt, program)),
                `digit ${entry.number}`,
              ).toEqual(entry.result);
            }
          } else {
            expect(fixture.golden.plans).toEqual([]);
          }
        });
      },
    );
  },
);
