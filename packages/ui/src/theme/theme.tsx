import { createContext, type ReactNode, useContext, useMemo } from 'react';
import {
  type ImageStyle,
  StyleSheet,
  type TextStyle,
  useColorScheme,
  type ViewStyle,
} from 'react-native';
import { withAlpha } from './color';
import { metrics, spacing } from './metrics';
import { type Status, statusColorKey, type Tone, toneColorKey } from './status';
import { type ThemeId, type ThemeTokens, themes } from './tokens.generated';

export interface Theme extends ThemeTokens {
  spacing: typeof spacing;
  metrics: typeof metrics;
  /** Card and divider border color. */
  hairline: string;
  /** The color of an Agent status in this theme. */
  status: (status: Status) => string;
  /** The color of a semantic tone in this theme. */
  tone: (tone: Tone) => string;
  /** A color at the wash opacity, for a fill under that same color as ink. */
  wash: (color: string) => string;
  /** Dimmed backdrop behind overlays. */
  backdrop: string;
}

export function buildTheme(id: ThemeId): Theme {
  const tokens = themes[id];
  return {
    ...tokens,
    spacing,
    metrics,
    hairline: withAlpha(tokens.colors.textPrimary, metrics.hairlineOpacity),
    status: (status) => tokens.colors[statusColorKey[status]],
    tone: (tone) => tokens.colors[toneColorKey[tone]],
    wash: (color) => withAlpha(color, metrics.washOpacity),
    backdrop: withAlpha(tokens.colors.canvas, metrics.backdropOpacity),
  };
}

const ThemeContext = createContext<Theme | null>(null);

interface ThemeProviderProps {
  /** Forces a theme; omit to follow the system appearance (dark: Índigo, light: Papel). */
  themeId?: ThemeId;
  children: ReactNode;
}

export function ThemeProvider({ themeId, children }: ThemeProviderProps) {
  const scheme = useColorScheme();
  const resolved: ThemeId = themeId ?? (scheme === 'light' ? 'papel' : 'indigo');
  const theme = useMemo(() => buildTheme(resolved), [resolved]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>');
  return theme;
}

type Styles = Record<string, ViewStyle | TextStyle | ImageStyle>;

/** Builds a themed StyleSheet hook: `const useStyles = makeStyles((t) => ({ box: {...} }))`. */
export function makeStyles<S extends Styles>(factory: (theme: Theme) => S): () => S {
  return () => {
    const theme = useTheme();
    return useMemo(() => StyleSheet.create(factory(theme)), [theme]);
  };
}
