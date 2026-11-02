import type { ComponentType } from 'react';
import { View } from 'react-native';
import { makeStyles } from '../theme/theme';
import type { QRCameraProps } from './QRCamera';
import { QRNotice } from './QRNotice';
import { QRPasteField } from './QRPasteField';
import { defaultQRLabels, type QRScannerLabels } from './qrLabels';

const useStyles = makeStyles((t) => ({ column: { gap: t.spacing.md } }));

let cameraModule: ComponentType<QRCameraProps> | null | undefined;

/** QRCamera, loaded on first use: null when expo-camera is missing from this build. */
function loadCamera(): ComponentType<QRCameraProps> | null {
  if (cameraModule === undefined) {
    try {
      cameraModule = (require('./QRCamera') as { QRCamera: ComponentType<QRCameraProps> }).QRCamera;
    } catch {
      cameraModule = null;
    }
  }
  return cameraModule;
}

export interface QRScannerProps {
  /** The text of a scanned QR code, or of a pasted code; a scan is delivered once per burst. */
  onCode: (text: string) => void;
  /** Stops reading codes while keeping the preview (a pairing is in progress). */
  paused?: boolean;
  /** Starts with the torch on. */
  torch?: boolean;
  /** Hides the paste fallback when the screen offers its own. */
  hidePaste?: boolean;
  labels?: Partial<QRScannerLabels>;
}

/**
 * A square camera preview that reads QR codes, with a torch toggle, a permission-denied
 * state that links to Settings, and a paste-the-code fallback that works without a camera.
 */
export function QRScanner({ onCode, paused, torch, hidePaste = false, labels }: QRScannerProps) {
  const styles = useStyles();
  const all = { ...defaultQRLabels, ...labels };
  const Camera = loadCamera();
  return (
    <View style={styles.column} testID="qr-scanner">
      {Camera ? (
        <Camera labels={all} onCode={onCode} paused={paused} torch={torch} />
      ) : (
        <QRNotice
          testID="qr-unavailable"
          title={all.unavailableTitle}
          message={all.unavailableMessage}
        />
      )}
      {hidePaste ? null : <QRPasteField labels={all} onCode={onCode} />}
    </View>
  );
}
