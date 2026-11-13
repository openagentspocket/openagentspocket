import '../chat/programs';
// The Blocked card, the pre-send input box check, the mode, the shortcuts and Usage against real
// Codex 0.167 (goldens/codex/lab: `agent.read` captures and a plugin Usage report from
// scripts/agent-lab.py, redacted by its `keep`).

import { describe, expect, it } from 'vitest';
import { footerCovered, readAgentMode } from '../chat/programs/agent-mode';
import { CODEX_MODES } from '../chat/programs/mode-lists';
import { readProgramMode } from '../chat/programs/modes';
import { programShortcuts } from '../chat/programs/registry';
import { detectInputBox } from '../chat/send/detect';
import { sendPolicyFor } from '../chat/send/registry';
import { renderText } from '../errors/text';
import { FakeClock } from '../hosts/cancellation';
import { labScreen, labScreenText, labText } from '../lab-captures.testkit';
import { decodeUsageReport } from '../usage/report';
import { BlockedCardStore } from './card-store';
import type { BlockedScreenIO } from './card-support';
import { parseBlockedDialog, planDialogAction } from './programs';
import type { BlockedDialog } from './types';

const screen = (name: string) => labScreen('codex', name);

function dialogOf(name: string): BlockedDialog {
  const parsed = parseBlockedDialog(screen(name), 'codex');
  if (parsed.kind !== 'dialog') throw new Error(`${name} shows no dialog (${parsed.kind})`);
  return parsed.dialog;
}

const choices = (dialog: BlockedDialog) => dialog.options.map(({ label, role }) => [label, role]);

function keysOf(dialog: BlockedDialog, ordinal: number) {
  const plan = planDialogAction(dialog, { kind: 'choose', ordinal });
  return plan.ok ? plan.plan.steps : { refused: plan.error.kind };
}

/** Taps one option on a card built as the app builds it over the pane; returns the keys sent. */
async function tap(name: string, ordinal: number): Promise<string[][]> {
  const keys: string[][] = [];
  const io: BlockedScreenIO = {
    readScreen: async () => screen(name),
    sendKeys: async (sent) => {
      keys.push([...sent]);
    },
    paste: async () => undefined,
  };
  const clock = new FakeClock();
  const card = new BlockedCardStore({ program: 'codex', io, clock });
  card.setActivity('blocked');
  await card.refresh();
  const run = card.perform({ kind: 'choose', ordinal });
  for (let tick = 0; tick < 100 && card.getState().progress === 'acting'; tick += 1) {
    await clock.advance(50);
  }
  await run;
  return keys;
}

describe('Codex 0.167 Blocked card, live captures', () => {
  it('reads a command approval in the read-only sandbox', () => {
    const dialog = dialogOf('exec-approval');
    expect(dialog.kind).toBe('codexExec');
    expect(dialog.subject.command).toBe('touch scratch.txt');
    expect(dialog.subject.environment).toBe('local');
    expect(choices(dialog)).toEqual([
      ['Yes, proceed', 'approve'],
      [
        "Yes, and don't ask again for commands that start with `touch scratch.txt`",
        'approvePersistent',
      ],
      ['No, and tell Codex what to do differently', 'decline'],
    ]);
  });

  it('denies with its digit, the key the lab saw Codex take', async () => {
    const dialog = dialogOf('exec-approval');
    expect(keysOf(dialog, 3)).toEqual([{ kind: 'keys', keys: ['3'] }]);
    expect(await tap('exec-approval', 3)).toEqual([['3']]);
  });

  it('reads the question Plan Mode asks and answers it with its digit', async () => {
    const dialog = dialogOf('question');
    expect(dialog.kind).toBe('codexQuestion');
    expect(dialog.title).toBe('Which color do you prefer?');
    expect(choices(dialog)).toEqual([
      ['Red', 'answer'],
      ['Blue', 'answer'],
      ['None of the above', 'otherText'],
    ]);
    expect(await tap('question', 2)).toEqual([['2']]);
  });

  // Found by the agent lab (2026-11-13): until the user trusts herdr's hook, Codex 0.167 holds the
  // pane on this review and herdr never reports the session (no-session-without-hooks).
  it('does not read the hooks review as a card, and holds a send', () => {
    expect(parseBlockedDialog(screen('hooks-review'), 'codex').kind).toBe('unrecognized');
    expect(detectInputBox(screen('hooks-review'), sendPolicyFor('codex')).kind).toBe('dialog');
  });
});

