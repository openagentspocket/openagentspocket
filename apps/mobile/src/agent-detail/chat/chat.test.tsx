import { MemoryStorage } from '@openagentspocket/core';
import { ThemeProvider } from '@openagentspocket/ui';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { AtlasChat } from '@/dev/atlas/atlasChat';
import { TestSettings } from '@/settings/TestSettings';
import { AgentDetailScreen } from '../AgentDetailScreen';
import { durationText, rowToolStatus } from './chatRowModel';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
const mockCopy = jest.fn(async (_text: string) => true);
jest.mock('expo-clipboard', () => ({
  getStringAsync: async () => '',
  setStringAsync: (text: string) => mockCopy(text),
}));
describe('chat row model', () => {
  it('formats durations as seconds, then minutes and seconds', () => {
    expect(durationText(26)).toBe('26s');
    expect(durationText(105)).toBe('1:45');
  });

  it('maps tool states to the row ink', () => {
    expect(rowToolStatus('awaitingApproval')).toBe('waiting');
    expect(rowToolStatus('declined')).toBe('failed');
    expect(rowToolStatus('running', true)).toBe('done');
  });
});

jest.setTimeout(30_000);

async function showAtlasChat(background?: 'list') {
  await render(
    <ThemeProvider themeId="indigo">
      <TestSettings>
        <AtlasChat background={background}>
          <AgentDetailScreen
            hostId="demo"
            paneId="p2"
            storage={new MemoryStorage()}
            surface="chat"
            onSwitch={jest.fn()}
          />
        </AtlasChat>
      </TestSettings>
    </ThemeProvider>,
  );
}

describe('Chat timeline in the Agent detail', () => {
  it('folds a finished turn behind its header and opens it on tap', async () => {
    await showAtlasChat();
    await waitFor(() => expect(screen.getAllByTestId(/^chat-row-turn:/).length).toBe(1));
    expect(screen.queryByText('Checking which controls the bar shows at each width.')).toBeNull();
    await fireEvent.press(screen.getAllByRole('button', { name: /^.+26s/ })[0] as never);
    await waitFor(() => expect(screen.getAllByTestId(/^chat-row-entry:t1/).length).toBe(1));
  });
});

describe('the actions under the latest answer', () => {
  it('show once, under the finished answer and not the running turn, and copy it', async () => {
    await showAtlasChat();
    await waitFor(() => expect(screen.getAllByTestId('chat-message-actions')).toHaveLength(1));
    const answer = screen.getByTestId('chat-row-entry:a1');
    expect(within(answer).getByTestId('chat-message-actions')).toBeTruthy();
    await fireEvent.press(within(answer).getByTestId('chat-message-action-copy'));
    expect(mockCopy).toHaveBeenCalledWith(expect.stringContaining('The toolbar now fits'));
  });
});

describe('the status line over the Composer', () => {
  it('stands for the running turn, which is no row of the transcript', async () => {
    await showAtlasChat();
    const line = await screen.findByTestId('background-work-strip-summary');
    expect(line.props.accessibilityValue.text).toMatch(/^Working for /);
    expect(screen.queryByTestId('chat-row-liveTurn')).toBeNull();
  });

  it('folds finished work into a count and opens the sheet, which lists the notices', async () => {
    await showAtlasChat('list');
    const line = await screen.findByTestId('background-work-strip-summary');
    expect(line.props.accessibilityValue.text).toContain('2 done');
    expect(screen.queryByTestId('work-row-w3')).toBeNull();
    await fireEvent.press(line);
    await waitFor(() => expect(screen.getByTestId('work-notice-n1')).toBeTruthy());
    expect(screen.getByTestId('work-sheet-w3')).toBeTruthy();
  });
});

describe('a Subagent in the transcript', () => {
  it('is a quiet line: finished, it opens its transcript; running, the sheet', async () => {
    await showAtlasChat('list');
    const finished = await screen.findByTestId('chat-row-entry:w3');
    await fireEvent.press(within(finished).getByTestId('tool-line-done'));
    await waitFor(() =>
      expect(
        screen.getByText('Check whether the screenshots still show the address field.'),
      ).toBeTruthy(),
    );
    const running = screen.getByTestId('chat-row-entry:w1');
    await fireEvent.press(within(running).getByTestId('tool-line-running'));
    await waitFor(() => expect(screen.getByTestId('work-sheet-w1')).toBeTruthy());
  });
});
