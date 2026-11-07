import type { BlockedCardState, BlockedDialog, GenericDialogExcerpt } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  BoundedScroll,
  Button,
  Card,
  Icon,
  makeStyles,
  Tappable,
  Text,
} from '@openagentspocket/ui';
import { useState } from 'react';
import { View } from 'react-native';
import { cardTitle, isMultiSelect, isTappable, optionKind, stopLabel } from './dialogModel';
import { cardText } from './text';

const useStyles = makeStyles((th) => ({
  header: { flexDirection: 'row', alignItems: 'center', gap: th.spacing.xs },
  title: { flex: 1 },
  code: {
    backgroundColor: th.colors.control,
    borderRadius: th.metrics.cardRadius,
    padding: th.spacing.sm,
  },
  choices: { gap: th.spacing.xs },
  pad: { flexDirection: 'row', gap: th.spacing.xs, flexWrap: 'wrap' },
  warning: { flexDirection: 'row', alignItems: 'center', gap: th.spacing.xxs },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.spacing.xs,
    minHeight: th.metrics.minTapSize,
  },
}));

export interface BlockedCardProps {
  state: BlockedCardState;
  onChoose: (ordinal: number) => void;
  /** Leaves exactly these answers checked on a multi-select question, then goes on. */
  onSubmitSelection: (ordinals: number[]) => void;
  onStop: () => void;
  onPress: (number: number) => void;
  onKeys: (keys: string[]) => void;
  onCollapsedChange: (collapsed: boolean) => void;
  /** The way out of whatever the card cannot do. */
  onShowTerminal?: () => void;
}

/** What the dialog asks about: the command, file, URL or host, and the Agent's own description. */
function subjectOf(dialog: BlockedDialog): { description: string | null; code: string | null } {
  const { subject } = dialog;
  const code = subject.command ?? subject.filePath ?? subject.url ?? subject.host;
  const description = subject.commandDescription ?? subject.reason ?? null;
  if (code) return { description, code };
  return { description: dialog.body.join('\n') || null, code: null };
}

function KeyPad({ onKeys, disabled }: { onKeys: (keys: string[]) => void; disabled: boolean }) {
  const styles = useStyles();
  const keys: { keys: string[]; label: string }[] = [
    { keys: ['up'], label: '↑' },
    { keys: ['down'], label: '↓' },
    { keys: ['enter'], label: t('Enter') },
    { keys: ['esc'], label: t('Escape') },
  ];
  return (
    <View style={styles.pad} testID="blocked-keypad">
      {keys.map((key) => (
        <Button
          key={key.label}
          title={key.label}
          kind="secondary"
          size="small"
          disabled={disabled}
          onPress={() => onKeys(key.keys)}
        />
      ))}
    </View>
  );
}

function Generic({
  excerpt,
  disabled,
  onPress,
}: {
  excerpt: GenericDialogExcerpt;
  disabled: boolean;
  onPress: (number: number) => void;
}) {
  const styles = useStyles();
  const numbers = [...excerpt.numbered.keys()].sort((a, b) => a - b);
  const reason = cardText(excerpt.reason);
  return (
    <>
      <BoundedScroll testID="blocked-excerpt">
        <View style={styles.code}>
          <Text variant="mono">{excerpt.rows.map((row) => row.text.trimEnd()).join('\n')}</Text>
        </View>
      </BoundedScroll>
      {reason ? (
        <Text variant="footnote" tone="secondary" testID="blocked-generic-reason">
          {reason}
        </Text>
      ) : null}
      <View style={styles.choices}>
        {numbers.map((number) => (
          <Button
            key={number}
            title={`${number}. ${excerpt.numbered.get(number) ?? ''}`}
            kind="secondary"
            disabled={disabled}
            onPress={() => onPress(number)}
            testID={`blocked-generic-${number}`}
          />
        ))}
      </View>
    </>
  );
}

/** A multi-select question's answers: toggles here, keys only once the selection goes. */
function Selection({
  dialog,
  disabled,
  onSubmit,
}: {
  dialog: BlockedDialog;
  disabled: boolean;
  onSubmit: (ordinals: number[]) => void;
}) {
  const styles = useStyles();
  const answers = dialog.options.filter((option) => option.role === 'answer');
  const button = dialog.options.find((option) => option.role === 'next');
  const [selection, setSelection] = useState<readonly number[]>(() =>
    dialog.focus.checked.filter((ordinal) => answers.some((a) => a.ordinal === ordinal)),
  );
  const toggle = (ordinal: number) =>
    setSelection((current) =>
      current.includes(ordinal)
        ? current.filter((other) => other !== ordinal)
        : [...current, ordinal],
    );
  return (
    <>
      {answers.map((option) => {
        const checked = selection.includes(option.ordinal);
        return (
          <Tappable
            key={option.ordinal}
            style={styles.toggle}
            onPress={() => toggle(option.ordinal)}
            accessibilityRole="checkbox"
            accessibilityLabel={option.label}
            accessibilityState={{ checked }}
            testID={`blocked-toggle-${option.ordinal}`}
          >
            <Icon name={checked ? 'statusDone' : 'statusIdle'} color="accent" />
            <Text variant="body">{option.label}</Text>
          </Tappable>
        );
      })}
      <Button
        title={button?.label ?? t('Next')}
        kind="primary"
        disabled={disabled || selection.length === 0}
        onPress={() => onSubmit([...selection].sort((a, b) => a - b))}
        testID="blocked-submit-selection"
      />
    </>
  );
}

