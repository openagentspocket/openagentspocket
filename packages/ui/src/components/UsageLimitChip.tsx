import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Card } from '../primitives/Card';
import { meterColor } from '../primitives/Meter';
import { StatusDot } from '../primitives/StatusDot';
import { Text } from '../primitives/Text';
import type { Status } from '../theme/status';
import { makeStyles, useTheme } from '../theme/theme';

const RING = 44;
const STROKE = 4;

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    paddingHorizontal: t.spacing.sm,
    paddingVertical: t.spacing.xs,
  },
  ring: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringText: { position: 'absolute' },
  texts: { flexShrink: 1 },
  hostLine: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs },
}));

export interface UsageLimitChipProps {
  /** Share of the window used, 0...100. */
  percent: number;
  host: string;
  hostStatus?: Status;
  program: string;
  /** The window name ("Weekly", "5 hours"). */
  window: string;
  /** Spoken label; defaults to the visible texts. */
  accessibilityLabel?: string;
  onPress?: () => void;
  testID?: string;
}

/** The ring that fills with the share of a window used; warning and danger from the meter thresholds. */
function LimitRing({ percent }: { percent: number }) {
  const styles = useStyles();
  const theme = useTheme();
  const share = Math.min(1, Math.max(0, Number.isFinite(percent) ? percent / 100 : 0));
  const radius = (RING - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = theme.colors[meterColor(share)];
  return (
    <View
      style={styles.ring}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width={RING} height={RING}>
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={radius}
          stroke={theme.colors.control}
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={radius}
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference * share} ${circumference}`}
          rotation={-90}
          origin={`${RING / 2}, ${RING / 2}`}
          testID="limit-ring-arc"
        />
      </Svg>
      <Text variant="caption" semibold tabularNums style={styles.ringText}>
        {`${Math.round(percent)} %`}
      </Text>
    </View>
  );
}

/** One Usage Limit window as a chip: ring with the percent, Host with its dot, program and window. */
export function UsageLimitChip({
  percent,
  host,
  hostStatus = 'idle',
  program,
  window,
  accessibilityLabel,
  onPress,
  testID = 'usage-limit-chip',
}: UsageLimitChipProps) {
  const styles = useStyles();
  return (
    <Card
      padded={false}
      onPress={onPress}
      accessibilityLabel={
        accessibilityLabel ?? `${host}, ${program} ${window}, ${Math.round(percent)}%`
      }
      testID={testID}
    >
      <View style={styles.row}>
        <LimitRing percent={percent} />
        <View style={styles.texts}>
          <View style={styles.hostLine}>
            <StatusDot status={hostStatus} size={7} />
            <Text variant="caption" tone="secondary" numberOfLines={1}>
              {host}
            </Text>
          </View>
          <Text variant="headline" numberOfLines={1}>
            {`${program} · ${window}`}
          </Text>
        </View>
      </View>
    </Card>
  );
}
