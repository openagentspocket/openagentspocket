import {
  type ChatAgentActivity,
  type ChatRow,
  type ComposerMessage,
  pendingEchoes,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { makeStyles, metrics, NoticeBanner } from '@openagentspocket/ui';
import { useMemo, useRef } from 'react';
import { FlatList, type NativeScrollEvent, type NativeSyntheticEvent, View } from 'react-native';
import { useConsoleState } from '@/console/hooks';
import { useConversation } from '@/conversations/useConversation';
import { useDetailUi } from '../detailUi';
import { ChatBanners } from './ChatBanners';
import { ChatEmpty } from './ChatEmpty';
import { ChatRowView } from './ChatRowView';
import { useChatRows } from './useChatRows';

const NO_MESSAGES: readonly ComposerMessage[] = [];
const NO_STATUSES = new Map<string, never>();

/** How far from the end still counts as reading the newest row, in points. */
const NEAR_END = 120;

const useStyles = makeStyles((th) => ({
  list: { flex: 1 },
  content: {
    maxWidth: metrics.readableWidth,
    width: '100%',
    alignSelf: 'center',
  },
  banners: { paddingHorizontal: th.spacing.sm, paddingTop: th.spacing.xs },
}));

interface Props {
  hostId: string;
  paneId: string;
  activity: ChatAgentActivity;
  /** The Composer's messages: the ones the transcript has not recorded yet show as echoes at the end. */
  messages?: readonly ComposerMessage[];
  /** Room for the floating header and the dock the list scrolls under. */
  topInset: number;
  bottomInset: number;
  onShowTerminal: () => void;
}

/** The conversation as a quiet timeline filling the screen, newest at the bottom. */
export function ChatTimeline({
  hostId,
  paneId,
  activity,
  messages = NO_MESSAGES,
  topInset,
  bottomInset,
  onShowTerminal,
}: Props) {
  const styles = useStyles();
  const conversation = useConversation(hostId, paneId);
  const { openSubagent } = useDetailUi();
  const summary = useConsoleState().hosts.find((host) => host.id === hostId);
  // While the Host resumes, the last known good state stands: no Connecting or Not Connected line.
  const hostStatus =
    summary?.link === 'resuming' ? { kind: 'connected' as const } : summary?.status;
  const { sendStatuses } = conversation.state;
  const pending = useMemo(
    () => pendingEchoes(messages, sendStatuses ?? NO_STATUSES),
    [messages, sendStatuses],
  );
  const { rows, toggle } = useChatRows(conversation.state, activity, pending);
  const list = useRef<FlatList<ChatRow>>(null);
  /** Follows new rows only while the reader is at the end. */
  const nearEnd = useRef(true);
  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    nearEnd.current = contentSize.height - contentOffset.y - layoutMeasurement.height < NEAR_END;
  };
  return (
    <View style={styles.list} testID="chat-timeline">
      <FlatList
        ref={list}
        data={rows}
        keyExtractor={(row) => row.id}
        initialNumToRender={40}
        onScrollBeginDrag={() => {
          nearEnd.current = false;
        }}
        onScrollEndDrag={settle}
        onMomentumScrollEnd={settle}
        onContentSizeChange={() => {
          if (!nearEnd.current) return;
          list.current?.scrollToEnd({ animated: false });
          // Rows below the window are measured as they render: land on the real end.
          setTimeout(() => nearEnd.current && list.current?.scrollToEnd({ animated: false }), 150);
        }}
        ListHeaderComponent={
          <View style={[styles.banners, { paddingTop: topInset }]}>
            <ChatBanners
              state={conversation.state}
              hostStatus={hostStatus}
              onRetry={conversation.retry}
              onShowTerminal={onShowTerminal}
            />
          </View>
        }
        ListEmptyComponent={
          <ChatEmpty phase={conversation.state.snapshot.phase} onShowTerminal={onShowTerminal} />
        }
        ListFooterComponent={<View style={{ height: bottomInset }} />}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => (
          <ChatRowView
            hostId={hostId}
            row={item}
            onToggle={toggle}
            onLoadOlder={() => conversation.loadOlder(false)}
            onOpenSubagent={openSubagent}
            now={Date.now()}
          />
        )}
      />
    </View>
  );
}
