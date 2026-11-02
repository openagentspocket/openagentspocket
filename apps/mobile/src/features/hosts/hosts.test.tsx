import { type Host, hostRoute } from '@openagentspocket/core';
import { OverlayHost, ThemeProvider } from '@openagentspocket/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { extraKeys, extraTables } from './extraText';
import { HostDetailScreen } from './HostDetailScreen';
import { HostFormScreen } from './HostFormScreen';
import { HostListScreen } from './HostListScreen';
import { DemoHostProbe } from './HostProbe';
import { createDemoRuntime, setHostsRuntime } from './hostsRuntime';
import { PairingScreen } from './PairingScreen';
import { DemoPairingConnector } from './pairingAdapters';
import { useInitialDraft } from './useInitialDraft';

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

const probe = new DemoHostProbe();

function setup() {
  const runtime = createDemoRuntime({ probe, connector: new DemoPairingConnector(0) });
  setHostsRuntime(runtime);
  return runtime;
}

function renderApp(ui: ReactElement) {
  return render(
    <ThemeProvider themeId="indigo">
      <OverlayHost />
      {ui}
    </ThemeProvider>,
  );
}

const SAMPLE: Host = {
  id: 'h1',
  name: 'Workshop',
  username: 'ada',
  authMethod: 'deviceKey',
  sessionName: '',
  herdrEndpoint: null,
  routes: [hostRoute({ id: 'r1', address: 'workshop.example' })],
};

function Form({ onSaved }: { onSaved: (id: string, created: boolean) => void }) {
  const initial = useInitialDraft();
  return initial ? (
    <HostFormScreen initial={initial} onSaved={onSaved} onCancel={() => {}} />
  ) : null;
}

afterEach(() => setHostsRuntime(null));

describe('hosts.form', () => {
  it('keeps Save off until the draft is valid, then adds the Host', async () => {
    const runtime = setup();
    const onSaved = jest.fn();
    await renderApp(<Form onSaved={onSaved} />);
    const save = await screen.findByTestId('host-save');
    expect(save).toBeDisabled();

    await fireEvent.changeText(screen.getByTestId('host-user'), 'ada');
    await fireEvent.changeText(screen.getByTestId('route-0-address'), 'workshop.example');
    expect(screen.getByTestId('host-save')).toBeEnabled();
    await act(async () => fireEvent.press(screen.getByTestId('host-save')));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.any(String), true));
    expect(runtime.model.getSnapshot().hosts).toHaveLength(1);
    expect(runtime.model.getSnapshot().hosts[0]?.routes[0]?.address).toBe('workshop.example');
  });

  it('flags an invalid port and blocks Save', async () => {
    setup();
    await renderApp(<Form onSaved={jest.fn()} />);
    await fireEvent.changeText(await screen.findByTestId('host-user'), 'ada');
    await fireEvent.changeText(screen.getByTestId('route-0-address'), 'workshop.example');
    await fireEvent.changeText(screen.getByTestId('route-0-port'), '99999');
    expect(screen.getByTestId('host-save')).toBeDisabled();
  });

  it('adds and deletes routes, keeping at least one', async () => {
    setup();
    await renderApp(<Form onSaved={jest.fn()} />);
    await screen.findByTestId('host-save');
    expect(screen.queryByTestId('route-0-delete')).toBeNull();
    await fireEvent.press(screen.getByTestId('host-add-route'));
    expect(screen.getByTestId('route-1')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('route-1-delete'));
    expect(screen.queryByTestId('route-1')).toBeNull();
  });
});

describe('hosts.list', () => {
  const noop = () => {};
  const list = (
    <HostListScreen onOpen={noop} onAdd={noop} onScan={noop} onEdit={noop} onDuplicate={noop} />
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

  it('shows Hosts Unavailable when the stored catalog is unreadable', async () => {
    const runtime = setup();
    jest.spyOn(runtime.model, 'getSnapshot').mockReturnValue({
      hosts: [],
      loadError: 'catalogUnreadable',
      connections: {},
    });
    await renderApp(list);
    expect(screen.getByTestId('hosts-unavailable')).toBeTruthy();
  });
});

describe('hosts.detail', () => {
  it('asks to trust the key on first connect, pins it and passes every check', async () => {
    const runtime = setup();
    await runtime.model.add(SAMPLE, null);
    await renderApp(<HostDetailScreen hostId="h1" onEdit={jest.fn()} onRemoved={jest.fn()} />);

    await fireEvent.press(await screen.findByTestId('alert-action-confirm'));
    await waitFor(() => expect(runtime.model.connection('h1')).toBe('connected'));
    expect(screen.getByTestId('preflight-connection-passed')).toBeTruthy();
    expect(screen.getByTestId('preflight-protocolCompatible-passed')).toBeTruthy();
    expect(screen.getByTestId('route-row-r1')).toBeTruthy();
  });

  it('declining the trust prompt stops the checks at the connection', async () => {
    const runtime = setup();
    await runtime.model.add(SAMPLE, null);
    await renderApp(<HostDetailScreen hostId="h1" onEdit={jest.fn()} onRemoved={jest.fn()} />);

    await fireEvent.press(await screen.findByTestId('alert-cancel'));
    await waitFor(() => expect(runtime.model.connection('h1')).toBe('cantConnect'));
    expect(screen.getByTestId('preflight-connection-failed')).toBeTruthy();
    expect(screen.getByTestId('preflight-herdrInstalled-blocked')).toBeTruthy();
  });

  it('a changed key fails without a prompt until the new key is trusted', async () => {
    const runtime = setup();
    await runtime.model.add(SAMPLE, null);
    await renderApp(<HostDetailScreen hostId="h1" onEdit={jest.fn()} onRemoved={jest.fn()} />);
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
    await renderApp(<PairingScreen onPaired={onPaired} onAddManually={jest.fn()} />);

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

  it('explains a code that is not a Pairing Code and lets the user add manually', async () => {
    setup();
    const onAddManually = jest.fn();
    await renderApp(<PairingScreen onPaired={jest.fn()} onAddManually={onAddManually} />);
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
    await renderApp(<PairingScreen onPaired={jest.fn()} onAddManually={jest.fn()} />);
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
