import { type ChatRow, rowCopyText, withoutAttachmentPaths } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  ActionMenu,
  type ActionMenuItem,
  Button,
  ChatDivider,
  ChatNoticeRow,
  ChatThoughtRow,
  ChatToolRow,
  ChatUserBubble,
  copyToClipboard,
  Markdown,
  makeStyles,
  Text,
  useRowMenu,
} from '@openagentspocket/ui';
import { memo, useMemo, useState } from 'react';
import { View } from 'react-native';
import { renderMessage } from '@/lib/renderText';
import { useAgentWait } from '../../blocked/BlockedCardProvider';
import { ChatQuestionBlock } from './ChatQuestionBlock';
import { ChatToolDetail } from './ChatToolDetail';
import { durationText, echoStatus, rowToolStatus, toolIcon, toolStatusLabel } from './chatRowModel';

const useStyles = makeStyles((th) => ({
  muted: { opacity: 0.7 },
  inset: { paddingHorizontal: th.spacing.md },
  nested: { paddingLeft: th.spacing.sm },
  center: { alignItems: 'center' },
}));

/** Copy, for a row that has text to copy. */
function copyMenu(text: string | null): ActionMenuItem[] | undefined {
  if (!text) return undefined;
  const title = t('Copy');
  return [
    { key: 'copy', title, icon: 'copy', onPress: () => void copyToClipboard(text, t('Copied')) },
  ];
}

interface Props {
  hostId: string;
  row: ChatRow;
  /** Opens or closes a turn fold or tool group. */
  onToggle: (id: ChatRow['id']) => void;
  onLoadOlder: () => void;
  /** Opens a Subagent's own transcript by the id its call reported. */
  onOpenSubagent?: (agentId: string) => void;
  now: number;
}

/** One timeline row in the Swift app's look: quiet bubbles, flat answers, compact tool rows. */
export const ChatRowView = memo(function ChatRowView({
  hostId,
  row,
  onToggle,
  onLoadOlder,
  onOpenSubagent,
  now,
}: Props) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const { content } = row;
  const menu = useMemo(() => copyMenu(rowCopyText(content)), [content]);
  const copy = useRowMenu(menu);
  const { openCalls } = useAgentWait();
  const body = () => {
    switch (content.type) {
      case 'user': {
        const { text, names } = withoutAttachmentPaths(content.message.text);
        return (
          <ChatUserBubble
            text={text}
            attachments={[...content.message.attachmentLabels, ...names]}
            menu={menu}
          />
        );
      }
      case 'pending': {
        const { text, names } = withoutAttachmentPaths(content.echo.text);
        return (
          <ChatUserBubble
            text={text}
            attachments={names}
            pending={content.echo.state.kind === 'sending'}
            pendingLabel={t('Sending…')}
            status={echoStatus(content.echo.state)}
            menu={menu}
          />
        );
      }
      case 'assistant':
        return <Markdown text={content.source} onLongPress={copy.onLongPress} />;
      case 'plan':
        return <Markdown text={content.plan.text} onLongPress={copy.onLongPress} />;
      case 'reasoning':
        return (
          <ChatThoughtRow
            label={t(
              'Thought for %@',
              durationText((content.reasoning.durationMilliseconds ?? 0) / 1000),
            )}
            text={content.reasoning.text}
            expanded={open}
            onToggle={() => setOpen(!open)}
          />
        );
      case 'tool': {
        const agentId = content.tool.subagentAgentID;
        // herdr can say idle over a question, and the row's status follows it: the wait decides.
        const asking = content.tool.callID !== null && openCalls.has(content.tool.callID);
        const status = asking
          ? 'waiting'
          : rowToolStatus(content.tool.status, content.tool.isNotUpdating);
        if (agentId !== null) {
          return (
            <ChatToolRow
              openLabel={t('Open Subagent Transcript')}
              subagents={[
                {
                  id: agentId,
                  name: content.tool.title,
                  kind: content.tool.subtitle ?? undefined,
                  status,
                  onOpen: onOpenSubagent ? () => onOpenSubagent(agentId) : undefined,
                },
              ]}
            />
          );
        }
        return (
          <ChatToolRow
            tool={{
              icon: toolIcon(content.tool.kind),
              title: content.tool.subtitle ?? content.tool.title,
              monospaced: content.tool.kind === 'command',
              status,
              statusLabel: asking ? t('Waiting') : toolStatusLabel(content.tool),
              added: content.tool.diff?.added,
              removed: content.tool.diff?.removed,
            }}
            detail={
              <>
                {content.tool.questions.length > 0 ? (
                  <ChatQuestionBlock
                    questions={content.tool.questions}
                    asking={asking}
                    showsText={content.tool.questions.length > 1}
                  />
                ) : null}
                <ChatToolDetail hostId={hostId} tool={content.tool} />
              </>
            }
            expanded={open || asking}
            onToggle={() => setOpen(!open)}
            onLongPress={copy.onLongPress}
          />
        );
      }
      case 'questions':
        return <ChatQuestionBlock questions={content.questions} asking />;
      case 'toolGroup':
        return (
          <ChatToolRow
            tool={{
              icon: toolIcon(content.group.kind),
              title: renderMessage(content.group.summary),
              status: content.group.isRunning
                ? 'running'
                : content.group.failed
                  ? 'failed'
                  : 'done',
              added: content.group.added,
              removed: content.group.removed,
            }}
            expanded={content.group.isOpen}
            onToggle={() => onToggle(row.id)}
          />
        );
      case 'turnHeader': {
        const { state, isOpen } = content.header;
        if (state.kind === 'working') {
          const since = Math.max(0, (now - Date.parse(state.since)) / 1000);
          return (
            <ChatDivider
              kind="working"
              label={t('Working for %@', '').trim()}
              elapsedSeconds={since}
            />
          );
        }
        return (
          <ChatDivider
            kind="turn"
            label={t('Worked for %@', durationText(state.seconds ?? 0))}
            collapsed={!isOpen}
            onToggle={() => onToggle(row.id)}
          />
        );
      }
      case 'divider':
        return content.divider.kind === 'compaction' ? (
          <ChatDivider kind="compacted" label={t('Context compacted')} />
        ) : content.divider.detail ? (
          <ChatNoticeRow title={content.divider.detail} />
        ) : null;
      case 'notice':
        return (
          <ChatNoticeRow title={content.notice.title} detail={content.notice.detail ?? undefined} />
        );
      case 'olderHistory':
        return content.older === 'available' ? (
          <View style={styles.center}>
            <Button
              kind="text"
              size="small"
              title={t('Load Earlier Messages')}
              onPress={onLoadOlder}
              testID="chat-load-older"
            />
          </View>
        ) : content.older === 'loading' ? (
          <Text variant="footnote" tone="secondary">
            {t('Loading…')}
          </Text>
        ) : null;
      default:
        return null;
    }
  };
  const node = body();
  if (!node) return null;
  // Bubbles and prose carry no inset of their own; the cards and disclosure rows do.
  const inset = ['user', 'pending', 'assistant', 'plan', 'questions'].includes(content.type);
  return (
    <View
      style={[
        { paddingTop: row.topSpacing },
        row.isNested && styles.nested,
        inset && styles.inset,
        row.isMuted && styles.muted,
      ]}
      testID={`chat-row-${row.id}`}
    >
      {node}
      {menu && content.type !== 'user' && content.type !== 'pending' ? (
        <ActionMenu items={menu} {...copy.menuProps} />
      ) : null}
    </View>
  );
});
