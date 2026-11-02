import { type FakeClock, HerdrApiError, type JsonObject } from '@openagentspocket/core';
import { utf8Decode, utf8Encode } from 'agentico-ssh';
import { describe, expect, it } from 'vitest';
import { isShellReadinessRefusal, startAgent, startAgentInNewWorkspace } from './launch';
import { connected, methodOf, paramsOf } from './test-helpers';

const PANE = { pane_id: 'p1', tab_id: 't1', terminal_id: 'term1', workspace_id: 'w1' };
const AGENT = {
  pane_id: 'p1',
  tab_id: 't1',
  terminal_id: 'term1',
  workspace_id: 'w1',
  agent_status: 'working',
  focused: false,
  revision: 1,
};

interface Call {
  method: string;
  params: JsonObject;
}

/** herdr that creates a pane, then answers `agent.start` from `startAnswers` in turn. */
async function herdr(startAnswers: ({ code: string; message: string } | 'ok')[]) {
  const calls: Call[] = [];
  const queue = [...startAnswers];
  const { transport, settings } = await connected((_s, request) => {
    const method = methodOf(request);
    calls.push({ method, params: paramsOf(request) });
    const { id } = JSON.parse(utf8Decode(request)) as { id: string };
    const line = (body: object) => utf8Encode(`${JSON.stringify({ id, ...body })}\n`);
    if (method === 'agent.start') {
      const answer = queue.shift() ?? 'ok';
      return answer === 'ok'
        ? line({ result: { type: 'agent_started', agent: AGENT, argv: [] } })
        : line({ error: answer });
    }
    if (method === 'tab.create')
      return line({ result: { type: 'tab_created', tab: { tab_id: 't1' }, root_pane: PANE } });
    if (method === 'workspace.create') {
      return line({
        result: {
          type: 'workspace_created',
          workspace: { workspace_id: 'w1' },
          tab: { tab_id: 't1' },
          root_pane: PANE,
        },
      });
    }
    return line({ result: { type: 'ok' } });
  });
  return { transport, clock: settings.clock as FakeClock, calls };
}

const LAUNCH = { kind: 'claude', name: 'claude', cwd: '/work', arguments: ['--x'] };

describe('starting an Agent', () => {
  it('creates a pane in a fresh tab, then starts the agent in it', async () => {
    const { transport, clock, calls } = await herdr(['ok']);
    const agent = await startAgent(transport, clock, LAUNCH);
    expect(agent.pane_id).toBe('p1');
    expect(calls.map((c) => c.method)).toEqual(['tab.create', 'agent.start']);
    expect(calls[1]?.params).toMatchObject({ pane_id: 'p1', kind: 'claude', args: ['--x'] });
  });

  it('resends while the pane shell is busy, then succeeds', async () => {
    const { transport, clock, calls } = await herdr([
      { code: 'agent_pane_busy', message: 'busy' },
      { code: 'agent_start_input_failed', message: 'line too long for canonical mode' },
      'ok',
    ]);
    const started = startAgent(transport, clock, LAUNCH);
    for (let n = 0; n < 4; n += 1) await clock.advance(500);
    expect((await started).pane_id).toBe('p1');
    expect(calls.filter((c) => c.method === 'agent.start')).toHaveLength(3);
  });

  it('closes the pane it created when the refusal is final, and rethrows it', async () => {
    const { transport, clock, calls } = await herdr([
      { code: 'agent_kind_unknown', message: 'no' },
    ]);
    await expect(startAgent(transport, clock, LAUNCH)).rejects.toMatchObject({
      code: 'agent_kind_unknown',
    });
    expect(calls.map((c) => c.method)).toEqual(['tab.create', 'agent.start', 'pane.close']);
  });

  it('gives up after the readiness budget with the last refusal', async () => {
    const busy = { code: 'agent_pane_busy', message: 'busy' };
    const { transport, clock, calls } = await herdr(Array.from({ length: 40 }, () => busy));
    const started = startAgent(transport, clock, LAUNCH);
    started.catch(() => undefined);
    for (let n = 0; n < 30; n += 1) await clock.advance(500);
    await expect(started).rejects.toMatchObject({ code: 'agent_pane_busy' });
    expect(calls.at(-1)?.method).toBe('pane.close');
  });

  it('removes a new workspace when its agent cannot start, and names the tab otherwise', async () => {
    const failing = await herdr([{ code: 'agent_kind_unknown', message: 'no' }]);
    await expect(
      startAgentInNewWorkspace(failing.transport, failing.clock, LAUNCH, { directory: '/work' }),
    ).rejects.toMatchObject({ code: 'agent_kind_unknown' });
    expect(failing.calls.at(-1)).toMatchObject({
      method: 'workspace.close',
      params: { workspace_id: 'w1' },
    });

    const ok = await herdr(['ok']);
    await startAgentInNewWorkspace(ok.transport, ok.clock, { ...LAUNCH, tabLabel: 'Agent' }, {});
    expect(ok.calls.at(-1)).toMatchObject({ method: 'tab.rename', params: { label: 'Agent' } });
  });
});

describe('isShellReadinessRefusal', () => {
  it('retries busy panes and the canonical-mode refusal only', () => {
    expect(isShellReadinessRefusal(new HerdrApiError('agent_pane_busy', ''))).toBe(true);
    expect(
      isShellReadinessRefusal(new HerdrApiError('agent_start_input_failed', 'in canonical mode')),
    ).toBe(true);
    expect(isShellReadinessRefusal(new HerdrApiError('agent_start_input_failed', 'other'))).toBe(
      false,
    );
  });
});
