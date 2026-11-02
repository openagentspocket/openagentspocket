import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button } from '../primitives/Button';
import { EmptyState } from '../primitives/EmptyState';
import { Text } from '../primitives/Text';
import { makeStyles, useTheme } from '../theme/theme';

export type PortPreviewState = 'opening' | 'ready' | 'paused' | 'error';

export interface PortPreviewLabels {
  back: string;
  forward: string;
  reload: string;
  share: string;
  loadingPage: string;
  opening: string;
  pausedTitle: string;
  pausedMessage: string;
  resume: string;
  retry: string;
}

export const defaultPortPreviewLabels: PortPreviewLabels = {
  back: 'Back',
  forward: 'Forward',
  reload: 'Reload',
  share: 'Share',
  loadingPage: 'Loading page',
  opening: 'Opening port…',
  pausedTitle: 'Preview Paused',
  pausedMessage:
    'The tunnel closed while the app was in the background. It opens again when you come back.',
  resume: 'Resume',
  retry: 'Try Again',
};

const useStyles = makeStyles((t) => ({
  root: { flex: 1, minHeight: 360, backgroundColor: t.colors.canvas },
  header: { alignItems: 'center', paddingVertical: t.spacing.xs },
  progress: { height: 2, backgroundColor: t.colors.control },
  fill: { height: 2, backgroundColor: t.colors.accent },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: t.spacing.sm },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: t.metrics.hairlineWidth,
    borderTopColor: t.hairline,
    paddingVertical: t.spacing.xxs,
  },
}));

interface PortPreviewProps {
  /** `devbox:5173`. */
  title: string;
  state: PortPreviewState;
  /** 0 to 1 while the page loads (ready state only). */
  progress?: number;
  /** Shown for `error`. */
  error?: { title: string; message: string };
  canGoBack?: boolean;
  canGoForward?: boolean;
  onBack?: () => void;
  onForward?: () => void;
  onReload: () => void;
  onShare?: () => void;
  /** Resume (paused) and Try Again (error). */
  onRetry: () => void;
  labels?: Partial<PortPreviewLabels>;
  /** The web view. */
  children?: ReactNode;
}

/** The port Preview screen: title, load progress, the page (or its state), and the bottom bar. */
export function PortPreview({
  title,
  state,
  progress,
  error,
  canGoBack = false,
  canGoForward = false,
  onBack,
  onForward,
  onReload,
  onShare,
  onRetry,
  labels,
  children,
}: PortPreviewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const text = { ...defaultPortPreviewLabels, ...labels };
  const ready = state === 'ready';
  return (
    <View style={styles.root} testID="port-preview">
      <View style={styles.header}>
        <Text variant="headline" accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
      </View>
      {ready && progress !== undefined && progress < 1 ? (
        <View
          style={styles.progress}
          accessibilityRole="progressbar"
          accessibilityLabel={text.loadingPage}
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
          testID="port-progress"
        >
          <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      ) : null}
      <View style={styles.body}>
        {state === 'opening' ? (
          <>
            <ActivityIndicator color={theme.colors.textSecondary} />
            <Text tone="secondary">{text.opening}</Text>
          </>
        ) : null}
        {state === 'paused' ? (
          <EmptyState
            icon="paused"
            title={text.pausedTitle}
            message={text.pausedMessage}
            actions={<Button kind="secondary" title={text.resume} onPress={onRetry} />}
          />
        ) : null}
        {state === 'error' && error ? (
          <EmptyState
            icon="warning"
            title={error.title}
            message={error.message}
            actions={<Button kind="secondary" title={text.retry} onPress={onRetry} />}
          />
        ) : null}
        {ready ? children : null}
      </View>
      <View style={styles.bar}>
        <Button
          kind="text"
          icon="arrowLeft"
          accessibilityLabel={text.back}
          disabled={!ready || !canGoBack}
          onPress={() => onBack?.()}
          testID="port-back"
        />
        <Button
          kind="text"
          icon="arrowRight"
          accessibilityLabel={text.forward}
          disabled={!ready || !canGoForward}
          onPress={() => onForward?.()}
          testID="port-forward"
        />
        <Button
          kind="text"
          icon="refresh"
          accessibilityLabel={text.reload}
          disabled={state === 'opening'}
          onPress={onReload}
          testID="port-reload"
        />
        <Button
          kind="text"
          icon="share"
          accessibilityLabel={text.share}
          disabled={!ready || !onShare}
          onPress={() => onShare?.()}
          testID="port-share"
        />
      </View>
    </View>
  );
}
