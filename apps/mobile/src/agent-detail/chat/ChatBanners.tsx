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
import { Banner, type IconName, makeStyles } from '@openagentspocket/ui';
import { View } from 'react-native';
import { renderMessage } from '@/lib/renderText';

const ICONS: Record<ReturnType<typeof bannerIcon>, IconName> = {
  conversation: 'note',
  notFound: 'search',
  alertBubble: 'note',
  wifi: 'wifi',
  wifiOff: 'wifiSlash',
  warning: 'warning',
};

const useStyles = makeStyles((th) => ({
  stack: { gap: th.spacing.xs, paddingTop: th.spacing.xs, paddingHorizontal: th.spacing.md },
}));

/** Calm washes: connecting is info, everything else a warning; never danger (nothing is lost). */
const toneOf = (line: ChatBannerLine) => (line.kind === 'connecting' ? 'info' : 'warning');

interface Props {
  state: ConversationState;
  hostStatus: EventsSessionStatus | undefined;
  onRetry: () => void;
  onShowTerminal: () => void;
}

/** The lines over the conversation: connecting, not connected, couldn't read; each with its way out. */
export function ChatBanners({ state, hostStatus, onRetry, onShowTerminal }: Props) {
  const styles = useStyles();
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
  // Not connected has no button, as in Swift (it reconnects on its own).
  const action = (line: ChatBannerLine) => {
    if (
      line.kind === 'readFailure' ||
      (line.kind === 'unavailable' && reasonOffersRetry(line.reason))
    ) {
      return { label: t('Retry'), onPress: onRetry };
    }
    if (line.kind === 'notConnected' || line.kind === 'connecting') return undefined;
    return { label: t('Show Agent Terminal'), onPress: onShowTerminal };
  };
  return (
    <View style={styles.stack} testID="chat-banners">
      {lines.map((line) => (
        <Banner
          key={bannerId(line)}
          look="row"
          tone={toneOf(line)}
          icon={ICONS[bannerIcon(line)]}
          message={renderMessage(bannerText(line))}
          actionLabel={action(line)?.label}
          onAction={action(line)?.onPress}
          testID={`chat-banner-${bannerId(line)}`}
        />
      ))}
    </View>
  );
}
