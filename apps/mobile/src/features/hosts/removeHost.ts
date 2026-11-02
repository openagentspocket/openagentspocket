import { type Host, hostDisplayName } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { confirm } from '@openagentspocket/ui';
import { hostsRuntime } from './hostsRuntime';

/** Asks, then removes the Host; a failure gets its own alert. Resolves true when removed. */
export async function removeHostWithConfirmation(host: Host): Promise<boolean> {
  const sure = await confirm({
    title: t('Remove %@?', hostDisplayName(host)),
    message: `${t('This permanently deletes the Host configuration and any saved password from the Keychain.')} ${t('This cannot be undone.')}`,
    confirmLabel: t('Remove Host'),
    destructive: true,
  });
  if (!sure) return false;
  try {
    await hostsRuntime().model.remove(host.id);
    return true;
  } catch {
    await confirm({
      title: t('Could Not Remove Host'),
      message: t(
        'The Host could not be removed. Its saved credentials may still be in the Keychain.',
      ),
      cancelLabel: null,
      confirmLabel: t('OK'),
    });
    return false;
  }
}
