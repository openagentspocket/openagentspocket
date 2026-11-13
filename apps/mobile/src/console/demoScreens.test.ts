import { DemoConsoleTransport } from './demo';

const READ = { source: 'recent', lines: 40, stripAnsi: true } as const;

describe('the demo Host', () => {
  it('shows each Agent its own screen', async () => {
    const transport = new DemoConsoleTransport();
    const snapshot = await transport.sessionSnapshot();
    const screens = await Promise.all(
      snapshot.agents.map((agent) => transport.readPane({ paneId: agent.pane_id, ...READ })),
    );
    expect(snapshot.agents.length).toBeGreaterThan(1);
    expect(new Set(screens.map((screen) => screen.text)).size).toBe(snapshot.agents.length);
  });

  it('keeps the question only on the Blocked Agent', async () => {
    const transport = new DemoConsoleTransport();
    const snapshot = await transport.sessionSnapshot();
    for (const agent of snapshot.agents) {
      const { text } = await transport.readPane({ paneId: agent.pane_id, ...READ });
      expect(text.includes('?')).toBe(agent.agent_status === 'blocked');
    }
  });
});
