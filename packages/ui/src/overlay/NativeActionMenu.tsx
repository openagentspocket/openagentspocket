import { useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import { iconSymbol } from '../primitives/Icon';
import { useTheme } from '../theme/theme';
import type { ActionMenuItem } from './ActionMenu';
import { groupMenuItems } from './menuGroups';

interface SwiftUiMenu {
  Host: React.ComponentType<Record<string, unknown>>;
  Menu: React.ComponentType<Record<string, unknown>>;
  Button: React.ComponentType<Record<string, unknown>>;
  Section?: React.ComponentType<Record<string, unknown>>;
  /** Modifier builders from `@expo/ui/swift-ui/modifiers`. */
  modifiers?: {
    labelStyle: (style: 'iconOnly') => unknown;
    accessibilityLabel: (label: string) => unknown;
  };
  ContextMenu?: React.ComponentType<Record<string, unknown>> & {
    Trigger: React.ComponentType<{ children: React.ReactNode }>;
    Preview: React.ComponentType<{ children: React.ReactNode }>;
    Items: React.ComponentType<{ children: React.ReactNode }>;
  };
}

let cached: SwiftUiMenu | null | undefined;

/** @expo/ui's SwiftUI menu pieces on iOS; null elsewhere or when the module is missing (tests, web). */
export function loadSwiftUi(): SwiftUiMenu | null {
  if (cached !== undefined) return cached;
  if (Platform.OS !== 'ios') {
    cached = null;
    return cached;
  }
  try {
    // Lazy so Android, web and Jest never evaluate the native module.
    const swift = require('@expo/ui/swift-ui') as SwiftUiMenu;
    cached = { ...swift, modifiers: loadModifiers() };
  } catch {
    cached = null;
  }
  return cached;
}

function loadModifiers(): SwiftUiMenu['modifiers'] {
  try {
    const { labelStyle, accessibilityLabel } = require('@expo/ui/swift-ui/modifiers');
    return { labelStyle, accessibilityLabel };
  } catch {
    return undefined;
  }
}

/** Forget the cached module (tests that toggle availability). */
export function resetNativeMenuCache() {
  cached = undefined;
}

/** What the system menu draws of the items: everything but the handlers. */
const drawnKey = (items: readonly ActionMenuItem[]): string =>
  JSON.stringify(
    items.map(({ key, title, icon, checked, destructive, disabled, section, subtitle }) => [
      key,
      title,
      icon,
      checked,
      destructive,
      disabled,
      section,
      subtitle,
    ]),
  );

/**
 * Items for the native menu that keep their identity while what they draw is unchanged. Callers
 * build their item lists inline on every render; handing the SwiftUI Host fresh children each time
 * made it rebuild (and re-send) the whole menu on every parent render, so opening it lagged.
 * Presses go to the latest handlers through a ref.
 */
function useStableItems(items: readonly ActionMenuItem[]): readonly ActionMenuItem[] {
  const latest = useRef(items);
  latest.current = items;
  const key = drawnKey(items);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for the drawn content of `items`
  return useMemo(
    () =>
      items.map((item) => ({
        ...item,
        onPress: () => latest.current.find((candidate) => candidate.key === item.key)?.onPress(),
      })),
    [key],
  );
}

function menuSections(ui: SwiftUiMenu, items: readonly ActionMenuItem[]) {
  const { Button, Section } = ui;
  return groupMenuItems(items).map((group) => {
    const buttons = group.items.map((item) => (
      <Button
        key={item.key}
        label={item.title}
        systemImage={item.checked ? 'checkmark' : item.icon ? iconSymbol(item.icon) : undefined}
        role={item.destructive ? 'destructive' : undefined}
        disabled={item.disabled}
        onPress={item.disabled ? undefined : item.onPress}
      />
    ));
    // A SwiftUI Section draws the divider (and the title) between groups.
    return Section ? (
      <Section key={group.items[0]?.key} title={group.title}>
        {buttons}
      </Section>
    ) : (
      buttons
    );
  });
}

interface NativePreviewMenuProps {
  ui: SwiftUiMenu;
  items: readonly ActionMenuItem[];
  /** The lifted card the system shows above the menu. */
  preview: React.ReactNode;
  /** The always-visible card that opens the menu on long press. */
  children: React.ReactNode;
  testID?: string;
}

/** True when the system context menu (with a lifted preview) is available. */
export function supportsNativePreview(ui: SwiftUiMenu | null): ui is SwiftUiMenu {
  return ui?.ContextMenu != null;
}

/** A long-press context menu whose preview is the card itself (SwiftUI contextMenu with preview). */
export function NativePreviewMenu({
  ui,
  items,
  preview,
  children,
  testID,
}: NativePreviewMenuProps) {
  const { Host, ContextMenu } = ui;
  const theme = useTheme();
  const stable = useStableItems(items);
  if (!ContextMenu) return <>{children}</>;
  return (
    <Host matchContents seedColor={theme.colors.accent} testID={testID}>
      <ContextMenu>
        <ContextMenu.Trigger>{children}</ContextMenu.Trigger>
        <ContextMenu.Preview>{preview}</ContextMenu.Preview>
        <ContextMenu.Items>{menuSections(ui, stable)}</ContextMenu.Items>
      </ContextMenu>
    </Host>
  );
}

const iconOnly = (modifiers: NonNullable<SwiftUiMenu['modifiers']>, label: string) => [
  modifiers.labelStyle('iconOnly'),
  modifiers.accessibilityLabel(label),
];

interface NativeActionMenuProps {
  ui: SwiftUiMenu;
  items: readonly ActionMenuItem[];
  title?: string;
  accessibilityLabel: string;
  icon: Parameters<typeof iconSymbol>[0];
  testID: string;
}

/** The same items as the JS ActionMenu, presented by the system (UIMenu). */
export function NativeActionMenu({
  ui,
  items,
  title,
  accessibilityLabel,
  icon,
  testID,
}: NativeActionMenuProps) {
  const { Host, Menu } = ui;
  const theme = useTheme();
  const stable = useStableItems(items);
  const accent = theme.colors.accent;
  // The whole element is memoized: a parent re-render with the same menu changes nothing natively.
  return useMemo(
    () => (
      <Host matchContents seedColor={accent} testID={testID}>
        <Menu
          label={title ?? accessibilityLabel}
          systemImage={iconSymbol(icon)}
          // A SwiftUI Menu draws its label as text beside the symbol; the trigger is the icon alone (the
          // label stays as the accessibility name), like every non-menu icon button.
          modifiers={ui.modifiers ? iconOnly(ui.modifiers, accessibilityLabel) : undefined}
        >
          {menuSections(ui, stable)}
        </Menu>
      </Host>
    ),
    [Host, Menu, ui, accent, testID, title, accessibilityLabel, icon, stable],
  );
}
