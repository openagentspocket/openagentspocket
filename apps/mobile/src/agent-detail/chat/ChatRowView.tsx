import type { ChatRow } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  Button,
  ChatDivider,
  ChatNoticeRow,
  ChatThoughtRow,
  ChatToolRow,
  ChatUserBubble,
  Markdown,
  makeStyles,
  Text,
} from '@openagentspocket/ui';
import { memo, useState } from 'react';
import { View } from 'react-native';
import { renderMessage } from '@/lib/renderText';
import { durationText, rowToolStatus, toolIcon, toolStatusLabel } from './chatRowModel';

const useStyles = makeStyles((th) => ({
  muted: { opacity: 0.7 },
  nested: { paddingLeft: th.spacing.sm },
  center: { alignItems: 'center' },
}));

interface Props {
  row: ChatRow;
  /** Opens or closes a turn fold or tool group. */
  onToggle: (id: ChatRow['id']) => void;
  onLoadOlder: () => void;
  now: number;
}

/** One timeline row in the Swift app's look: quiet bubbles, flat answers, compact tool rows. */
export const ChatRowView = memo(function ChatRowView({ row, onToggle, onLoadOlder, now }: Props) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const { content } = row;
  const body = () => {
    switch (content.type) {
      case 'user':
        return (
          <ChatUserBubble
            text={content.message.text}
            attachments={content.message.attachmentLabels}
          />
        );
      case 'pending':
        return (
          <ChatUserBubble
            text={content.echo.text}
            pending={content.echo.state.kind === 'sending'}
            pendingLabel={t('Sending…')}
          />
        );
      case 'assistant':
        return <Markdown text={content.source} />;
      case 'plan':
        return <Markdown text={content.plan.text} />;
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
      case 'tool':
        return (
          <ChatToolRow
            tool={{
              icon: toolIcon(content.tool.kind),
              title: content.tool.subtitle ?? content.tool.title,
              status: rowToolStatus(content.tool.status, content.tool.isNotUpdating),
              statusLabel: toolStatusLabel(content.tool),
            }}
            expanded={open}
            onToggle={() => setOpen(!open)}
          />
        );
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
            }}
            expanded={false}
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
  return (
    <View
      style={[
        { paddingTop: row.topSpacing },
        row.isNested && styles.nested,
        row.isMuted && styles.muted,
      ]}
      testID={`chat-row-${row.id}`}
    >
      {node}
    </View>
  );
});