describe('Codex 0.167 screens for sending, modes, shortcuts and Stop', () => {
  const policy = sendPolicyFor('codex');
  const box = (name: string) => detectInputBox(screen(name), policy).kind;

  it('reads the input box as Chat checks it before a send', () => {
    expect(box('idle')).toBe('empty');
    expect(box('no-session-without-hooks')).toBe('empty');
    expect(box('plan-idle')).toBe('empty');
    // Codex takes a message while it works (it queues it).
    expect(box('working')).toBe('empty');
    expect(detectInputBox(screen('draft'), policy)).toEqual({ kind: 'text', text: 'draft text' });
    expect(box('shortcuts-overlay')).toBe('overlay');
    expect(box('exec-approval')).toBe('dialog');
    expect(box('question')).toBe('dialog');
  });

  it('names the mode its footer draws', () => {
    const mode = (name: string) => {
      const found = readProgramMode(CODEX_MODES, labScreenText('codex', name));
      return found && renderText(found);
    };
    expect(mode('idle')).toBe('Default Mode');
    expect(mode('plan-idle')).toBe('Plan Mode');
  });

  // Found by the agent lab (2026-11-13): Codex draws the question over its footer, so the screen
  // has no mode words; the mode read before the question stands, never a Default Mode guess.
  it('does not call a Plan Mode question Default Mode', () => {
    const plan = readAgentMode('codex', screen('plan-idle'), null);
    expect(plan && renderText(plan)).toBe('Plan Mode');
    const found = readAgentMode('codex', screen('question'), plan);
    expect(found && renderText(found)).toBe('Plan Mode');
    expect(readAgentMode('codex', screen('question'), null)).toBeNull();
  });

  it('keeps the last mode under every dialog, and reads the footer again once it shows', () => {
    const plan = readAgentMode('codex', screen('plan-idle'), null);
    for (const name of ['exec-approval', 'hooks-review']) {
      expect(footerCovered('codex', screen(name))).toBe(true);
      expect(readAgentMode('codex', screen(name), plan)).toBe(plan);
    }
    expect(footerCovered('codex', screen('idle'))).toBe(false);
    const after = readAgentMode('codex', screen('idle'), plan);
    expect(after && renderText(after)).toBe('Default Mode');
  });

  it('cycles modes with the key its shortcuts overlay names', () => {
    const overlay = labScreenText('codex', 'shortcuts-overlay');
    expect(overlay).toMatch(/⇧tab\s+Change mode/u);
    expect(overlay).toMatch(/esc esc\s+Edit last message/u);
    const keys = programShortcuts('codex').flatMap((s) => (s.kind === 'keys' ? [s.keys] : []));
    expect(keys).toContainEqual(['shift+tab']);
    expect(keys).toContainEqual(['esc', 'esc']);
  });

  it('stops a working turn with Esc', () => {
    expect(policy.stop.keys).toEqual(['esc']);
    const guard = policy.stop.screenGuard;
    expect(
      guard?.({ screen: screen('working'), activity: 'working' }) ?? { kind: 'press' },
    ).toEqual({ kind: 'press' });
  });
});

describe('Codex 0.167 Usage through the plugin, live capture', () => {
  it('reads the tokens of the rollouts and the service limit window', () => {
    const { report } = JSON.parse(labText('codex', 'usage-report.json')) as { report: unknown };
    const decoded = decodeUsageReport(JSON.stringify(report));
    const codex = decoded.programs.find((program) => program.program === 'codex');
    expect(codex?.tokenUsage.state).toBe('ok');
    expect(codex?.tokenUsage.totals?.today.tokens.total).toBe(82_984);
    expect(codex?.usageLimits.state).toBe('ok');
    expect(codex?.usageLimits.windows.map((window) => window.usedPercent)).toEqual([29]);
  });
});
