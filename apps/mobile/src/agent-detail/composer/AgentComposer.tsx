import {
  type AgentSkill,
  type ComposerSkill,
  commandSuggestions,
  detectSkillTrigger,
  ESCAPE_WAIT,
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
  Tappable,
} from '@openagentspocket/ui';
import { useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { StagingStatusBar } from '@/features/composer-tools/StagingStatusBar';
import { useAgentSkills } from '@/features/composer-tools/useAgentSkills';
import { useSetting } from '@/settings/SettingsProvider';
import { renderMessage } from '@/usage/usageText';
import { agentBarLabels } from '../agentBarLabels';
import { useDetailUi } from '../detailUi';
import type { Surface } from '../surface';
import { COMPOSER_MORE_ANCHOR } from './composerAnchors';
import type { AgentComposer } from './composerContext';
import { useChatSend } from './useChatSend';
import { useComposerMenus } from './useComposerMenus';

export { COMPOSER_MORE_ANCHOR };

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
  /** The Host's skills the Chat `/` menu offers (the program's send policy picks which). */
  agentSkills?: readonly AgentSkill[];
  /** The Agent's launch directory: its project skills are listed in the menu too. */
  projectRoot?: string;
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
  agentSkills,
  projectRoot,
  onAttachKey,
  program = 'unknown',
  status,
  onToggleSurface,
}: Props) {
  const { store, snapshot, interrupt } = composer;
  const { composing, setComposing } = useDetailUi();
  // The Host's skills, unless the caller brings its own.
  const hostSkills = useAgentSkills({
    hostId: composer.hostId,
    program,
    projectRoot,
    enabled: surface === 'chat' && agentSkills === undefined,
  });
  const chatSend = useChatSend({
    hostId: composer.hostId,
    paneId: composer.paneId,
    program,
    snapshot,
    skills: agentSkills ?? hostSkills,
  });
  const [toolbarVisible, setToolbarVisible] = useSetting('terminalToolbarVisible');
  const menus = useComposerMenus({ composer, surface, program, projectRoot, onToggleSurface });
  const policy = surface === 'chat' ? chatSend.delivery : terminalPolicy;
  // Chat's Stop is the program's own (keys and guard); the terminal's is Esc, which some programs ignore.
  const chatStop = surface === 'chat' ? chatSend.chatInterrupt : null;
  const canStop = surface === 'chat' ? true : (chatSend.policy?.terminalStop ?? true);
  useSyncExternalStore(store.stop.subscribe, () => store.stop.phase);
  const held = useSyncExternalStore(store.stop.subscribe, () => store.stop.isHeldAfterSend);
  const [attachDraft, setAttachDraft] = useState(false);
  const trigger = detectSkillTrigger(snapshot.draft, skillPrefixes);
  const matches = trigger ? matchingSkills(trigger, skills) : [];
  // Chat's `/` menu: the commands a leading `/` matches, which complete in the draft and send nothing.
  const menu =
    surface === 'chat' && chatSend.policy
      ? commandSuggestions(snapshot.draft, chatSend.commands)
      : null;
  const suggestions = menu
    ? menu.map((command) => ({
        name: `/${command.name}`,
        description: command.isEnabled
          ? (command.summary ?? '')
          : t('Available once the Agent is idle'),
      }))
    : matches.map((skill) => ({ name: skill.command, description: skill.description ?? '' }));
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
      <StagingStatusBar store={menus.staging} />
      <ComposerCard
        value={snapshot.draft}
        onChange={(text) => store.applyEditorDraft(text, { start: text.length, end: text.length })}
        onSend={() => void send()}
        onStop={
          canStop
            ? () =>
                void store.stop.stop(chatStop?.perform ?? interrupt, chatStop?.wait ?? ESCAPE_WAIT)
            : undefined
        }
        working={control === 'stop'}
        placeholder={t('Message Agent')}
        skills={suggestions}
        onSkill={(command) => {
          if (menu) {
            const entry = menu.find((candidate) => `/${candidate.name}` === command);
            if (entry?.isEnabled) store.replaceDraft(`${command} `);
          } else if (trigger) {
            store.replaceTrailingToken(trigger.token, `${command} `);
          }
        }}
        // Folded to one line until the Composer is open (Swift): then the "..." menu shows.
        expanded={surface === 'terminal' || composing ? true : undefined}
        moreAnchorKey={COMPOSER_MORE_ANCHOR}
        barToggle={
          surface === 'terminal'
            ? {
                visible: toolbarVisible,
                onToggle: () => setToolbarVisible(!toolbarVisible),
                label: t('Toolbar'),
              }
            : undefined
        }
        onFocusChange={setComposing}
        addMenu={menus.addItems}
        moreMenu={menus.moreItems}
        leading={
          <Tappable
            onPress={onToggleSurface}
            accessibilityRole="button"
            accessibilityLabel={surface === 'chat' ? t('Show Terminal') : t('Show Chat')}
            testID="surface-toggle"
          >
            <ProgramMark program={program} status={status} size={26} />
          </Tappable>
        }
        surfaceIcon={surface === 'chat' ? 'chat' : 'terminal'}
        labels={agentBarLabels()}
        testID="composer"
      />
      {menus.sheets}
      {attachDraft && onAttachKey ? (
        <KeyboardDock rows={ATTACH_KEYS} onKey={(key) => onAttachKey(key)} />
      ) : null}
    </View>
  );
}
