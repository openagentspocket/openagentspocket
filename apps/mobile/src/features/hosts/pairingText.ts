import {
  PAIRING_MESSAGE_CATALOG_KEYS,
  type PairingMessage,
  type PairingStep,
} from '@openagentspocket/core';
import { getLocale, getLocaleTag, t, translate } from '@openagentspocket/i18n';
import type { QRScannerLabels } from '@openagentspocket/ui';
import { extra } from './extraText';

/** The words of a pairing message, from the Swift catalog key the core ids map to. */
export function pairingMessageText(message: PairingMessage): string {
  return translate(
    getLocale(),
    'app',
    PAIRING_MESSAGE_CATALOG_KEYS[message.id],
    [...message.args],
    getLocaleTag(),
  );
}

export function stepTitle(step: PairingStep): string {
  switch (step) {
    case 'reach':
      return t('Reach the Host');
    case 'authenticate':
      return t('Authenticate with the Pairing Code');
    case 'enroll':
      return t('Enroll this device');
    case 'verify':
      return t('Verify the new key');
    case 'parse':
      return t('Pairing');
  }
}

/** The scanner's strings in the current language. */
export function scannerLabels(): QRScannerLabels {
  return {
    preview: extra('Camera'),
    torchOn: extra('Turn on the light'),
    torchOff: extra('Turn off the light'),
    deniedTitle: t('Camera Access Needed'),
    deniedMessage: t(
      'Scanning a Pairing Code uses the camera. Allow camera access in Settings, paste a Pairing Code, or add the Host manually instead.',
    ),
    openSettings: t('Open Settings'),
    allowCamera: extra('Allow Camera'),
    unavailableTitle: t('Scanning Unavailable'),
    unavailableMessage: t(
      'This device cannot scan QR codes. Paste a Pairing Code, or add the Host manually instead.',
    ),
    pasteField: extra('Pairing Code'),
    pastePlaceholder: t('Paste Pairing Code'),
    pasteSubmit: extra('Use Code'),
  };
}
