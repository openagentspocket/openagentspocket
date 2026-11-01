import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { makeStyles, useTheme } from '../theme/theme';
import type { ColorKey } from '../theme/tokens.generated';

export type TextVariant = 'title' | 'headline' | 'body' | 'caption' | 'label' | 'mono';
export type TextTone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'danger';

const TONE_COLOR: Record<TextTone, ColorKey> = {
  primary: 'textPrimary',
  secondary: 'textSecondary',
  tertiary: 'textTertiary',
  accent: 'accent',
  danger: 'danger',
};

const useStyles = makeStyles(() => ({
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.6 },
  mono: { fontSize: 13, lineHeight: 18, fontFamily: 'Menlo' },
}));

interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
}

export function Text({ variant = 'body', tone = 'primary', style, ...rest }: TextProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <RNText {...rest} style={[styles[variant], { color: theme.colors[TONE_COLOR[tone]] }, style]} />
  );
}
