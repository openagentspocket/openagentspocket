import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { Dimensions, StyleSheet, Text } from 'react-native';
import {
  ActionMenu,
  ActionMenuButton,
  confirm,
  OverlayHost,
  prompt,
  Sheet,
  ThemeProvider,
  TOAST_DEFAULT_MS,
  toast,
} from '../index';
import { ask, renderThemed } from '../test-utils';
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

const slotLog: string[] = [];
function makeSlot(name: string) {
  return ({ children }: { children: React.ReactNode }) => {
    slotLog.push(name);
    return <>{children}</>;
  };
}
const TriggerSlot = makeSlot('trigger');
const PreviewSlot = makeSlot('preview');
const ItemsSlot = makeSlot('items');

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

  it('fades its scrim and only slides the panel', async () => {
    await renderThemed(
      <Sheet visible title="Usage" onClose={() => {}}>
        <Text>body</Text>
      </Sheet>,
    );
    const scrim = StyleSheet.flatten(
      screen.getByTestId('sheet-backdrop', { includeHiddenElements: true }).parent?.props.style,
    );
    const panel = StyleSheet.flatten(screen.getByTestId('sheet').props.style);
    expect(scrim).toHaveProperty('opacity');
    expect(scrim.transform).toBeUndefined();
    expect(panel.transform?.[0]).toHaveProperty('translateY');
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

  it('keeps a long menu inside the window, scrolling past its room', async () => {
    const items = Array.from({ length: 30 }, (_, index) => ({
      key: `k${index}`,
      title: `Item ${index}`,
      subtitle: 'Esc',
      onPress: () => {},
    }));
    await renderThemed(<ActionMenu visible onClose={() => {}} items={items} />);
    expect(screen.getByTestId('action-menu-scroll')).toBeTruthy();
    const { maxHeight } = StyleSheet.flatten(screen.getByTestId('action-menu').props.style);
    expect(maxHeight).toBeGreaterThan(0);
    expect(maxHeight).toBeLessThanOrEqual(Dimensions.get('window').height);
  });

  it('presents the system menu on iOS when asked to', async () => {
    await renderThemed(
      <ActionMenuButton
        native
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

  it('a short item title keeps its full wording for screen readers', async () => {
    await renderThemed(
      <ActionMenuButton
        native={false}
        accessibilityLabel="More"
        items={[
          { key: 'pr', title: 'PR', accessibilityLabel: 'Open Pull Request', onPress: () => {} },
        ]}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'More' }));
    expect(await screen.findByRole('menuitem', { name: 'Open Pull Request' })).toBeTruthy();
  });

  it('maps items onto SwiftUI Menu and Button props', async () => {
    calls.Host = [];
    calls.Menu = [];
    calls.Button = [];
    const onPin = jest.fn();
    const onOff = jest.fn();
    await renderThemed(
      <NativeActionMenu
        ui={{
          Host: FakeHost,
          Menu: FakeMenu,
          Button: FakeButton,
          modifiers: {
            labelStyle: (style) => style,
            accessibilityLabel: (label) => `a11y:${label}`,
          },
        }}
        accessibilityLabel="More"
        icon="more"
        testID="nm"
        items={[
          { key: 'pin', title: 'Pin', checked: true, onPress: onPin },
          {
            key: 'del',
            title: 'Delete',
            accessibilityLabel: 'Delete Everything',
            destructive: true,
            onPress: () => {},
          },
          { key: 'off', title: 'Off', disabled: true, onPress: onOff },
        ]}
      />,
    );
    expect(calls.Host?.[0]?.seedColor).toBe(themes.indigo.colors.accent);
    expect(calls.Menu).toHaveLength(1);
    expect(calls.Menu?.[0]?.label).toBe('More');
    // The trigger is the symbol alone: its label must not be drawn as text.
    expect(calls.Menu?.[0]?.modifiers).toEqual(['iconOnly', 'a11y:More']);
    const [pin, del, off] = calls.Button ?? [];
    expect(pin?.systemImage).toBe('checkmark');
    expect(pin?.role).toBeUndefined();
    expect(del?.role).toBe('destructive');
    // A short title keeps its full wording for VoiceOver.
    expect(del?.modifiers).toEqual(['a11y:Delete Everything']);
    expect(pin?.modifiers).toBeUndefined();
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
    slotLog.length = 0;
    const slots = slotLog;
    const ContextMenu = Object.assign(FakeMenu, {
      Trigger: TriggerSlot,
      Preview: PreviewSlot,
      Items: ItemsSlot,
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
