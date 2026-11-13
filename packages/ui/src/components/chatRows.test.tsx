import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderThemed } from '../test-utils';
import { ChatDivider, formatClock } from './ChatDivider';
import { ChatNoticeRow } from './ChatNoticeRow';
import { ChatThoughtRow } from './ChatThoughtRow';
import { ChatToolRow } from './ChatToolRow';
import { ChatUserBubble } from './ChatUserBubble';
import { DiffRow } from './DiffRow';

describe('ChatUserBubble', () => {
  it('speaks its text, shows attachment chips and opens the long press menu', async () => {
    const onCopy = jest.fn();
    await renderThemed(
      <ChatUserBubble
        text="Tighten the toolbar"
        attachments={['shot.png']}
        menu={[{ key: 'copy', title: 'Copy', onPress: onCopy }]}
      />,
    );
    expect(screen.getByLabelText('shot.png')).toBeTruthy();
    await fireEvent(screen.getByLabelText('Tighten the toolbar'), 'longPress');
    await fireEvent.press(await screen.findByRole('menuitem', { name: 'Copy' }));
    expect(screen.queryByRole('menuitem', { name: 'Copy' })).toBeNull();
  });

  it('shows the sending caption only while pending', async () => {
    await renderThemed(<ChatUserBubble text="Hi" pending pendingLabel="Sending" />);
    expect(screen.getByText('Sending')).toBeTruthy();
  });
});

describe('ChatDivider', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('formats the clock as m:ss', () => {
    expect(formatClock(105)).toBe('1:45');
    expect(formatClock(5)).toBe('0:05');
  });

  it('ticks the working timer each second', async () => {
    await renderThemed(<ChatDivider kind="working" label="Working for" elapsedSeconds={105} />);
    expect(screen.getByLabelText('Working for 1:45')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByLabelText('Working for 1:47')).toBeTruthy();
  });

  it('folds the turn on press and reports its expanded state', async () => {
    const onToggle = jest.fn();
    await renderThemed(<ChatDivider kind="turn" label="Worked for 26s" onToggle={onToggle} />);
    const header = screen.getByRole('button', { name: 'Worked for 26s' });
    expect(header.props.accessibilityState).toMatchObject({ expanded: false });
    await fireEvent.press(header);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('draws compacted as a labeled rule, not a button', async () => {
    await renderThemed(<ChatDivider kind="compacted" label="Context compacted" />);
    expect(screen.getByLabelText('Context compacted')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ChatThoughtRow', () => {
  it('hides the reasoning until expanded and toggles on press', async () => {
    const onToggle = jest.fn();
    await renderThemed(
      <ChatThoughtRow label="Thought" text="Because" expanded={false} onToggle={onToggle} />,
    );
    expect(screen.queryByText('Because')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Thought' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('shows the reasoning when expanded', async () => {
    await renderThemed(
      <ChatThoughtRow label="Thought" text="Because" expanded onToggle={() => {}} />,
    );
    expect(screen.getByText('Because')).toBeTruthy();
  });
});

describe('ChatToolRow', () => {
  it('speaks command and status, toggles on press and shows output when expanded', async () => {
    const onToggle = jest.fn();
    await renderThemed(
      <ChatToolRow
        tool={{ title: 'swift test', status: 'failed', statusLabel: 'Exit 1', output: 'boom' }}
        expanded
        onToggle={onToggle}
      />,
    );
    expect(screen.getByText('boom')).toBeTruthy();
    expect(screen.getByTestId('tool-status-failed')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'swift test, Exit 1' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('marks a waiting tool', async () => {
    await renderThemed(
      <ChatToolRow tool={{ title: 'git push', status: 'waiting', statusLabel: 'Waiting' }} />,
    );
    expect(screen.getByTestId('tool-status-waiting')).toBeTruthy();
  });

  it('lists subagents with a transcript link only when they are finished', async () => {
    const onOpen = jest.fn();
    await renderThemed(
      <ChatToolRow
        openLabel="Open transcript"
        subagents={[
          { id: 'a', name: 'Check anchors', kind: 'Explore', status: 'done', onOpen },
          { id: 'b', name: 'docs-audit', status: 'running', onOpen },
        ]}
      />,
    );
    expect(screen.getAllByRole('link')).toHaveLength(1);
    await fireEvent.press(screen.getByRole('link', { name: 'Open transcript, Check anchors' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('tool-status-running')).toBeTruthy();
  });
});

describe('ChatNoticeRow', () => {
  it('reads title and detail as one element', async () => {
    await renderThemed(<ChatNoticeRow title="Agent done" detail="All links resolve" />);
    expect(screen.getByLabelText('Agent done. All links resolve')).toBeTruthy();
  });
});

describe('DiffRow', () => {
  const file = { letter: 'M', tone: 'warning', title: 'Modified', added: 1, removed: 1 } as const;
  const hunks = [
    {
      header: '@@ -1 +1 @@',
      gapLabel: '3 unchanged lines',
      onExpandGap: jest.fn(),
      lines: [
        { kind: 'del', oldNumber: 1, text: 'old' },
        { kind: 'add', newNumber: 1, segments: [{ text: 'n' }, { text: 'ew', changed: true }] },
      ],
    },
  ] as const;

  it('labels lines, expands the gap and references a line on long press', async () => {
    const onReference = jest.fn();
    await renderThemed(<DiffRow file={file} hunks={hunks} onReference={onReference} />);
    expect(screen.getByLabelText('Removed, line 1: old')).toBeTruthy();
    await fireEvent(screen.getByLabelText('Added, line 1: new'), 'longPress');
    expect(onReference).toHaveBeenCalledWith(expect.objectContaining({ kind: 'add' }));
    await fireEvent.press(screen.getByRole('button', { name: '@@ -1 +1 @@, 3 unchanged lines' }));
    expect(hunks[0].onExpandGap).toHaveBeenCalledTimes(1);
  });

  it('references a line without the long press: a screen-reader action, in both layouts', async () => {
    const onReference = jest.fn();
    const { unmount } = await renderThemed(
      <DiffRow file={file} hunks={hunks} onReference={onReference} />,
    );
    const added = screen.getByLabelText('Added, line 1: new');
    expect(added.props.accessibilityActions).toEqual([
      expect.objectContaining({ name: 'reference-0' }),
    ]);
    await fireEvent(added, 'accessibilityAction', { nativeEvent: { actionName: 'reference-0' } });
    expect(onReference).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'add' }));
    await unmount();
    await renderThemed(
      <DiffRow file={file} hunks={hunks} layout="sideBySide" onReference={onReference} />,
    );
    const row = screen.getByTestId('diff-row-split');
    expect(row.props.accessibilityActions).toHaveLength(2);
    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'reference-0' } });
    expect(onReference).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'del' }));
    await fireEvent(screen.getByTestId('diff-row-split-add'), 'longPress');
    expect(onReference).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'add' }));
  });

  it('pairs removed and added lines in the side by side layout', async () => {
    await renderThemed(<DiffRow file={file} hunks={hunks} layout="sideBySide" />);
    expect(screen.getAllByTestId('diff-row-split')).toHaveLength(1);
    expect(screen.getByLabelText('Removed, line 1: old. Added, line 1: new')).toBeTruthy();
  });
});
