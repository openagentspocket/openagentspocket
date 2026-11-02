import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { Button } from '../primitives/Button';
import { makeStyles } from '../theme/theme';
import { QRNotice } from './QRNotice';
import type { QRScannerLabels } from './qrLabels';
import { createCodeGate, scannerState } from './qrState';

const useStyles = makeStyles((t) => ({
  frame: {
    aspectRatio: 1,
    width: '100%',
    overflow: 'hidden',
    borderRadius: t.metrics.cardRadius,
    backgroundColor: t.colors.control,
  },
  camera: { flex: 1 },
  torch: { position: 'absolute', right: t.spacing.xs, bottom: t.spacing.xs },
}));

export interface QRCameraProps {
  labels: QRScannerLabels;
  onCode: (text: string) => void;
  /** Stops reading codes (a pairing in progress) while keeping the preview. */
  paused?: boolean;
  /** Starts with the torch on. */
  torch?: boolean;
}

/**
 * The live preview with permission handling. The only file that imports expo-camera, and
 * QRScanner loads it lazily, so a dev client built before the module existed still starts.
 */
export function QRCamera({ labels, onCode, paused = false, torch = false }: QRCameraProps) {
  const styles = useStyles();
  const [systemPermission, requestPermission] = useCameraPermissions();
  const permission = systemPermission ?? null;
  const [mountFailed, setMountFailed] = useState(false);
  const [torchOn, setTorchOn] = useState(torch);
  const gate = useRef(createCodeGate()).current;
  const state = scannerState(permission, mountFailed);
  const undetermined = permission !== null && permission.status === 'undetermined';

  useEffect(() => {
    // First visit: ask once, straight away; the button below covers a dismissed prompt.
    if (undetermined) void requestPermission();
  }, [undetermined, requestPermission]);

  if (state === 'unavailable') {
    return (
      <QRNotice
        testID="qr-unavailable"
        title={labels.unavailableTitle}
        message={labels.unavailableMessage}
      />
    );
  }
  if (state === 'denied' || (state === 'ask' && !undetermined)) {
    return (
      <QRNotice
        testID="qr-denied"
        title={labels.deniedTitle}
        message={labels.deniedMessage}
        actions={
          state === 'ask' ? (
            <Button title={labels.allowCamera} onPress={() => void requestPermission()} />
          ) : (
            <Button title={labels.openSettings} onPress={() => void Linking.openSettings()} />
          )
        }
      />
    );
  }
  const ready = state === 'ready';
  return (
    <View style={styles.frame} testID="qr-camera">
      {ready ? (
        <CameraView
          style={styles.camera}
          facing="back"
          enableTorch={torchOn}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={
            paused
              ? undefined
              : ({ data }) => {
                  if (gate(data)) onCode(data);
                }
          }
          onMountError={() => setMountFailed(true)}
          accessibilityLabel={labels.preview}
        />
      ) : null}
      {ready ? (
        <View style={styles.torch}>
          <Button
            kind="capsule"
            icon="torch"
            accessibilityLabel={torchOn ? labels.torchOff : labels.torchOn}
            onPress={() => setTorchOn((on) => !on)}
            testID="qr-torch"
          />
        </View>
      ) : null}
    </View>
  );
}
