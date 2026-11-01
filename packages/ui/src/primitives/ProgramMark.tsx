import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useFontScale } from '../theme/accessibility';
import type { Status } from '../theme/status';
import { makeStyles, useTheme } from '../theme/theme';
import type { ColorKey } from '../theme/tokens.generated';
import { StatusDot } from './StatusDot';
import { useSurfaceFill } from './surfaceFill';
import { Text } from './Text';

/** The status dot's share of the mark, and the ring cut around it. */
export const PROGRAM_MARK_BADGE_RATIO = 0.5;
const BADGE_RING = 1.5;

const useStyles = makeStyles(() => ({
  beside: { flexDirection: 'row', alignItems: 'center', gap: 4 },
}));

interface ProgramMarkProps {
  /** The program's name ("Claude Code", "codex"); its first letter is the neutral glyph. */
  program: string;
  /** Nil draws the mark alone: a shell has no status. */
  status?: Status;
  size?: number;
  /** The brand logo (an SVG element); omit for the neutral glyph. */
  logo?: ReactNode;
  /**
   * The fill under the mark, so the ring around the status dot reads as a cut-out.
   * Defaults to the enclosing card's, sheet's or screen's fill.
   */
  surface?: ColorKey;
}

/**
 * The program an Agent runs, with its status as a dot cut into the lower
 * trailing corner. At accessibility text sizes the status moves beside the
 * mark as StatusDot's shaped glyph, so status is never color alone.
 * Decorative: the row around it names the program and status.
 */
export function ProgramMark({ program, status, size = 20, logo, surface }: ProgramMarkProps) {
  const theme = useTheme();
  const styles = useStyles();
  const fill = useSurfaceFill();
  const { isAccessibilitySize } = useFontScale();
  const badge = Math.round(size * PROGRAM_MARK_BADGE_RATIO);
  // The dot pokes past the corner by a quarter of itself, as an app badge does.
  const poke = badge / 4;
  const initial = program.trim().charAt(0).toUpperCase() || '?';
  const glyph = logo ?? (
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
        <View
          testID={`program-mark-status-${status}`}
          style={{
            position: 'absolute',
            right: -poke - BADGE_RING,
            bottom: -poke - BADGE_RING,
            width: badge + 2 * BADGE_RING,
            height: badge + 2 * BADGE_RING,
            borderRadius: badge,
            borderWidth: BADGE_RING,
            borderColor: theme.colors[surface ?? fill],
            backgroundColor: theme.status(status),
          }}
        />
      ) : null}
    </View>
  );
}
