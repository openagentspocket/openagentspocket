import type { ComponentType, ReactNode } from 'react';
import { Platform } from 'react-native';

/** The slice of react-native-screens' FullWindowOverlay this package uses. */
export interface WindowOverlayProps {
  children: ReactNode;
  unstable_accessibilityContainerViewIsModal?: boolean;
}

let overlay: ComponentType<WindowOverlayProps> | null | undefined;

/**
 * iOS: a view drawn in the key window above every presented view controller (route sheets,
 * native sheets), so what it holds is visible over whatever is on screen. A React Native `Modal`
 * presents from the view controller that owns its view, and UIKit refuses that while the
 * controller already presents a sheet ("Attempt to present ... which is already presenting"):
 * the alert never shows. Null on Android (a Modal is its own window there), on web and in Jest.
 */
export function loadWindowOverlay(): ComponentType<WindowOverlayProps> | null {
  if (overlay !== undefined) return overlay;
  overlay = null;
  if (Platform.OS !== 'ios') return overlay;
  try {
    // Lazy so Jest never evaluates the native component.
    const mod = require('react-native-screens') as {
      FullWindowOverlay?: ComponentType<WindowOverlayProps>;
    };
    overlay = mod.FullWindowOverlay ?? null;
  } catch {
    overlay = null;
  }
  return overlay;
}
