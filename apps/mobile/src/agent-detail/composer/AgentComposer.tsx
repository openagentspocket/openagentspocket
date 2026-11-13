import {
  type AgentSkill,
  chatActivityOf,
  composerPlaceholder,
  ESCAPE_WAIT,
  message,
  primaryControl,
  refusalAction,
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
import { Keyboard, View } from 'react-native';
import { ComposerAttachments } from '@/features/composer-tools/ComposerAttachments';
import { StagingStatusBar } from '@/features/composer-tools/StagingStatusBar';
import { useAgentSkills } from '@/features/composer-tools/useAgentSkills';
import { useSetting } from '@/settings/SettingsProvider';
import { renderMessage } from '@/usage/usageText';
import { useShownStatus } from '../../blocked/BlockedCardProvider';
import { agentBarLabels } from '../agentBarLabels';
import { useDetailUi } from '../detailUi';
import type { Surface } from '../surface';
import { COMPOSER_MORE_ANCHOR } from './composerAnchors';
import type { AgentComposer } from './composerContext';
import { useChatSend } from './useChatSend';
import { useComposerMenus } from './useComposerMenus';
import { useSlashPanel } from './useSlashPanel';

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
  /** The Host's skills the `/` panel offers (on Chat, the program's send policy picks which). */
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
  agentSkills,
  projectRoot,
  onAttachKey,
  program = 'unknown',
  status,
  onToggleSurface,
}: Props) {
  const { store, snapshot, interrupt } = composer;
  const { composing, setComposing } = useDetailUi();
  // The Host's skills, unless the caller brings its own: Chat's menu needs them at once, the
  // terminal only once a `/` opens the panel.
  const hostSkills = useAgentSkills({
    hostId: composer.hostId,
    program,
    projectRoot,
    enabled: agentSkills === undefined && (surface === 'chat' || snapshot.draft.startsWith('/')),
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
  const slash = useSlashPanel({
    composer,
    surface,
    program,
    chatPolicy: chatSend.policy,
    chatMenu: chatSend.commands,
    skills: agentSkills ?? hostSkills,
    onToggleSurface,
  });
  const hasAttachments = snapshot.attachments.length > 0;
  const control = primaryControl({
    status: snapshot.status,
    draft: snapshot.draft,
    hasAttachments,
    canStop: canStop && !held,
  });
  // Chat refused and only a Terminal can be sure to do it: the way there goes with the words, and
  // a typed command arrives there typed as the program runs it, for the user to send.
  const terminalReachable = onToggleSurface !== undefined;
  const notice =
    snapshot.notice && snapshot.notice.route === surface
      ? refusalText(snapshot.notice.refusal, { terminalReachable })
      : undefined;
  const refused = snapshot.notice?.refusal;
  const noticeAction =
    surface === 'chat' && refused ? refusalAction(refused, terminalReachable) : undefined;
  const takeNoticeAction = () => {
    onToggleSurface?.();
    if (noticeAction?.kind === 'runInTerminal') store.replaceDraft(noticeAction.text);
  };
  const shownStatus = useShownStatus(status ?? 'idle');
  const stopNotice = store.stop.notice;
  const failed = snapshot.messages.filter(
    (message) => message.state.kind === 'failed' && message.route === surface,
  );

  const send = async () => {
    // What the Agent does next is the point: give the terminal its room back at once.
    if (surface === 'terminal') {
      setComposing(false);
      Keyboard.dismiss();
    }
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
          title={
            'key' in notice
              ? renderMessage(message(notice.key, ...(notice.args ?? [])))
              : notice.plain
          }
          actionLabel={
            noticeAction?.kind === 'runInTerminal'
              ? t('Run in Terminal')
              : noticeAction
                ? t('Show Terminal')
                : undefined
          }
          onAction={noticeAction ? takeNoticeAction : undefined}
          testID="composer-notice"
        />
      ) : null}
      {stopNotice ? (
        <Banner tone="warning" title={stopNotice} testID="composer-stop-notice" />
      ) : null}
      <StagingStatusBar store={menus.staging} />
      <ComposerAttachments
        store={store}
        attachments={snapshot.attachments}
        staging={menus.staging}
      />
      <ComposerCard
        value={snapshot.draft}
        hasAttachments={hasAttachments}
        onChange={(text) => store.applyEditorDraft(text, { start: text.length, end: text.length })}
        onSend={() => void send()}
        onStop={
          canStop
            ? () =>
                void store.stop.stop(chatStop?.perform ?? interrupt, chatStop?.wait ?? ESCAPE_WAIT)
            : undefined
        }
        working={control === 'stop'}
        // What Send does now: a program that holds a message sent mid-turn says when it is read.
        placeholder={renderMessage(
          composerPlaceholder(
            surface === 'chat' ? chatSend.policy : null,
            chatActivityOf(snapshot.status),
          ),
        )}
        commands={slash.commands}
        onCommand={slash.onCommand}
        skills={slash.skills}
        onSkill={slash.onSkill}
        // Folded to one line until the Composer is open (Swift): then the "..." menu shows.
        expanded={composing ? true : undefined}
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
        dictation={menus.dictation}
        addMenu={menus.addItems}
        moreMenu={menus.moreItems}
        shortcutsMenu={menus.shortcutItems}
        leading={
          <Tappable
            onPress={onToggleSurface}
            accessibilityRole="button"
            accessibilityLabel={surface === 'chat' ? t('Show Terminal') : t('Show Chat')}
            testID="surface-toggle"
          >
            <ProgramMark program={program} status={status && shownStatus} size={26} />
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
