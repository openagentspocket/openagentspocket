import { ActivityIndicator, Platform, Pressable, type ViewStyle } from 'react-native';
import { useAnchor } from '../overlay/anchors';
import { makeStyles, type Theme, useTheme } from '../theme/theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ButtonKind = 'primary' | 'secondary' | 'destructive' | 'text' | 'capsule';
/** dense: full tap height with callout text and tight padding (paired buttons in a sheet footer). */
export type ButtonSize = 'regular' | 'small' | 'dense';

const useStyles = makeStyles((t) => ({
  base: {
    minHeight: t.metrics.minTapSize,
    paddingHorizontal: t.spacing.md,
    borderRadius: t.metrics.cardRadius,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: t.spacing.xs,
  },
  tight: { paddingHorizontal: t.spacing.xxs },
  small: { minHeight: 32, paddingHorizontal: t.spacing.sm },
  dense: { paddingHorizontal: t.spacing.xs, gap: t.spacing.xxs },
  iconOnly: { paddingHorizontal: 0, minWidth: t.metrics.minTapSize },
  iconOnlySmall: { minWidth: 32 },
  primary: { backgroundColor: t.colors.accent },
  secondary: {
    backgroundColor: t.colors.control,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
  },
  destructive: { backgroundColor: t.wash(t.colors.danger) },
  text: { paddingHorizontal: t.spacing.xs },
  capsule: { backgroundColor: t.colors.accentContainer, borderRadius: 999 },
  label: { flexShrink: 1 },
  pill: { borderRadius: 999 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
}));

/** Web only: the browser's blue focus ring is not part of the Swift look. */
export const noFocusRing = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as ViewStyle;

const inkFor = (kind: ButtonKind, t: Theme) =>
  ({
    primary: t.colors.onAccent,
    secondary: t.colors.textPrimary,
    destructive: t.colors.danger,
    text: t.colors.accent,
    capsule: t.colors.accent,
  })[kind];

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
  anchorKey,
  testID,
}: ButtonProps) {
  const anchorRef = useAnchor(anchorKey);
  const styles = useStyles();
  const theme = useTheme();
  const ink = inkFor(kind, theme);
  const inactive = disabled || loading;
  const iconOnly = title === undefined;
  return (
    <Pressable
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
      hitSlop={size === 'small' ? 6 : 0}
      style={({ pressed }) => [
        styles.base,
        noFocusRing,
        size === 'small' && styles.small,
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
      {loading ? <ActivityIndicator size="small" color={ink} testID="button-spinner" /> : null}
      {!loading && icon ? (
        <Icon name={icon} size={iconSize ?? (size === 'small' ? 15 : 17)} tint={ink} />
      ) : null}
      {title !== undefined ? (
        <Text
          variant={size === 'regular' ? 'headline' : 'callout'}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={[styles.label, { color: ink }]}
        >
          {title}
        </Text>
      ) : null}
    </Pressable>
  );
}
