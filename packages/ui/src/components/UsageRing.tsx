import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Icon } from '../primitives/Icon';
import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import { withAlpha } from '../theme/color';
import { useTheme } from '../theme/theme';

export type UsageTone = 'ok' | 'warn' | 'critical';

const SIZE = 22;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const TRACK_OPACITY = 0.25;

interface UsageRingProps {
  /** 0-100 of the worst window, or null when no limits are known (a bar glyph shows). */
  percent: number | null;
  tone?: UsageTone;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

/** Swift's Home Usage ring: 22 pt ring, 3 pt rounded stroke, number in caption2 inside. */
export function UsageRing({
  percent,
  tone = 'ok',
  onPress,
  accessibilityLabel,
  testID = 'usage-ring',
}: UsageRingProps) {
  const { colors } = useTheme();
  const arc = { ok: colors.accent, warn: colors.warning, critical: colors.danger }[tone];
  const clamped = percent === null ? 0 : Math.min(100, Math.max(0, percent));
  const content =
    percent === null ? (
      <Icon name="usage" size={20} color="accent" />
    ) : (
      <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={SIZE} height={SIZE} style={{ position: 'absolute' }}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={withAlpha(arc, TRACK_OPACITY)}
            strokeWidth={STROKE}
            fill="none"
          />
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={arc}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${(CIRCUMFERENCE * clamped) / 100} ${CIRCUMFERENCE}`}
            rotation={-90}
            origin={`${SIZE / 2}, ${SIZE / 2}`}
          />
        </Svg>
        <Text
          variant="caption2"
          semibold
          style={{ fontSize: 9, lineHeight: 11, letterSpacing: 0 }}
          testID={`${testID}-value`}
        >
          {String(Math.round(clamped))}
        </Text>
      </View>
    );
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={percent === null ? undefined : { text: `${Math.round(clamped)}%` }}
      style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}
      testID={testID}
    >
      {content}
    </Tappable>
  );
}
