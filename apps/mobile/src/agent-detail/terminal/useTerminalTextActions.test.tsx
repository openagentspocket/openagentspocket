import { ThemeProvider } from '@openagentspocket/ui';
import { act, render, screen } from '@testing-library/react-native';
import type { ConversationRegistry } from '@/conversations/ConversationRegistry';
import { ConversationsProvider } from '@/conversations/useConversation';
import { useTerminalTextActions } from './useTerminalTextActions';

let actions: ReturnType<typeof useTerminalTextActions>;

function Probe() {
  actions = useTerminalTextActions('h', 'p1');
  return actions.sheets;
}

async function show(read: () => Promise<string | null>) {
  const registry = { readVisibleText: read } as unknown as ConversationRegistry;
  await render(
    <ThemeProvider themeId="indigo">
      <ConversationsProvider registry={registry}>
        <Probe />
      </ConversationsProvider>
    </ThemeProvider>,
  );
}

const press = (key: string) =>
  act(async () => actions.items.find((item) => item.key === key)?.onPress?.());

describe('the terminal text actions', () => {
  it('shows the screen as selectable text', async () => {
    await show(async () => 'hello from the pane');
    await press('select');
    expect(await screen.findByText('hello from the pane')).toBeTruthy();
  });

  it('lists the links on the screen, and keeps them when they scroll away', async () => {
    const reads = ['see https://example.com/a now', 'nothing here'];
    await show(async () => reads.shift() ?? '');
    await press('links');
    expect(await screen.findByTestId('attach-link-https://example.com/a')).toBeTruthy();
    await press('links');
    expect(await screen.findByTestId('attach-link-https://example.com/a')).toBeTruthy();
  });

  it('opens with nothing when the Host cannot read the pane', async () => {
    await show(async () => {
      throw new Error('gone');
    });
    await press('select');
    expect(screen.getByTestId('select-text-sheet')).toBeTruthy();
  });
});
