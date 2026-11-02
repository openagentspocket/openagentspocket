/** Test support: loads the Swift goldens under packages/core/goldens (node only). */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeAnsiScreen } from './ansi-decoder';
import type { AnsiScreen } from './screen';

const GOLDENS = fileURLToPath(new URL('../../goldens/', import.meta.url));

export interface ScreenFixture {
  name: string;
  ansi: string;
  screen: AnsiScreen;
  /** The golden JSON, as parsed. */
  golden: GoldenScreen;
  /** The decoded-screen JSON, as parsed. */
  decoded: unknown;
}

export interface GoldenScreen {
  fixture: string;
  program: string;
  parse: unknown;
  plans: GoldenPlan[];
}

export interface GoldenPlan {
  action?: unknown;
  number?: number;
  result: unknown;
  resultWithToolUseID?: unknown;
}

/** One capture by stem (`claude-02-c1-bash-blocked`); the program is the stem's prefix. */
export function loadScreen(stem: string): AnsiScreen {
  const program = stem.startsWith('codex') ? 'codex' : 'claude';
  return decodeAnsiScreen(readFileSync(`${GOLDENS}${program}/screens/${stem}.ansi`, 'utf8'));
}

export function screenFixtures(program: 'claude' | 'codex'): ScreenFixture[] {
  const directory = `${GOLDENS}${program}/screens/`;
  return readdirSync(directory)
    .filter((file) => file.endsWith('.ansi'))
    .sort()
    .map((file) => {
      const stem = file.slice(0, -'.ansi'.length);
      const ansi = readFileSync(`${directory}${file}`, 'utf8');
      return {
        name: stem,
        ansi,
        screen: decodeAnsiScreen(ansi),
        golden: JSON.parse(readFileSync(`${directory}${stem}.golden.json`, 'utf8')),
        decoded: JSON.parse(readFileSync(`${directory}${stem}.screen.json`, 'utf8')),
      };
    });
}
