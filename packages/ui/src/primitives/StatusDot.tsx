import { View } from 'react-native';
import type { Status } from '../theme/status';
import { useTheme } from '../theme/theme';

export type { Status } from '../theme/status';

/** An Agent status as a dot in the theme's status color. Hidden from screen readers: the row says it in words. */
export function StatusDot({ status, size = 10 }: { status: Status; size?: number }) {
  const theme = useTheme();
  return (
    <View
      testID={`status-dot-${status}`}
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.status(status),
      }}
    />
  );
}
