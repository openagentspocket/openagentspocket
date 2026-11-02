import { renderHook, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { resetInitialUrlRouting, useIncomingLinks } from './useIncomingLinks';

const mockNavigate = jest.fn();
let mockNavState: { key: string } | undefined = { key: 'root' };
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate }),
  useRootNavigationState: () => mockNavState,
}));

beforeEach(() => {
  mockNavigate.mockClear();
  jest.mocked(Linking.getInitialURL).mockClear?.();
  mockNavState = { key: 'root' };
  resetInitialUrlRouting();
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
});

describe('useIncomingLinks', () => {
  it('routes a link that arrives while the app runs and stops listening on unmount', async () => {
    let listener: ((event: { url: string }) => void) | undefined;
    const remove = jest.fn();
    jest.spyOn(Linking, 'addEventListener').mockImplementation(((_: string, next: never) => {
      listener = next;
      return { remove };
    }) as never);
    const view = await renderHook(() => useIncomingLinks());
    listener?.({ url: 'openagentspocket:///hosts' });
    expect(mockNavigate).toHaveBeenCalledWith('/hosts');
    await view.unmount();
    expect(remove).toHaveBeenCalled();
  });

  it('routes the cold-start URL once the navigator is ready, and only once', async () => {
    const initial = jest.spyOn(Linking, 'getInitialURL');
    initial.mockClear();
    initial.mockResolvedValue('openagentspocket:///hosts');
    mockNavState = undefined;
    const view = await renderHook(() => useIncomingLinks());
    expect(initial).not.toHaveBeenCalled();
    mockNavState = { key: 'root' };
    await view.rerender({});
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/hosts'));
    await view.rerender({});
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('leaves a plain launch on Home', async () => {
    await renderHook(() => useIncomingLinks());
    await waitFor(() => expect(Linking.getInitialURL).toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
