import { MemoryStorage } from '@openagentspocket/core';
import { ThemeProvider } from '@openagentspocket/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AtlasChat } from '@/dev/atlas/atlasChat';
import { TestSettings } from '@/settings/TestSettings';
import { AgentDetailScreen } from '../AgentDetailScreen';
import { durationText, rowToolStatus } from './chatRowModel';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-clipboard', () => ({ getStringAsync: async () => '' }));
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

describe('Chat timeline in the Agent detail', () => {
  it('folds a finished turn behind its header and opens it on tap', async () => {
    await render(
      <ThemeProvider themeId="indigo">
        <TestSettings>
          <AtlasChat>
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
    await waitFor(() => expect(screen.getAllByTestId(/^chat-row-turn:/).length).toBe(1));
    expect(screen.queryByText('Checking which controls the bar shows at each width.')).toBeNull();
    await fireEvent.press(screen.getAllByRole('button', { name: /^.+26s/ })[0] as never);
    await waitFor(() => expect(screen.getAllByTestId(/^chat-row-entry:t1/).length).toBe(1));
  });
});
