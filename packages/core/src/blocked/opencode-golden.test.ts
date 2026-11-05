// Differential tests: every OpenCode screen capture in goldens/opencode decodes, parses and plans
// as the Swift goldens say (goldens/README.md "Screen goldens").

import { describe, expect, it } from 'vitest';
import { screenFixtures } from './golden-fixtures.testkit';
import { parseImage, planImage, screenImage } from './golden-image.testkit';
import type { DialogAction } from './plan-types';
import { parseBlockedDialog, planDialogAction } from './programs';

const TOOL_USE_ID = 'toolu_golden';

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

const fixtures = screenFixtures('opencode');

describe('OpenCode screen goldens', () => {
  it('has the captured screens', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  describe.each(fixtures.map((fixture) => [fixture.name, fixture] as const))(
    '%s',
    (_name, fixture) => {
      const result = parseBlockedDialog(fixture.screen, 'opencode');

      it('decodes to the Swift screen', () => {
        expect(screenImage(fixture.screen)).toEqual(fixture.decoded);
      });

      it('parses to the same DialogParseResult', () => {
        expect(parseImage(result)).toEqual(fixture.golden.parse);
      });

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
        } else {
          expect(fixture.golden.plans).toEqual([]);
        }
      });
    },
  );
});
