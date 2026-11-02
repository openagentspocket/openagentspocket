import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Dimensions } from 'react-native';
import { ThemeProvider } from './theme/theme';
import type { ThemeId } from './theme/tokens.generated';

/** Renders inside a ThemeProvider forced to `themeId` (Índigo by default). Tests only. */
export const renderThemed = (
  ui: ReactElement,
  themeId: ThemeId = 'indigo',
): ReturnType<typeof render> => render(<ThemeProvider themeId={themeId}>{ui}</ThemeProvider>);

/**
 * Pretends the system text size is `fontScale` (1 is the default size, iOS AX1 is 1.786).
 * Call before rendering. jest.setup.js resets it to 1 around every test, because React
 * Native's jest preset reports 2, an accessibility size. Tests only.
 */
export function setFontScale(fontScale: number): void {
  Dimensions.set({
    window: { ...Dimensions.get('window'), fontScale },
    screen: { ...Dimensions.get('screen'), fontScale },
  });
}
