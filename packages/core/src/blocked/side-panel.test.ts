import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import '../chat/programs';
import { decodeAnsiScreen } from './ansi-decoder';
import { textWidth } from './cell-width';
import { parseClaudeDialog } from './claude-parser';
import { parseCodexDialog } from './codex-parser';
import { goldenAnsi } from './golden-fixtures.testkit';
import { planKeys } from './plan-types';
import { planDialogAction } from './programs';
import type { BlockedDialog, DialogParseResult } from './types';

/** Rebuilt from the owner's screenshot and a live read of the panel: Claude Code's side panel. */
const PANEL_SCREEN = readFileSync(
  fileURLToPath(new URL('./fixtures/claude-side-panel-bash.ansi', import.meta.url)),
  'utf8',
);

const ESC = String.fromCharCode(27);
const SGR = new RegExp(`${ESC}\\[[0-9;]*m`, 'gu');
const DIM_BAR = '\u001b[0m\u001b[2m│\u001b[0m';

/** Draws a side panel beside every row of a golden, down to its last visible row. */
function besidePanel(ansi: string): string {
  const rows = ansi.split('\n');
  const width = (row: string) => textWidth(row.replace(SGR, ''));
  const columns = Math.max(...rows.map(width));
  const last = rows.map((row) => row.replace(SGR, '').trim() !== '').lastIndexOf(true);
  const panel = ['──────────', ' ▶ Time to compact · conversation 862.2k', ' c: compact'];
  return rows
    .map((row, index) =>
      index > last
        ? row
        : `${row}${' '.repeat(columns - width(row))}${DIM_BAR}${panel[index % panel.length]}`,
    )
    .join('\n');
}

function dialogOf(result: DialogParseResult): BlockedDialog {
  if (result.kind !== 'dialog') throw new Error(`expected a dialog, got ${result.kind}`);
  return result.dialog;
}

describe('a dialog beside a side panel', () => {
  const dialog = () => dialogOf(parseClaudeDialog(decodeAnsiScreen(PANEL_SCREEN)));

  it('reads as the permission it is, under its own title', () => {
    expect(dialog().kind).toBe('claudeBash');
    expect(dialog().title).toBe('Bash command');
  });

  it("shows each option's own label", () => {
    expect(dialog().options.map((option) => option.label)).toEqual(['Yes', 'No']);
  });

  it('shows only the command, with no frame around it', () => {
    const command = dialog().subject.command ?? '';
    expect(command.startsWith('cd /your/project')).toBe(true);
    expect(command.endsWith('|| git status)')).toBe(true);
    expect(command).not.toMatch(/[│╌─]/u);
  });

  it("answers with the verified option's digit", () => {
    const planned = planDialogAction(dialog(), { kind: 'choose', ordinal: 2 });
    if (!planned.ok) throw new Error('expected a plan');
    expect(planKeys(planned.plan)).toEqual(['2']);
  });

  it.each([
    ['claude-02-c1-bash-blocked', parseClaudeDialog],
    ['claude-36-c7-phone-yes-blocked', parseClaudeDialog],
    ['codex-01-x1-exec', parseCodexDialog],
  ])('reads %s the same with a panel beside it', (stem, parse) => {
    const plain = dialogOf(parse(decodeAnsiScreen(goldenAnsi(stem))));
    const framed = dialogOf(parse(decodeAnsiScreen(besidePanel(goldenAnsi(stem)))));
    expect(framed.kind).toBe(plain.kind);
    expect(framed.options.map((option) => option.label)).toEqual(
      plain.options.map((option) => option.label),
    );
    expect(framed.subject).toEqual(plain.subject);
  });

  it('ends an option at a frame row under it, with the digit buttons clean', () => {
    const ansi = goldenAnsi('claude-02-c1-bash-blocked').replace(
      '4. \u001b[0mNo',
      '4. \u001b[0mNo\n        │ ▶ Time to compact',
    );
    const result = parseClaudeDialog(decodeAnsiScreen(ansi));
    if (result.kind !== 'unrecognized') throw new Error('expected the generic card');
    expect(result.excerpt.numbered.get(4)).toBe('No');
  });
});
