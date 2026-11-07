import type {
  BlockedCardState,
  BlockedDialog,
  DialogOption,
  GenericDialogExcerpt,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  type BlockedBody,
  BlockedCard as BlockedCardView,
  type BlockedOption,
} from '@openagentspocket/ui';
import { cardTitle, isTappable, optionKind, stopLabel } from './dialogModel';
import { cardText } from './text';

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

function optionOf(option: DialogOption, onChoose: (ordinal: number) => void): BlockedOption {
  return {
    id: String(option.ordinal),
    label: option.label,
    kind: optionKind(option),
    warning:
      option.role === 'approvePersistent'
        ? t("Saves a rule, so this isn't asked again.")
        : undefined,
    onPress: () => onChoose(option.ordinal),
  };
}

function promptBody(
  dialog: BlockedDialog,
  { state, onChoose, onStop }: BlockedCardProps,
): BlockedBody {
  const { description, code } = subjectOf(dialog);
  const stop = stopLabel(dialog, state.progress);
  return {
    kind: 'prompt',
    description: description ?? undefined,
    code: code ?? undefined,
    options: dialog.options.filter(isTappable).map((option) => optionOf(option, onChoose)),
    hint: dialog.options.some((option) => !isTappable(option))
      ? t('Type your own answer in the terminal.')
      : undefined,
    stop: stop
      ? { id: 'stop', label: stop, disabled: state.progress === 'acting', onPress: onStop }
      : undefined,
  };
}

function excerptBody(
  excerpt: GenericDialogExcerpt,
  onPress: (number: number) => void,
): BlockedBody {
  const numbers = [...excerpt.numbered.keys()].sort((a, b) => a - b);
  return {
    kind: 'excerpt',
    text: excerpt.rows.map((row) => row.text.trimEnd()).join('\n'),
    options: numbers.map((number) => ({
      id: String(number),
      label: `${number}. ${excerpt.numbered.get(number) ?? ''}`,
      onPress: () => onPress(number),
    })),
  };
}

function keysBody(onKeys: (keys: string[]) => void): BlockedBody {
  const keys: { keys: string[]; label: string }[] = [
    { keys: ['up'], label: '↑' },
    { keys: ['down'], label: '↓' },
    { keys: ['enter'], label: t('Enter') },
    { keys: ['esc'], label: t('Escape') },
  ];
  return {
    kind: 'keys',
    message: t(
      "The Agent is waiting on something Agentico can't read. Answer with these keys or in the terminal.",
    ),
    keys: keys.map((key) => ({
      id: key.label,
      label: key.label,
      onPress: () => onKeys(key.keys),
    })),
  };
}

/**
 * The Blocked card: the dialog on the Agent's screen as a native card. Maps the store's state
 * (`BlockedCardStore` decides what is offered and what is sent) to the card in `packages/ui`.
 */
export function BlockedCard(props: BlockedCardProps) {
  const { state, onCollapsedChange } = props;
  const { content } = state;
  if (content.kind === 'none') return null;
  const title =
    content.kind === 'card'
      ? cardTitle(content.dialog)
      : content.kind === 'generic'
        ? t('Question')
        : t('Keys');
  const body =
    content.kind === 'card'
      ? promptBody(content.dialog, props)
      : content.kind === 'generic'
        ? excerptBody(content.excerpt, props.onPress)
        : keysBody(props.onKeys);
  return (
    <BlockedCardView
      title={title}
      body={body}
      // The raw keys stay live after an unconfirmed answer: they are the way out of it.
      disabled={
        content.kind === 'unreadable' ? state.progress === 'acting' : state.progress !== 'ready'
      }
      collapsed={state.isCollapsed}
      onToggleCollapsed={() => onCollapsedChange(!state.isCollapsed)}
      notice={state.notice ? cardText(state.notice) : undefined}
      labels={{ collapse: t('Collapse'), expand: t('Expand') }}
    />
  );
}
