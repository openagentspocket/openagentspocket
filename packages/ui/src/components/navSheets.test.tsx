import { fireEvent, screen } from '@testing-library/react-native';
import { renderThemed } from '../test-utils';
import { ThemeProvider } from '../theme/theme';
import { EmptyDetail } from './EmptyDetail';
import { KeyValueGroup } from './KeyValueGroup';
import { ListToolbar, PRESENTATION_ICON } from './ListToolbar';
import { QuickSheetHeader } from './QuickSheetHeader';
import { ScannerFrame } from './ScannerFrame';
import { SidebarColumn } from './SidebarColumn';

const noop = () => {};
const menu = [{ key: 'a', title: 'A', onPress: noop }];

describe('ListToolbar', () => {
  it('home and new fire; three capsule controls plus home are labeled', async () => {
    const onHome = jest.fn();
    const onNew = jest.fn();
    await renderThemed(
      <ListToolbar
        presentation="flat"
        presentationItems={menu}
        hostItems={menu}
        onHome={onHome}
        onNew={onNew}
      />,
    );
    await fireEvent.press(screen.getByLabelText('Home'));
    await fireEvent.press(screen.getByLabelText('New Agent'));
    expect(onHome).toHaveBeenCalledTimes(1);
    expect(onNew).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('list-toolbar-host')).toBeTruthy();
    expect(screen.getByTestId('list-toolbar-presentation')).toBeTruthy();
  });
  it('has one icon per presentation', async () => {
    expect(new Set(Object.values(PRESENTATION_ICON)).size).toBe(4);
  });
});

describe('SidebarColumn', () => {
  it('search edits, new and hide fire, footer actions are reachable', async () => {
    const onSearch = jest.fn();
    const onNew = jest.fn();
    const onHide = jest.fn();
    const onHosts = jest.fn();
    await renderThemed(
      <SidebarColumn
        title="Agents"
        titleItems={menu}
        onNew={onNew}
        onHide={onHide}
        search=""
        onSearchChange={onSearch}
        footerStart={[{ key: 'hosts', icon: 'server', label: 'Hosts', onPress: onHosts }]}
        footerEnd={[{ key: 'host', icon: 'filter', label: 'Host filter', items: menu }]}
      >
        {null}
      </SidebarColumn>,
    );
    await fireEvent.changeText(screen.getByTestId('sidebar-column-search'), 'pay');
    await fireEvent.press(screen.getByLabelText('New'));
    await fireEvent.press(screen.getByLabelText('Hide Sidebar'));
    await fireEvent.press(screen.getByLabelText('Hosts'));
    expect(onSearch).toHaveBeenCalledWith('pay');
    expect(onNew).toHaveBeenCalled();
    expect(onHide).toHaveBeenCalled();
    expect(onHosts).toHaveBeenCalled();
    expect(screen.getByTestId('sidebar-column-footer-host')).toBeTruthy();
  });
});

describe('EmptyDetail', () => {
  it('shows a header and an action that fires; no action, no button', async () => {
    const onPress = jest.fn();
    const { rerender } = await renderThemed(
      <EmptyDetail title="T" message="M" action={{ label: 'New Agent', shortcut: 'K', onPress }} />,
    );
    expect(screen.getByRole('header')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('New Agent'));
    expect(onPress).toHaveBeenCalledTimes(1);
    await rerender(
      <ThemeProvider themeId="indigo">
        <EmptyDetail title="T" message="M" />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('empty-detail-action')).toBeNull();
  });
});

describe('QuickSheetHeader', () => {
  it('default: grabber and a close button', async () => {
    const onClose = jest.fn();
    await renderThemed(<QuickSheetHeader title="Usage" onClose={onClose} />);
    expect(screen.getByTestId('quick-sheet-header-grabber')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('detail: eyebrow, large title and chips replace the close row', async () => {
    await renderThemed(
      <QuickSheetHeader
        title="Polish"
        onClose={noop}
        eyebrow={null}
        eyebrowTrailing="7m"
        chips={null}
        grabber={false}
      />,
    );
    expect(screen.getByText('7m')).toBeTruthy();
    expect(screen.queryByTestId('quick-sheet-header-grabber')).toBeNull();
    expect(screen.queryByLabelText('Close')).toBeNull();
  });
});

describe('ScannerFrame', () => {
  it('scanning draws four corner brackets', async () => {
    await renderThemed(<ScannerFrame state="scanning" onPaste={noop} onManual={noop} />);
    for (const corner of ['tl', 'tr', 'bl', 'br']) {
      expect(screen.getByTestId(`scanner-frame-${corner}`)).toBeTruthy();
    }
  });
  it('unavailable offers paste and manual', async () => {
    const onPaste = jest.fn();
    const onManual = jest.fn();
    await renderThemed(<ScannerFrame state="unavailable" onPaste={onPaste} onManual={onManual} />);
    await fireEvent.press(screen.getByTestId('scanner-frame-paste'));
    await fireEvent.press(screen.getByTestId('scanner-frame-manual'));
    expect(onPaste).toHaveBeenCalled();
    expect(onManual).toHaveBeenCalled();
  });
  it('denied adds an Open Settings action only when given', async () => {
    const onOpenSettings = jest.fn();
    await renderThemed(
      <ScannerFrame
        state="denied"
        onPaste={noop}
        onManual={noop}
        onOpenSettings={onOpenSettings}
      />,
    );
    await fireEvent.press(screen.getByLabelText('Open Settings'));
    expect(onOpenSettings).toHaveBeenCalled();
  });
});

describe('KeyValueGroup', () => {
  it('renders one labeled row per entry and a copy button only where asked', async () => {
    await renderThemed(
      <KeyValueGroup
        title="Account"
        rows={[
          { label: 'Auth', value: 'Device Key' },
          { label: 'Pane id', value: 'wB:p1', mono: true, copy: true },
        ]}
      />,
    );
    expect(screen.getAllByTestId('key-value-group-row')).toHaveLength(2);
    expect(screen.getByLabelText('Auth, Device Key')).toBeTruthy();
    expect(screen.getAllByTestId('copy-button')).toHaveLength(1);
  });
});
