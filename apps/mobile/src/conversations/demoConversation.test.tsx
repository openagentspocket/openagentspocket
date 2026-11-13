import { renderHook } from '@testing-library/react-native';
import { setDemoMode } from '@/connections/mode';
import { DemoConsoleTransport } from '@/console/demo';
import { demoConversation } from './demoConversation';
import { useConversation } from './useConversation';

afterEach(() => setDemoMode(undefined));

describe('the demo Host conversations', () => {
  it('gives every demo Agent a conversation to read', async () => {
    const snapshot = await new DemoConsoleTransport().sessionSnapshot();
    for (const agent of snapshot.agents) {
      const state = demoConversation('demo', agent.pane_id);
      expect(state?.snapshot.phase.type).toBe('following');
      expect(state?.snapshot.transcript.entries.length).toBeGreaterThan(0);
    }
  });

  it('shows the Codex Agent its conversation in demo mode, not an unreadable session', async () => {
    setDemoMode(true);
    const { result } = await renderHook(() => useConversation('demo', 'p2'));
    expect(result.current.state.snapshot.phase.type).toBe('following');
  });

  it('stays inert outside the demo, where no session is known', async () => {
    setDemoMode(false);
    const { result } = await renderHook(() => useConversation('demo', 'p2'));
    expect(result.current.state.snapshot.phase.type).toBe('unavailable');
  });
});
