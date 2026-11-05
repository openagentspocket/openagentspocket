import { renderHook, waitFor } from '@testing-library/react-native';
import { setRowChangesFactory } from './rowChanges';
import { useGitStatus } from './useGitStatus';

afterEach(() => setRowChangesFactory(undefined));

describe('useGitStatus', () => {
  it('reads the demo Checkout of a directory once it settles', async () => {
    const { result } = await renderHook(() => useGitStatus('demo', '/work/api-server', 'p1'));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current?.branch).toBe('migrate-db'), { timeout: 3000 });
    expect(result.current).toMatchObject({
      diff: { added: 12, removed: 7 },
      ahead: 2,
      untracked: 2,
    });
  });

  it('reads nothing for an Agent without a directory', async () => {
    const { result } = await renderHook(() => useGitStatus('demo', undefined));
    expect(result.current).toBeNull();
  });
});
