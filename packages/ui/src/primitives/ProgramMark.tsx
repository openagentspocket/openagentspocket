import { programIdentity } from '@openagentspocket/core';
import { Animated, View } from 'react-native';
import { usePulse } from '../motion';
import { useFontScale } from '../theme/accessibility';
import { airy } from '../theme/metrics';
import { programTint } from '../theme/programTint';
import type { Status } from '../theme/status';
import { makeStyles, useTheme } from '../theme/theme';
import type { ColorKey } from '../theme/tokens.generated';
import { badgeGeometry, PROGRAM_MARK_BADGE_GAP, ProgramLogo } from './ProgramLogo';
import { StatusDot } from './StatusDot';
import { useSurfaceFill } from './surfaceFill';
import { Text } from './Text';

const useStyles = makeStyles(() => ({
  beside: { flexDirection: 'row', alignItems: 'center', gap: airy.chipV },
}));

interface ProgramMarkProps {
  /**
   * The program as herdr reports it ("claude", "Claude Code"). Known programs draw their brand
   * logo; any other draws its first letter as a monogram.
   */
  program: string;
  /** Nil draws the mark alone: a shell has no status. */
  status?: Status;
  size?: number;
  /**
   * The fill under the mark, so the ring around the status dot reads as a cut-out.
   * Defaults to the enclosing card's, sheet's or screen's fill.
   */
  surface?: ColorKey;
  /** The status dot pulses while Working (the Agent chips); Reduce Motion keeps it still. */
  pulse?: boolean;
}

/**
 * The program an Agent runs, with its status as a dot cut into the lower
 * trailing corner. At accessibility text sizes the status moves beside the
 * mark as StatusDot's shaped glyph, so status is never color alone.
 * Decorative: the row around it names the program and status.
 */
export function ProgramMark({ program, status, size = 20, surface, pulse }: ProgramMarkProps) {
  const theme = useTheme();
  const styles = useStyles();
  const fill = useSurfaceFill();
  const { isAccessibilitySize } = useFontScale();
  const dotOpacity = usePulse(Boolean(pulse && status === 'working'));
  const identity = programIdentity(program);
  const { diameter: badge, center } = badgeGeometry(size);
  const initial = identity.displayName.charAt(0).toUpperCase() || '?';
  const cutOut = Boolean(status && identity.brand && !isAccessibilitySize);
  const ringed = !identity.brand;
  const ring = ringed ? PROGRAM_MARK_BADGE_GAP : 0;
  const glyph = identity.brand ? (
    <ProgramLogo
      brand={identity.brand}
      size={size}
      color={programTint(identity.brand, theme)}
      cutout={cutOut}
    />
  ) : (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 4,
        backgroundColor: theme.colors.control,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        variant="label"
        tone="secondary"
        style={{ fontSize: size * 0.55, lineHeight: size * 0.7, letterSpacing: 0 }}
      >
        {initial}
      </Text>
    </View>
  );
  const hidden = {
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
    testID: `program-mark-${program}`,
  } as const;
  if (status && isAccessibilitySize) {
    return (
      <View style={styles.beside} {...hidden}>
        <View style={{ width: size, height: size }}>{glyph}</View>
        <StatusDot status={status} />
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size }} {...hidden}>
      {glyph}
      {status ? (
        <Animated.View
          testID={`program-mark-status-${status}`}
          style={{
            opacity: dotOpacity,
            position: 'absolute',
            left: center - badge / 2 - ring,
            top: center - badge / 2 - ring,
            width: badge + 2 * ring,
            height: badge + 2 * ring,
            borderRadius: badge,
            borderWidth: ring,
            borderColor: theme.colors[surface ?? fill],
            backgroundColor: theme.status(status),
          }}
        />
      ) : null}
    </View>
  );
}
