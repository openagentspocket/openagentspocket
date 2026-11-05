// Differential test: every Grok Build transcript in packages/core/goldens/grok is fed to the
// reducer and each activity projection must equal the Swift golden (goldens/README.md).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { goldenImage } from '../golden-image';
import { frameLines } from '../model/lines';
import { type ChatAgentActivity, projectionContext } from '../model/types';
import { GrokTranscriptReducer } from './reducer';

const DIRECTORY = join(__dirname, '../../../goldens/grok/transcripts');
const ACTIVITIES: ChatAgentActivity[] = ['unknown', 'idle', 'working', 'blocked'];

interface Golden {
  fixture: string;
  reducer: { transcriptPath: string };
  lineOffsets: number[];
  unsupportedFormat: string | null;
  projections: Record<ChatAgentActivity, unknown>;
}

const goldens = readdirSync(DIRECTORY).filter((name) => name.endsWith('.golden.json'));

describe('Grok Build transcript goldens', () => {
  it('finds the fixtures', () => {
    expect(goldens.length).toBe(12);
  });

  for (const name of goldens) {
    const golden = JSON.parse(readFileSync(join(DIRECTORY, name), 'utf8')) as Golden;
    describe(golden.fixture, () => {
      const lines = frameLines(new Uint8Array(readFileSync(join(DIRECTORY, golden.fixture))));
      const reducer = new GrokTranscriptReducer(golden.reducer.transcriptPath);
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
