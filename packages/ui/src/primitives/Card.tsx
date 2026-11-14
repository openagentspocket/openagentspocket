import type { ReactNode } from 'react';
import {
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
  type GestureResponderEvent,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';
import { withAlpha } from '../theme/color';
import { rounded } from '../theme/corners';
import { makeStyles, useTheme } from '../theme/theme';
import type { ColorKey } from '../theme/tokens.generated';
import { SurfaceFillProvider } from './surfaceFill';
import { Tappable } from './Tappable';

export type CardLevel = 'surface' | 'overlay' | 'control' | 'terminal';

/** The color each card level fills with; rows inside read it through `useSurfaceFill()`. */
export const CARD_FILL: Record<CardLevel, ColorKey> = {
  surface: 'surface',
  overlay: 'surfaceOverlay',
  control: 'control',
  terminal: 'terminalBackground',
};

const useStyles = makeStyles((t) => ({
  card: {
    backgroundColor: t.colors.surface,
    ...rounded(t.radius.card),
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
    overflow: 'hidden',
  },
  padded: { padding: t.spacing.md, gap: t.spacing.xs },
  overlay: { backgroundColor: t.colors.surfaceOverlay },
  // Code and command boxes sit inside a card or a sheet: one step down the corner scale.
  control: { backgroundColor: t.colors.control, ...rounded(t.radius.control) },
  terminal: { backgroundColor: t.colors.terminalBackground, ...rounded(t.radius.control) },
  selected: {
    borderWidth: 1,
    borderColor: t.colors.accent,
    backgroundColor: t.wash(t.colors.accent),
  },
  pressed: { backgroundColor: t.colors.surfaceRaised },
}));

interface CardProps {
  children: ReactNode;
  /**
   * surface: a card on the canvas; overlay: inside a sheet or drawer; control: a code or command box;
   * terminal: a block in the terminal's palette (a fenced code block).
   */
  level?: CardLevel;
  /** Outlines a card that asks for attention in this color (at 40%). */
  accent?: ColorKey;
  /** Fills the card with a wash of this color (a Host's connection tone). */
  tint?: ColorKey;
  /** The chosen option of a set: accent border and wash, announced as selected. */
  selected?: boolean;
  /** Layout of the content (direction, alignment, size); the look stays the card's. */
  style?: StyleProp<ViewStyle>;
  /** A picture of something else (a preview): hidden from screen readers. */
  decorative?: boolean;
  /** False for a grouped list whose rows pad themselves. */
  padded?: boolean;
  onPress?: () => void;
  onLongPress?: (event: GestureResponderEvent) => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityActions?: readonly AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
  testID?: string;
}

/** A themed card: surface fill, the card corner, hairline border. */
export function Card({
  children,
  level = 'surface',
  accent,
  tint,
  selected,
  style,
  decorative,
  padded = true,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
  accessibilityActions,
  onAccessibilityAction,
  testID,
}: CardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const filled = <SurfaceFillProvider value={CARD_FILL[level]}>{children}</SurfaceFillProvider>;
  const look = [
    styles.card,
    padded && styles.padded,
    level !== 'surface' && styles[level],
    accent && {
      borderColor: withAlpha(theme.colors[accent], theme.metrics.accentOutlineOpacity),
    },
    tint && { backgroundColor: theme.wash(theme.colors[tint]) },
    selected && styles.selected,
    style,
  ];
  if (!onPress && !onLongPress) {
    return (
      <View
        style={look}
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        accessibilityElementsHidden={decorative}
        importantForAccessibility={decorative ? 'no-hide-descendants' : undefined}
      >
        {filled}
      </View>
    );
  }
  return (
    <Tappable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={selected === undefined ? undefined : { selected }}
      accessibilityHint={accessibilityHint}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [...look, pressed && styles.pressed]}
    >
      {filled}
    </Tappable>
  );
}
