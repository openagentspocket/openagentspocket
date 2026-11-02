// Differential test: every Claude transcript in packages/core/goldens/claude is fed to the
// reducer and each activity projection must equal the Swift golden. The only mapping is the one
// goldens/README.md describes: enum payloads as `{case: payload}`, Sets as sorted arrays.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { goldenImage } from '../golden-image';
import { frameLines } from '../model/lines';
import type { ChatAgentActivity } from '../model/types';
import { projectionContext } from '../model/types';
import type { ClaudeRole } from './chain';
import { ClaudeTranscriptReducer } from './reducer';

const DIRECTORY = join(__dirname, '../../../goldens/claude/transcripts');
const ACTIVITIES: ChatAgentActivity[] = ['unknown', 'idle', 'working', 'blocked'];

interface Golden {
  fixture: string;
  reducer: { role: ClaudeRole };
  lineOffsets: number[];
  unsupportedFormat: string | null;
  projections: Record<ChatAgentActivity, unknown>;
}

const goldens = readdirSync(DIRECTORY).filter((name) => name.endsWith('.golden.json'));

describe('Claude transcript goldens', () => {
  it('finds the fixtures', () => {
    expect(goldens.length).toBeGreaterThanOrEqual(4);
  });

  for (const name of goldens) {
    const golden = JSON.parse(readFileSync(join(DIRECTORY, name), 'utf8')) as Golden;
    describe(golden.fixture, () => {
      const lines = frameLines(new Uint8Array(readFileSync(join(DIRECTORY, golden.fixture))));
      const reducer = new ClaudeTranscriptReducer(golden.reducer.role);
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
