import { renderHook } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { useIncomingLinks } from './useIncomingLinks';

const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ navigate: mockNavigate }) }));

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
});
