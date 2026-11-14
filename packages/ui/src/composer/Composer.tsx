import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { ActionMenu, type ActionMenuItem } from '../overlay/ActionMenu';
import { Button } from '../primitives/Button';
import { Chip } from '../primitives/Chip';
import { ThemedTextInput } from '../primitives/ThemedTextInput';
import { rounded } from '../theme/corners';
import { makeStyles, useTheme } from '../theme/theme';
import { typography } from '../theme/typography';

export interface ComposerSuggestion {
  key: string;
  label: string;
}

/** What the trailing button does: send a draft or attachments; stop a busy Agent when there is neither. */
export type ComposerAction = 'send' | 'stop' | 'none';

export function composerAction(
  draft: string,
  busy: boolean,
  canStop: boolean,
  hasAttachments = false,
): ComposerAction {
  if (draft.trim().length > 0 || hasAttachments) return 'send';
  return busy && canStop ? 'stop' : 'none';
}

const useStyles = makeStyles((t) => ({
  root: {
    gap: t.spacing.xs,
    paddingHorizontal: t.spacing.xs,
    paddingVertical: t.spacing.xs,
    backgroundColor: t.colors.surfaceRaised,
    borderTopWidth: t.metrics.hairlineWidth,
    borderTopColor: t.hairline,
  },
  suggestions: { gap: t.spacing.xs, paddingHorizontal: t.spacing.xxs },
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: t.spacing.xxs },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 132,
    paddingHorizontal: t.spacing.sm,
    paddingTop: t.spacing.xs,
    paddingBottom: t.spacing.xs,
    ...rounded(t.radius.card),
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
    backgroundColor: t.colors.control,
    color: t.colors.textPrimary,
    fontSize: typography.subheadline.fontSize,
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
      <View style={styles.bar}>
        {addMenu?.length ? (
          <Button
            kind="text"
            icon="add"
            accessibilityLabel={addLabel}
            onPress={() => setMenuOpen(true)}
            disabled={disabled}
            testID={`${testID}-add`}
          />
        ) : null}
        <ThemedTextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          editable={!disabled}
          multiline
          style={styles.input}
          accessibilityLabel={placeholder}
          testID={`${testID}-input`}
        />
        {action === 'stop' ? (
          <Button
            kind="destructive"
            icon="stop"
            accessibilityLabel={stopLabel}
            onPress={() => onStop?.()}
            testID={`${testID}-stop`}
          />
        ) : (
          <Button
            kind="primary"
            icon="send"
            accessibilityLabel={sendLabel}
            onPress={onSend}
            disabled={disabled || action !== 'send'}
            testID={`${testID}-send`}
          />
        )}
      </View>
      {addMenu?.length ? (
        <ActionMenu items={addMenu} visible={menuOpen} onClose={() => setMenuOpen(false)} />
      ) : null}
    </View>
  );
}
