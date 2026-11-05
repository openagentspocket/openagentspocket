import { t } from '@openagentspocket/i18n';
import { ConnectionSheet } from '@openagentspocket/ui';

interface HostConnectionSheetProps {
  visible: boolean;
  hostName: string;
  /** The reconnect attempt in flight (1-based); undefined once it gave up. */
  attempt?: number;
  /** The route line under the state ("deploy · 2 routes"). */
  routes: string;
  failure?: { title: string; detail: string };
  onRetry: () => void;
  onStop: () => void;
  onEdit: () => void;
  onClose: () => void;
}

/** console.host-connection-sheet: what an offline Host is doing about it, as a `ConnectionSheet`. */
export function HostConnectionSheet(props: HostConnectionSheetProps) {
  const { attempt } = props;
  return (
    <ConnectionSheet
      visible={props.visible}
      title={props.hostName}
      state={
        attempt === undefined
          ? { icon: 'wifiSlash', label: t('Offline') }
          : { icon: 'network', label: t('Reconnecting'), note: t('Attempt %lld', attempt) }
      }
      detail={props.routes}
      failure={props.failure}
      primary={{ label: t('Retry Now'), onPress: props.onRetry }}
      secondary={{ label: t('Stop Connecting'), onPress: props.onStop }}
      edit={{ label: t('Edit'), onPress: props.onEdit }}
      onClose={props.onClose}
      testID="host-connection-sheet"
    />
  );
}
