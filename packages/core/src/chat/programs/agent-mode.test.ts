import './index';
import { describe, expect, it } from 'vitest';
import { type GoldenProgram, screenFixtures } from '../../blocked/golden-fixtures.testkit';
import { parseBlockedDialog } from '../../blocked/programs';
import { readAgentMode } from './agent-mode';

const LAST = { key: 'Plan Mode' };
const PROGRAMS: GoldenProgram[] = ['claude', 'codex', 'grok', 'opencode', 'omp'];

describe('the mode under a dialog, every program with screens and modes', () => {
  for (const program of PROGRAMS) {
    it(`${program}: keeps the last mode while a dialog covers the footer`, () => {
      const covered = screenFixtures(program).filter(
        (fixture) => parseBlockedDialog(fixture.screen, program).kind !== 'none',
      );
      for (const fixture of covered) {
        expect([fixture.name, readAgentMode(program, fixture.screen, LAST)]).toEqual([
          fixture.name,
          LAST,
        ]);
      }
    });
  }

  it('reads the footer again when no dialog covers it', () => {
    const ready = screenFixtures('claude').find((fixture) => fixture.name === 'claude-01-ready');
    if (!ready) throw new Error('claude-01-ready is missing');
    expect(readAgentMode('claude', ready.screen, LAST)).not.toBe(LAST);
  });

  it('names nothing for a program that lists no modes', () => {
    const [any] = screenFixtures('claude');
    if (!any) throw new Error('no Claude screen');
    expect(readAgentMode('unknown-program', any.screen, LAST)).toBeNull();
  });
});
