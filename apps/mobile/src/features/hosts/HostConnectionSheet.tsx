import { t } from '@openagentspocket/i18n';
import { Button, Icon, makeStyles, Sheet, Text } from '@openagentspocket/ui';
import { View } from 'react-native';

const useStyles = makeStyles((theme) => ({
  body: { gap: theme.spacing.sm },
  state: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  footer: { alignItems: 'stretch', gap: theme.spacing.xs },
}));

interface HostConnectionSheetProps {
  visible: boolean;
  hostName: string;
  /** The reconnect attempt in flight (1-based); undefined once it gave up. */
  attempt?: number;
  /** The route line under the state ("deploy · 2 routes"). */
  routes: string;
  /** Why the last attempt failed: a headline and the per-route lines. */
  failure?: { title: string; detail: string };
  onRetry: () => void;
  onStop: () => void;
  onEdit: () => void;
  onClose: () => void;
}

/** console.host-connection-sheet: what an offline Host is doing about it, with Retry Now and Stop Connecting. */
export function HostConnectionSheet(props: HostConnectionSheetProps) {
  const styles = useStyles();
  const { attempt, failure } = props;
  return (
    <Sheet
      visible={props.visible}
      onClose={props.onClose}
      title={props.hostName}
      detent="medium"
      trailing={{ label: t('Edit'), onPress: props.onEdit, testID: 'host-connection-edit' }}
      footer={
        <View style={styles.footer}>
          <Button title={t('Retry Now')} onPress={props.onRetry} testID="host-connection-retry" />
          <Button
            kind="text"
            title={t('Stop Connecting')}
            onPress={props.onStop}
            testID="host-connection-stop"
          />
        </View>
      }
      testID="host-connection-sheet"
    >
      <View style={styles.body}>
        <View style={styles.state}>
          <Icon name={attempt === undefined ? 'wifiSlash' : 'network'} color="textSecondary" />
          <Text semibold>{attempt === undefined ? t('Offline') : t('Reconnecting')}</Text>
          {attempt === undefined ? null : (
            <Text tone="secondary">{t('Attempt %lld', attempt)}</Text>
          )}
        </View>
        <Text variant="footnote" monospaced tone="secondary">
          {props.routes}
        </Text>
        {failure ? (
          <>
            <Text semibold>{failure.title}</Text>
            <Text variant="footnote" monospaced tone="secondary">
              {failure.detail}
            </Text>
          </>
        ) : null}
      </View>
    </Sheet>
  );
}
