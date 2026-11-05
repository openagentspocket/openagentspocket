import { t } from '@openagentspocket/i18n';
import { ConnectionSheet } from '@openagentspocket/ui';

interface HostConnectionSheetProps {
  visible: boolean;
  hostName: string;
  /** The reconnect attempt in flight (1-based); undefined once it gave up. */
  attempt?: number;
  /** The user stopped connecting: "Stopped" with a Connect action, no Stop button. */
  stopped?: boolean;
  /** The route line under the state ("deploy · 2 routes"). */
  routes: string;
  failure?: { title: string; detail: string };
  onRetry: () => void;
  onStop: () => void;
  onEdit: () => void;
  onClose: () => void;
  onDismissed?: () => void;
}

/** console.host-connection-sheet: what an offline Host is doing about it, as a `ConnectionSheet`. */
export function HostConnectionSheet(props: HostConnectionSheetProps) {
  const { attempt, stopped } = props;
  return (
    <ConnectionSheet
      visible={props.visible}
      title={props.hostName}
      state={
        stopped
          ? { icon: 'wifiSlash', label: t('Stopped') }
          : attempt === undefined
            ? { icon: 'wifiSlash', label: t('Offline') }
            : { icon: 'network', label: t('Reconnecting'), note: t('Attempt %lld', attempt) }
      }
      detail={props.routes}
      failure={props.failure}
      primary={{ label: stopped ? t('Connect') : t('Retry Now'), onPress: props.onRetry }}
      secondary={stopped ? undefined : { label: t('Stop Connecting'), onPress: props.onStop }}
      edit={{ label: t('Edit'), onPress: props.onEdit }}
      onClose={props.onClose}
      onDismissed={props.onDismissed}
      testID="host-connection-sheet"
    />
  );
}
