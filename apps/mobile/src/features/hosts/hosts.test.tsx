import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { AddHostSheet } from './AddHostSheet';
import { extraKeys, extraTables } from './extraText';
import { HostDetailScreen } from './HostDetailScreen';
import { HostListScreen } from './HostListScreen';
import { createDemoRuntime, setHostsRuntime } from './hostsRuntime';
import { Form, fillRoute, probe, renderApp, SAMPLE, setup } from './hostsTestKit';
import { installerSteps } from './installerSteps';
import { PairingScreen } from './PairingScreen';
import { guideSteps, pairCommandLines } from './setupGuideSteps';

const mockCopy = jest.fn();
jest.mock('expo-clipboard', () => ({ setStringAsync: (text: string) => mockCopy(text) }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));
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

const CONFIG_ONLY_CODE =
  'HERDR-PAIR:1:eyJhZGRycyI6WyIxOTIuMTY4LjEuNDIiXSwicG9ydCI6MjIsInVzZXIiOiJhZGEiLCJmcCI6IlNIQTI1Njo2K2puY05kaWJzRzJjcXZmb0xBcEdyTzhDdkl3QUVNenNCK0lpbE9zOHRnIn0';

afterEach(() => setHostsRuntime(null));

describe('hosts.form', () => {
  it('keeps Save off until the draft is valid, then adds the Host', async () => {
    const runtime = setup();
    const onSaved = jest.fn();
    await renderApp(<Form onSaved={onSaved} />);
    const save = await screen.findByTestId('host-save');
    expect(save).toBeDisabled();

    await fireEvent.changeText(screen.getByTestId('host-user'), 'ada');
    await fillRoute('workshop.example');
    expect(screen.getByTestId('host-save')).toBeEnabled();
    await act(async () => fireEvent.press(screen.getByTestId('host-save')));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.any(String), true));
    expect(runtime.model.getSnapshot().hosts).toHaveLength(1);
    expect(runtime.model.getSnapshot().hosts[0]?.routes[0]?.address).toBe('workshop.example');
  });

  it('copies the Device Key authorized_keys line', async () => {
    setup();
    await renderApp(<Form onSaved={jest.fn()} />);
    const line = await screen.findByTestId('device-key-line');
    await fireEvent.press(screen.getByTestId('device-key-copy'));
    expect(mockCopy).toHaveBeenCalledWith(String(line.props.children));
    expect(mockCopy.mock.calls[0]?.[0]).toMatch(/^ssh-ed25519 /);
  });

  it('dismisses the keyboard on drag and keeps taps working while it is up', async () => {
    setup();
    await renderApp(<Form onSaved={jest.fn()} />);
    await screen.findByTestId('host-save');
    const scroll = screen.getByTestId('host-form-scroll');
    expect(scroll.props.keyboardDismissMode).toBe('on-drag');
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('flags an invalid port and blocks Save', async () => {
    setup();
    await renderApp(<Form onSaved={jest.fn()} />);
    await fireEvent.changeText(await screen.findByTestId('host-user'), 'ada');
    await fillRoute('workshop.example', '99999');
    expect(screen.getByTestId('host-save')).toBeDisabled();
  });

  it('lists each route as a chevron row and opens its page', async () => {
    setup();
    await renderApp(<Form onSaved={jest.fn()} />);
    await screen.findByTestId('host-save');
    await fillRoute('workshop.example');
    expect(within(screen.getByTestId('route-0')).getByText('workshop.example')).toBeTruthy();
    expect(within(screen.getByTestId('route-0')).getByText('Direct')).toBeTruthy();
  });

  it('adds a route from the New Route page only on Save, and deletes keeping at least one', async () => {
    setup();
    await renderApp(<Form onSaved={jest.fn()} />);
    await screen.findByTestId('host-save');

    await fireEvent.press(screen.getByTestId('host-add-route'));
    await fireEvent.press(screen.getByTestId('route-back'));
    expect(screen.queryByTestId('route-1')).toBeNull();

    await fireEvent.press(screen.getByTestId('host-add-route'));
    expect(screen.getByTestId('route-save')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('new-route-address'), 'second.example');
    await fireEvent.press(screen.getByTestId('route-save'));
    expect(screen.getByTestId('route-1')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('route-1'));
    await fireEvent.press(screen.getByTestId('route-1-delete'));
    expect(screen.queryByTestId('route-1')).toBeNull();
    await fireEvent.press(screen.getByTestId('route-0'));
    expect(screen.getByTestId('route-0-delete')).toBeDisabled();
  });

  it('fills the route address and the Host name from the peer picker', async () => {
    setup();
    await renderApp(<Form onSaved={jest.fn()} />);
    await screen.findByTestId('host-save');
    await fireEvent.press(screen.getByTestId('route-0'));
    await fireEvent.press(screen.getByTestId('route-0-choose-peer'));
    await fireEvent.press(await screen.findByTestId('peer-build-server'));
    expect(screen.getByTestId('route-0-address').props.value).toBe('100.101.102.12');
    await fireEvent.press(screen.getByTestId('route-back'));
    expect(screen.getByTestId('host-name').props.value).toBe('build-server');
  });
});

