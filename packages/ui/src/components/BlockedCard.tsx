import { useState } from 'react';
import { View } from 'react-native';
import { TextField } from '../form/TextField';
import { BoundedScroll } from '../primitives/BoundedScroll';
import { Button } from '../primitives/Button';
import { Card } from '../primitives/Card';
import { Icon } from '../primitives/Icon';
import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import { makeStyles } from '../theme/theme';

export type BlockedOptionKind = 'primary' | 'secondary' | 'destructive';

/** One control of the card. */
export interface BlockedAction {
  id: string;
  label: string;
  onPress: () => void;
}

export interface BlockedOption extends BlockedAction {
  kind?: BlockedOptionKind;
  /** Amber line right under this option ("Saves a rule, so this isn't asked again."). */
  warning?: string;
}

/** A dialog the app read: what it asks about, one button per answer. */
export interface BlockedPromptBody {
  kind: 'prompt';
  description?: string;
  /** The command, path or URL the dialog asks about (monospaced box). */
  code?: string;
  options: readonly BlockedOption[];
  /** A quiet line under the answers ("Type your own answer in the terminal."). */
  hint?: string;
  /** The way out when no answer is one; a text button under them. */
  stop?: BlockedAction & { disabled?: boolean };
  /** A question dialog asks for typed text next to its options. */
  question?: { fieldLabel: string; placeholder?: string; onSubmit: (text: string) => void };
  /** Offers Add a Note under the answers. */
  onNote?: (text: string) => void;
}

/** A dialog the app does not know: the Agent's screen as it is, and its numbered answers. */
export interface BlockedExcerptBody {
  kind: 'excerpt';
  text: string;
  options: readonly BlockedAction[];
}

/** Nothing readable on the Agent's screen: a sentence and raw keys. */
export interface BlockedKeysBody {
  kind: 'keys';
  message: string;
  keys: readonly BlockedAction[];
}

export type BlockedBody = BlockedPromptBody | BlockedExcerptBody | BlockedKeysBody;

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
  code: {
    backgroundColor: t.colors.control,
    borderRadius: t.metrics.cardRadius,
    padding: t.spacing.sm,
  },
  choices: { gap: t.spacing.xs },
  pad: { flexDirection: 'row', gap: t.spacing.xs, flexWrap: 'wrap' },
  warning: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs },
  note: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs, minHeight: 32 },
}));

/** The typed answer: free text with its send button, cleared once sent. */
function TextAnswer({
  field,
  send,
  onSubmit,
  name,
}: {
  field: { label: string; placeholder?: string; multiline?: boolean };
  send: string;
  onSubmit: (text: string) => void;
  /** Names the testIDs: `blocked-<name>-field`, `blocked-send-<name>`. */
  name: string;
}) {
  const [draft, setDraft] = useState('');
  const submit = () => {
    const value = draft.trim();
    if (!value) return;
    onSubmit(value);
    setDraft('');
  };
  return (
    <>
      <TextField
        label={field.label}
        placeholder={field.placeholder}
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={field.multiline ? undefined : submit}
        multiline={field.multiline}
        testID={`blocked-${name}-field`}
      />
      <Button
        title={send}
        onPress={submit}
        disabled={!draft.trim()}
        testID={`blocked-send-${name}`}
      />
    </>
  );
}

function AddNote({
  onNote,
  labels,
}: {
  onNote: (text: string) => void;
  labels: BlockedCardLabels;
}) {
  const styles = useStyles();
  const [noting, setNoting] = useState(false);
  if (noting) {
    return (
      <TextAnswer
        field={{ label: labels.noteField, placeholder: labels.notePlaceholder, multiline: true }}
        send={labels.sendNote}
        onSubmit={(text) => {
          onNote(text);
          setNoting(false);
        }}
        name="note"
      />
    );
  }
  return (
    <Tappable
      style={styles.note}
      onPress={() => setNoting(true)}
      accessibilityRole="button"
      accessibilityLabel={labels.addNote}
      testID="blocked-add-note"
    >
      <Icon name="note" color="accent" />
      <Text variant="subheadline" tone="accent">
        {labels.addNote}
      </Text>
    </Tappable>
  );
}

