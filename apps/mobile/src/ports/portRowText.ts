import { bindScope, type ListeningPort } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';

/** The bound address in words: every interface, the Host only, or the address itself. */
export function addressLabel(port: ListeningPort): string {
  const scope = bindScope(port);
  switch (scope.kind) {
    case 'allInterfaces':
      return t('All interfaces');
    case 'loopback':
      return t('Localhost');
    case 'address':
      return scope.address;
  }
}

/** The container's image, else the process id when the Host showed it. */
export function portDetail(port: ListeningPort): string | null {
  if (port.image !== null && port.containerName !== null) return port.image;
  if (port.pid !== null) return t('pid %@', String(port.pid));
  return null;
}
