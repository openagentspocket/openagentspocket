import { fireEvent, screen } from '@testing-library/react-native';
import { renderThemed } from '../test-utils';
import { KeyValueGroup } from './KeyValueGroup';
import { ListToolbar, PRESENTATION_ICON } from './ListToolbar';
import { QuickSheetHeader } from './QuickSheetHeader';

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
