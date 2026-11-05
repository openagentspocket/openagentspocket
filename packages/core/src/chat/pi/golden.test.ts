// Differential test: every Pi and Oh My Pi transcript in packages/core/goldens/{pi,omp} is fed to the
// reducer and each activity projection must equal the Swift golden (goldens/README.md "JSON encoding").

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { goldenImage } from '../golden-image';
import { frameLines } from '../model/lines';
import { type ChatAgentActivity, projectionContext } from '../model/types';
import { PiTranscriptReducer } from './reducer';

const ACTIVITIES: ChatAgentActivity[] = ['unknown', 'idle', 'working', 'blocked'];

interface Golden {
  fixture: string;
  reducer: { program: 'pi' | 'omp' };
  lineOffsets: number[];
  unsupportedFormat: string | null;
  projections: Record<ChatAgentActivity, unknown>;
}

describe.each(['pi', 'omp'] as const)('%s transcript goldens', (program) => {
  const directory = join(__dirname, `../../../goldens/${program}/transcripts`);
  const goldens = readdirSync(directory).filter((name) => name.endsWith('.golden.json'));

  it('finds the fixtures', () => {
    expect(goldens.length).toBeGreaterThanOrEqual(1);
  });

  for (const name of goldens) {
    const golden = JSON.parse(readFileSync(join(directory, name), 'utf8')) as Golden;
    describe(golden.fixture, () => {
      const lines = frameLines(new Uint8Array(readFileSync(join(directory, golden.fixture))));
      const reducer = new PiTranscriptReducer(golden.reducer.program);
      reducer.append(lines);

      it('frames the same lines', () => {
        expect(lines.map((line) => line.offset)).toEqual(golden.lineOffsets);
      });

      it('reads a supported format', () => {
        expect(reducer.unsupportedFormat).toBe(golden.unsupportedFormat);
      });

      for (const activity of ACTIVITIES) {
        it(`projects ${activity}`, () => {
          const transcript = reducer.transcript(projectionContext({ activity }));
          expect(goldenImage(transcript)).toEqual(golden.projections[activity]);
        });
      }
    });
  }
});
