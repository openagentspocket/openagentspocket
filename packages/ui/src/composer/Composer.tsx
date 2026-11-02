import { type ReactNode, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { ActionMenu, type ActionMenuItem } from '../overlay/ActionMenu';
import { Chip } from '../primitives/Chip';
import { Icon } from '../primitives/Icon';
import { makeStyles, useTheme } from '../theme/theme';

export interface ComposerSuggestion {
  key: string;
  label: string;
}

/** What the trailing button does: send a non-empty draft; stop a busy Agent when the draft is empty. */
export type ComposerAction = 'send' | 'stop' | 'none';

export function composerAction(draft: string, busy: boolean, canStop: boolean): ComposerAction {
  if (draft.trim().length > 0) return 'send';
  return busy && canStop ? 'stop' : 'none';
}

const useStyles = makeStyles((t) => ({
  // Swift: one rounded card, the draft on top, a row of round buttons under it.
  root: {
    gap: t.spacing.xs,
    marginHorizontal: t.spacing.md,
    marginVertical: t.spacing.xs,
    padding: t.spacing.xs,
    borderRadius: 16,
    backgroundColor: t.colors.surfaceRaised,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
  },
  suggestions: { gap: t.spacing.xs, paddingHorizontal: t.spacing.xxs },
  bar: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  spacer: { flex: 1 },
  input: {
    minHeight: 36,
    maxHeight: 132,
    paddingHorizontal: t.spacing.xs,
    paddingVertical: t.spacing.xxs,
    color: t.colors.textPrimary,
    fontSize: 17,
  },
  round: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

interface ComposerProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  /** Interrupts the Agent; shown in place of Send while it works and the draft is empty. */
  onStop?: () => void;
  /** The Agent is working. */
  busy?: boolean;
  placeholder?: string;
  /** The add button's menu (attach a file, a snippet, a skill). */
  addMenu?: readonly ActionMenuItem[];
  suggestions?: readonly ComposerSuggestion[];
  onSuggestion?: (key: string) => void;
  disabled?: boolean;
  sendLabel?: string;
  stopLabel?: string;
  addLabel?: string;
  /** More round buttons after Add (the Chat/Terminal toggle, the more menu). */
  tools?: ReactNode;
  /** Inside the card under the buttons (the agent switcher). */
  footer?: ReactNode;
  testID?: string;
}

/** The chat composer: a multiline draft, an add menu, Send or Stop, and a suggestions strip. */
export function Composer({
  value,
  onChangeText,
  onSend,
  onStop,
  busy = false,
  placeholder,
  addMenu,
  suggestions,
  onSuggestion,
  disabled = false,
  sendLabel = 'Send',
  stopLabel = 'Stop',
  addLabel = 'Add',
  tools,
  footer,
  testID = 'composer',
}: ComposerProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const action = composerAction(value, busy, onStop !== undefined);
  return (
    <View style={styles.root} testID={testID}>
      {suggestions?.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          contentContainerStyle={styles.suggestions}
        >
          {suggestions.map((suggestion) => (
            <Chip
              key={suggestion.key}
              label={suggestion.label}
              mono={false}
              onPress={() => onSuggestion?.(suggestion.key)}
              testID={`suggestion-${suggestion.key}`}
            />
          ))}
        </ScrollView>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textTertiary}
        selectionColor={theme.colors.accent}
        keyboardAppearance={theme.appearance}
        editable={!disabled}
        multiline
        numberOfLines={1}
        style={styles.input}
        accessibilityLabel={placeholder}
        testID={`${testID}-input`}
      />
      <View style={styles.bar}>
        {addMenu?.length ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={addLabel}
            onPress={() => setMenuOpen(true)}
            disabled={disabled}
            style={[styles.round, { backgroundColor: theme.colors.control }]}
            testID={`${testID}-add`}
          >
            <Icon name="add" color="textPrimary" size={18} />
          </Pressable>
        ) : null}
        {tools}
        <View style={styles.spacer} />
        {action === 'stop' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={stopLabel}
            onPress={() => onStop?.()}
            style={[styles.round, { backgroundColor: theme.colors.danger }]}
            testID={`${testID}-stop`}
          >
            <Icon name="stop" tint={theme.colors.onAccent} size={16} />
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={sendLabel}
            accessibilityState={{ disabled: disabled || action !== 'send' }}
            onPress={onSend}
            disabled={disabled || action !== 'send'}
            style={[
              styles.round,
              {
                backgroundColor: theme.colors.accent,
                opacity: disabled || action !== 'send' ? 0.4 : 1,
              },
            ]}
            testID={`${testID}-send`}
          >
            <Icon name="send" tint={theme.colors.onAccent} size={16} weight="bold" />
          </Pressable>
        )}
      </View>
      {footer}
      {addMenu?.length ? (
        <ActionMenu items={addMenu} visible={menuOpen} onClose={() => setMenuOpen(false)} />
      ) : null}
    </View>
  );
}