describe('hosts.list', () => {
  const noop = () => {};
  const list = (
    <HostListScreen
      onDone={noop}
      onOpen={noop}
      onAdd={noop}
      onScan={noop}
      onEdit={noop}
      onDuplicate={noop}
    />
  );

  it('offers Scan to Pair and Add Host when empty, and groups saved Hosts', async () => {
    const runtime = setup();
    await renderApp(list);
    expect(screen.getByTestId('hosts-empty')).toBeTruthy();
    expect(screen.getByTestId('hosts-scan')).toBeTruthy();
    await act(async () => runtime.model.add(SAMPLE, null));
    expect(screen.getByTestId('hosts-list')).toBeTruthy();
    expect(screen.getByTestId('host-row-h1')).toBeTruthy();
  });

  it('shows the latency of a connected Host before the chevron', async () => {
    const runtime = setup();
    await runtime.model.add(SAMPLE, null);
    runtime.model.setConnection('h1', 'connected');
    runtime.model.setLatency('h1', 0);
    await renderApp(list);
    expect(within(screen.getByTestId('host-row-h1')).getByText('<1 ms')).toBeTruthy();
    await act(async () => runtime.model.setLatency('h1', 12));
    expect(within(screen.getByTestId('host-row-h1')).getByText('12 ms')).toBeTruthy();
  });

  it('titles a Host without a name by its address, not by the user@address line', async () => {
    const runtime = setup();
    await renderApp(list);
    await act(async () => runtime.model.add({ ...SAMPLE, name: '' }, null));
    expect(screen.getAllByText('workshop.example')).toHaveLength(1);
    expect(screen.getAllByText('ada@workshop.example')).toHaveLength(1);
  });

  it('shows Hosts Unavailable when the stored catalog is unreadable', async () => {
    const runtime = setup();
    jest.spyOn(runtime.model, 'getSnapshot').mockReturnValue({
      hosts: [],
      loadError: 'catalogUnreadable',
      connections: {},
      latencies: {},
    });
    await renderApp(list);
    expect(screen.getByTestId('hosts-unavailable')).toBeTruthy();
  });
});

describe('hosts.detail', () => {
  it('asks to trust the key on first connect, pins it and passes every check', async () => {
    const runtime = setup();
    await runtime.model.add(SAMPLE, null);
    await renderApp(
      <HostDetailScreen hostId="h1" onBack={jest.fn()} onEdit={jest.fn()} onRemoved={jest.fn()} />,
    );

    await fireEvent.press(await screen.findByTestId('alert-action-confirm'));
    await waitFor(() => expect(runtime.model.connection('h1')).toBe('connected'));
    expect(screen.getByTestId('preflight-connection-passed')).toBeTruthy();
    expect(screen.getByTestId('preflight-protocolCompatible-passed')).toBeTruthy();
    expect(screen.getByTestId('route-row-r1')).toBeTruthy();
  });

  it('declining the trust prompt stops the checks at the connection', async () => {
    const runtime = setup();
    await runtime.model.add(SAMPLE, null);
    await renderApp(
      <HostDetailScreen hostId="h1" onBack={jest.fn()} onEdit={jest.fn()} onRemoved={jest.fn()} />,
    );

    await fireEvent.press(await screen.findByTestId('alert-cancel'));
    await waitFor(() => expect(runtime.model.connection('h1')).toBe('cantConnect'));
    expect(screen.getByTestId('preflight-connection-failed')).toBeTruthy();
    expect(screen.getByTestId('preflight-herdrInstalled-blocked')).toBeTruthy();
  });

  it('a changed key fails without a prompt until the new key is trusted', async () => {
    const runtime = setup();
    await runtime.model.add(SAMPLE, null);
    await renderApp(
      <HostDetailScreen hostId="h1" onBack={jest.fn()} onEdit={jest.fn()} onRemoved={jest.fn()} />,
    );
    await fireEvent.press(await screen.findByTestId('alert-action-confirm'));
    await waitFor(() => expect(runtime.model.connection('h1')).toBe('connected'));

    probe.rotateKey('h1');
    await act(async () => fireEvent.press(screen.getByTestId('host-run-checks')));
    await screen.findByTestId('changed-key-section');
    expect(runtime.model.connection('h1')).toBe('cantConnect');

    await act(async () => fireEvent.press(screen.getByTestId('trust-new-key')));
    await fireEvent.press(await screen.findByTestId('alert-action-confirm'));
    await waitFor(() => expect(runtime.model.connection('h1')).toBe('connected'));
    expect(screen.queryByTestId('changed-key-section')).toBeNull();
  });
});

