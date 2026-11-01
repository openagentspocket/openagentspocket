import { describe, expect, it } from 'vitest';
import { type ConsoleAgent, consoleSorted, groupForHome } from './agents';
import { FakeTransport } from './fake-transport';

const agent = (over: Partial<ConsoleAgent>): ConsoleAgent => ({
  hostId: 'h',
  hostName: 'H',
  paneId: 'p',
  name: 'a',
  status: 'idle',
  ...over,
});

describe('consoleSorted', () => {
  it('puts blocked first, then done, working, idle, unknown', () => {
    const sorted = consoleSorted(
      (['unknown', 'idle', 'working', 'done', 'blocked'] as const).map((status) =>
        agent({ status, paneId: status }),
      ),
    );
    expect(sorted.map((a) => a.status)).toEqual(['blocked', 'done', 'working', 'idle', 'unknown']);
  });

  it('orders the same status by Host, then newest state change', () => {
    const sorted = consoleSorted([
      agent({ paneId: 'old', stateChangeSeq: 1 }),
      agent({ paneId: 'new', stateChangeSeq: 5 }),
      agent({ paneId: 'other', hostName: 'A', hostId: 'a' }),
    ]);
    expect(sorted.map((a) => a.paneId)).toEqual(['other', 'new', 'old']);
  });

  it('does not mutate its input', () => {
    const input = [agent({ status: 'working' }), agent({ status: 'blocked' })];
    consoleSorted(input);
    expect(input[0]?.status).toBe('working');
  });
});

describe('groupForHome', () => {
  it('splits the demo Agents into sections and drops idle ones', async () => {
    const agents = await new FakeTransport().listAgents();
    const groups = groupForHome([...agents, agent({ status: 'idle', paneId: 'z' })]);
    expect(groups.needsYou).toHaveLength(1);
    expect(groups.working).toHaveLength(2);
    expect(groups.done).toHaveLength(1);
  });
});
