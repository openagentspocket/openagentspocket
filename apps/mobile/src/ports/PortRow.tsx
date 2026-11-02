import { canOpen, displayName, type ListeningPort } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Icon, ListRow } from '@openagentspocket/ui';
import { addressLabel, portDetail } from './portRowText';
import { portsText } from './text';

interface PortRowProps {
  port: ListeningPort;
  onOpen: (port: ListeningPort) => void;
}

/**
 * One listening server: the container or process that owns it, the address it is bound to and
 * its port. A row the preview cannot reach says why and cannot be pressed.
 */
export function PortRow({ port, onOpen }: PortRowProps) {
  const reachable = canOpen(port);
  const name = portsText(displayName(port));
  const address = addressLabel(port);
  const detail = portDetail(port);
  const subtitle = reachable
    ? [address, detail].filter(Boolean).join(' · ')
    : `${address} · ${t('Not reachable through SSH safely')}`;
  return (
    <ListRow
      title={name}
      subtitle={subtitle}
      leading={<Icon name={port.containerName !== null ? 'container' : 'globe'} size={22} />}
      value={String(port.port)}
      chevron={reachable}
      disabled={!reachable}
      onPress={() => onOpen(port)}
      accessibilityLabel={t('%@, port %@', name, String(port.port))}
      accessibilityHint={reachable ? t('Opens a preview of this server') : undefined}
      testID={`port-row-${port.port}`}
    />
  );
}
