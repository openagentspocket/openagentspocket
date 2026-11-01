import { Pressable } from 'react-native';
import { makeStyles, useTheme } from '../theme/theme';
import { Text } from './Text';

export type ButtonKind = 'primary' | 'secondary';

const useStyles = makeStyles((t) => ({
  base: {
    minHeight: t.metrics.minTapSize,
    paddingHorizontal: t.spacing.md,
    borderRadius: t.metrics.cardRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: t.colors.accent },
  secondary: {
    backgroundColor: t.colors.control,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
}));

interface ButtonProps {
  title: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  testID?: string;
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled = false,
  testID,
}: ButtonProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        styles[kind],
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text
        variant="headline"
        style={{ color: kind === 'primary' ? theme.colors.onAccent : theme.colors.textPrimary }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
