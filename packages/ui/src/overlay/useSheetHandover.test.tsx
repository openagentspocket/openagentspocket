import { act, renderHook } from '@testing-library/react-native';
import { useHandoverSheet } from './useSheetHandover';

describe('useHandoverSheet', () => {
  it('runs a handover only after the sheet has left, keeping its value until then', async () => {
    const run = jest.fn();
    const { result } = await renderHook(() => useHandoverSheet<string>());
    await act(async () => result.current.open('row'));
    await act(async () => result.current.closeThen(run));
    expect(result.current.visible).toBe(false);
    expect(result.current.value).toBe('row');
    expect(run).not.toHaveBeenCalled();
    await act(async () => result.current.onDismissed());
    expect(run).toHaveBeenCalledTimes(1);
    expect(result.current.value).toBeUndefined();
  });

  it('runs at once when the sheet is not open, since no dismissal will come', async () => {
    const run = jest.fn();
    const { result } = await renderHook(() => useHandoverSheet());
    await act(async () => result.current.closeThen(run));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('a plain close runs nothing on dismissal', async () => {
    const run = jest.fn();
    const { result } = await renderHook(() => useHandoverSheet('start'));
    expect(result.current.visible).toBe(true);
    await act(async () => result.current.close());
    await act(async () => result.current.onDismissed());
    expect(run).not.toHaveBeenCalled();
  });
});
