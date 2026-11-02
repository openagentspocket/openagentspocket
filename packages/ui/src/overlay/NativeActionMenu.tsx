import { Platform } from 'react-native';
import { iconSymbol } from '../primitives/Icon';
import type { ActionMenuItem } from './ActionMenu';

interface SwiftUiMenu {
  Host: React.ComponentType<Record<string, unknown>>;
  Menu: React.ComponentType<Record<string, unknown>>;
  Button: React.ComponentType<Record<string, unknown>>;
  Section: React.ComponentType<Record<string, unknown>>;
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
  const { Host, Menu, Button } = ui;
  return (
    <Host matchContents testID={testID}>
      <Menu label={title ?? accessibilityLabel} systemImage={iconSymbol(icon)}>
        {items.map((item) => (
          <Button
            key={item.key}
            label={item.title}
            systemImage={item.checked ? 'checkmark' : item.icon ? iconSymbol(item.icon) : undefined}
            role={item.destructive ? 'destructive' : undefined}
            onPress={item.disabled ? undefined : item.onPress}
          />
        ))}
      </Menu>
    </Host>
  );
}
