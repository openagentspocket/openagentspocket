import { Platform, Switch } from 'react-native';
import { useTheme } from '../theme/theme';

interface ToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

/** The one switch: accent when on, the control fill when off; Android's thumb follows the tokens, iOS keeps the system white one. */
export function Toggle(props: ToggleProps) {
  const theme = useTheme();
  return (
    <Switch
      {...props}
      trackColor={{ false: theme.colors.control, true: theme.colors.accent }}
      thumbColor={
        Platform.OS === 'android'
          ? props.value
            ? theme.colors.onAccent
            : theme.colors.textSecondary
          : undefined
      }
      ios_backgroundColor={theme.colors.control}
    />
  );
}
