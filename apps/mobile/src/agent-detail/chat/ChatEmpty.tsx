import {
  type ChatConversationSnapshot,
  type ChatNoSessionNotice,
  reasonExplanation,
  reasonIsWaiting,
  reasonTitle,
  type UndetectedProgramNotice,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, EmptyState } from '@openagentspocket/ui';
import { renderMessage } from '@/lib/renderText';
import type { UndetectedProgram } from './useUndetectedProgram';

/** Chat with nothing to show: still looking, or the reason there is nothing, and the way out. */
function undetectedText(notice: UndetectedProgramNotice): { title: string; message: string } {
  const name = notice.program.label;
  switch (notice.kind) {
    case 'install':
      return {
        title: t("%@ isn't reporting to herdr", name),
        message: t(
          "Chat reads a program's conversation through its herdr integration, which this Host doesn't have for %@ yet. Install it, then restart %@ in this pane.",
          name,
          name,
        ),
      };
    case 'restart':
      return {
        title: t('Restart %@', name),
        message: t(
          "herdr's integration for %@ is installed. Restart %@ in this pane and it reports its conversation.",
          name,
          name,
        ),
      };
    case 'otherUser':
      return {
        title: t('%@ runs as another user', name),
        message: t(
          "It was started with sudo or su, so it can't report to this herdr. Start %@ as your own user to see its Chat.",
          name,
        ),
      };
  }
}

/** A program herdr does not report: what it is, why there is no Chat, and the way out. */
function Undetected({
  program,
  onShowTerminal,
}: {
  program: UndetectedProgram;
  onShowTerminal?: () => void;
}) {
  const { title, message } = undetectedText(program.notice);
  return (
    <EmptyState
      title={title}
      message={message}
      layout="compact"
      actions={
        <>
          {program.install ? (
            <Button
              title={t('Install Integration')}
              onPress={program.install}
              loading={program.installing}
              testID="chat-install-integration"
            />
          ) : null}
          {onShowTerminal ? (
            <Button kind="text" title={t('Show Terminal')} onPress={onShowTerminal} />
          ) : null}
        </>
      }
      testID="chat-slot"
    />
  );
}

/** A notice with the terminal as its way out: no session reported, and why Chat can tell. */
function TerminalNotice({
  title,
  message,
  onShowTerminal,
}: {
  title: string;
  message: string;
  onShowTerminal?: () => void;
}) {
  return (
    <EmptyState
      title={title}
      message={message}
      layout="compact"
      actions={
        onShowTerminal ? (
          <Button
            kind="text"
            title={t('Show Terminal')}
            onPress={onShowTerminal}
            testID="chat-show-terminal"
          />
        ) : undefined
      }
      testID="chat-slot"
    />
  );
}

export function ChatEmpty({
  phase,
  onShowTerminal,
  undetected,
  noSession,
}: {
  phase: ChatConversationSnapshot['phase'];
  onShowTerminal?: () => void;
  /** A program herdr does not report, with the reason and the fix. */
  undetected?: UndetectedProgram | null;
  /** Why herdr reports no session, when Chat can tell more than "waiting". */
  noSession?: ChatNoSessionNotice | null;
}) {
  if (undetected) return <Undetected program={undetected} onShowTerminal={onShowTerminal} />;
  if (noSession) {
    return (
      <TerminalNotice
        title={renderMessage(noSession.title)}
        message={renderMessage(noSession.explanation)}
        onShowTerminal={onShowTerminal}
      />
    );
  }
  if (phase.type !== 'unavailable') {
    return (
      <EmptyState
        busy
        layout="compact"
        title={
          phase.type === 'locating'
            ? t('Looking for the conversation…')
            : t('Waiting for Conversation')
        }
        testID="chat-slot"
      />
    );
  }
  const { reason } = phase;
  if (reasonIsWaiting(reason)) {
    return (
      <EmptyState
        busy
        layout="compact"
        title={renderMessage(reasonTitle(reason))}
        testID="chat-slot"
      />
    );
  }
  return (
    <TerminalNotice
      title={renderMessage(reasonTitle(reason))}
      message={renderMessage(reasonExplanation(reason))}
      onShowTerminal={onShowTerminal}
    />
  );
}
