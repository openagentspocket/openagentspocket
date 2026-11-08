import type { ReactNode } from 'react';
import { View } from 'react-native';
import { makeStyles } from '../theme/theme';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Spinner } from './Spinner';
import { Text } from './Text';

/** fill: centers in the space it is offered; compact: its own height, for a narrow panel. */
export type EmptyStateLayout = 'fill' | 'compact';

const useStyles = makeStyles((t) => ({
  fill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: t.metrics.screenInset,
    gap: t.spacing.md,
  },
  compact: { alignItems: 'center', gap: t.spacing.xs, paddingVertical: t.spacing.md },
  copy: { alignItems: 'center', gap: t.spacing.xxs, maxWidth: 440 },
  centered: { textAlign: 'center' },
  actions: { gap: t.spacing.xs, alignItems: 'stretch', minWidth: 200 },
  detail: { textAlign: 'center', maxWidth: 440 },
}));

interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: IconName;
  /** Buttons under the message. */
  actions?: ReactNode;
  layout?: EmptyStateLayout;
  /** A wait ("Looking for the conversation..."): an accent spinner, the title in quiet text. */
  busy?: boolean;
  testID?: string;
}

/** Nothing to show, or nothing that can be shown: a symbol, a title, a message and actions. */
export function EmptyState({
  title,
  message,
  icon = 'emptyTray',
  actions,
  layout = 'fill',
  busy = false,
  testID = 'empty-state',
}: EmptyStateProps) {
  const styles = useStyles();
  const fill = layout === 'fill';
  return (
    <View
      style={fill ? styles.fill : styles.compact}
      accessibilityRole={busy ? 'progressbar' : undefined}
      accessibilityLabel={busy ? title : undefined}
      testID={testID}
    >
      {busy ? <Spinner size="large" color="accent" /> : <Icon name={icon} size={fill ? 40 : 24} />}
      <View style={styles.copy}>
        <Text
          variant={busy ? 'subheadline' : fill ? 'title2' : 'headline'}
          tone={busy ? 'secondary' : undefined}
          accessibilityRole={busy ? undefined : 'header'}
          style={styles.centered}
        >
          {title}
        </Text>
        {message ? (
          <Text variant={fill ? 'body' : 'caption'} tone="secondary" style={styles.centered}>
            {message}
          </Text>
        ) : null}
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

interface ErrorStateProps {
  /** One line: what went wrong ("Can't reach your Host"). */
  summary: string;
  /** The technical cause, in small print (the transport error). */
  detail?: string;
  /** What to do about it ("Check that the Host is awake and on your network."). */
  recovery?: string;
  onRetry?: () => void;
  retryLabel?: string;
  layout?: EmptyStateLayout;
  testID?: string;
}

/** A failure presented as summary, recovery, detail, and a retry: TransportError's presentation. */
export function ErrorState({
  summary,
  detail,
  recovery,
  onRetry,
  retryLabel = 'Try Again',
  layout = 'fill',
  testID = 'error-state',
}: ErrorStateProps) {
  const styles = useStyles();
  return (
    <EmptyState
      title={summary}
      message={recovery}
      icon="warning"
      layout={layout}
      testID={testID}
      actions={
        detail || onRetry ? (
          <>
            {detail ? (
              <Text variant="mono" tone="tertiary" selectable style={styles.detail}>
                {detail}
              </Text>
            ) : null}
            {onRetry ? (
              <Button kind="secondary" icon="refresh" title={retryLabel} onPress={onRetry} />
            ) : null}
          </>
        ) : undefined
      }
    />
  );
}
