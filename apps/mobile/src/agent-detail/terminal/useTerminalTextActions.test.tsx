import { FakeClock, ScriptedTerminalSession, scriptedRunner } from '@openagentspocket/core';
import { ThemeProvider, toast } from '@openagentspocket/ui';
import { act, render, screen } from '@testing-library/react-native';
import { utf8Encode } from 'agentico-ssh';
import type { ConversationRegistry } from '@/conversations/ConversationRegistry';
import { ConversationsProvider } from '@/conversations/useConversation';
import { AgentTerminalSession } from './AgentTerminalSession';
import { useTerminalTextActions } from './useTerminalTextActions';

jest.mock('@openagentspocket/ui', () => ({
  ...jest.requireActual('@openagentspocket/ui'),
  toast: jest.fn(),
}));

let actions: ReturnType<typeof useTerminalTextActions>;

const wired = () => {
  const remote = new ScriptedTerminalSession();
  const { runner } = scriptedRunner([async () => ({ session: remote, generation: 1 })]);
  const session = new AgentTerminalSession('p1', {
    runner,
    clock: new FakeClock(),
    transportGeneration: () => 1,
    subscribe: () => () => undefined,
  });
  return { remote, session };
};

function Probe({ session }: { session: AgentTerminalSession }) {
  actions = useTerminalTextActions('h', 'p1', session, 'claude');
  return actions.sheets;
}

async function show(
  read: () => Promise<string | null>,
  { session = wired().session, canReadScreens = true } = {},
) {
  const registry = {
    readVisibleText: read,
    canReadScreens,
  } as unknown as ConversationRegistry;
  return render(
    <ThemeProvider themeId="indigo">
      <ConversationsProvider registry={registry}>
        <Probe session={session} />
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

describe('Message Jump in the terminal menu', () => {
  const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  const keys = () => actions.items.map((item) => item.key);

  /** A live Attach whose remote has turned mouse reports on. */
  const live = async () => {
    const { remote, session } = wired();
    session.getStore().viewDidResize(80, 24);
    await settle();
    remote.emit(utf8Encode('\u001b[?1000h\u001b[?1006h'));
    await settle();
    return { remote, session };
  };

  afterEach(() => {
    jest.useRealTimers();
    jest.mocked(toast).mockClear();
  });

  it('offers both directions when panes can be read and the remote scrolls', async () => {
    const { session } = await live();
    await show(async () => 'screen', { session });
    expect(keys()).toEqual(expect.arrayContaining(['jump-older', 'jump-newer']));
  });

  it('is not offered where panes cannot be read', async () => {
    const { session } = await live();
    await show(async () => null, { session, canReadScreens: false });
    expect(keys()).not.toContain('jump-older');
  });

  it('is not offered before the remote takes wheel reports', async () => {
    await show(async () => 'screen');
    expect(keys()).not.toContain('jump-older');
  });

  it('scrolls the Attach, and says so when it reaches the end', async () => {
    const { remote, session } = await live();
    await show(async () => 'same screen', { session });
    jest.useFakeTimers();
    await press('jump-older');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000);
    });
    expect(remote.scrolls.length).toBeGreaterThan(0);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it('says nothing after a jump that found its message', async () => {
    const { session } = await live();
    const reads = ['screen', '> a message further up'];
    await show(async () => reads.shift() ?? '> a message further up', { session });
    jest.useFakeTimers();
    await press('jump-older');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000);
    });
    expect(toast).not.toHaveBeenCalled();
  });

  it('ends a jump in progress when the view leaves', async () => {
    const { remote, session } = await live();
    const view = await show(async () => 'same screen', { session });
    jest.useFakeTimers();
    await press('jump-older');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
    const steps = remote.scrolls.length;
    expect(steps).toBeGreaterThan(0);
    await view.unmount();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(remote.scrolls).toHaveLength(steps);
    expect(toast).not.toHaveBeenCalled();
  });
});
