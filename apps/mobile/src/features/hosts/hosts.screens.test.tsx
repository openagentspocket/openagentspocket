import { t } from '@openagentspocket/i18n';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { HostDetailScreen } from './HostDetailScreen';
import { createDemoRuntime, setHostsRuntime } from './hostsRuntime';
import { Form, probe, renderApp, SAMPLE, setup } from './hostsTestKit';
import { SetupGuideScreen } from './SetupGuideScreen';
import { pairCommandLines } from './setupGuideSteps';

const mockCopy = jest.fn();
jest.mock('expo-clipboard', () => ({ setStringAsync: (text: string) => mockCopy(text) }));
jest.mock('expo-camera', () => {
  const { View } = require('react-native');
  return {
    CameraView: (props: object) => <View {...props} />,
    useCameraPermissions: () => [
      { granted: true, canAskAgain: true, status: 'granted' },
      jest.fn(),
    ],
  };
});

afterEach(() => setHostsRuntime(null));

describe('hosts.plugin-notice', () => {
  async function openDetail(version: string) {
    const runtime = setup();
    probe.setPluginVersion('h1', version);
    await runtime.model.add(SAMPLE, null);
    await renderApp(
      <HostDetailScreen hostId="h1" onBack={jest.fn()} onEdit={jest.fn()} onRemoved={jest.fn()} />,
    );
    await fireEvent.press(await screen.findByTestId('alert-action-confirm'));
    await waitFor(() => expect(runtime.model.connection('h1')).toBe('connected'));
    return runtime;
  }

  it('shows the plugin version in the Host group without a notice when it is current', async () => {
    await openDetail('0.12.0');
    expect(within(screen.getByTestId('host-plugin-row')).getByText('0.12.0')).toBeTruthy();
    expect(screen.queryByTestId('plugin-notice-message')).toBeNull();
  });

  it('an outdated plugin opens the notice with the update command and what it lacks', async () => {
    await openDetail('0.5.0');
    expect(within(screen.getByTestId('host-plugin-row')).getByText('0.5.0')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('host-plugin-row'));
    expect(await screen.findByTestId('plugin-notice-message')).toBeTruthy();
    expect(screen.getByText(/Update available: 0\.5\.0/)).toBeTruthy();
    expect(screen.getByText(/Usage needs plugin 0\.7\.0/)).toBeTruthy();
  });
});

describe('hosts.setup-guide', () => {
  it('shows real commands and offers no other platform', async () => {
    setup();
    await renderApp(<SetupGuideScreen onBack={jest.fn()} />);
    expect(screen.queryByText(/<repository>/)).toBeNull();
    expect(screen.getByText(pairCommandLines()[0] ?? '')).toBeTruthy();
    expect(screen.queryByText(t('Windows'))).toBeNull();
  });
});

describe('hosts.replace-auth-key-confirm', () => {
  it('confirms before replacing a Device Key that cannot be loaded', async () => {
    const replaceDeviceKey = jest.fn(async () => undefined);
    setHostsRuntime(
      createDemoRuntime({
        probe,
        loadDeviceKey: async () => ({ ok: false, reason: 'unavailable' }),
        replaceDeviceKey,
      }),
    );
    await renderApp(<Form onSaved={jest.fn()} />);
    await fireEvent.press(await screen.findByTestId('device-key-replace'));
    expect(await screen.findByText('Replace the Device Key?')).toBeTruthy();
    expect(replaceDeviceKey).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('alert-action-confirm'));
    await waitFor(() => expect(replaceDeviceKey).toHaveBeenCalledTimes(1));
  });
});
