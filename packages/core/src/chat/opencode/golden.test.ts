// Differential test: every OpenCode transcript in packages/core/goldens/opencode is fed to the
// reducer and each activity projection must equal the Swift golden (goldens/README.md).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { goldenImage } from '../golden-image';
import type { ChatLine } from '../model/lines';
import { type ChatAgentActivity, projectionContext } from '../model/types';
import { OpenCodeTranscriptReducer } from './reducer';

const DIRECTORY = join(__dirname, '../../../goldens/opencode/transcripts');
const ACTIVITIES: ChatAgentActivity[] = ['unknown', 'idle', 'working', 'blocked'];

interface Golden {
  fixture: string;
  lineOffsets: number[];
  unsupportedFormat: string | null;
  projections: Record<ChatAgentActivity, unknown>;
}

/**
 * The lines the record source hands the reducer for `rows-<scenario>.jsonl`: each row at its `seq`,
 * the session and inbox lines at the read offset past the store's event counter.
 */
function linesOf(fixture: string): ChatLine[] {
  const scenario = fixture.replace(/^rows-/, '').replace(/\.jsonl$/, '');
  const store = JSON.parse(readFileSync(join(DIRECTORY, `store-${scenario}.json`), 'utf8')) as {
    event_seq: number | null;
  };
  const readOffset = Math.max(store.event_seq ?? 0, 0) + 1;
  const text = readFileSync(join(DIRECTORY, fixture), 'utf8');
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const data = new TextEncoder().encode(line);
      const value = JSON.parse(line) as { seq?: unknown };
      const offset = typeof value.seq === 'number' ? value.seq : readOffset;
      return { offset, length: data.length, data };
    });
}

const goldens = readdirSync(DIRECTORY).filter((name) => name.endsWith('.golden.json'));

describe('OpenCode transcript goldens', () => {
  it('finds the fixtures', () => {
    expect(goldens.length).toBe(18);
  });

  for (const name of goldens) {
    const golden = JSON.parse(readFileSync(join(DIRECTORY, name), 'utf8')) as Golden;
    describe(golden.fixture, () => {
      const lines = linesOf(golden.fixture);
      const reducer = new OpenCodeTranscriptReducer();
      reducer.append(lines);

      it('hands on the same offsets', () => {
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