function PromptBody({
  body,
  disabled,
  labels,
}: {
  body: BlockedPromptBody;
  disabled: boolean;
  labels: BlockedCardLabels;
}) {
  const styles = useStyles();
  const { question, onNote, stop } = body;
  return (
    <>
      <BoundedScroll testID="blocked-subject">
        {body.description ? (
          <Text variant="subheadline" tone="secondary">
            {body.description}
          </Text>
        ) : null}
        {body.code ? (
          <View style={styles.code} testID="blocked-code">
            <Text variant="mono">{body.code}</Text>
          </View>
        ) : null}
      </BoundedScroll>
      <View style={styles.choices}>
        {body.options.map((option) => (
          <View key={option.id} style={styles.choices}>
            <Button
              title={option.label}
              kind={option.kind ?? 'secondary'}
              disabled={disabled}
              onPress={option.onPress}
              testID={`blocked-option-${option.id}`}
            />
            {option.warning ? (
              <View style={styles.warning} testID={`blocked-warning-${option.id}`}>
                <Icon name="warning" size={13} color="warning" />
                <Text variant="footnote" tone="warning">
                  {option.warning}
                </Text>
              </View>
            ) : null}
          </View>
        ))}
        {body.hint ? (
          <Text variant="footnote" tone="secondary">
            {body.hint}
          </Text>
        ) : null}
        {stop ? (
          <Button
            title={stop.label}
            kind="text"
            disabled={stop.disabled}
            onPress={stop.onPress}
            testID="blocked-stop"
          />
        ) : null}
      </View>
      {question ? (
        <TextAnswer
          field={{ label: question.fieldLabel, placeholder: question.placeholder }}
          send={labels.send}
          onSubmit={question.onSubmit}
          name="question"
        />
      ) : null}
      {onNote && !question ? <AddNote onNote={onNote} labels={labels} /> : null}
    </>
  );
}

function ExcerptBody({ body, disabled }: { body: BlockedExcerptBody; disabled: boolean }) {
  const styles = useStyles();
  return (
    <>
      <BoundedScroll testID="blocked-excerpt">
        <View style={styles.code}>
          <Text variant="mono">{body.text}</Text>
        </View>
      </BoundedScroll>
      <View style={styles.choices}>
        {body.options.map((option) => (
          <Button
            key={option.id}
            title={option.label}
            kind="secondary"
            disabled={disabled}
            onPress={option.onPress}
            testID={`blocked-generic-${option.id}`}
          />
        ))}
      </View>
    </>
  );
}

function KeysBody({ body, disabled }: { body: BlockedKeysBody; disabled: boolean }) {
  const styles = useStyles();
  return (
    <>
      <Text variant="body">{body.message}</Text>
      <View style={styles.pad} testID="blocked-keypad">
        {body.keys.map((key) => (
          <Button
            key={key.id}
            title={key.label}
            kind="secondary"
            size="small"
            disabled={disabled}
            onPress={key.onPress}
          />
        ))}
      </View>
    </>
  );
}

export interface BlockedCardProps {
  /** "Bash command", "Question". */
  title: string;
  /** What the card shows under its header; `body.kind` is the variant. */
  body: BlockedBody;
  /** Every answer waits: keys are going out, or an answer went unconfirmed. */
  disabled?: boolean;
  /** Collapsed: one bar with the title and a chevron. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  /** Amber line at the foot of the card ("This prompt changed."). */
  notice?: string;
  labels?: Partial<BlockedCardLabels>;
  testID?: string;
}

/**
 * The Blocked card over the composer: the Agent's dialog as a card with the answers one tap
 * away. A long subject scrolls inside its own box, so the answers stay on screen. Presentational;
 * the store decides what is offered and what is sent.
 */
export function BlockedCard({
  title,
  body,
  disabled = false,
  collapsed = false,
  onToggleCollapsed,
  notice,
  labels,
  testID = 'blocked-card',
}: BlockedCardProps) {
  const styles = useStyles();
  const text = { ...defaultBlockedCardLabels, ...labels };
  return (
    <Card accent="warning" testID={testID}>
      <Tappable
        style={styles.header}
        onPress={onToggleCollapsed}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${collapsed ? text.expand : text.collapse}`}
        accessibilityState={{ expanded: !collapsed }}
        testID="blocked-collapse"
      >
        <Icon name="hand" size={20} color="warning" />
        <Text variant="headline" style={styles.title} numberOfLines={collapsed ? 1 : 2}>
          {title}
        </Text>
        <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} color="accent" />
      </Tappable>
      {collapsed ? null : (
        <>
          {body.kind === 'prompt' ? (
            <PromptBody body={body} disabled={disabled} labels={text} />
          ) : null}
          {body.kind === 'excerpt' ? <ExcerptBody body={body} disabled={disabled} /> : null}
          {body.kind === 'keys' ? <KeysBody body={body} disabled={disabled} /> : null}
          {notice ? (
            <Text variant="footnote" tone="warning" testID="blocked-notice">
              {notice}
            </Text>
          ) : null}
        </>
      )}
    </Card>
  );
}
