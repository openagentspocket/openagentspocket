import { act, fireEvent, screen } from '@testing-library/react-native';
import { createRef } from 'react';
import {
  appendOutput,
  Composer,
  composerAction,
  DiffView,
  gridSize,
  KeyboardDock,
  Markdown,
  parseUnifiedDiff,
  stripAnsi,
  type TerminalHandle,
  TerminalView,
  ThemeProvider,
  toSideBySide,
} from './index';
import { renderThemed } from './test-utils';

const DIFF = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -10,3 +10,3 @@ fn
 keep
-old
+new
+extra
`;

describe('Markdown', () => {
  it('renders headings as headers, code fences as code blocks and opens links', async () => {
    const onLinkPress = jest.fn();
    await renderThemed(
      <Markdown
        onLinkPress={onLinkPress}
        text={'# Plan\n\nSee [docs](https://example.com) and `x`.\n\n```ts\nconst a = 1;\n```\n'}
      />,
    );
    expect(screen.getByRole('header', { name: 'Plan' })).toBeTruthy();
    expect(screen.getByTestId('code-block')).toBeTruthy();
    expect(screen.getByText('const a = 1;')).toBeTruthy();
    await fireEvent.press(screen.getByRole('link', { name: 'docs' }));
    expect(onLinkPress).toHaveBeenCalledWith('https://example.com');
  });

  it('numbers ordered lists from their start, marks tasks, and lays out tables', async () => {
    await renderThemed(
      <Markdown
        text={'3. three\n4. four\n\n- [x] done\n- [ ] todo\n\n| a | b |\n|---|---|\n| 1 | 2 |\n'}
      />,
    );
    expect(screen.getByText('3.')).toBeTruthy();
    expect(screen.getByText('4.')).toBeTruthy();
    expect(screen.getByText('☑')).toBeTruthy();
    expect(screen.getByText('☐')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });
});

describe('parseUnifiedDiff / toSideBySide', () => {
  it('numbers old and new lines from the hunk header', () => {
    const lines = parseUnifiedDiff(DIFF);
    expect(lines.map((line) => line.kind)).toEqual([
      'meta',
      'meta',
      'meta',
      'hunk',
      'context',
      'del',
      'add',
      'add',
    ]);
    expect(lines[4]).toMatchObject({ text: 'keep', oldNumber: 10, newNumber: 10 });
    expect(lines[5]).toMatchObject({ text: 'old', oldNumber: 11 });
    expect(lines[7]).toMatchObject({ text: 'extra', newNumber: 12 });
  });

  it('pairs deletions with the additions after them', () => {
    const rows = toSideBySide(parseUnifiedDiff(DIFF)).slice(4);
    expect(rows.map((row) => [row.left?.text, row.right?.text])).toEqual([
      ['keep', 'keep'],
      ['old', 'new'],
      [undefined, 'extra'],
    ]);
  });

  it('renders one row per line, unified or split', async () => {
    await renderThemed(<DiffView diff={DIFF} />);
    expect(screen.getAllByTestId('diff-line-add', { includeHiddenElements: true })).toHaveLength(2);
    await renderThemed(<DiffView diff={DIFF} layout="split" />);
    expect(screen.getAllByTestId('diff-split-row')).toHaveLength(3);
  });

  // Heads come from the label props, so the test pins how a row is spoken, not the English copy.
  const heads = {
    addedLabel: (n?: number) => `add ${n}`,
    removedLabel: (n?: number) => `del ${n}`,
    unchangedLabel: (n?: number) => `same ${n}`,
  };

  it('speaks each unified row as one element: kind, line number, text', async () => {
    await renderThemed(<DiffView diff={DIFF} {...heads} />);
    expect(screen.getByLabelText('same 10: keep')).toHaveProp('accessible', true);
    expect(screen.getByLabelText('del 11: old')).toBeTruthy();
    expect(screen.getByLabelText('add 11: new')).toBeTruthy();
    expect(screen.getByLabelText('@@ -10,3 +10,3 @@ fn')).toBeTruthy();
    // Gutters and signs are hidden: only the rows reach a screen reader.
    expect(screen.getAllByText('11', { includeHiddenElements: true })).toHaveLength(2);
    expect(screen.queryByText('11')).toBeNull();
    expect(screen.queryByText('+')).toBeNull();
  });

  it('speaks a split row as its removed line, then its added one, and context once', async () => {
    await renderThemed(<DiffView diff={DIFF} layout="split" {...heads} />);
    expect(screen.getByLabelText('del 11: old. add 11: new')).toBeTruthy();
    expect(screen.getByLabelText('same 10: keep')).toBeTruthy();
    expect(screen.getByLabelText('add 12: extra')).toBeTruthy();
    expect(screen.getByLabelText('@@ -10,3 +10,3 @@ fn')).toBeTruthy();
  });
});

describe('TerminalView', () => {
  it('strips escapes, folds CR/LF and backspace, and caps scrollback', () => {
    expect(stripAnsi('\x1b[32mok\x1b[0m \x1b]0;title\x07done')).toBe('ok done');
    expect(appendOutput('ab', 'c\bd\r\nnext')).toBe('abd\nnext');
    expect(appendOutput('', '1\n2\n3\n4', 2)).toBe('3\n4');
    // 10 pt: cells 6 wide and 13 tall.
    expect(gridSize(300, 100, 10)).toEqual({ cols: 50, rows: 7 });
  });

  it('shows written output, reports its grid and forwards keystrokes', async () => {
    const ref = createRef<TerminalHandle>();
    const onInput = jest.fn();
    const onResize = jest.fn();
    await renderThemed(
      <TerminalView ref={ref} onInput={onInput} onResize={onResize} fontSize={10} />,
    );
    await act(async () => ref.current?.write('\x1b[1mhello\x1b[0m\r\n$ '));
    expect(screen.getByTestId('terminal-screen')).toHaveTextContent('hello $', { exact: false });
    await fireEvent(screen.getByTestId('terminal'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 100 } },
    });
    expect(onResize).toHaveBeenCalledWith(50, 7);
    const input = screen.getByTestId('terminal-input');
    await fireEvent.changeText(input, 'ls');
    await fireEvent(input, 'submitEditing');
    await fireEvent(input, 'keyPress', { nativeEvent: { key: 'Backspace' } });
    expect(onInput.mock.calls.map(([data]) => data)).toEqual(['ls', '\r', '\x7f']);
    await act(async () => ref.current?.clear());
    expect(screen.getByTestId('terminal-screen')).toHaveTextContent('');
  });
});

describe('KeyboardDock', () => {
  const rows = [
    [
      { id: 'ctrl', label: 'ctrl', accessibilityLabel: 'Control', modifier: 'ctrl' as const },
      { id: 'shift', label: 'shift', accessibilityLabel: 'Shift', modifier: 'shift' as const },
      { id: 'c', label: 'c' },
    ],
  ];

  it('latches Ctrl for exactly one key (Sticky Ctrl)', async () => {
    const onKey = jest.fn();
    await renderThemed(<KeyboardDock rows={rows} onKey={onKey} />);
    const ctrl = screen.getByRole('togglebutton', { name: 'Control' });
    await fireEvent.press(ctrl);
    expect(ctrl).toBeSelected();
    await fireEvent.press(screen.getByTestId('key-c'));
    await fireEvent.press(screen.getByTestId('key-c'));
    expect(onKey.mock.calls.map(([key, mods]) => [key.id, mods.ctrl])).toEqual([
      ['c', true],
      ['c', false],
    ]);
    expect(ctrl).not.toBeSelected();
  });

  it('latches Shift for one key too, alone or with Ctrl', async () => {
    const onKey = jest.fn();
    await renderThemed(<KeyboardDock rows={rows} onKey={onKey} />);
    const shift = screen.getByRole('togglebutton', { name: 'Shift' });
    await fireEvent.press(shift);
    await fireEvent.press(screen.getByRole('togglebutton', { name: 'Control' }));
    await fireEvent.press(screen.getByTestId('key-c'));
    await fireEvent.press(screen.getByTestId('key-c'));
    expect(onKey.mock.calls.map(([, mods]) => mods)).toEqual([
      { ctrl: true, alt: false, shift: true },
      { ctrl: false, alt: false, shift: false },
    ]);
    expect(shift).not.toBeSelected();
  });
});

describe('Composer', () => {
  it('sends a non-empty draft, stops a busy Agent, and does nothing otherwise', () => {
    expect(composerAction('  hi ', false, false)).toBe('send');
    expect(composerAction('hi', true, true)).toBe('send');
    expect(composerAction('   ', true, true)).toBe('stop');
    expect(composerAction('', true, false)).toBe('none');
    expect(composerAction('', false, true)).toBe('none');
    expect(composerAction('', true, true, true)).toBe('send');
  });

  it('disables Send on an empty draft and offers Stop while busy', async () => {
    const onSend = jest.fn();
    const onStop = jest.fn();
    const { rerender } = await renderThemed(
      <Composer value="" onChangeText={() => {}} onSend={onSend} onStop={onStop} />,
    );
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await rerender(
      <ThemeProvider themeId="indigo">
        <Composer value="" onChangeText={() => {}} onSend={onSend} onStop={onStop} busy />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Stop' }));
    expect(onStop).toHaveBeenCalled();
  });

  it('reports suggestions and edits, and sends', async () => {
    const onSuggestion = jest.fn();
    const onChangeText = jest.fn();
    const onSend = jest.fn();
    await renderThemed(
      <Composer
        value="run tests"
        onChangeText={onChangeText}
        onSend={onSend}
        suggestions={[{ key: 'continue', label: 'Continue' }]}
        onSuggestion={onSuggestion}
        placeholder="Message"
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await fireEvent.changeText(screen.getByLabelText('Message'), 'run tests now');
    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    expect(onSuggestion).toHaveBeenCalledWith('continue');
    expect(onChangeText).toHaveBeenCalledWith('run tests now');
    expect(onSend).toHaveBeenCalled();
  });
});