function Known({
  dialog,
  state,
  onChoose,
  onSubmitSelection,
  onStop,
}: Pick<BlockedCardProps, 'onChoose' | 'onSubmitSelection' | 'onStop'> & {
  dialog: BlockedDialog;
  state: BlockedCardState;
}) {
  const styles = useStyles();
  const { description, code } = subjectOf(dialog);
  const disabled = state.progress !== 'ready';
  const stop = stopLabel(dialog, state.progress);
  const multi = isMultiSelect(dialog);
  const buttons = dialog.options.filter(
    (option) => isTappable(option) && !(multi && ['answer', 'next'].includes(option.role)),
  );
  return (
    <>
      <BoundedScroll testID="blocked-subject">
        {description ? (
          <Text variant="subheadline" tone="secondary">
            {description}
          </Text>
        ) : null}
        {code ? (
          <View style={styles.code}>
            <Text variant="mono">{code}</Text>
          </View>
        ) : null}
      </BoundedScroll>
      <View style={styles.choices}>
        {multi ? (
          <Selection dialog={dialog} disabled={disabled} onSubmit={onSubmitSelection} />
        ) : null}
        {buttons.map((option) => (
          <View key={option.ordinal} style={styles.choices}>
            <Button
              title={option.label}
              kind={optionKind(option)}
              disabled={disabled}
              onPress={() => onChoose(option.ordinal)}
              testID={`blocked-option-${option.ordinal}`}
            />
            {option.role === 'approvePersistent' ? (
              <View style={styles.warning}>
                <Icon name="warning" size={13} color="warning" />
                <Text variant="footnote" tone="warning">
                  {t("Saves a rule, so this isn't asked again.")}
                </Text>
              </View>
            ) : null}
          </View>
        ))}
        {dialog.options.some((option) => !isTappable(option)) ? (
          <Text variant="footnote" tone="secondary">
            {t('Type your own answer in the terminal.')}
          </Text>
        ) : null}
        {stop ? (
          <Button
            title={stop}
            kind="text"
            disabled={state.progress === 'acting'}
            onPress={onStop}
            testID="blocked-stop"
          />
        ) : null}
      </View>
    </>
  );
}

/**
 * The Blocked card: the dialog on the Agent's screen as a native card. Presentational; the
 * store (`BlockedCardStore`) decides what is offered and what is sent.
 */
export function BlockedCard(props: BlockedCardProps) {
  const { state, onCollapsedChange } = props;
  const styles = useStyles();
  const { content } = state;
  // A question no read shows has only its row to say so: no keys go out on a guess.
  if (content.kind === 'none' || content.kind === 'questionUnread') return null;
  const heading =
    content.kind === 'card'
      ? cardTitle(content.dialog)
      : content.kind === 'generic'
        ? t('Needs you')
        : t('Keys');
  return (
    <Card accent="warning" testID="blocked-card">
      <Tappable
        style={styles.header}
        onPress={() => onCollapsedChange(!state.isCollapsed)}
        accessibilityRole="button"
        accessibilityLabel={`${heading}, ${state.isCollapsed ? t('Expand') : t('Collapse')}`}
        accessibilityState={{ expanded: !state.isCollapsed }}
        testID="blocked-collapse"
      >
        <Icon name="hand" size={20} color="warning" />
        <Text variant="headline" style={styles.title} numberOfLines={state.isCollapsed ? 1 : 2}>
          {heading}
        </Text>
        <Icon name={state.isCollapsed ? 'chevronRight' : 'chevronDown'} color="accent" />
      </Tappable>
      {state.isCollapsed ? null : (
        <>
          {content.kind === 'card' ? (
            <Known
              key={state.dialogGeneration}
              dialog={content.dialog}
              state={state}
              onChoose={props.onChoose}
              onSubmitSelection={props.onSubmitSelection}
              onStop={props.onStop}
            />
          ) : null}
          {content.kind === 'generic' ? (
            <Generic
              excerpt={content.excerpt}
              disabled={state.progress !== 'ready'}
              onPress={props.onPress}
            />
          ) : null}
          {content.kind === 'unreadable' ? (
            <>
              <Text variant="body">
                {t(
                  "The Agent is waiting on something Agentico can't read. Answer with these keys or in the terminal.",
                )}
              </Text>
              <KeyPad onKeys={props.onKeys} disabled={state.progress === 'acting'} />
            </>
          ) : null}
          {state.notice ? (
            <Text variant="footnote" tone="warning" testID="blocked-notice">
              {cardText(state.notice)}
            </Text>
          ) : null}
          {props.onShowTerminal ? (
            <Button
              title={t('Show Terminal')}
              kind="text"
              size="small"
              onPress={props.onShowTerminal}
              testID="blocked-show-terminal"
            />
          ) : null}
        </>
      )}
    </Card>
  );
}
