import type { ReactNode } from 'react';
import {
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
  type GestureResponderEvent,
  View,
} from 'react-native';
import { withAlpha } from '../theme/color';
import { makeStyles, useTheme } from '../theme/theme';
import type { ColorKey } from '../theme/tokens.generated';
import { SurfaceFillProvider } from './surfaceFill';
import { Tappable } from './Tappable';

export type CardLevel = 'surface' | 'overlay';

/** The color each card level fills with; rows inside read it through `useSurfaceFill()`. */
export const CARD_FILL: Record<CardLevel, ColorKey> = {
  surface: 'surface',
  overlay: 'surfaceOverlay',
};

const useStyles = makeStyles((t) => ({
  card: {
    backgroundColor: t.colors.surface,
    borderRadius: t.metrics.cardRadius,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
    overflow: 'hidden',
  },
  padded: { padding: t.spacing.md, gap: t.spacing.xs },
  overlay: { backgroundColor: t.colors.surfaceOverlay },
  pressed: { backgroundColor: t.colors.surfaceRaised },
}));

interface CardProps {
  children: ReactNode;
  /** surface: a card on the canvas; overlay: a card inside a sheet or drawer. */
  level?: CardLevel;
  /** Outlines a card that asks for attention in this color (at 40%). */
  accent?: ColorKey;
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

/** A themed card: surface fill, radius 8, hairline border. */
export function Card({
  children,
  level = 'surface',
  accent,
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
    level === 'overlay' && styles.overlay,
    accent && {
      borderColor: withAlpha(theme.colors[accent], theme.metrics.accentOutlineOpacity),
    },
  ];
  if (!onPress && !onLongPress) {
    return (
      <View style={look} testID={testID} accessibilityLabel={accessibilityLabel}>
        {filled}
      </View>
    );
  }
  return (
    <Tappable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
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
