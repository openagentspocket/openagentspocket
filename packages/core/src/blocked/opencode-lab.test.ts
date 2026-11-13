import '../chat/programs';
// The Blocked card, the pre-send input box check, the mode and Stop against real OpenCode 2.1.3
// screens (goldens/opencode/lab, `agent.read` captures from scripts/agent-lab.py).

import { describe, expect, it } from 'vitest';
import { OPENCODE_MODES } from '../chat/programs/mode-lists';
import { readProgramMode } from '../chat/programs/modes';
import { programShortcuts } from '../chat/programs/registry';
import { detectInputBox } from '../chat/send/detect';
import { sendPolicyFor } from '../chat/send/registry';
import { renderText } from '../errors/text';
import { FakeClock } from '../hosts/cancellation';
import { labScreen, labScreenText } from '../lab-captures.testkit';
import { BlockedCardStore } from './card-store';
import type { BlockedScreenIO } from './card-support';
import { parseBlockedDialog, planDialogAction } from './programs';
import type { BlockedDialog } from './types';

const screen = (name: string) => labScreen('opencode', name);
/** The shell call the permission holds, as Chat reads it (chat/opencode/lab.test.ts). */
const SHELL_CALL = 'call_85f0f209553640a79b73b399';

function dialogOf(name: string): BlockedDialog {
  const parsed = parseBlockedDialog(screen(name), 'opencode');
  if (parsed.kind !== 'dialog') throw new Error(`${name} shows no dialog (${parsed.kind})`);
  return parsed.dialog;
}

const choices = (dialog: BlockedDialog) => dialog.options.map(({ label, role }) => [label, role]);

function keysOf(dialog: BlockedDialog, ordinal: number, toolUseID: string | null = null) {
  const plan = planDialogAction(dialog, { kind: 'choose', ordinal }, toolUseID);
  return plan.ok ? plan.plan.steps : { refused: plan.error.kind };
}

describe('OpenCode 2.1.3 Blocked card, live captures', () => {
  it('reads a shell permission', () => {
    const dialog = dialogOf('permission-shell');
    expect(dialog.kind).toBe('openCodePermission');
    expect(dialog.subject.command).toBe('ls');
    expect(choices(dialog)).toEqual([
      ['Allow once', 'approve'],
      ['Always allow', 'approvePersistent'],
      ['Reject', 'decline'],
    ]);
    expect(keysOf(dialog, 1)).toEqual([{ kind: 'keys', keys: ['enter'] }]);
  });

  it('reads a file edit permission with its path', () => {
    const dialog = dialogOf('permission-edit');
    expect(dialog.kind).toBe('openCodePermission');
    expect(dialog.subject.filePath).toBe('notes.txt');
    expect(dialog.body).toEqual(['Edit notes.txt']);
  });

  it('rejects with Esc only for the matched call', () => {
    const dialog = dialogOf('permission-shell');
    expect(keysOf(dialog, 3)).toEqual({ refused: 'unsupported' });
    expect(keysOf(dialog, 3, SHELL_CALL)).toEqual([{ kind: 'keys', keys: ['esc'] }]);
  });

  it('answers a question with its digit', () => {
    const dialog = dialogOf('question');
    expect(dialog.kind).toBe('openCodeQuestion');
    expect(choices(dialog)).toEqual([
      ['Red', 'answer'],
      ['Blue', 'answer'],
      ['Type your own answer', 'otherText'],
    ]);
    expect(keysOf(dialog, 2)).toEqual([{ kind: 'keys', keys: ['2'] }]);
    expect(keysOf(dialog, 3)).toEqual({ refused: 'unsupported' });
  });

  // Finding (agent lab, 2026-11-13): apps/mobile useBlockedCard builds the card without
  // `toolUseIdFor`, so Reject on OpenCode's own permission is refused ("Reject this in the
  // terminal") and sends nothing, although Chat's transcript holds the running call's id. Wiring
  // it needs the card to match the dialog to the conversation's awaiting call; not done here.
  it.skip('rejects from a card built as the app builds it', async () => {
    const keys: string[][] = [];
    const io: BlockedScreenIO = {
      readScreen: async () => screen('permission-shell'),
      sendKeys: async (sent) => {
        keys.push([...sent]);
      },
      paste: async () => undefined,
    };
    const clock = new FakeClock();
    const card = new BlockedCardStore({ program: 'opencode', io, clock });
    card.setActivity('blocked');
    await card.refresh();
    const run = card.perform({ kind: 'choose', ordinal: 3 });
    for (let tick = 0; tick < 100 && keys.length === 0; tick += 1) await clock.advance(50);
    await run;
    expect(keys).toEqual([['esc']]);
  });
});

describe('OpenCode 2.1.3 screens for sending, modes and Stop', () => {
  const policy = sendPolicyFor('opencode');
  const box = (name: string) => detectInputBox(screen(name), policy).kind;

  it('reads the input box as Chat checks it before a send', () => {
    expect(box('home-build')).toBe('noComposer');
    expect(box('session-idle')).toBe('empty');
    expect(detectInputBox(screen('draft'), policy)).toEqual({ kind: 'text', text: 'draft text' });
    expect(box('models-overlay')).toBe('overlay');
    expect(box('working')).toBe('disabled');
    expect(box('permission-shell')).toBe('dialog');
  });

  it('names the mode its footer draws', () => {
    const mode = (name: string) => {
      const found = readProgramMode(OPENCODE_MODES, labScreenText('opencode', name));
      return found && renderText(found);
    };
    expect(mode('home-build')).toBe('Build');
    expect(mode('home-plan')).toBe('Plan');
    expect(mode('session-idle')).toBe('Build');
  });

  it('switches agents with the key its footer names', () => {
    expect(labScreenText('opencode', 'home-build')).toContain('shift+tab agents');
    const keys = programShortcuts('opencode').flatMap((s) => (s.kind === 'keys' ? [s.keys] : []));
    expect(keys).toContainEqual(['shift+tab']);
    expect(keys).not.toContainEqual(['tab']);
  });

  it('stops a working turn and presses nothing once it ended', () => {
    const guard = policy.stop.screenGuard;
    expect(guard?.({ screen: screen('working'), activity: 'working' })).toEqual({ kind: 'press' });
    expect(guard?.({ screen: screen('interrupted'), activity: 'idle' }).kind).toBe('refuse');
  });
});
