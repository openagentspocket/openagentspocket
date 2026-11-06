import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Icon } from '../primitives/Icon';
import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import { makeStyles } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xxs,
    minHeight: t.metrics.minTapSize,
    paddingHorizontal: t.spacing.md,
  },
  line: { flex: 1, height: t.metrics.hairlineWidth, backgroundColor: t.hairline },
  centered: { gap: t.spacing.xs },
}));

/** m:ss of a whole number of seconds (1:45). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

interface ChatDividerProps {
  kind: 'turn' | 'working' | 'compacted';
  /** The words: 'Worked for 26s', 'Working for', 'Context compacted'. Translated by the caller. */
  label: string;
  /** working: seconds already elapsed; the clock ticks each second after it. */
  elapsedSeconds?: number;
  /** turn: the folded state; the chevron points down when expanded. */
  collapsed?: boolean;
  onToggle?: () => void;
  testID?: string;
}

function useTicker(active: boolean, from: number): number {
  const [seconds, setSeconds] = useState(from);
  useEffect(() => {
    setSeconds(from);
    if (!active) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [active, from]);
  return seconds;
}

/** Swift's turn header, live Working timer and Context compacted rule. */
export function ChatDivider({
  kind,
  label,
  elapsedSeconds = 0,
  collapsed = true,
  onToggle,
  testID = 'chat-divider',
}: ChatDividerProps) {
  const styles = useStyles();
  const seconds = useTicker(kind === 'working', elapsedSeconds);
  if (kind === 'compacted') {
    return (
      <View
        style={[styles.row, styles.centered]}
        testID={testID}
        accessible
        accessibilityLabel={label}
      >
        <View style={styles.line} />
        <Text variant="caption2" tone="secondary">
          {label}
        </Text>
        <View style={styles.line} />
      </View>
    );
  }
  if (kind === 'working') {
    const spoken = `${label} ${formatClock(seconds)}`;
    return (
      <View style={styles.row} testID={testID} accessible accessibilityLabel={spoken}>
        <Text variant="footnote" tone="secondary" tabularNums>
          {spoken}
        </Text>
      </View>
    );
  }
  return (
    <Tappable
      style={styles.row}
      testID={testID}
      onPress={onToggle}
      disabled={!onToggle}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: !collapsed }}
    >
      <Text variant="footnote" tone="secondary">
        {label}
      </Text>
      <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={11} color="textSecondary" />
    </Tappable>
  );
}
