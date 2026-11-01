import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { ThemeProvider } from './theme/theme';
import type { ThemeId } from './theme/tokens.generated';

/** Renders inside a ThemeProvider forced to `themeId` (Índigo by default). Tests only. */
export const renderThemed = (
  ui: ReactElement,
  themeId: ThemeId = 'indigo',
): ReturnType<typeof render> => render(<ThemeProvider themeId={themeId}>{ui}</ThemeProvider>);
