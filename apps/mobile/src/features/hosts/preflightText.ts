import type { PreflightCheck, PreflightHint } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { extra } from './extraText';

/** The checklist's row titles, in the order the checks run. */
export function checkTitle(check: PreflightCheck): string {
  switch (check) {
    case 'connection':
      return t('SSH connection');
    case 'remoteEnvironment':
      return extra('Remote environment');
    case 'herdrInstalled':
      return t('herdr installed');
    case 'serverRunning':
      return t('herdr server running');
    case 'protocolCompatible':
      return extra('Protocol compatible');
  }
}

function param(hint: Extract<PreflightHint, { key: string; params: unknown }>, name: string) {
  return String(hint.params[name] ?? '');
}

/** The fix-it sentence of a hint, in the current language (the Swift catalog's wording). */
export function hintText(hint: PreflightHint): string {
  if (hint.key === 'routes') {
    return hint.routes.map((entry) => `${entry.route}: ${hintText(entry.hint)}`).join('\n');
  }
  const detail = param(hint, 'detail');
  const path = param(hint, 'path');
  const known = param(hint, 'known');
  const presented = param(hint, 'presented');
  switch (hint.key) {
    case 'sshUnreachable':
      return t('Could not reach the Host over SSH. Check the address and port. (%@)', detail);
    case 'deviceKeyRejected':
      return `${t("The Host rejected the device key. Copy this Host's key line into ~/.ssh/authorized_keys on the Host, then run the checks again.")} ${t('If the key line starts with from=, the Host refuses connections from other addresses, such as a Jump Host or a local network route.')}`;
    case 'rsaKeyRejected':
      return t(
        'The Host rejected the RSA Key. Copy its public key from Edit Host and register it wherever that Host accepts SSH identities.',
      );
    case 'passwordRejected':
      return t('The Host rejected the login. Check the username and password.');
    case 'deviceKeyCorrupt':
      return t(
        'The Device Key is corrupted. Edit this Host and choose Replace Device Key, then add the new public key to ~/.ssh/authorized_keys on every Device Key Host.',
      );
    case 'rsaKeyCorrupt':
      return t(
        'The RSA Key is corrupted. Edit this Host and choose Replace RSA Key, then register the new public key on every Host that uses it.',
      );
    case 'rsaSignatureUnsupported':
      return t(
        'The Host does not offer RSA-SHA2-512 signatures, which RSA Key requires. Registering the key again will not help; enable rsa-sha2-512 on the Host or choose another authentication method.',
      );
    case 'keyAccessNotConfirmed':
      return t(
        "The SSH key stayed locked because the unlock prompt was cancelled or failed. Run the checks again and confirm it's you.",
      );
    case 'hostKeyRejected':
      return t('The host key was not confirmed. Run the checks again and confirm the fingerprint.');
    case 'hostKeyChanged':
      return t(
        "Host key changed: trusted %@, the Host presented %@. This can be a reinstalled server or an attack — verify with the Host's owner before trusting it.",
        known,
        presented,
      );
    case 'tcpForwardingUnavailable':
      return t(
        'The Jump Host refused TCP forwarding. Enable AllowTcpForwarding in its SSH server configuration and try again.',
      );
    case 'timedOut':
      return t('The Host did not answer in time. Check the connection and try again.');
    case 'gitTimedOut':
      return t('Reading Changes timed out.');
    case 'hostFileFailed':
      return t('Reading a Host file failed.');
    case 'cancelled':
      return t('The check was cancelled before it finished.');
    case 'channelFailed':
      return t('The connection failed unexpectedly. (%@)', detail);
    case 'attachExited':
    case 'unexpected':
      return t('The connection failed unexpectedly. (%@)', hint.cause?.kind ?? hint.key);
    case 'connectionBusy':
      return t('The connection is busy. Try again.');
    case 'hostFeatureUnavailable':
      return `${param(hint, 'feature')}.`;
    case 'homeDirectoryUnresolvable':
      return t(
        'Could not resolve the remote home directory, so the herdr socket path is unknown. (%@)',
        detail,
      );
    case 'invalidDirectoryPath':
      return t('That folder path cannot be opened: %@.', path);
    case 'socketNotFound':
      return t(
        'No herdr socket at %@. Install and start herdr on the Host, or fix the session name.',
        path,
      );
    case 'endpointSocketNotFound':
      return t(
        'No herdr socket at %@. Start the herdr instance configured for this Host and verify its socket path, then run the checks again.',
        path,
      );
    case 'herdrBinaryNotFound':
      return t("The herdr CLI was not found on the Host's non-interactive SSH PATH.");
    case 'herdrLauncherNotFound':
      return t(
        'The herdr launcher at %@ could not run. Check that this launcher exists, is executable, and can start herdr. Pair the Host again if its path changed.',
        path,
      );
    case 'streamLocalOpenFailed':
      return t(
        'Could not open the herdr socket at %@. Start herdr on the Host, or enable SSH stream-local forwarding and run the checks again.',
        path,
      );
    case 'endpointStreamLocalOpenFailed':
      return t(
        'Could not open the herdr socket at %@. Start the herdr instance configured for this Host, or enable SSH stream-local forwarding and run the checks again.',
        path,
      );
    case 'apiRejected':
      return extra(
        'herdr answered but rejected the check: {0} ({1})',
        param(hint, 'message'),
        param(hint, 'code'),
      );
    case 'protocolTooOld':
      return t(
        'The Host speaks herdr protocol %lld; this app needs at least %lld. %@',
        Number(hint.params.server),
        Number(hint.params.supported),
        t('Update herdr on the Host.'),
      );
    case 'endpointProtocolTooOld':
      return t(
        'The Host speaks herdr protocol %lld; this app needs at least %lld. %@',
        Number(hint.params.server),
        Number(hint.params.supported),
        t('Update the herdr instance configured for this Host.'),
      );
    case 'malformedResponse':
      return t("The server's reply did not parse as herdr protocol. (%@)", detail);
    default:
      return jumpHostText(hint, detail, known, presented);
  }
}

