import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { terminalColors, terminalThemeById } from '../theme/terminalPalettes';
import { useTheme } from '../theme/theme';

/** Which registered terminal theme each appearance uses (Swift's two slots). */
export interface TerminalThemeSlots {
  light: string;
  dark: string;
}

const SlotsContext = createContext<TerminalThemeSlots | null>(null);

export function TerminalThemeProvider({
  light,
  dark,
  children,
}: TerminalThemeSlots & { children: ReactNode }) {
  const slots = useMemo(() => ({ light, dark }), [light, dark]);
  return <SlotsContext.Provider value={slots}>{children}</SlotsContext.Provider>;
}

/** What every terminal surface paints with. */
export interface TerminalSurfaceColors {
  background: string;
  foreground: string;
  /** The 16 ANSI colors; absent without a provider (the renderer keeps its defaults). */
  palette?: readonly string[];
}

/**
 * The one source of terminal colors: the slot of the current appearance, resolved through the theme
 * registry. Without a provider (tests, gallery) the app theme's own terminal tokens apply.
 */
export function useTerminalColors(): TerminalSurfaceColors {
  const theme = useTheme();
  const slots = useContext(SlotsContext);
  const id = slots ? slots[theme.appearance] : undefined;
  return useMemo(() => {
    if (!id) {
      return {
        background: theme.colors.terminalBackground,
        foreground: theme.colors.terminalForeground,
      };
    }
    const { background, foreground, ansi } = terminalColors(
      terminalThemeById(id),
      theme.appearance,
    );
    return { background, foreground, palette: ansi };
  }, [id, theme]);
}
