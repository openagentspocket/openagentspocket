import { fireEvent, screen } from '@testing-library/react-native';
import { renderThemed } from '../test-utils';
import {
  FileRow,
  HostRow,
  HostStatusCard,
  PortRow,
  ThemeChoiceCard,
  ThemeChoicePreview,
} from './hostsSettingsFiles';

const HIDDEN = { includeHiddenElements: true };

describe('HostRow', () => {
  const host = {
    name: 'Studio',
    subtitle: 'dev@studio',
    connection: 'connected',
    latencyLabel: '1 ms',
  } as const;

  it('speaks name, address and latency and opens on press', async () => {
    const onPress = jest.fn();
    await renderThemed(<HostRow host={host} onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Studio, dev@studio, 1 ms' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('status-dot-done', HIDDEN)).toBeTruthy();
  });

  it('shows a retry button on a failed Host only', async () => {
    const onRetry = jest.fn();
    await renderThemed(
      <HostRow
        host={{ ...host, connection: 'failed' }}
        onPress={() => {}}
        onRetry={onRetry}
        retryLabel="Retry"
      />,
    );
    expect(screen.getByTestId('status-dot-blocked', HIDDEN)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('hides the latency when not connected', async () => {
    await renderThemed(<HostRow host={{ ...host, connection: 'connecting' }} onPress={() => {}} />);
    expect(screen.queryByText('1 ms')).toBeNull();
  });
});

describe('HostStatusCard', () => {
  it('reconnects through its labelled circle', async () => {
    const onReconnect = jest.fn();
    await renderThemed(
      <HostStatusCard
        tone="success"
        title="Up"
        subtitle="addr"
        onReconnect={onReconnect}
        reconnectLabel="Reconnect"
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Reconnect' }));
    expect(onReconnect).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('icon-check', HIDDEN)).toBeTruthy();
  });

  it('draws the glyph of its tone and no button without a handler', async () => {
    await renderThemed(<HostStatusCard tone="danger" title="Down" subtitle="addr" />);
    expect(screen.getByTestId('icon-error', HIDDEN)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ThemeChoiceCard', () => {
  it('reports selection state and selects on press', async () => {
    const onPress = jest.fn();
    await renderThemed(
      <ThemeChoiceCard themeId="papel" subtitle="Light" selected={false} onPress={onPress} />,
    );
    const card = screen.getByRole('button', { name: /Papel/ });
    expect(card.props.accessibilityState).toEqual({ selected: false });
    expect(screen.queryByTestId('icon-check', HIDDEN)).toBeNull();
    await fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('draws the check when selected', async () => {
    await renderThemed(
      <ThemeChoiceCard themeId="indigo" subtitle="Dark" selected onPress={() => {}} />,
    );
    expect(screen.getByTestId('icon-check', HIDDEN)).toBeTruthy();
    expect(screen.getByRole('button').props.accessibilityState).toEqual({ selected: true });
  });

  it('renders the miniature preview hidden from screen readers', async () => {
    await renderThemed(
      <ThemeChoicePreview
        themeId="indigo"
        agentName="a"
        statusLabel="s"
        prompt="p"
        chips={['x']}
        terminalPath="~"
        terminalCommand="c"
      />,
    );
    expect(
      screen.getByTestId('theme-preview-indigo', HIDDEN).props.accessibilityElementsHidden,
    ).toBe(true);
  });
});

describe('FileRow', () => {
  it('opens a folder, which shows a chevron; a file has none', async () => {
    const onPress = jest.fn();
    await renderThemed(
      <>
        <FileRow item={{ name: 'src', kind: 'directory', detail: 'today' }} onPress={onPress} />
        <FileRow item={{ name: 'a.txt', kind: 'file', detail: '1 byte' }} onPress={() => {}} />
      </>,
    );
    expect(screen.getAllByTestId('icon-chevronRight', HIDDEN)).toHaveLength(1);
    expect(screen.getByTestId('icon-folder', HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('icon-file', HIDDEN)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('file-src'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('long press opens the menu', async () => {
    const onDelete = jest.fn();
    await renderThemed(
      <FileRow
        item={{ name: 'a.txt', kind: 'file' }}
        onPress={() => {}}
        menu={[{ key: 'delete', title: 'Delete', destructive: true, onPress: onDelete }]}
      />,
    );
    await fireEvent(screen.getByTestId('file-a.txt'), 'longPress');
    expect(await screen.findByText('Delete')).toBeTruthy();
  });

  it('tags a file that may hold secrets', async () => {
    await renderThemed(
      <FileRow item={{ name: '.env', kind: 'file' }} secretLabel="Secret" onPress={() => {}} />,
    );
    expect(screen.getByText('Secret')).toBeTruthy();
  });
});

describe('PortRow', () => {
  const port = { number: 3000, name: 'web', addressLabel: 'Localhost', reachable: true } as const;

  it('opens a reachable port', async () => {
    const onOpen = jest.fn();
    await renderThemed(<PortRow port={port} onOpen={onOpen} />);
    await fireEvent.press(screen.getByRole('button', { name: 'web, 3000' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByText('3000')).toBeTruthy();
  });

  it('says why an unreachable port cannot open and drops the chevron', async () => {
    await renderThemed(
      <PortRow
        port={{ ...port, reachable: false }}
        unreachableLabel="Not safe"
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText('Not safe')).toBeTruthy();
    expect(screen.queryByTestId('icon-chevronRight', HIDDEN)).toBeNull();
    expect(
      screen.getByRole('button', { name: 'web, 3000' }).props.accessibilityState,
    ).toMatchObject({
      disabled: true,
    });
  });
});
