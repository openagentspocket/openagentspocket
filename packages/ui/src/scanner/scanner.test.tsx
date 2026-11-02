import { fireEvent, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { QRScanner } from '../index';
import { renderThemed } from '../test-utils';
import { createCodeGate, SAME_CODE_MS, scannerState } from './qrState';

interface MockPermission {
  granted: boolean;
  canAskAgain: boolean;
  status: string;
}
let mockPermission: MockPermission | null = null;
const mockRequest = jest.fn();
jest.mock('expo-camera', () => {
  const { View } = require('react-native');
  return {
    CameraView: (props: object) => <View testID="camera-view" {...props} />,
    useCameraPermissions: () => [mockPermission, mockRequest],
  };
});

describe('scannerState', () => {
  it('waits for the system, then follows the permission', () => {
    expect(scannerState(null, false)).toBe('checking');
    expect(scannerState({ granted: true, canAskAgain: true }, false)).toBe('ready');
    expect(scannerState({ granted: false, canAskAgain: true }, false)).toBe('ask');
    expect(scannerState({ granted: false, canAskAgain: false }, false)).toBe('denied');
    expect(scannerState({ granted: true, canAskAgain: true }, true)).toBe('unavailable');
  });
});

describe('createCodeGate', () => {
  it('drops a repeat inside the window and passes it after', () => {
    let now = 0;
    const gate = createCodeGate(() => now);
    expect(gate('a')).toBe(true);
    now = SAME_CODE_MS - 1;
    expect(gate('a')).toBe(false);
    expect(gate('b')).toBe(true);
    now += SAME_CODE_MS;
    expect(gate('b')).toBe(true);
  });
});

describe('QRScanner', () => {
  beforeEach(() => {
    mockRequest.mockClear();
  });

  it('shows the camera, delivers a scan once, and toggles the torch', async () => {
    mockPermission = { granted: true, canAskAgain: true, status: 'granted' };
    const onCode = jest.fn();
    await renderThemed(<QRScanner onCode={onCode} />);
    const camera = screen.getByTestId('camera-view');
    expect(camera.props.enableTorch).toBe(false);
    camera.props.onBarcodeScanned({ data: 'HERDR-PAIR:x' });
    camera.props.onBarcodeScanned({ data: 'HERDR-PAIR:x' });
    expect(onCode).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('qr-torch'));
    expect(screen.getByTestId('camera-view').props.enableTorch).toBe(true);
  });

  it('stops reading codes while paused', async () => {
    mockPermission = { granted: true, canAskAgain: true, status: 'granted' };
    await renderThemed(<QRScanner onCode={jest.fn()} paused />);
    expect(screen.getByTestId('camera-view').props.onBarcodeScanned).toBeUndefined();
  });

  it('links to Settings when access is denied for good, and still takes a pasted code', async () => {
    mockPermission = { granted: false, canAskAgain: false, status: 'denied' };
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    const onCode = jest.fn();
    await renderThemed(<QRScanner onCode={onCode} />);
    expect(screen.getByTestId('qr-denied')).toBeTruthy();
    expect(screen.queryByTestId('camera-view')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Open Settings' }));
    expect(open).toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('qr-paste-field'), '  HERDR-PAIR:y \n');
    await fireEvent.press(screen.getByTestId('qr-paste-submit'));
    expect(onCode).toHaveBeenCalledWith('HERDR-PAIR:y');
  });

  it('asks again while the system still allows it', async () => {
    mockPermission = { granted: false, canAskAgain: true, status: 'denied' };
    await renderThemed(<QRScanner onCode={jest.fn()} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Allow Camera' }));
    expect(mockRequest).toHaveBeenCalled();
  });

  it('asks once on the first visit', async () => {
    mockPermission = { granted: false, canAskAgain: true, status: 'undetermined' };
    await renderThemed(<QRScanner onCode={jest.fn()} />);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it('ignores a blank paste', async () => {
    mockPermission = { granted: false, canAskAgain: false, status: 'denied' };
    const onCode = jest.fn();
    await renderThemed(<QRScanner onCode={onCode} />);
    await fireEvent.changeText(screen.getByTestId('qr-paste-field'), '   ');
    await fireEvent.press(screen.getByTestId('qr-paste-submit'));
    expect(onCode).not.toHaveBeenCalled();
  });
});