function jumpHostText(
  hint: Extract<PreflightHint, { params: unknown }>,
  detail: string,
  known: string,
  presented: string,
): string {
  switch (hint.key) {
    case 'jumpHostUnreachable':
      return t('Could not reach the Jump Host. Check its address and port. (%@)', detail);
    case 'jumpHostDeviceKeyRejected':
      return t(
        "The Jump Host rejected the Device Key. Add this Host's key line to ~/.ssh/authorized_keys there, then run the checks again.",
      );
    case 'jumpHostRsaKeyRejected':
      return t(
        'The Jump Host rejected the RSA Key. Register its public key on the Jump Host, then run the checks again.',
      );
    case 'jumpHostPasswordRejected':
      return t(
        'The Jump Host rejected the login. It must accept the same password configured for this Host; separate passwords are not supported.',
      );
    case 'jumpHostKeyRejected':
      return t(
        "The Jump Host's key was not confirmed. Run the checks again and confirm the fingerprint.",
      );
    case 'jumpHostKeyChanged':
      return t(
        'Jump Host key changed: trusted %@, it presented %@. This can be a reinstalled server or an attack — verify with its owner before trusting it.',
        known,
        presented,
      );
    case 'jumpHostDeviceKeyCorrupt':
      return t(
        'The Device Key is corrupted, so the Jump Host could not be reached. Edit this Host and choose Replace Device Key.',
      );
    case 'jumpHostRsaKeyCorrupt':
      return t(
        'The RSA Key is corrupted, so the Jump Host could not be reached. Edit this Host and choose Replace RSA Key.',
      );
    case 'jumpHostRsaSignatureUnsupported':
      return t(
        'The Jump Host does not offer RSA-SHA2-512 signatures, which RSA Key requires on both hops. Enable rsa-sha2-512 there or choose another authentication method.',
      );
    case 'jumpHostTimedOut':
      return t('The Jump Host did not answer in time. Check the connection and try again.');
    default:
      return t('Could not connect through the Jump Host. (%@)', hint.cause?.kind ?? hint.key);
  }
}
