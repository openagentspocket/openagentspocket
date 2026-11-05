import type { Ref } from 'react';
import { TextInput, type TextInputInstance, type TextInputProps } from 'react-native';
import { useTheme } from '../theme/theme';

export type ThemedTextInputProps = Omit<
  TextInputProps,
  | 'placeholderTextColor'
  | 'selectionColor'
  | 'cursorColor'
  | 'selectionHandleColor'
  | 'keyboardAppearance'
> & { ref?: Ref<TextInputInstance> };

/**
 * The one text input: caret, selection and handles in the accent, placeholder in tertiary ink and
 * the keyboard in the theme's appearance. Every field in the app is this (TextField, search,
 * composer, rename...), so no input falls back to the platform's blue or gray.
 */
export function ThemedTextInput(props: ThemedTextInputProps) {
  const theme = useTheme();
  return (
    <TextInput
      {...props}
      placeholderTextColor={theme.colors.textTertiary}
      selectionColor={theme.colors.accent}
      cursorColor={theme.colors.accent}
      selectionHandleColor={theme.colors.accent}
      keyboardAppearance={theme.appearance}
    />
  );
}
