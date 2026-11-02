import {
  bannerIcon,
  bannerId,
  bannerText,
  type ChatBannerLine,
  type EventsSessionStatus,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { type IconName, makeStyles, NoticeBanner } from '@openagentspocket/ui';
import { View } from 'react-native';
import { renderMessage } from './renderText';

const ICONS: Record<ReturnType<typeof bannerIcon>, IconName> = {
  conversation: 'note',
  notFound: 'search',
  alertBubble: 'note',
  wifi: 'wifi',
  wifiOff: 'wifiSlash',
  warning: 'warning',
};

const useStyles = makeStyles((th) => ({
  stack: { gap: th.spacing.xs, paddingHorizontal: th.spacing.md, paddingTop: th.spacing.xs },
}));

/** What the chat surface knows of its connection: the Host's events status and the read outcome. */
export interface ChatStatusInput {
  hostStatus?: EventsSessionStatus | null;
  lines: readonly ChatBannerLine[];
  /** Searching the Host for the transcript, with nothing saved to show. */
  locating?: boolean;
}

interface Props extends ChatStatusInput {
  onRetry?: () => void;
  onShowTerminal?: () => void;
}

/** Calm washes: connecting is info, everything else a warning; never danger (nothing is lost). */
const toneOf = (line: ChatBannerLine) => (line.kind === 'connecting' ? 'info' : 'warning');

function actionFor(line: ChatBannerLine, retry?: () => void, terminal?: () => void) {
  if (line.kind === 'readFailure' && retry) return { label: t('Retry'), onPress: retry };
  if (line.kind === 'launch' && terminal) {
    return { label: t('Show Agent Terminal'), onPress: terminal };
  }
  return undefined;
}

/** The lines under the chat header ("Connecting...", "Not connected.", "Couldn't read...") and the wait. */
export function ChatBanners({ lines, locating, onRetry, onShowTerminal }: Props) {
  const styles = useStyles();
  return (
    <>
      {lines.length > 0 ? (
        <View style={styles.stack} testID="chat-banners">
          {lines.map((line) => (
            <NoticeBanner
              key={bannerId(line)}
              tone={toneOf(line)}
              icon={ICONS[bannerIcon(line)]}
              message={renderMessage(bannerText(line))}
              action={actionFor(line, onRetry, onShowTerminal)}
              testID={`chat-banner-${bannerId(line)}`}
            />
          ))}
        </View>
      ) : null}
      {locating ? (
        <NoticeBanner kind="locating" message={t('Looking for the conversation…')} />
      ) : null}
    </>
  );
}
