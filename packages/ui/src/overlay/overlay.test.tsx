import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { Text } from 'react-native';
import {
  ActionMenu,
  ActionMenuButton,
  confirm,
  OverlayHost,
  Sheet,
  ThemeProvider,
  TOAST_DEFAULT_MS,
  toast,
} from '../index';
import { renderThemed } from '../test-utils';
import { themes } from '../theme/tokens.generated';
import { NativeActionMenu, NativePreviewMenu } from './NativeActionMenu';

const calls: Record<string, Record<string, unknown>[]> = { Host: [], Menu: [], Button: [] };
function FakeHost(props: Record<string, unknown>) {
  calls.Host?.push(props);
  return <>{props.children as React.ReactNode}</>;
}
function FakeMenu(props: Record<string, unknown>) {
  calls.Menu?.push(props);
  return <>{props.children as React.ReactNode}</>;
}
function FakeButton(props: Record<string, unknown>) {
  calls.Button?.push(props);
  return null;
}

/** Calls confirm() inside act, since it updates the mounted host; boxed so awaiting does not wait for the answer. */
async function ask<T>(run: () => Promise<T>): Promise<{ answer: Promise<T> }> {
  const box: { answer?: Promise<T> } = {};
  await act(async () => {
    box.answer = run();
  });
  if (!box.answer) throw new Error('confirm() was not called');
  return { answer: box.answer };
}

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

describe('Sheet', () => {
  it('shows its title and body, and closes from the close button and the backdrop', async () => {
    const onClose = jest.fn();
    await renderThemed(
      <Sheet visible title="Usage" onClose={onClose}>
        <Text>body</Text>
      </Sheet>,
    );
    expect(screen.getByRole('header', { name: 'Usage' })).toBeTruthy();
    expect(screen.getByText('body')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    await fireEvent.press(screen.getByTestId('sheet-backdrop', { includeHiddenElements: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('presents confirm() inside itself while open, once', async () => {
    await renderThemed(
      <>
        <OverlayHost />
        <Sheet visible title="Usage" onClose={() => {}}>
          <Text>body</Text>
        </Sheet>
      </>,
    );
    const { answer } = await ask(() => confirm({ title: 'Refresh now?', confirmLabel: 'Refresh' }));
    expect(await screen.findAllByText('Refresh now?')).toHaveLength(1);
    expect(within(screen.getByTestId('sheet-host')).getByText('Refresh now?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Refresh' }));
    await expect(answer).resolves.toBe(true);
  });

  it('renders nothing while hidden', async () => {
    await renderThemed(
      <Sheet visible={false} title="Usage" onClose={() => {}}>
        <Text>body</Text>
      </Sheet>,
    );
    expect(screen.queryByText('body')).toBeNull();
  });
});

describe('ActionMenu', () => {
  it('runs an item after closing, and skips disabled items', async () => {
    const onClose = jest.fn();
    const onRename = jest.fn();
    const onOff = jest.fn();
    await renderThemed(
      <ActionMenu
        visible
        title="Agent"
        onClose={onClose}
        items={[
          { key: 'rename', title: 'Rename', onPress: onRename },
          { key: 'off', title: 'Off', disabled: true, onPress: onOff },
        ]}
      />,
    );
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Off' }));
    expect(onOff).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Rename' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('presents the system menu on iOS instead of the JS button', async () => {
    await renderThemed(
      <ActionMenuButton
        accessibilityLabel="More"
        items={[{ key: 'pin', title: 'Pin', onPress: () => {} }]}
      />,
    );
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
    expect(screen.getByTestId('menu-button')).toBeTruthy();
  });

  it('opens from a header button and runs the chosen item', async () => {
    const onPin = jest.fn();
    await renderThemed(
      <ActionMenuButton
        native={false}
        accessibilityLabel="More"
        items={[{ key: 'pin', title: 'Pin', onPress: onPin }]}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'More' }));
    await fireEvent.press(await screen.findByRole('menuitem', { name: 'Pin' }));
    await waitFor(() => expect(onPin).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('menuitem', { name: 'Pin' })).toBeNull();
  });

  it('maps items onto SwiftUI Menu and Button props', async () => {
    calls.Host = [];
    calls.Menu = [];
    calls.Button = [];
    const onPin = jest.fn();
    const onOff = jest.fn();
    await renderThemed(
      <NativeActionMenu
        ui={{ Host: FakeHost, Menu: FakeMenu, Button: FakeButton }}
        accessibilityLabel="More"
        icon="more"
        testID="nm"
        items={[
          { key: 'pin', title: 'Pin', checked: true, onPress: onPin },
          { key: 'del', title: 'Delete', destructive: true, onPress: () => {} },
          { key: 'off', title: 'Off', disabled: true, onPress: onOff },
        ]}
      />,
    );
    expect(calls.Host?.[0]?.seedColor).toBe(themes.indigo.colors.accent);
    expect(calls.Menu).toHaveLength(1);
    expect(calls.Menu?.[0]?.label).toBe('More');
    const [pin, del, off] = calls.Button ?? [];
    expect(pin?.systemImage).toBe('checkmark');
    expect(pin?.role).toBeUndefined();
    expect(del?.role).toBe('destructive');
    expect(off?.disabled).toBe(true);
    expect(off?.onPress).toBeUndefined();
    const press = pin?.onPress as (() => void) | undefined;
    press?.();
    expect(onPin).toHaveBeenCalled();
  });
});

describe('ActionMenu preview', () => {
  const items = [
    { key: 'pin', title: 'Pin', icon: 'pin' as const, onPress: jest.fn() },
    { key: 'close', title: 'Close', destructive: true, onPress: jest.fn() },
  ];

  it('lifts the preview above the items and runs an item after closing', async () => {
    jest.useFakeTimers();
    const onClose = jest.fn();
    await renderThemed(
      <ActionMenu visible inline preview={<Text>card</Text>} items={items} onClose={onClose} />,
    );
    expect(screen.getByTestId('action-menu-preview', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText('card', { includeHiddenElements: true })).toBeTruthy();
    await fireEvent.press(screen.getByTestId('action-menu-pin'));
    expect(onClose).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('keeps the plain popover without a preview', async () => {
    await renderThemed(<ActionMenu visible items={items} onClose={jest.fn()} />);
    expect(screen.queryByTestId('action-menu-preview')).toBeNull();
  });

  it('NativePreviewMenu puts the card in the context menu preview slot', async () => {
    const slots: string[] = [];
    const slot = (name: string) =>
      function Slot({ children }: { children: React.ReactNode }) {
        slots.push(name);
        return <>{children}</>;
      };
    const ContextMenu = Object.assign(FakeMenu, {
      Trigger: slot('trigger'),
      Preview: slot('preview'),
      Items: slot('items'),
    });
    await renderThemed(
      <NativePreviewMenu
        ui={{ Host: FakeHost, Menu: FakeMenu, Button: FakeButton, ContextMenu }}
        items={items}
        preview={<Text>card</Text>}
      >
        <Text>trigger</Text>
      </NativePreviewMenu>,
    );
    expect(slots).toEqual(['trigger', 'preview', 'items']);
  });
});
