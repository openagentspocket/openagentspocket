import { useAnchor } from '../overlay/anchors';
import { rounded } from '../theme/corners';
import { makeStyles, type Theme, useTheme } from '../theme/theme';
import type { ColorKey } from '../theme/tokens.generated';
import { Icon, type IconName } from './Icon';
import { Spinner } from './Spinner';
import { Tappable } from './Tappable';
import { Text, type TextVariant } from './Text';

export type ButtonKind = 'primary' | 'secondary' | 'destructive' | 'text' | 'capsule';
/** dense: full tap height with callout text and tight padding (paired buttons in a sheet footer). */
/** medium: between small and regular. mini: caption text, its tap area kept by the hit slop. */
export type ButtonSize = 'regular' | 'medium' | 'small' | 'mini' | 'dense';

const useStyles = makeStyles((t) => ({
  base: {
    minHeight: t.metrics.minTapSize,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.xxs,
    ...rounded(t.radius.control),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.xs,
  },
  tight: { paddingHorizontal: t.spacing.xxs },
  medium: { minHeight: 38, paddingHorizontal: t.spacing.sm },
  small: { minHeight: 32, paddingHorizontal: t.spacing.sm },
  mini: { minHeight: 24, paddingVertical: 0, paddingHorizontal: t.spacing.xxs },
  dense: { paddingHorizontal: t.spacing.xs, gap: t.spacing.xxs },
  iconOnly: { paddingHorizontal: 0, minWidth: t.metrics.minTapSize },
  iconOnlySmall: { minWidth: 32 },
  primary: { backgroundColor: t.colors.accent },
  secondary: { backgroundColor: t.colors.control },
  destructive: { backgroundColor: t.wash(t.colors.danger) },
  text: { paddingHorizontal: t.spacing.xs },
  capsule: { backgroundColor: t.colors.accentContainer, borderRadius: t.radius.capsule },
  label: { flexShrink: 1, textAlign: 'center' },
  pill: { borderRadius: t.radius.capsule },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
}));

/** Web only: the browser's blue focus ring is not part of the Swift look. */

const INK_KEY = {
  primary: 'onAccent',
  secondary: 'textPrimary',
  destructive: 'danger',
  text: 'accent',
  capsule: 'accent',
} as const satisfies Record<ButtonKind, ColorKey>;

/** Brings a smaller control back to the minimum tap area. */
const HIT_SLOP: Record<ButtonSize, number> = {
  regular: 0,
  medium: 3,
  small: 6,
  mini: 10,
  dense: 0,
};

const LABEL_VARIANT = {
  regular: 'headline',
  medium: 'callout',
  small: 'callout',
  mini: 'caption',
  dense: 'callout',
} as const satisfies Record<ButtonSize, TextVariant>;

const inkFor = (kind: ButtonKind, t: Theme) => t.colors[INK_KEY[kind]];

interface CommonProps {
  onPress: () => void;
  kind?: ButtonKind;
  size?: ButtonSize;
  disabled?: boolean;
  /** Shows a spinner and ignores presses. */
  loading?: boolean;
  accessibilityHint?: string;
  /** Overrides the glyph size (toolbars draw glyphs near 60 percent of the control). */
  iconSize?: number;
  /** Fully rounded ends (Swift capsule), whatever the kind. */
  pill?: boolean;
  /** Minimal side padding, for buttons that share a row (alert actions) so labels stay on one line. */
  tight?: boolean;
  /** Draws in the text color instead of the kind's: chrome that should not read as an accent. */
  neutral?: boolean;
  /** Registers the button as a popover anchor (`confirm({ anchorKey })`). */
  anchorKey?: string;
  testID?: string;
}

type ButtonProps = CommonProps &
  (
    | { title: string; icon?: IconName; accessibilityLabel?: string }
    | { title?: undefined; icon: IconName; accessibilityLabel: string }
  );

/** The one button: primary, secondary, destructive, text, capsule; with a title, an icon, or both. */
export function Button({
  title,
  icon,
  onPress,
  kind = 'primary',
  size = 'regular',
  disabled = false,
  loading = false,
  accessibilityLabel,
  accessibilityHint,
  iconSize,
  pill = false,
  tight = false,
  neutral = false,
  anchorKey,
  testID,
}: ButtonProps) {
  const anchorRef = useAnchor(anchorKey);
  const styles = useStyles();
  const theme = useTheme();
  const ink = neutral ? theme.colors.textPrimary : inkFor(kind, theme);
  const inactive = disabled || loading;
  const iconOnly = title === undefined;
  return (
    <Tappable
      ref={anchorRef}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      // Drops a returned promise (`onPress={() => confirm(...)}`): nothing awaits a press.
      onPress={() => {
        onPress();
      }}
      testID={testID}
      hitSlop={HIT_SLOP[size]}
      style={({ pressed }) => [
        styles.base,
        size === 'medium' && styles.medium,
        size === 'small' && styles.small,
        size === 'mini' && styles.mini,
        size === 'dense' && styles.dense,
        iconOnly && styles.iconOnly,
        iconOnly && size === 'small' && styles.iconOnlySmall,
        styles[kind],
        tight && styles.tight,
        pill && styles.pill,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {loading ? <Spinner size="small" color={INK_KEY[kind]} testID="button-spinner" /> : null}
      {!loading && icon ? (
        <Icon name={icon} size={iconSize ?? (size === 'small' ? 15 : 17)} tint={ink} />
      ) : null}
      {title !== undefined ? (
        <Text
          variant={LABEL_VARIANT[size]}
          // Every button reads at one size: a long label wraps, and only a shared row may shrink it.
          numberOfLines={tight ? 1 : 3}
          adjustsFontSizeToFit={tight}
          minimumFontScale={0.8}
          style={[styles.label, { color: ink }]}
        >
          {title}
        </Text>
      ) : null}
    </Tappable>
  );
}
