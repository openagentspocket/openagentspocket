import { describe, expect, it } from 'vitest';
import { makeWorld, PANE, row, started, type World } from './coordinator-world.testkit';
import { openActivity } from './envelope';
import type { ActivityAsk } from './types';

describe('approval asks', () => {
  const ask: ActivityAsk = {
    episodeId: 'ep1',
    denyOnly: false,
    prompt: 'Proceed?',
    options: ['Yes', 'No'],
    timestamp: 1753305600,
  };
  const opened = (w: World, content: { envelope?: object } | undefined) =>
    openActivity({ ...content?.envelope } as never, w.keys.record('h1')?.key ?? new Uint8Array());

  it('a changed ask rebuilds the activity', async () => {
    const w = await makeWorld();
    await started(w, [row(PANE, 'blocked')]);
    w.state.asks.set(PANE, ask);
    w.coordinator.approvalAsksDidChange('h1');
    await w.settle();
    expect(opened(w, w.controller.updates.at(-1)?.content).agents[0]?.ask?.episodeId).toBe('ep1');
  });

  it('a tap result survives an unrelated update and a new episode starts without it', async () => {
    const w = await makeWorld();
    w.state.asks.set(PANE, ask);
    const id = await started(w, [row(PANE, 'blocked')]);
    const shown = w.controller.requested[0];
    expect(shown).toBeDefined();
    // The intent handler writes the result straight onto the activity.
    const key = w.keys.record('h1')?.key ?? new Uint8Array();
    const details = openActivity({ ...shown?.envelope } as never, key);
    const withResult = {
      counts: shown?.counts ?? { working: 0, blocked: 1, done: 0 },
      envelope: JSON.parse(
        JSON.stringify(
          // reseal through the public seal path with the result set
          (await import('./envelope')).sealActivity(
            {
              ...details,
              agents: details.agents.map((a) => ({
                ...a,
                ask: { ...ask, result: 'sent' as const },
              })),
            },
            key,
            new Uint8Array(12).fill(9),
          ),
        ),
      ),
    };
    w.controller.setContent(id, withResult);

    w.coordinator.agentsDidChange([row(PANE, 'blocked'), row('wV:p2', 'working')]);
    await w.settle();
    expect(opened(w, w.controller.updates.at(-1)?.content).agents[0]?.ask?.result).toBe('sent');

    w.state.asks.set(PANE, { ...ask, episodeId: 'ep2' });
    w.coordinator.approvalAsksDidChange('h1');
    await w.settle();
    expect(opened(w, w.controller.updates.at(-1)?.content).agents[0]?.ask?.result).toBeUndefined();
  });

  it('a result alone causes no update', async () => {
    const w = await makeWorld();
    w.state.asks.set(PANE, ask);
    await started(w, [row(PANE, 'blocked')]);
    w.coordinator.agentsDidChange([row(PANE, 'blocked')]);
    await w.settle();
    expect(w.controller.updates).toHaveLength(0);
  });
});
