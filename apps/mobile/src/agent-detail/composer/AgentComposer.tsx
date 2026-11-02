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
import { Banner, Composer, KeyboardDock, type KeySpec } from '@openagentspocket/ui';
import { useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { renderMessage } from '@/usage/usageText';
import type { Surface } from '../surface';
import type { AgentComposer } from './composerContext';

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
}

/** The Composer under the Chat or Terminal slot: draft, Send or Stop, suggestions and what went wrong. */
export function AgentComposerBar({
  composer,
  surface,
  skills = [],
  skillPrefixes = ['/'],
  canStop = true,
  onAttachKey,
}: Props) {
  const { store, snapshot, interrupt } = composer;
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
      <Composer
        value={snapshot.draft}
        onChangeText={(text) =>
          store.applyEditorDraft(text, { start: text.length, end: text.length })
        }
        onSend={() => void send()}
        onStop={canStop ? () => void store.stop.stop(interrupt) : undefined}
        busy={control === 'stop'}
        placeholder={t('Message the Agent')}
        sendLabel={t('Send')}
        stopLabel={t('Stop')}
        suggestions={matches.map((skill) => ({ key: skill.command, label: skill.command }))}
        onSuggestion={(command) => {
          if (trigger) store.replaceTrailingToken(trigger.token, `${command} `);
        }}
        testID="composer"
      />
      {attachDraft && onAttachKey ? (
        <KeyboardDock rows={ATTACH_KEYS} onKey={(key) => onAttachKey(key)} />
      ) : null}
    </View>
  );
}
