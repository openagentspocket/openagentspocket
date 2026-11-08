import { fireEvent, screen } from '@testing-library/react-native';
import { Banner } from '../primitives/Banner';
import { renderThemed } from '../test-utils';
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
  const items = [
    { id: '1', title: 'A', caption: 'Explore', state: 'running' as const, meta: '1s' },
    { id: '2', title: 'B', caption: 'Audit', state: 'completed' as const, meta: '2s' },
    { id: '3', title: 'C', caption: 'x', state: 'failed' as const, meta: '3s' },
  ];
  it('opens at a row, or at no row from "+N more"', async () => {
    const onOpen = jest.fn();
    await renderThemed(<BackgroundWorkStrip items={items} overflow={2} onOpen={onOpen} />);
    expect(screen.getByTestId('work-spinner', { includeHiddenElements: true })).toBeTruthy();
    expect(
      screen.getByTestId('work-glyph-completed', { includeHiddenElements: true }),
    ).toBeTruthy();
    await fireEvent.press(screen.getByTestId('work-row-2'));
    expect(onOpen).toHaveBeenLastCalledWith('2');
    await fireEvent.press(screen.getByTestId('work-more'));
    expect(onOpen).toHaveBeenLastCalledWith(null);
  });

  it('condenses to one line that opens the list, and is empty with nothing to list', async () => {
    const onOpen = jest.fn();
    await renderThemed(
      <BackgroundWorkStrip
        items={items}
        summary={{ state: 'running', text: '1 running · A' }}
        onOpen={onOpen}
      />,
    );
    expect(screen.queryByTestId('work-row-1')).toBeNull();
    await fireEvent.press(screen.getByTestId('background-work-strip-summary'));
    expect(onOpen).toHaveBeenCalledWith(null);
    await renderThemed(<BackgroundWorkStrip items={[]} onOpen={onOpen} />);
    expect(screen.queryByTestId('background-work-strip')).toBeNull();
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
