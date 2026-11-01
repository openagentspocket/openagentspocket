import { View } from 'react-native';
import { useFontScale } from '../theme/accessibility';
import type { Status } from '../theme/status';
import { useTheme } from '../theme/theme';
import { Icon, type IconName } from './Icon';

export type { Status } from '../theme/status';

/** The glyph drawn at accessibility text sizes: one shape per status (Swift's `StatusDot.glyph`). */
export const STATUS_GLYPH: Record<Status, IconName> = {
  blocked: 'statusBlocked',
  done: 'statusDone',
  working: 'statusWorking',
  idle: 'statusIdle',
};

/** Caption size, the glyph's size at the default text scale. */
const GLYPH_SIZE = 12;

/**
 * An Agent status as a dot in the theme's status color, or at accessibility text
 * sizes a glyph whose shape names the status, so status is never color alone.
 * Hidden from screen readers: the row says it in words.
 */
export function StatusDot({ status, size = 10 }: { status: Status; size?: number }) {
  const theme = useTheme();
  const { scale, isAccessibilitySize } = useFontScale();
  if (isAccessibilitySize) {
    return (
      <Icon
        name={STATUS_GLYPH[status]}
        size={Math.round(GLYPH_SIZE * Math.min(scale, 2))}
        tint={theme.status(status)}
        testID={`status-dot-${status}`}
      />
    );
  }
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
