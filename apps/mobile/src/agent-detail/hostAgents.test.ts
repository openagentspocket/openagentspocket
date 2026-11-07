import type { ConsoleRow } from '@openagentspocket/core';
import { hostAgentItems, otherAgentBlocked } from './hostAgents';

const row = (hostId: string, pane: string, status: string) =>
  ({
    hostId,
    agent: { pane_id: pane, agent_status: status, agent: 'codex', name: pane },
  }) as unknown as ConsoleRow;

describe('hostAgentItems', () => {
  const here = row('a', 'p1', 'working');
  const rows = [here, row('a', 'p2', 'blocked'), row('b', 'p3', 'idle')];

  it("lists the Host's Agents only, with the current one checked", () => {
    const items = hostAgentItems(rows, here, jest.fn());
    expect(items.map((item) => item.key)).toEqual(['p1', 'p2']);
    expect(items.map((item) => item.checked)).toEqual([true, false]);
    expect(items[0]?.subtitle).not.toBe(items[1]?.subtitle);
  });

  it('has nothing to offer an Agent alone on its Host', () => {
    expect(hostAgentItems([here, row('b', 'p3', 'idle')], here, jest.fn())).toEqual([]);
  });
});

describe('otherAgentBlocked', () => {
  const here = row('a', 'p1', 'blocked');

  it('ignores the current Agent and other Hosts', () => {
    expect(otherAgentBlocked([here, row('b', 'p3', 'blocked')], here)).toBe(false);
  });

  it('sees another Blocked Agent of the Host', () => {
    expect(otherAgentBlocked([here, row('a', 'p2', 'blocked')], here)).toBe(true);
  });
});
