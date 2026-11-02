import { toast } from '../overlay/toast';
import { Button } from '../primitives/Button';
import { QRNotice } from '../scanner/QRNotice';
import { QRScanner } from '../scanner/QRScanner';
import { defaultQRLabels } from '../scanner/qrLabels';
import { Specimen, Stack } from './galleryKit';

const noop = () => {};

export function Scanner() {
  return (
    <>
      <Specimen name="QRScanner (live camera, or its state on this device)">
        <QRScanner
          onCode={(text) => toast({ title: `Code: ${text.slice(0, 24)}`, tone: 'info' })}
        />
      </Specimen>
      <Specimen name="QRScanner denied / unavailable">
        <Stack>
          <QRNotice
            testID="gallery-qr-denied"
            title={defaultQRLabels.deniedTitle}
            message={defaultQRLabels.deniedMessage}
            actions={<Button title={defaultQRLabels.openSettings} onPress={noop} />}
          />
          <QRNotice
            testID="gallery-qr-unavailable"
            title={defaultQRLabels.unavailableTitle}
            message={defaultQRLabels.unavailableMessage}
          />
        </Stack>
      </Specimen>
    </>
  );
}
