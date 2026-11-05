// Test support: Grok Build screens laid out the way Grok 1.0.62 draws them (Swift GrokScreenBuilder),
// for the states and widths no capture shows, plus the captures by stem.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeAnsiScreen } from '../../blocked/ansi-decoder';
import type { AnsiScreen } from '../../blocked/screen';

const GOLDENS = fileURLToPath(new URL('../../../goldens/grok/screens/', import.meta.url));

export const captureText = (stem: string): string => readFileSync(`${GOLDENS}${stem}.ansi`, 'utf8');
export const capture = (stem: string): AnsiScreen => decodeAnsiScreen(captureText(stem));

export interface BuilderOptions {
  columns?: number;
  header?: string;
  scrollback?: string[];
  status?: {
    label: string;
    phase?: string | null;
    turn?: string;
    buttons?: string;
    queued?: string;
  };
  cue?: string;
  dock?: string[];
  glyph?: '❯' | '!' | '#';
  typed?: string;
  ghost?: string;
  placeholder?: string;
  topLabel?: string;
  bottomLabel?: string;
  multiline?: boolean;
  hints?: string[];
  footer?: string;
}

const ITALIC = '\u001b[3m';
const RESET = '\u001b[0m';

function rule(columns: number, left: string, label: string, right: string): string {
  const fill = Math.max(0, columns - 4 - [...label].length - (label === '' ? 0 : 2));
  const middle = label === '' ? '─'.repeat(fill + 0) : ` ${label} ${'─'.repeat(fill)}`;
  return `  ${left}─${middle}${right}`;
}

export function grokScreen(options: BuilderOptions = {}): AnsiScreen {
  const columns = options.columns ?? 120;
  const rows: string[] = [];
  if (options.header) rows.push(options.header);
  for (const row of options.scrollback ?? []) rows.push(`     ${row}`);
  rows.push('');
  if (options.cue) rows.push(`  ◉ ${options.cue}`);
  for (const row of options.dock ?? []) rows.push(row);
  if (options.status) {
    const { label, phase, turn, buttons, queued } = options.status;
    const timers = [phase === undefined ? null : phase, turn].filter(Boolean).join('  ');
    rows.push(`  ⠋ ${label}  ${timers}${buttons ?? ''}${queued ?? ''}`);
  }
  const glyph = options.glyph ?? '❯';
  const first = options.typed ?? '';
  const lines = first === '' ? [''] : first.split('\n');
  const placeholder = options.placeholder ?? (first === '' && !options.ghost ? '' : '');
  rows.push(rule(columns, '╭', options.topLabel ?? '', '╮'));
  lines.forEach((line, index) => {
    const lead = index === 0 ? `│ ${glyph} ` : '│   ';
    const ghost =
      index === lines.length - 1 && options.ghost ? `${ITALIC}${options.ghost}${RESET}` : '';
    const shown = index === 0 && line === '' && ghost === '' ? placeholder : line;
    const pad = Math.max(
      1,
      columns - 2 - [...lead].length - [...shown].length - [...(options.ghost ?? '')].length - 1,
    );
    rows.push(`  ${lead}${shown}${ghost}${' '.repeat(pad)}│`);
  });
  const bottom = options.multiline
    ? `${options.bottomLabel ?? 'grok-build'} ${'─'.repeat(4)} multiline`
    : (options.bottomLabel ?? 'grok-build');
  rows.push(rule(columns, '╰', bottom, '╯').replace(/ ─*╯$/u, ' ╯'));
  const footer = options.footer ?? (options.hints === undefined ? '' : options.hints.join('  │  '));
  if (footer !== '') rows.push(`  ${footer}`);
  return decodeAnsiScreen(rows.join('\r\n'));
}
