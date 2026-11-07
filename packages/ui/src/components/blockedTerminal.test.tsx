import { fireEvent, screen, within } from '@testing-library/react-native';
import { renderThemed } from '../test-utils';
import { BackgroundWorkStrip } from './BackgroundWorkStrip';
import { type BlockedBody, BlockedCard } from './BlockedCard';
import { JumpControl } from './JumpControl';
import { agentPadKeys, KeyPad, swipedPage } from './KeyPad';
import { NoticeBanner } from './NoticeBanner';
import {
  afterKey,
  dpadDirection,
  NO_MODIFIERS,
  nextModifierState,
  TerminalToolbar,
} from './TerminalToolbar';

const onYes = jest.fn();
const body: BlockedBody = {
  kind: 'prompt',
  description: 'Run tests',
  code: 'swift test',
  options: [
    { id: 'yes', label: 'Yes', kind: 'primary', onPress: onYes },
    { id: 'rule', label: 'Always', warning: 'Saves a rule', onPress: jest.fn() },
    { id: 'no', label: 'No', kind: 'destructive', onPress: jest.fn() },
  ],
};

describe('BlockedCard', () => {
  it('sends the tapped option and shows the rule warning under its option', async () => {
    await renderThemed(<BlockedCard title="Bash" body={body} />);
    expect(screen.getByTestId('blocked-code')).toBeTruthy();
    expect(screen.getByTestId('blocked-warning-rule')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('blocked-option-yes'));
    expect(onYes).toHaveBeenCalled();
  });

  it('keeps the answers outside the scroll of a long subject', async () => {
    await renderThemed(<BlockedCard title="Bash" body={body} />);
    const subject = screen.getByTestId('blocked-subject');
    expect(within(subject).getByTestId('blocked-code')).toBeTruthy();
    expect(within(subject).queryByTestId('blocked-option-yes')).toBeNull();
    expect(screen.getByTestId('blocked-option-yes')).toBeTruthy();
  });

  it('holds every answer while disabled, and Stop on its own', async () => {
    const onStop = jest.fn();
    const onPress = jest.fn();
    await renderThemed(
      <BlockedCard
        title="Bash"
        disabled
        body={{
          kind: 'prompt',
          options: [{ id: 'yes', label: 'Yes', onPress }],
          stop: { id: 'stop', label: 'Stop', onPress: onStop },
        }}
      />,
    );
    await fireEvent.press(screen.getByTestId('blocked-option-yes'));
    expect(onPress).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('blocked-stop'));
    expect(onStop).toHaveBeenCalled();
  });

  it('offers a note only when asked to, and sends it trimmed', async () => {
    const onNote = jest.fn();
    await renderThemed(<BlockedCard title="Bash" body={body} />);
    expect(screen.queryByTestId('blocked-add-note')).toBeNull();
    await renderThemed(<BlockedCard title="Bash" body={{ ...body, onNote } as BlockedBody} />);
    await fireEvent.press(screen.getByTestId('blocked-add-note'));
    await fireEvent.changeText(screen.getByTestId('blocked-note-field'), ' use bun ');
    await fireEvent.press(screen.getByTestId('blocked-send-note'));
    expect(onNote).toHaveBeenCalledWith('use bun');
    expect(screen.getByTestId('blocked-add-note')).toBeTruthy();
  });

  it('answers a question with typed text', async () => {
    const onSubmit = jest.fn();
    await renderThemed(
      <BlockedCard
        title="Which one?"
        body={{ kind: 'prompt', options: [], question: { fieldLabel: 'Answer', onSubmit } }}
      />,
    );
    await fireEvent.changeText(screen.getByTestId('blocked-question-field'), 'staging');
    await fireEvent.press(screen.getByTestId('blocked-send-question'));
    expect(onSubmit).toHaveBeenCalledWith('staging');
  });

  it('shows a screen excerpt with numbered answers, and raw keys', async () => {
    const onPress = jest.fn();
    await renderThemed(
      <BlockedCard
        title="Question"
        body={{ kind: 'excerpt', text: 'Pick', options: [{ id: '1', label: '1. A', onPress }] }}
      />,
    );
    expect(screen.getByTestId('blocked-excerpt')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('blocked-generic-1'));
    expect(onPress).toHaveBeenCalledTimes(1);
    await renderThemed(
      <BlockedCard
        title="Keys"
        body={{ kind: 'keys', message: 'Unreadable', keys: [{ id: 'up', label: 'Up', onPress }] }}
      />,
    );
    await fireEvent.press(screen.getByLabelText('Up'));
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it('collapses to the header, without its choices or notice', async () => {
    await renderThemed(<BlockedCard title="Bash" body={body} collapsed notice="Changed" />);
    expect(screen.queryByTestId('blocked-option-yes')).toBeNull();
    expect(screen.queryByTestId('blocked-notice')).toBeNull();
  });
});

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

describe('NoticeBanner', () => {
  it('runs the action and renders the locating and in-app kinds', async () => {
    const onPress = jest.fn();
    await renderThemed(<NoticeBanner message="Failed" action={{ label: 'Retry', onPress }} />);
    await fireEvent.press(screen.getByTestId('notice-action'));
    expect(onPress).toHaveBeenCalled();
    await renderThemed(<NoticeBanner kind="locating" message="Looking" />);
    expect(screen.getByTestId('notice-locating')).toBeTruthy();
    await renderThemed(<NoticeBanner kind="inapp" title="Agent" message="Needs you" />);
    expect(screen.getByTestId('notice-inapp')).toBeTruthy();
  });
});

describe('JumpControl', () => {
  it('hides when not visible, jumps on tap, expands on long press', async () => {
    const onJumpLatest = jest.fn();
    const onPrevious = jest.fn();
    await renderThemed(
      <JumpControl
        visible={false}
        onJumpLatest={jest.fn()}
        onPrevious={jest.fn()}
        onNext={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('jump-control')).toBeNull();
    await renderThemed(
      <JumpControl
        visible
        onJumpLatest={onJumpLatest}
        onPrevious={onPrevious}
        onNext={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByTestId('jump-latest'));
    expect(onJumpLatest).toHaveBeenCalled();
    await fireEvent(screen.getByTestId('jump-latest'), 'longPress');
    await fireEvent.press(screen.getByTestId('jump-previous'));
    expect(onPrevious).toHaveBeenCalled();
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
