import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { Dimensions, StyleSheet, Text } from 'react-native';
import { confirm, OverlayHost, prompt, ThemeProvider, TOAST_DEFAULT_MS, toast } from '../index';
import { ask, renderThemed } from '../test-utils';

describe('confirm()', () => {
  it('resolves true when confirmed and false when cancelled', async () => {
    await renderThemed(<OverlayHost />);
    let { answer } = await ask(() => confirm({ title: 'Reconnect?', confirmLabel: 'Reconnect' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Reconnect' }));
    await expect(answer).resolves.toBe(true);

    ({ answer } = await ask(() => confirm({ title: 'Reconnect?', confirmLabel: 'Reconnect' })));
    await fireEvent.press(await screen.findByRole('button', { name: 'Cancel' }));
    await expect(answer).resolves.toBe(false);
    expect(screen.queryByText('Reconnect?')).toBeNull();
  });

  it('prompt() resolves the edited text in a centered alert, or null on cancel', async () => {
    await renderThemed(<OverlayHost />);
    let { answer } = await ask(() =>
      prompt({ title: 'Rename', initial: 'a.txt', confirmLabel: 'Rename' }),
    );
    expect(screen.getByTestId('alert-alert')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('alert-field'), 'b.txt');
    await fireEvent.press(screen.getByTestId('alert-action-confirm'));
    await expect(answer).resolves.toBe('b.txt');

    ({ answer } = await ask(() => prompt({ title: 'Rename', initial: 'a.txt' })));
    await fireEvent.press(screen.getByTestId('alert-cancel'));
    await expect(answer).resolves.toBeNull();
  });

  it('draws a destructive action and a title header in an alert', async () => {
    await renderThemed(<OverlayHost />);
    await ask(() =>
      confirm({ title: 'Delete this Host?', confirmLabel: 'Delete', destructive: true }),
    );
    expect(await screen.findByTestId('alert-alert')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Delete this Host?' })).toBeTruthy();
    expect(screen.getByTestId('alert-action-confirm')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('alert-cancel'));
  });

  it('resolves the chosen key of a dialog, or null on cancel', async () => {
    await renderThemed(<OverlayHost />);
    const actions = [
      { key: 'close', title: 'Close', destructive: true },
      { key: 'detach', title: 'Detach only' },
    ] as const;
    let { answer } = await ask(() => confirm({ title: 'Close the Agent?', actions }));
    expect(await screen.findByTestId('alert-dialog')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Detach only' }));
    await expect(answer).resolves.toBe('detach');

    ({ answer } = await ask(() => confirm({ title: 'Close the Agent?', actions })));
    await fireEvent.press(await screen.findByRole('button', { name: 'Cancel' }));
    await expect(answer).resolves.toBeNull();
  });

  it('shows requests one at a time, in order', async () => {
    await renderThemed(<OverlayHost />);
    const { answer: first } = await ask(() => confirm({ title: 'First', confirmLabel: 'One' }));
    const { answer: second } = await ask(() => confirm({ title: 'Second', confirmLabel: 'Two' }));
    expect(await screen.findByText('First')).toBeTruthy();
    expect(screen.queryByText('Second')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'One' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Two' }));
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
  });

  it('has no cancel button for an informational alert', async () => {
    await renderThemed(<OverlayHost />);
    const { answer } = await ask(() => confirm({ title: 'Copied', cancelLabel: null }));
    await screen.findByText('Copied');
    expect(screen.queryByTestId('alert-cancel')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'OK' }));
    await expect(answer).resolves.toBe(true);
  });

  it('answers cancel and warns when no host is mounted', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(confirm({ title: 'Nobody home' })).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('draws in the most recently mounted host only', async () => {
    await renderThemed(
      <>
        <OverlayHost />
        <ThemeProvider themeId="papel">
          <OverlayHost />
        </ThemeProvider>
      </>,
    );
    await ask(() => confirm({ title: 'Once', confirmLabel: 'Fine' }));
    expect(await screen.findAllByText('Once')).toHaveLength(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Fine' }));
  });
});

describe('toast()', () => {
  afterEach(() => jest.useRealTimers());

  it('shows the head of the queue and dismisses it after its duration', async () => {
    jest.useFakeTimers();
    await renderThemed(<OverlayHost />);
    await act(async () => {
      toast({ title: 'Sent', message: 'To the Agent' });
      toast({ title: 'Second' });
    });
    expect(screen.getByRole('alert', { name: 'Sent, To the Agent' })).toBeTruthy();
    expect(screen.queryByText('Second')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(TOAST_DEFAULT_MS);
    });
    expect(screen.queryByText('Sent')).toBeNull();
    expect(screen.getByText('Second')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(TOAST_DEFAULT_MS);
    });
  });

  it('runs its action and dismisses on tap; the returned function dismisses early', async () => {
    await renderThemed(<OverlayHost />);
    const onPress = jest.fn();
    await act(async () => {
      toast({ title: 'Agent needs you', onPress, durationMs: 0 });
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Agent needs you' }));
    expect(onPress).toHaveBeenCalled();
    expect(screen.queryByText('Agent needs you')).toBeNull();

    let dismiss = () => {};
    await act(async () => {
      dismiss = toast({ title: 'Sticky', durationMs: 0 });
    });
    expect(screen.getByText('Sticky')).toBeTruthy();
    await act(async () => dismiss());
    expect(screen.queryByText('Sticky')).toBeNull();
  });
});
