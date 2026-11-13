import type { ComponentType, ReactElement, Ref } from 'react';
import type { ViewProps } from 'react-native';

/** The slice of True Sheet this app uses, so `packages/ui` needs no native types. */
export interface TrueSheetMethods {
  present(index?: number, animated?: boolean): Promise<void>;
  dismiss(animated?: boolean): Promise<void>;
}

export type TrueSheetDetent = 'auto' | number;

export interface TrueSheetViewProps extends ViewProps {
  ref?: Ref<TrueSheetMethods>;
  detents?: TrueSheetDetent[];
  backgroundColor?: string;
  cornerRadius?: number;
  grabber?: boolean;
  dimmed?: boolean;
  dismissible?: boolean;
  scrollableRef?: Ref<unknown>;
  /** Pinned at the sheet's bottom; an `absolute` one rises above the keyboard while it is up. */
  footer?: ReactElement;
  footerOptions?: { position?: 'relative' | 'absolute'; avoidKeyboard?: boolean };
  maxContentHeight?: number;
  onDidDismiss?: () => void;
  onDidPresent?: () => void;
}

let sheet: ComponentType<TrueSheetViewProps> | null | undefined;

/**
 * True Sheet where its native module exists (iOS, Android builds), null under Jest. The web build
 * resolves `loadTrueSheet.web.ts` instead, so Metro never bundles the package for the browser.
 */
export function loadTrueSheet(): ComponentType<TrueSheetViewProps> | null {
  if (sheet !== undefined) return sheet;
  sheet = null;
  try {
    // Lazy so web and Jest never evaluate the native module.
    const mod = require('@lodev09/react-native-true-sheet') as {
      TrueSheet?: ComponentType<TrueSheetViewProps>;
    };
    sheet = mod.TrueSheet ?? null;
  } catch {
    sheet = null;
  }
  return sheet;
}
