import { ActivityIndicator } from 'react-native';
import { useTheme } from '../theme/theme';
import type { ColorKey } from '../theme/tokens.generated';

interface SpinnerProps {
  size?: 'small' | 'large';
  /** A token of the theme; secondary ink by default, accent for the main wait of a screen. */
  color?: ColorKey;
  accessibilityLabel?: string;
  testID?: string;
}

/** The one activity indicator: its color is always a theme token, never the platform's gray. */
export function Spinner({ size = 'small', color = 'textSecondary', ...rest }: SpinnerProps) {
  const theme = useTheme();
  return <ActivityIndicator size={size} color={theme.colors[color]} {...rest} />;
}
