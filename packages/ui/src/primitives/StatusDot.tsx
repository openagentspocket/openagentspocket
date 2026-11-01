import { View } from 'react-native';
import { useTheme } from '../theme/theme';
import type { ColorKey } from '../theme/tokens.generated';

export type Status = 'blocked' | 'working' | 'done' | 'idle';

const STATUS_COLOR: Record<Status, ColorKey> = {
  blocked: 'statusBlocked',
  working: 'statusWorking',
  done: 'statusDone',
  idle: 'statusIdle',
};

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
        backgroundColor: theme.colors[STATUS_COLOR[status]],
      }}
    />
  );
}
