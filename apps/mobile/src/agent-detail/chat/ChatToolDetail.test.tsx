import { type ChatRow, toolActivity } from '@openagentspocket/core';
import { OverlayHost, ThemeProvider } from '@openagentspocket/ui';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ChatRowView } from './ChatRowView';

const mockCopy = jest.fn(async (_text: string) => true);
jest.mock('expo-clipboard', () => ({ setStringAsync: (text: string) => mockCopy(text) }));

const change = {
  path: '/work/a.ts',
  kind: 'updated' as const,
  added: 1,
  removed: 1,
  lineCount: 2,
  isLineCut: false,
  hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-old', '+new'] }],
};

function row(init: Partial<Parameters<typeof toolActivity>[0]>): ChatRow {
  const tool = toolActivity({
    kind: 'command',
    name: 'Bash',
    title: 'ls',
    status: 'succeeded',
    ...init,
  });
  return { id: 'r', content: { type: 'tool', tool }, topSpacing: 0 } as unknown as ChatRow;
}

async function show(value: ChatRow) {
  await render(
    <ThemeProvider themeId="indigo">
      <ChatRowView hostId="h" row={value} onToggle={jest.fn()} onLoadOlder={jest.fn()} now={0} />
      <OverlayHost />
    </ThemeProvider>,
  );
}

describe('an open tool row', () => {
  it('keeps its output closed until tapped, then shows it', async () => {
    await show(row({ preview: { text: 'a.txt', isTruncated: false, imageCount: 0 } }));
    expect(screen.queryByText('a.txt')).toBeNull();
    await fireEvent.press(screen.getByLabelText('ls'));
    expect(screen.getByText('a.txt')).toBeTruthy();
  });

  it('shows the lines of the files it changed', async () => {
    await show(
      row({
        fileChanges: {
          files: [change],
          moreFiles: 0,
          directory: '/work',
          isShared: false,
          isUnavailable: false,
          isSkipped: false,
          movesWorkingTree: false,
        },
      }),
    );
    await fireEvent.press(screen.getByLabelText('ls'));
    expect(screen.getByText('new')).toBeTruthy();
  });

  it('says so when its picture cannot be read, with no live Host', async () => {
    await show(row({ imagePath: '/tmp/shot.png' }));
    await fireEvent.press(screen.getByLabelText('ls'));
    expect(await screen.findByTestId('chat-tool-detail')).toBeTruthy();
    expect(screen.queryByTestId('chat-tool-image')).toBeNull();
  });
});
