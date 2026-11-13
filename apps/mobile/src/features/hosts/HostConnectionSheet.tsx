import { ConnectionSheet, useHandoverSheet } from '@openagentspocket/ui';
import { useHostConnection } from './useHostConnection';

/**
 * console.host-connection-sheet: what a Host whose link is down is doing about it. `open(hostId)`
 * presents it; render `sheet` once. Home's Host cards and the "is offline" lines share one.
 */
export function useHostConnectionSheet() {
  const handover = useHandoverSheet<string>();
  const status = useHostConnection(handover.value, handover.closeThen);
  const sheet = status ? (
    <ConnectionSheet
      {...status}
      visible={handover.visible}
      onClose={handover.close}
      onDismissed={handover.onDismissed}
      testID="host-connection-sheet"
    />
  ) : null;
  return { open: handover.open, sheet };
}
