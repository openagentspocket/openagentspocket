import {
  Platform,
  Text as RNText,
  type TextProps as RNTextProps,
  StyleSheet,
  type TextStyle,
} from 'react-native';
import { useFontScaleOverride } from '../theme/accessibility';
import { makeStyles, useTheme } from '../theme/theme';
import type { ColorKey } from '../theme/tokens.generated';
import { type TextVariant, typography } from '../theme/typography';

export type { TextVariant } from '../theme/typography';

export type TextTone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'accent'
  | 'onAccent'
  | 'danger'
  | 'warning'
  | 'success';

const TONE_COLOR: Record<TextTone, ColorKey> = {
  primary: 'textPrimary',
  secondary: 'textSecondary',
  tertiary: 'textTertiary',
  accent: 'accent',
  onAccent: 'onAccent',
  danger: 'danger',
  warning: 'warning',
  success: 'success',
};

/** The platform's monospaced face. */
export const monoFamily = Platform.select({ ios: 'Menlo', default: 'monospace' });
/** SF Mono on iOS (system monospaced design), for UI text; the terminal keeps `monoFamily`. */
export const uiMonoFamily = Platform.select({ ios: 'ui-monospace', default: 'monospace' });

const useStyles = makeStyles(() => ({
  ...typography,
  mono: { ...typography.mono, fontFamily: uiMonoFamily },
  monoFace: { fontFamily: uiMonoFamily },
  semibold: { fontWeight: '600' },
  digits: { fontVariant: ['tabular-nums'] },
}));

interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  /** Monospaced face at the variant's size (addresses, paths, models, ages). */
  monospaced?: boolean;
  /** Semibold weight at the variant's size. */
  semibold?: boolean;
  /** Fixed-width digits, for counts and ages. */
  tabularNums?: boolean;
}

export function Text({
  variant = 'body',
  tone = 'primary',
  monospaced,
  semibold,
  tabularNums,
  style,
  ...rest
}: TextProps) {
  const styles = useStyles();
  const theme = useTheme();
  const forced = useFontScaleOverride();
  const base: TextStyle = StyleSheet.flatten(styles[variant]) ?? {};
  const scaled =
    forced && forced !== 1
      ? {
          fontSize: (base.fontSize ?? 17) * forced,
          lineHeight: base.lineHeight ? base.lineHeight * forced : undefined,
        }
      : null;
  return (
    <RNText
      selectionColor={theme.colors.accent}
      {...rest}
      style={[
        styles[variant],
        scaled,
        monospaced && styles.monoFace,
        semibold && styles.semibold,
        tabularNums && styles.digits,
        { color: theme.colors[TONE_COLOR[tone]] },
        style,
      ]}
    />
  );
}
