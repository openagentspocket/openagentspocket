import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Status } from '../theme/status';
import { useTheme } from '../theme/theme';
import type { ColorKey } from '../theme/tokens.generated';
import { Text } from './Text';

/** The status dot's share of the mark, and the ring cut around it. */
export const PROGRAM_MARK_BADGE_RATIO = 0.5;
const BADGE_RING = 1.5;

interface ProgramMarkProps {
  /** The program's name ("Claude Code", "codex"); its first letter is the neutral glyph. */
  program: string;
  /** Nil draws the mark alone: a shell has no status. */
  status?: Status;
  size?: number;
  /** The brand logo (an SVG element); omit for the neutral glyph. */
  logo?: ReactNode;
  /** The surface under the mark, so the ring around the status dot reads as a cut-out. */
  surface?: ColorKey;
}

/**
 * The program an Agent runs, with its status as a dot cut into the lower
 * trailing corner. Decorative: the row around it names the program and status.
 */
export function ProgramMark({
  program,
  status,
  size = 20,
  logo,
  surface = 'surface',
}: ProgramMarkProps) {
  const theme = useTheme();
  const badge = Math.round(size * PROGRAM_MARK_BADGE_RATIO);
  // The dot pokes past the corner by a quarter of itself, as an app badge does.
  const poke = badge / 4;
  const initial = program.trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={`program-mark-${program}`}
    >
      {logo ?? (
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
      )}
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
            borderColor: theme.colors[surface],
            backgroundColor: theme.status(status),
          }}
        />
      ) : null}
    </View>
  );
}
