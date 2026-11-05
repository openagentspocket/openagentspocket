import {
  bannerIcon,
  bannerId,
  bannerLines,
  bannerText,
  type ChatBannerLine,
  type ConversationState,
  type EventsSessionStatus,
  reasonOffersRetry,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { type IconName, NoticeBanner } from '@openagentspocket/ui';
import { View } from 'react-native';
import { renderMessage } from '@/lib/renderText';

const ICONS: Record<ReturnType<typeof bannerIcon>, IconName> = {
  conversation: 'chat',
  notFound: 'search',
  alertBubble: 'note',
  wifi: 'wifi',
  wifiOff: 'wifiSlash',
  warning: 'warning',
};

interface Props {
  state: ConversationState;
  hostStatus: EventsSessionStatus | undefined;
  onRetry: () => void;
  onShowTerminal: () => void;
}

/** The lines over the conversation: connecting, not connected, couldn't read; each with its way out. */
export function ChatBanners({ state, hostStatus, onRetry, onShowTerminal }: Props) {
  const { snapshot } = state;
  const phase = snapshot.phase;
  const lines = bannerLines({
    hostStatus,
    hasPendingEchoes: false,
    conversation: {
      phase:
        phase.type === 'unavailable'
          ? { kind: 'unavailable', reason: phase.reason }
          : phase.type === 'following'
            ? { kind: 'following', path: phase.path }
            : { kind: 'locating' },
      transcript: snapshot.transcript,
      isFromCache: snapshot.isFromCache,
      readFailure: snapshot.readFailure,
    },
  });
  if (lines.length === 0) return null;
  const action = (line: ChatBannerLine) => {
    const retry =
      line.kind === 'readFailure' ||
      line.kind === 'notConnected' ||
      (line.kind === 'unavailable' && reasonOffersRetry(line.reason));
    return retry
      ? { label: t('Retry'), onPress: onRetry }
      : { label: t('Show Agent Terminal'), onPress: onShowTerminal };
  };
  return (
    <View testID="chat-banners">
      {lines.map((line) => (
        <NoticeBanner
          key={bannerId(line)}
          tone="warning"
          icon={ICONS[bannerIcon(line)]}
          message={renderMessage(bannerText(line))}
          action={action(line)}
        />
      ))}
    </View>
  );
}
