import { act, render } from '@testing-library/react-native';
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

/** Calls confirm() inside act, since it updates the mounted host; boxed so awaiting does not wait for the answer. */
export async function ask<T>(run: () => Promise<T>): Promise<{ answer: Promise<T> }> {
  const box: { answer?: Promise<T> } = {};
  await act(async () => {
    box.answer = run();
  });
  if (!box.answer) throw new Error('confirm() was not called');
  return { answer: box.answer };
}