describe('hosts.pairing', () => {
  it('pairs from a pasted code, shows the steps and saves the Host', async () => {
    const runtime = setup();
    const onPaired = jest.fn();
    await renderApp(
      <PairingScreen
        onCancel={jest.fn()}
        onPaired={onPaired}
        onAddManually={jest.fn()}
        onOpenGuide={jest.fn()}
      />,
    );

    await fireEvent.changeText(await screen.findByTestId('qr-paste-field'), CONFIG_ONLY_CODE);
    await fireEvent.press(screen.getByTestId('qr-paste-submit'));

    await screen.findByTestId('pairing-ceremony');
    await waitFor(() => expect(onPaired).toHaveBeenCalledTimes(1));
    const [saved] = runtime.model.getSnapshot().hosts;
    expect(saved?.username).toBe('ada');
    expect(saved?.authMethod).toBe('deviceKey');
    const key = runtime.model.knownHosts.fingerprints(`agentico-host:${saved?.id}`, 0);
    expect(key).toHaveLength(1);
  });

  it('tells how to show a Pairing Code on the machine and opens the Setup Guide', async () => {
    setup();
    const onOpenGuide = jest.fn();
    await renderApp(
      <PairingScreen
        onCancel={jest.fn()}
        onPaired={jest.fn()}
        onAddManually={jest.fn()}
        onOpenGuide={onOpenGuide}
      />,
    );
    expect(await screen.findByText(pairCommandLines('unix')[0] ?? '')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('pairing-guide'));
    expect(onOpenGuide).toHaveBeenCalled();
  });

  it('explains a code that is not a Pairing Code and lets the user add manually', async () => {
    setup();
    const onAddManually = jest.fn();
    await renderApp(
      <PairingScreen
        onCancel={jest.fn()}
        onPaired={jest.fn()}
        onAddManually={onAddManually}
        onOpenGuide={jest.fn()}
      />,
    );
    await fireEvent.changeText(await screen.findByTestId('qr-paste-field'), 'hello');
    await fireEvent.press(screen.getByTestId('qr-paste-submit'));
    expect(await screen.findByTestId('pairing-scan-failure')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('pairing-manual'));
    expect(onAddManually).toHaveBeenCalled();
  });

  it('shows the failure of the ceremony with Try Again and persists nothing', async () => {
    const failing = {
      pair: async () => {
        throw new Error('boom');
      },
    };
    const runtime = createDemoRuntime({ probe, connector: failing });
    setHostsRuntime(runtime);
    await renderApp(
      <PairingScreen
        onCancel={jest.fn()}
        onPaired={jest.fn()}
        onAddManually={jest.fn()}
        onOpenGuide={jest.fn()}
      />,
    );
    await fireEvent.changeText(await screen.findByTestId('qr-paste-field'), CONFIG_ONLY_CODE);
    await fireEvent.press(screen.getByTestId('qr-paste-submit'));
    expect(await screen.findByTestId('pairing-failure')).toBeTruthy();
    expect(screen.getByTestId('pairing-retry')).toBeTruthy();
    expect(runtime.model.getSnapshot().hosts).toHaveLength(0);
  });
});

describe('extra strings', () => {
  it('ship in both languages', async () => {
    for (const key of extraKeys) {
      expect(extraTables.en[key]).toBeTruthy();
      expect(extraTables.es[key]).toBeTruthy();
    }
  });
});

describe('Easy Pair', () => {
  const renderPairing = async () => {
    setup();
    await renderApp(
      <PairingScreen
        onCancel={jest.fn()}
        onPaired={jest.fn()}
        onAddManually={jest.fn()}
        onOpenGuide={jest.fn()}
      />,
    );
  };

  it('switches the command and guidance with the platform', async () => {
    await renderPairing();
    expect(await screen.findByText(pairCommandLines('unix')[0] ?? '')).toBeTruthy();
    await fireEvent.press(screen.getByText('Windows'));
    expect(await screen.findByText(pairCommandLines('windows')[0] ?? '')).toBeTruthy();
    expect(screen.getByText(guideSteps('windows')[0]?.title ?? '')).toBeTruthy();
  });

  it('opens What happens with one row per installer step', async () => {
    await renderPairing();
    await fireEvent.press(await screen.findByTestId('pairing-what-happens'));
    for (const step of installerSteps('unix'))
      expect(await screen.findByText(step.title)).toBeTruthy();
  });

  it('the Add Host sheet offers Easy Pair and Add Manually', async () => {
    const onEasyPair = jest.fn();
    const onAddManually = jest.fn();
    await renderApp(
      <AddHostSheet onClose={jest.fn()} onEasyPair={onEasyPair} onAddManually={onAddManually} />,
    );
    await fireEvent.press(await screen.findByTestId('add-host-sheet-manual'));
    await fireEvent.press(screen.getByTestId('add-host-sheet-easy-pair'));
    expect(onAddManually).toHaveBeenCalledTimes(1);
    expect(onEasyPair).toHaveBeenCalledTimes(1);
  });
});
