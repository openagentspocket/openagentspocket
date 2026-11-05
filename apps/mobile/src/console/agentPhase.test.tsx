import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { createDemoConsoleStore } from './demo';
import { ConsoleStoreProvider, useAgentPhase } from './hooks';

function setup() {
  const store = createDemoConsoleStore();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ConsoleStoreProvider store={store}>{children}</ConsoleStoreProvider>
  );
  return { store, wrapper };
}

describe('useAgentPhase', () => {
  it('is live for a listed Agent, gone for one a fresh snapshot lacks, unknown for a Host with none', async () => {
    const { store, wrapper } = setup();
    const live = await renderHook(() => useAgentPhase('demo', 'p1'), { wrapper });
    const missing = await renderHook(() => useAgentPhase('demo', 'zz'), { wrapper });
    const noHost = await renderHook(() => useAgentPhase('nope', 'p1'), { wrapper });
    await waitFor(() => expect(live.result.current.phase).toBe('live'));
    expect(missing.result.current.phase).toBe('gone');
    expect(noHost.result.current.phase).toBe('unknown');
    store.removeHost('demo');
  });

  it('keeps the Agent, stale, while the Host is stopped and live again after the fresh snapshot', async () => {
    const { store, wrapper } = setup();
    const { result } = await renderHook(() => useAgentPhase('demo', 'p1'), { wrapper });
    await waitFor(() => expect(result.current.phase).toBe('live'));
    await act(async () => {
      await store.stopConnecting('demo');
    });
    await waitFor(() => expect(result.current.phase).toBe('stale'));
    expect(result.current.row?.agent.pane_id).toBe('p1');
    expect(store.getState().rows.length).toBeGreaterThan(0);
    expect(store.getState().hosts[0]?.isStale).toBe(true);
    await act(async () => {
      await store.retry('demo');
    });
    await waitFor(() => expect(result.current.phase).toBe('live'));
    expect(store.getState().hosts[0]?.isStale).toBe(false);
    store.removeHost('demo');
  });
});
