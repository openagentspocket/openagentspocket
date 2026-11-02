import type { Ref } from 'react';
import { TextInput, type TextInputInstance, type TextInputProps, View } from 'react-native';
import { monoFamily, Text } from '../primitives/Text';
import { makeStyles, useTheme } from '../theme/theme';

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
    fontSize: 15,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  mono: { fontFamily: monoFamily, fontSize: 14 },
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
  ref?: Ref<TextInputInstance>;
}

/** A labeled text input on the control fill, with a hint or an error under it. */
export function TextField({
  label,
  error,
  hint,
  mono = false,
  multiline,
  testID,
  ref,
  ...input
}: TextFieldProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
      <TextInput
        ref={ref}
        {...input}
        multiline={multiline}
        accessibilityLabel={input.accessibilityLabel ?? label}
        accessibilityHint={error ?? hint}
        aria-invalid={error !== undefined}
        placeholderTextColor={theme.colors.textTertiary}
        selectionColor={theme.colors.accent}
        keyboardAppearance={theme.appearance}
        style={[
          styles.input,
          multiline && styles.multiline,
          mono && styles.mono,
          error !== undefined && styles.invalid,
        ]}
        testID={testID}
      />
      {error !== undefined ? (
        <Text variant="caption" tone="danger" testID={testID ? `${testID}-error` : undefined}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
