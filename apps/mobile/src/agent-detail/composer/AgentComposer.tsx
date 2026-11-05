import {
  type ComposerDeliveryPolicy,
  type ComposerSkill,
  detectSkillTrigger,
  matchingSkills,
  primaryControl,
  refusalText,
  terminalPolicy,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  Banner,
  ComposerCard,
  KeyboardDock,
  type KeySpec,
  ProgramMark,
  type Status,
} from '@openagentspocket/ui';
import * as Clipboard from 'expo-clipboard';
import { useState, useSyncExternalStore } from 'react';
import { Pressable, View } from 'react-native';
import { renderMessage } from '@/usage/usageText';
import { agentBarLabels } from '../agentBarLabels';
import { useDetailUi } from '../detailUi';
import type { Surface } from '../surface';
import type { AgentComposer } from './composerContext';

/** The key the Close Pane popover points at: the composer's "..." circle. */
export const COMPOSER_MORE_ANCHOR = 'agent-composer-more';

/** Chat never types into the terminal: a Blocked Agent is answered with the Blocked card. */
const chatPolicy: ComposerDeliveryPolicy = {
  route: 'chat',
  insertsIntoAttachWhenBlocked: false,
  outgoingText: (text) => text,
  validate: () => undefined,
};

/** The keys that finish a draft typed into a Blocked terminal: the user presses them themselves. */
const ATTACH_KEYS: readonly (readonly KeySpec[])[] = [
  [
    { id: 'esc', label: 'Esc', accessibilityLabel: 'Escape' },
    { id: 'enter', label: 'Enter', icon: 'send', accessibilityLabel: 'Enter' },
  ],
];

interface Props {
  composer: AgentComposer;
  surface: Surface;
  /** Commands or Skills the draft's trailing token can complete; empty when the source is unknown. */
  skills?: readonly ComposerSkill[];
  skillPrefixes?: readonly string[];
  /** False where Esc does not interrupt (Grok Build): Send stays. */
  canStop?: boolean;
  /** Writes a key to the live terminal; the tools dock shows only after a draft went there. */
  onAttachKey?: (key: KeySpec) => void;
  /** The Agent's program and status: its mark flips Chat/Terminal in the composer row. */
  program?: string;
  status?: Status;
  onToggleSurface?: () => void;
}

/** The Composer under the Chat or Terminal slot: draft, Send or Stop, suggestions and what went wrong. */
export function AgentComposerBar({
  composer,
  surface,
  skills = [],
  skillPrefixes = ['/'],
  canStop = true,
  onAttachKey,
  program = 'unknown',
  status,
  onToggleSurface,
}: Props) {
  const { store, snapshot, interrupt } = composer;
  const { setComposing } = useDetailUi();
  const policy = surface === 'chat' ? chatPolicy : terminalPolicy;
  useSyncExternalStore(store.stop.subscribe, () => store.stop.phase);
  const held = useSyncExternalStore(store.stop.subscribe, () => store.stop.isHeldAfterSend);
  const [attachDraft, setAttachDraft] = useState(false);
  const trigger = detectSkillTrigger(snapshot.draft, skillPrefixes);
  const matches = trigger ? matchingSkills(trigger, skills) : [];
  const control = primaryControl({
    status: snapshot.status,
    draft: snapshot.draft,
    canStop: canStop && !held,
  });
  const notice =
    snapshot.notice && snapshot.notice.route === surface
      ? refusalText(snapshot.notice.refusal)
      : undefined;
  const stopNotice = store.stop.notice;
  const failed = snapshot.messages.filter(
    (message) => message.state.kind === 'failed' && message.route === surface,
  );

  const send = async () => {
    const result = await store.send(policy);
    setAttachDraft(result.kind === 'deliveredViaAttach');
  };

  return (
    <View testID="agent-composer">
      {failed.map((message) => (
        <Banner
          key={message.id}
          tone="danger"
          title={message.state.kind === 'failed' ? renderMessage(message.state.text) : ''}
          message={message.text}
          actionLabel={t('Retry')}
          onAction={() => void store.retry(message.id, policy)}
          onDismiss={() => store.withdrawToDraft(message.id)}
          dismissLabel={t('Edit')}
          testID={`composer-failed-${message.id}`}
        />
      ))}
      {snapshot.messages.some(
        (message) => message.state.kind === 'undelivered' && message.route === surface,
      ) ? (
        <Banner
          tone="warning"
          title={t('The message could not be sent. Check the connection and retry.')}
          testID="composer-undelivered"
        />
      ) : null}
      {notice ? (
        <Banner
          tone="warning"
          title={'key' in notice ? renderMessage({ key: notice.key }) : notice.plain}
          testID="composer-notice"
        />
      ) : null}
      {stopNotice ? (
        <Banner tone="warning" title={stopNotice} testID="composer-stop-notice" />
      ) : null}
      <ComposerCard
        value={snapshot.draft}
        onChange={(text) => store.applyEditorDraft(text, { start: text.length, end: text.length })}
        onSend={() => void send()}
        onStop={canStop ? () => void store.stop.stop(interrupt) : undefined}
        working={control === 'stop'}
        placeholder={t('Message Agent')}
        skills={matches.map((skill) => ({
          name: skill.command,
          description: skill.description ?? '',
        }))}
        onSkill={(command) => {
          if (trigger) store.replaceTrailingToken(trigger.token, `${command} `);
        }}
        expanded={surface === 'terminal' ? true : undefined}
        moreAnchorKey={COMPOSER_MORE_ANCHOR}
        onFocusChange={setComposing}
        moreMenu={[
          {
            key: 'paste',
            title: t('Paste'),
            icon: 'copy',
            onPress: () =>
              void Clipboard.getStringAsync().then((text) => {
                if (!text) return;
                const draft = snapshot.draft + text;
                store.applyEditorDraft(draft, { start: draft.length, end: draft.length });
              }),
          },
          {
            key: 'clear',
            title: t('Clear'),
            icon: 'trash',
            onPress: () => store.applyEditorDraft('', { start: 0, end: 0 }),
          },
        ]}
        leading={
          <Pressable
            onPress={onToggleSurface}
            accessibilityRole="button"
            accessibilityLabel={surface === 'chat' ? t('Show Terminal') : t('Show Chat')}
            testID="surface-toggle"
          >
            <ProgramMark program={program} status={status} size={26} />
          </Pressable>
        }
        surfaceIcon={surface === 'chat' ? 'chat' : 'terminal'}
        labels={agentBarLabels()}
        testID="composer"
      />
      {attachDraft && onAttachKey ? (
        <KeyboardDock rows={ATTACH_KEYS} onKey={(key) => onAttachKey(key)} />
      ) : null}
    </View>
  );
}
