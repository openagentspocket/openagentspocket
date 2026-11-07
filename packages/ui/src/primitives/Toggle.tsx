import { Platform, Switch } from 'react-native';
import { contrast } from '../theme/programTint';
import { useTheme } from '../theme/theme';

interface ToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

/** Under this the system's white thumb disappears into a near-white accent. */
const THUMB_FLOOR = 1.5;

/**
 * The one switch: accent when on, the control fill when off; Android's thumb follows the tokens,
 * iOS keeps the system white one unless the accent would swallow it.
 */
export function Toggle(props: ToggleProps) {
  const theme = useTheme();
  const { accent, onAccent, textPrimary, textSecondary } = theme.colors;
  const whiteOnWhite = contrast(accent, textPrimary) < THUMB_FLOOR;
  return (
    <Switch
      {...props}
      trackColor={{ false: theme.colors.control, true: theme.colors.accent }}
      thumbColor={
        Platform.OS === 'android'
          ? props.value
            ? onAccent
            : textSecondary
          : props.value && whiteOnWhite
            ? onAccent
            : undefined
      }
      ios_backgroundColor={theme.colors.control}
    />
  );
}
