import {
  type ChatConversationSnapshot,
  reasonExplanation,
  reasonIsWaiting,
  reasonTitle,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, EmptyState, NoticeBanner } from '@openagentspocket/ui';
import { renderMessage } from '@/lib/renderText';

/** Chat with nothing to show: still looking, or the reason there is nothing, and the way out. */
export function ChatEmpty({
  phase,
  onShowTerminal,
}: {
  phase: ChatConversationSnapshot['phase'];
  onShowTerminal?: () => void;
}) {
  if (phase.type !== 'unavailable') {
    return (
      <NoticeBanner
        kind="locating"
        message={
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
      <NoticeBanner
        kind="locating"
        message={renderMessage(reasonTitle(reason))}
        testID="chat-slot"
      />
    );
  }
  return (
    <EmptyState
      title={renderMessage(reasonTitle(reason))}
      message={renderMessage(reasonExplanation(reason))}
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
