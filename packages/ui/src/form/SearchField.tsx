import { Pressable, type TextInputProps, View } from 'react-native';
import { Icon } from '../primitives/Icon';
import { ThemedTextInput } from '../primitives/ThemedTextInput';
import { makeStyles, useTheme } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    minHeight: 40,
    paddingHorizontal: t.spacing.sm,
    borderRadius: t.metrics.cardRadius,
    backgroundColor: t.colors.control,
  },
  input: { flex: 1, color: t.colors.textPrimary, fontSize: 17, paddingVertical: 0 },
}));

export interface SearchFieldProps
  extends Omit<TextInputProps, 'style' | 'placeholderTextColor' | 'selectionColor' | 'value'> {
  /** The placeholder and the accessibility label ("Search Agents"). */
  label: string;
  value: string;
  clearLabel?: string;
}

/** The system-style search field: a control-colored capsule with a magnifier, placeholder and clear button. */
export function SearchField({
  label,
  value,
  onChangeText,
  clearLabel = 'Clear',
  ...rest
}: SearchFieldProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Icon name="search" size={16} color="textTertiary" />
      <ThemedTextInput
        {...rest}
        value={value}
        onChangeText={onChangeText}
        placeholder={label}
        accessibilityLabel={label}
        style={styles.input}
      />
      {value !== '' ? (
        <Pressable
          onPress={() => onChangeText?.('')}
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
          hitSlop={10}
        >
          <Icon name="close" size={16} color="textTertiary" />
        </Pressable>
      ) : null}
    </View>
  );
}
