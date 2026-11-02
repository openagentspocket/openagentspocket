/** Every string the scanner draws; screens pass translations (the i18n layer owns the catalogs). */
export interface QRScannerLabels {
  /** Accessibility label of the live camera preview. */
  preview: string;
  torchOn: string;
  torchOff: string;
  deniedTitle: string;
  deniedMessage: string;
  openSettings: string;
  /** Asks again while the system still allows the prompt. */
  allowCamera: string;
  unavailableTitle: string;
  unavailableMessage: string;
  pasteField: string;
  pastePlaceholder: string;
  pasteSubmit: string;
}

/** English defaults, the Swift app's wording; the i18n layer passes translations through `labels`. */
export const defaultQRLabels: QRScannerLabels = {
  preview: 'Camera',
  torchOn: 'Turn on the light',
  torchOff: 'Turn off the light',
  deniedTitle: 'Camera Access Needed',
  deniedMessage:
    'Scanning a Pairing Code uses the camera. Allow camera access in Settings, paste a Pairing Code, or add the Host manually instead.',
  openSettings: 'Open Settings',
  allowCamera: 'Allow Camera',
  unavailableTitle: 'Scanning Unavailable',
  unavailableMessage:
    'This device cannot scan QR codes. Paste a Pairing Code, or add the Host manually instead.',
  pasteField: 'Pairing Code',
  pastePlaceholder: 'Paste Pairing Code',
  pasteSubmit: 'Use Code',
};
