import { setLocale, translate } from '@openagentspocket/i18n';
import { OverlayHost, ThemeProvider } from '@openagentspocket/ui';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PortPreviewScreen } from './PortPreviewScreen';
import { PortsScreen } from './PortsScreen';
import { portsStoreFor, releasePortsStore } from './registry';

// The native web view is the integrator's to verify on a device: a View that keeps its props.
jest.mock('react-native-webview', () => {
  const react = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => react.createElement(View, props),
  };
});

type WebViewProps = {
  source: { uri: string };
  onShouldStartLoadWithRequest: (request: { url: string; isTopFrame: boolean }) => boolean;
  onError: (event: { nativeEvent: { code: number; domain?: string; description: string } }) => void;
};

const HOST = { hostId: 'devbox', hostName: 'devbox' };

const wrap = (node: React.ReactElement) =>
  render(
    <ThemeProvider themeId="indigo">
      {node}
      <OverlayHost />
    </ThemeProvider>,
  );

const webView = () => screen.getByTestId('preview-webview').props as WebViewProps;

describe('PortsScreen', () => {
  afterEach(async () => {
    await cleanup();
    releasePortsStore(HOST.hostId);
    setLocale('en');
  });

  it('lists the servers, keeps system ports behind Show All and disables a public address', async () => {
    const store = portsStoreFor(HOST);
    await wrap(<PortsScreen store={store} onOpenPreview={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('port-row-8080')).toBeTruthy());

    expect(screen.getByTestId('port-row-5173')).toBeTruthy();
    expect(screen.queryByTestId('port-row-22')).toBeNull();
    // A container row and a process row are both there; a public address cannot be pressed.
    expect(screen.getByTestId('port-row-9443').props.accessibilityState?.disabled).toBe(true);

    await fireEvent.press(screen.getByTestId('ports-show-all'));
    expect(screen.getByTestId('port-row-22')).toBeTruthy();
  });

  it('opens a preview of a pressed row and of a typed port', async () => {
    const store = portsStoreFor(HOST);
    const onOpenPreview = jest.fn();
    await wrap(<PortsScreen store={store} onOpenPreview={onOpenPreview} />);
    await waitFor(() => expect(screen.getByTestId('port-row-5173')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('port-row-5173'));
    expect(onOpenPreview).toHaveBeenCalledTimes(1);
    expect(store.getState().preview?.target).toEqual({ kind: 'loopbackV4', port: 5173 });

    await fireEvent.press(screen.getByTestId('ports-open-port'));
    const field = screen.getByTestId('open-port-field');
    await fireEvent.changeText(field, 'abc');
    expect(screen.getByTestId('open-port-submit').props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(field, '3000');
    await fireEvent.press(screen.getByTestId('open-port-submit'));
    await waitFor(() => expect(onOpenPreview).toHaveBeenCalledTimes(2));
    expect(store.getState().preview?.target).toEqual({ kind: 'loopbackV4', port: 3000 });
  });
});

describe('PortPreviewScreen', () => {
  afterEach(async () => {
    await cleanup();
    releasePortsStore(HOST.hostId);
    setLocale('en');
  });

  async function openPreview() {
    const store = portsStoreFor(HOST);
    store.openPort(3000);
    await act(async () => {
      await store.settle();
    });
    await wrap(<PortPreviewScreen store={store} />);
    return store;
  }

  it('loads the tunnel URL and keeps navigation on the tunnel', async () => {
    const store = await openPreview();
    const { uri } = webView().source;
    expect(uri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    const localPort = Number(/:(\d+)\//.exec(uri)?.[1]);

    // Pages of the tunnel stay; a link to the Host's own port is pointed at the tunnel.
    expect(webView().onShouldStartLoadWithRequest({ url: uri, isTopFrame: true })).toBe(true);
    await act(async () => {
      expect(
        webView().onShouldStartLoadWithRequest({
          url: 'http://localhost:3000/login',
          isTopFrame: true,
        }),
      ).toBe(false);
    });
    expect(webView().source.uri).toBe(`http://127.0.0.1:${localPort}/login`);
    // Another loopback port is refused outright.
    expect(
      webView().onShouldStartLoadWithRequest({ url: 'http://127.0.0.1:9/', isTopFrame: true }),
    ).toBe(false);
    expect(store.getState().preview?.phase.kind).toBe('open');
  });

  it('asks before leaving the Host', async () => {
    await openPreview();
    await act(async () => {
      webView().onShouldStartLoadWithRequest({ url: 'https://example.com/docs', isTopFrame: true });
    });
    await waitFor(() =>
      expect(screen.getByText(translate('en', 'app', 'Leave the Preview?'))).toBeTruthy(),
    );
  });

  it('ignores a cancelled load and reports a real failure', async () => {
    const store = await openPreview();
    await act(async () => {
      webView().onError({ nativeEvent: { code: -999, description: 'cancelled' } });
      await store.settle();
    });
    expect(store.getState().preview?.phase.kind).toBe('open');

    await act(async () => {
      webView().onError({ nativeEvent: { code: -1004, description: 'connection refused' } });
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
      await store.settle();
    });
    expect(store.getState().preview?.phase.kind).toBe('failed');
    expect(screen.getByTestId('preview-failure')).toBeTruthy();
  });

  it('stops the tunnel when the screen is left', async () => {
    const store = portsStoreFor(HOST);
    store.openPort(3000);
    await act(async () => {
      await store.settle();
    });
    const view = await wrap(<PortPreviewScreen store={store} />);
    await act(async () => {
      view.unmount();
    });
    expect(store.getState().preview).toBeNull();
  });
});
