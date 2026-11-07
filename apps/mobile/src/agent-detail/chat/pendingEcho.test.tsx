import type { ChatPendingEchoState, ChatRow } from '@openagentspocket/core';
import { ThemeProvider } from '@openagentspocket/ui';
import { render, screen } from '@testing-library/react-native';
import { ChatRowView } from './ChatRowView';

const pendingRow = (state: ChatPendingEchoState): ChatRow =>
  ({
    id: 'pending:m1',
    content: { type: 'pending', echo: { id: 'm1', text: 'fix the tests', state } },
  }) as unknown as ChatRow;

async function show(state: ChatPendingEchoState) {
  await render(
    <ThemeProvider themeId="indigo">
      <ChatRowView
        hostId="h"
        row={pendingRow(state)}
        onToggle={jest.fn()}
        onLoadOlder={jest.fn()}
        now={0}
      />
    </ThemeProvider>,
  );
}

// Each state of a message Chat sent draws the same bubble; only its caption differs (Swift ChatPendingBubble).
describe('a message Chat sent, under its bubble', () => {
  it('shows a caption for every state that has one', async () => {
    const withCaption: ChatPendingEchoState[] = [
      { kind: 'unconfirmed' },
      { kind: 'failed', reason: 'The Host went away.' },
      { kind: 'notDelivered' },
      { kind: 'discarded' },
      { kind: 'refused', reason: 'Claude says no.' },
      { kind: 'misdirected' },
    ];
    for (const state of withCaption) {
      await show(state);
      expect(screen.getByLabelText('fix the tests')).toBeTruthy();
      expect(screen.getByTestId('chat-user-bubble-status')).toBeTruthy();
      await screen.unmount();
    }
  });

  it('says the reason a program refused it, as the program said it', async () => {
    await show({ kind: 'refused', reason: 'Claude says no.' });
    expect(screen.getByText('Claude says no.')).toBeTruthy();
  });

  it('adds nothing once it is sent, and dims the bubble with a caption while sending', async () => {
    await show({ kind: 'sent' });
    expect(screen.queryByTestId('chat-user-bubble-status')).toBeNull();
    await screen.unmount();
    await show({ kind: 'sending' });
    expect(screen.queryByTestId('chat-user-bubble-status')).toBeNull();
    expect(screen.getByText('Sending…')).toBeTruthy();
  });
});
