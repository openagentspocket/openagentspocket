import type { UsageLimitLevel } from '@openagentspocket/core';
import { Icon, Text, useTheme } from '@openagentspocket/ui';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const SIZE = 24;
const STROKE = 3;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface Props {
  /** 0-100, or null until a running window has been read. */
  percent: number | null;
  level: UsageLimitLevel;
}

/** Home's Usage ring: the fullest running window as an arc, or a chart glyph until one is read. */
export function UsageRing({ percent, level }: Props) {
  const { colors } = useTheme();
  if (percent === null) return <Icon name="usage" size={20} color="textPrimary" />;
  const arc = { normal: colors.accent, warning: colors.warning, danger: colors.danger }[level];
  return (
    <View style={{ width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={SIZE} height={SIZE} style={{ position: 'absolute' }}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={colors.control}
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
          strokeDasharray={`${(CIRCUMFERENCE * percent) / 100} ${CIRCUMFERENCE}`}
          rotation={-90}
          origin={`${SIZE / 2}, ${SIZE / 2}`}
        />
      </Svg>
      <Text variant="label" style={{ fontSize: 9, lineHeight: 11, letterSpacing: 0 }}>
        {String(Math.round(percent))}
      </Text>
    </View>
  );
}
