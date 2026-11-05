import type { BlockedCardState, BlockedDialog, GenericDialogExcerpt } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, Card, Icon, makeStyles, Text } from '@openagentspocket/ui';
import { Pressable, View } from 'react-native';
import { cardTitle, isTappable, optionKind, stopLabel } from './dialogModel';
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
}));

export interface BlockedCardProps {
  state: BlockedCardState;
  onChoose: (ordinal: number) => void;
  onStop: () => void;
  onPress: (number: number) => void;
  onKeys: (keys: string[]) => void;
  onCollapsedChange: (collapsed: boolean) => void;
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
  return (
    <>
      <View style={styles.code}>
        <Text variant="mono">{excerpt.rows.map((row) => row.text.trimEnd()).join('\n')}</Text>
      </View>
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

function Known({
  dialog,
  state,
  onChoose,
  onStop,
}: Pick<BlockedCardProps, 'onChoose' | 'onStop'> & {
  dialog: BlockedDialog;
  state: BlockedCardState;
}) {
  const styles = useStyles();
  const { description, code } = subjectOf(dialog);
  const disabled = state.progress !== 'ready';
  const stop = stopLabel(dialog, state.progress);
  return (
    <>
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
      <View style={styles.choices}>
        {dialog.options.filter(isTappable).map((option) => (
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
  if (content.kind === 'none') return null;
  const heading =
    content.kind === 'card'
      ? cardTitle(content.dialog)
      : content.kind === 'generic'
        ? t('Question')
        : t('Keys');
  return (
    <Card accent="warning" testID="blocked-card">
      <Pressable
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
      </Pressable>
      {state.isCollapsed ? null : (
        <>
          {content.kind === 'card' ? (
            <Known
              dialog={content.dialog}
              state={state}
              onChoose={props.onChoose}
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
        </>
      )}
    </Card>
  );
}
