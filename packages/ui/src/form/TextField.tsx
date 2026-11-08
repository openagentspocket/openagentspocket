import type { Ref } from 'react';
import { type TextInputInstance, type TextInputProps, View } from 'react-native';
import { monoFamily, Text } from '../primitives/Text';
import { ThemedTextInput } from '../primitives/ThemedTextInput';
import { makeStyles, useTheme } from '../theme/theme';
import { typography } from '../theme/typography';

const useStyles = makeStyles((t) => ({
  field: { gap: t.spacing.xxs },
  input: {
    minHeight: t.metrics.minTapSize,
    paddingHorizontal: t.spacing.sm,
    paddingVertical: t.spacing.xs,
    borderRadius: t.metrics.cardRadius,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
    backgroundColor: t.colors.control,
    color: t.colors.textPrimary,
    fontSize: typography.subheadline.fontSize,
  },
  inline: {
    minHeight: t.metrics.rowMinHeight,
    paddingHorizontal: t.spacing.md,
    color: t.colors.textPrimary,
    fontSize: typography.body.fontSize,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  mono: { fontFamily: monoFamily, fontSize: typography.mono.fontSize },
  invalid: { borderColor: t.colors.danger },
}));

export interface TextFieldProps
  extends Omit<TextInputProps, 'style' | 'placeholderTextColor' | 'selectionColor'> {
  label: string;
  /** Shown under the field in danger ink; marks the field invalid. */
  error?: string;
  /** Small print under the field when there is no error. */
  hint?: string;
  /** Monospaced input, for hosts, paths, keys. */
  mono?: boolean;
  /** A bare row for a grouped card (Swift form rows): no label above, no box; the label is the placeholder. */
  inline?: boolean;
  ref?: Ref<TextInputInstance>;
}

/** A labeled text input on the control fill, with a hint or an error under it. */
export function TextField({
  label,
  error,
  hint,
  mono = false,
  inline = false,
  multiline,
  testID,
  ref,
  ...input
}: TextFieldProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.field}>
      {inline ? null : (
        <Text variant="footnote" tone="secondary">
          {label}
        </Text>
      )}
      <ThemedTextInput
        ref={ref}
        {...input}
        multiline={multiline}
        accessibilityLabel={input.accessibilityLabel ?? label}
        accessibilityHint={error ?? hint}
        aria-invalid={error !== undefined}
        placeholder={inline ? (input.placeholder ?? label) : input.placeholder}
        style={[
          inline ? styles.inline : styles.input,
          multiline && styles.multiline,
          mono && styles.mono,
          error !== undefined && styles.invalid,
        ]}
        testID={testID}
      />
      {error !== undefined ? (
        <Text variant="footnote" tone="danger" testID={testID ? `${testID}-error` : undefined}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="footnote" tone="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
