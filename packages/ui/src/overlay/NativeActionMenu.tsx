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
    cached = require('@expo/ui/swift-ui') as SwiftUiMenu;
  } catch {
    cached = null;
  }
  return cached;
}

/** Forget the cached module (tests that toggle availability). */
export function resetNativeMenuCache() {
  cached = undefined;
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
  if (!ContextMenu) return <>{children}</>;
  return (
    <Host matchContents seedColor={theme.colors.accent} testID={testID}>
      <ContextMenu>
        <ContextMenu.Trigger>{children}</ContextMenu.Trigger>
        <ContextMenu.Preview>{preview}</ContextMenu.Preview>
        <ContextMenu.Items>{menuSections(ui, items)}</ContextMenu.Items>
      </ContextMenu>
    </Host>
  );
}

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
  return (
    <Host matchContents seedColor={theme.colors.accent} testID={testID}>
      <Menu label={title ?? accessibilityLabel} systemImage={iconSymbol(icon)}>
        {menuSections(ui, items)}
      </Menu>
    </Host>
  );
}
