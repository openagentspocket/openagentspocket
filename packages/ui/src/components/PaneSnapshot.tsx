import { View } from 'react-native';
import { Text } from '../primitives/Text';
import { useTerminalColors } from '../terminal/TerminalThemeContext';
import { withAlpha } from '../theme/color';

interface PaneSnapshotProps {
  /** The last lines of the pane, already cut to the width (core `snapshotLines`). */
  lines: readonly string[];
  testID?: string;
}

/** A pane's last lines as a small monospaced thumbnail in the terminal theme's foreground. */
export function PaneSnapshot({ lines, testID = 'pane-snapshot' }: PaneSnapshotProps) {
  const { foreground } = useTerminalColors();
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {lines.map((line, index) => (
        <Text
          // biome-ignore lint/suspicious/noArrayIndexKey: lines repeat and only ever change together
          key={index}
          variant="caption2"
          monospaced
          numberOfLines={1}
          allowFontScaling={false}
          style={{ color: withAlpha(foreground, 0.85), fontSize: 7, lineHeight: 10 }}
        >
          {line === '' ? ' ' : line}
        </Text>
      ))}
    </View>
  );
}
