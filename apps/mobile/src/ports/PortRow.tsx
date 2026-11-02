import { canOpen, displayName, type ListeningPort } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { PortRow as PortRowView } from '@openagentspocket/ui';
import { addressLabel, portDetail } from './portRowText';
import { portsText } from './text';

interface PortRowProps {
  port: ListeningPort;
  onOpen: (port: ListeningPort) => void;
}

/**
 * One listening server: the container or process that owns it, the address it is bound to and
 * its port. A row the preview cannot reach is dimmed and says why.
 */
export function PortRow({ port, onOpen }: PortRowProps) {
  return (
    <PortRowView
      port={{
        number: port.port,
        name: portsText(displayName(port)),
        addressLabel: addressLabel(port),
        detail: portDetail(port) ?? undefined,
        container: port.containerName !== null,
        reachable: canOpen(port),
      }}
      unreachableLabel={t('Not reachable through SSH safely')}
      accessibilityHint={t('Opens a preview of this server')}
      onOpen={() => onOpen(port)}
      testID={`port-row-${port.port}`}
    />
  );
}
