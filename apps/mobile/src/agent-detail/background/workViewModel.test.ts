import {
  backgroundWorkItem,
  backgroundWorkOf,
  emptyTranscript,
  openableSubagentID,
  presentBackgroundWork,
} from '@openagentspocket/core';
import { openableItem } from './workViewModel';

const NOW = Date.parse('2026-11-13T12:00:00Z');

function rowsOf(state: 'running' | 'completed') {
  const items = [
    backgroundWorkItem({
      id: 'call-1',
      kind: 'subagent',
      title: 'Review notes',
      launchOffset: 1,
      launchedAt: new Date(NOW - 60_000).toISOString(),
      agentID: 'child-1',
      state,
      endOffset: state === 'running' ? null : 2,
    }),
  ];
  const transcript = { ...emptyTranscript(), backgroundWork: items };
  const work = backgroundWorkOf(transcript, {}, true, NOW);
  const { rows } = presentBackgroundWork(work, { isHostConnected: true, now: NOW, locale: 'en' });
  return { items, row: rows[0] };
}

function opens(program: string, state: 'running' | 'completed' = 'completed'): string | null {
  const { items, row } = rowsOf(state);
  if (!row) throw new Error('no row');
  let opened: string | null = null;
  const item = openableItem(
    row,
    (id) => openableSubagentID(items, id, program),
    (agentId) => {
      opened = agentId;
    },
  );
  item.onOpen?.();
  return item.onOpen ? opened : null;
}

describe('a Background Work row that opens a Subagent transcript', () => {
  it("opens a finished Subagent's transcript for a program that reads one", () => {
    expect(opens('claude')).toBe('child-1');
  });

  it('opens nothing for a program with no reader for it', () => {
    expect(opens('opencode')).toBeNull();
  });

  it('opens nothing while the Subagent runs', () => {
    expect(opens('claude', 'running')).toBeNull();
  });
});
