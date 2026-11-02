import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { TextField } from '../form/TextField';
import { impact } from '../haptics';
import { Button } from '../primitives/Button';
import { Card } from '../primitives/Card';
import { Icon } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import { makeStyles, useTheme } from '../theme/theme';

export type BlockedOptionKind = 'primary' | 'secondary' | 'destructive';

export interface BlockedOption {
  id: string;
  label: string;
  kind?: BlockedOptionKind;
  /** Amber line right under this option ("Saves a rule, so this isn't asked again."). */
  warning?: string;
}

export interface BlockedPrompt {
  /** "Bash command", "Edit file", a question. */
  title: string;
  description?: string;
  /** The command, path or URL the dialog asks about (monospaced box). */
  code?: string;
  options: readonly BlockedOption[];
  /** A question dialog asks for typed text next to its options. */
  question?: { fieldLabel: string; placeholder?: string };
}

export interface BlockedCardLabels {
  collapse: string;
  expand: string;
  addNote: string;
  noteField: string;
  notePlaceholder: string;
  sendNote: string;
  send: string;
}

/** English defaults, the Swift wording; screens pass translations through `labels`. */
export const defaultBlockedCardLabels: BlockedCardLabels = {
  collapse: 'Collapse',
  expand: 'Expand',
  addNote: 'Add a Note',
  noteField: 'Note',
  notePlaceholder: 'Tell the agent what to do instead',
  sendNote: 'Send Note',
  send: 'Send',
};

const useStyles = makeStyles((t) => ({
  header: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  title: { flex: 1 },
  body: { gap: t.spacing.sm, marginTop: t.spacing.xs },
  code: {
    backgroundColor: t.colors.control,
    borderRadius: t.metrics.cardRadius,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
    paddingHorizontal: t.spacing.sm,
    paddingVertical: t.spacing.xs,
  },
  options: { gap: t.spacing.xs },
  option: {
    minHeight: t.metrics.minTapSize + 8,
    justifyContent: 'center',
    borderRadius: t.metrics.cardRadius,
    paddingHorizontal: t.spacing.sm,
    paddingVertical: t.spacing.xs,
    backgroundColor: t.colors.control,
  },
  primary: { backgroundColor: t.colors.accent },
  destructive: { backgroundColor: t.wash(t.colors.danger) },
  pressed: { opacity: 0.7 },
  warning: { flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.xxs },
  note: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs, minHeight: 32 },
}));

/** One full-width answer: Yes solid accent, others on the control fill, No on a red wash. */
function OptionButton({ option, onPress }: { option: BlockedOption; onPress: () => void }) {
  const styles = useStyles();
  const kind = option.kind ?? 'secondary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={option.label}
      onPress={() => {
        impact('light');
        onPress();
      }}
      style={({ pressed }) => [
        styles.option,
        kind === 'primary' && styles.primary,
        kind === 'destructive' && styles.destructive,
        pressed && styles.pressed,
      ]}
      testID={`blocked-option-${option.id}`}
    >
      <Text
        variant="body"
        semibold={kind !== 'secondary'}
        tone={kind === 'primary' ? 'onAccent' : kind === 'destructive' ? 'danger' : 'primary'}
      >
        {option.label}
      </Text>
    </Pressable>
  );
}

export interface BlockedCardProps {
  prompt: BlockedPrompt;
  /** Collapsed: one bar with the title and a chevron. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onChoose: (optionId: string) => void;
  /** Free text: the Add a Note field, or the answer of a question dialog. */
  onNote: (text: string) => void;
  labels?: Partial<BlockedCardLabels>;
  testID?: string;
}

/**
 * The Blocked card over the composer: the Agent's dialog as a card with the answers one tap
 * away. Presentational; the store decides what is offered and what is sent.
 */
export function BlockedCard({
  prompt,
  collapsed = false,
  onToggleCollapsed,
  onChoose,
  onNote,
  labels,
  testID = 'blocked-card',
}: BlockedCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const text = { ...defaultBlockedCardLabels, ...labels };
  const [noting, setNoting] = useState(false);
  const [draft, setDraft] = useState('');
  const submit = () => {
    const value = draft.trim();
    if (!value) return;
    onNote(value);
    setDraft('');
    setNoting(false);
  };
  const options = (
    <View style={styles.options}>
      {prompt.options.map((option) => (
        <View key={option.id} style={styles.options}>
          <OptionButton option={option} onPress={() => onChoose(option.id)} />
          {option.warning ? (
            <View style={styles.warning} testID={`blocked-warning-${option.id}`}>
              <Icon name="warning" size={13} tint={theme.colors.warning} />
              <Text variant="footnote" tone="warning">
                {option.warning}
              </Text>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
  return (
    <Card accent="warning" testID={testID}>
      <Pressable
        style={styles.header}
        onPress={onToggleCollapsed}
        accessibilityRole="button"
        accessibilityLabel={`${prompt.title}, ${collapsed ? text.expand : text.collapse}`}
        accessibilityState={{ expanded: !collapsed }}
        testID="blocked-header"
      >
        <Icon name="hand" size={20} tint={theme.colors.warning} />
        <Text variant="headline" style={styles.title} numberOfLines={1}>
          {prompt.title}
        </Text>
        <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} tint={theme.colors.accent} />
      </Pressable>
      {collapsed ? null : (
        <View style={styles.body}>
          {prompt.description ? (
            <Text variant="subheadline" tone="secondary">
              {prompt.description}
            </Text>
          ) : null}
          {prompt.code ? (
            <View style={styles.code} testID="blocked-code">
              <Text variant="mono">{prompt.code}</Text>
            </View>
          ) : null}
          {options}
          {prompt.question ? (
            <>
              <TextField
                label={prompt.question.fieldLabel}
                placeholder={prompt.question.placeholder}
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={submit}
                testID="blocked-question-field"
              />
              <Button
                title={text.send}
                onPress={submit}
                disabled={!draft.trim()}
                testID="blocked-send"
              />
            </>
          ) : (
            <>
              {noting ? (
                <>
                  <TextField
                    label={text.noteField}
                    placeholder={text.notePlaceholder}
                    value={draft}
                    onChangeText={setDraft}
                    multiline
                    testID="blocked-note-field"
                  />
                  <Button
                    title={text.sendNote}
                    onPress={submit}
                    disabled={!draft.trim()}
                    testID="blocked-send-note"
                  />
                </>
              ) : (
                <Pressable
                  style={styles.note}
                  onPress={() => setNoting(true)}
                  accessibilityRole="button"
                  accessibilityLabel={text.addNote}
                  testID="blocked-add-note"
                >
                  <Icon name="note" tint={theme.colors.accent} />
                  <Text variant="subheadline" tone="accent">
                    {text.addNote}
                  </Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      )}
    </Card>
  );
}
