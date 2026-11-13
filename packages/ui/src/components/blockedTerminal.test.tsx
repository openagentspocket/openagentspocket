import { fireEvent, screen } from '@testing-library/react-native';
import { Banner } from '../primitives/Banner';
import { renderThemed } from '../test-utils';
import { BackgroundWorkList } from './BackgroundWorkList';
import { BackgroundWorkStrip } from './BackgroundWorkStrip';
import { agentPadKeys, KeyPad, swipedPage } from './KeyPad';
import {
  afterKey,
  dpadDirection,
  NO_MODIFIERS,
  nextModifierState,
  TerminalToolbar,
} from './TerminalToolbar';

describe('BackgroundWorkStrip', () => {
  it('is one line that opens the sheet, and draws nothing without a line', async () => {
    const onOpen = jest.fn();
    await renderThemed(
      <BackgroundWorkStrip
        line={{ state: 'running', text: 'Working for 5s · 2 done' }}
        onOpen={onOpen}
      />,
    );
    expect(screen.getByTestId('work-spinner', { includeHiddenElements: true })).toBeTruthy();
    await fireEvent.press(screen.getByTestId('background-work-strip-summary'));
    expect(onOpen).toHaveBeenCalled();
    await renderThemed(<BackgroundWorkStrip line={null} onOpen={onOpen} />);
    expect(screen.queryByTestId('background-work-strip-summary')).toBeNull();
  });

  it('shows the Agent waiting on the user with its own glyph', async () => {
    await renderThemed(
      <BackgroundWorkStrip line={{ state: 'waiting', text: 'Needs you' }} onOpen={jest.fn()} />,
    );
    expect(screen.getByTestId('work-glyph-waiting', { includeHiddenElements: true })).toBeTruthy();
  });
});

describe('BackgroundWorkList notices', () => {
  it('lists the harness notices in their own section', async () => {
    await renderThemed(
      <BackgroundWorkList
        unfinished={[]}
        finished={[]}
        notices={[{ id: 'n1', title: 'Background task finished', detail: 'exit 0' }]}
        expanded={new Set()}
        onToggle={jest.fn()}
        labels={{
          running: 'Running',
          finished: 'Finished',
          finishedFooter: '',
          notices: 'Notices',
        }}
      />,
    );
    expect(screen.getByTestId('work-notice-n1')).toBeTruthy();
    expect(screen.getByText('Notices')).toBeTruthy();
  });
});

describe('Banner looks', () => {
  it('runs the row action and renders the floating look with its question', async () => {
    const onPress = jest.fn();
    await renderThemed(
      <Banner look="row" message="Failed" actionLabel="Retry" onAction={onPress} />,
    );
    await fireEvent.press(screen.getByTestId('banner-action'));
    expect(onPress).toHaveBeenCalled();
    await renderThemed(<Banner look="floating" title="Agent" message="Blocked" question="Edit?" />);
    expect(screen.getByTestId('banner-question')).toBeTruthy();
  });
});

describe('TerminalToolbar', () => {
  it('cycles a modifier off, armed, locked, off and releases armed after a key', () => {
    expect(nextModifierState('off')).toBe('armed');
    expect(nextModifierState('armed')).toBe('locked');
    expect(nextModifierState('locked')).toBe('off');
    expect(afterKey({ ...NO_MODIFIERS, ctrl: 'armed', alt: 'locked' })).toEqual({
      ctrl: 'off',
      alt: 'locked',
      shift: 'off',
    });
  });

  it('maps a drag to a direction outside the dead zone', () => {
    expect(dpadDirection(5, 5)).toBeNull();
    expect(dpadDirection(40, 3)).toBe('right');
    expect(dpadDirection(-40, 3)).toBe('left');
    expect(dpadDirection(2, -50)).toBe('up');
    expect(dpadDirection(2, 50)).toBe('down');
  });

  it('sends Esc with Ctrl armed, and the d-pad direction', async () => {
    const onKey = jest.fn();
    const onDpad = jest.fn();
    await renderThemed(
      <TerminalToolbar
        onKey={onKey}
        onDpad={onDpad}
        onToggleKeyboard={jest.fn()}
        moreItems={[]}
        defaultDpadOpen
      />,
    );
    await fireEvent.press(screen.getByTestId('toolbar-key-ctrl'));
    await fireEvent(screen.getByTestId('toolbar-key-esc'), 'pressIn');
    await fireEvent(screen.getByTestId('toolbar-key-esc'), 'pressOut');
    expect(onKey.mock.calls[0]?.[1]).toMatchObject({ ctrl: true });
    await fireEvent.press(screen.getByTestId('dpad-up'));
    expect(onDpad).toHaveBeenCalledWith('up', expect.objectContaining({ ctrl: false }));
  });
});

describe('KeyPad', () => {
  it('swipes between pages, changes tabs and sends a key', async () => {
    expect(swipedPage(0, 2, -60)).toBe(1);
    expect(swipedPage(1, 2, -60)).toBe(1);
    expect(swipedPage(1, 2, 60)).toBe(0);
    expect(swipedPage(0, 2, 10)).toBe(0);
    const onKey = jest.fn();
    const onPageChange = jest.fn();
    const onTabChange = jest.fn();
    await renderThemed(
      <KeyPad
        pages={[
          { id: 'agent', title: 'Agent', keys: agentPadKeys },
          { id: 'terminal', title: 'Terminal', keys: agentPadKeys },
        ]}
        page="agent"
        onPageChange={onPageChange}
        onKey={onKey}
        tabs={[{ id: 'keys', label: 'Keys', icon: 'keyboard' }]}
        tab="keys"
        onTabChange={onTabChange}
      />,
    );
    await fireEvent(screen.getByTestId('keypad-key-enter'), 'pressIn');
    await fireEvent(screen.getByTestId('keypad-key-enter'), 'pressOut');
    expect(onKey).toHaveBeenCalledWith(expect.objectContaining({ id: 'enter' }), 'agent');
    await fireEvent.press(screen.getByTestId('keypad-page-terminal'));
    expect(onPageChange).toHaveBeenCalledWith('terminal');
    await fireEvent.press(screen.getByTestId('keypad-tab-keys'));
    expect(onTabChange).toHaveBeenCalledWith('keys');
  });
});
