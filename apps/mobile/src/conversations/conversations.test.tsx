import {
  type ChatHostFiles,
  FakeClock,
  FakeHostFiles,
  type Host,
  VolatileChatTranscriptCache,
} from '@openagentspocket/core';
import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { type ConversationConsole, ConversationRegistry } from './ConversationRegistry';
import { ConversationsProvider, useConversation } from './useConversation';

const SESSION = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b';
const CWD = '/work/app';

function row(
  over: { session?: boolean } = {},
): ReturnType<ConversationConsole['getState']>['rows'][number] {
  return {
    hostId: 'h1',
    hostName: 'Host',
    workspaceTabCount: 1,
    tabPaneCount: 1,
    agent: {
      pane_id: 'p1',
      agent: 'claude',
      agent_status: 'idle',
      cwd: CWD,
      agent_session:
        over.session === false
          ? null
          : { agent: 'claude', kind: 'id', source: 'herdr:claude', value: SESSION },
    },
  } as ReturnType<ConversationConsole['getState']>['rows'][number];
}

function setup(session = true) {
  const files = new FakeHostFiles();
  const clock = new FakeClock(() => new Promise<void>((resolve) => setImmediate(resolve)));
  const listeners = new Set<() => void>();
  let rows = [row({ session })];
  const consoleStore: ConversationConsole = {
    getState: () => ({ rows, hosts: [{ id: 'h1', status: { kind: 'connected' } }] }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  let hosts: Host[] = [{ id: 'h1', sessionName: '', herdrEndpoint: null } as Host];
  const cache = new VolatileChatTranscriptCache();
  const registry = new ConversationRegistry({
    console: consoleStore,
    hosts: () => hosts,
    createFiles: (): ChatHostFiles => files,
    cache,
    clock,
  });
  return {
    files,
    clock,
    registry,
    cache,
    setRows: (next: typeof rows) => {
      rows = next;
      for (const listener of listeners) listener();
    },
    setHosts: (next: Host[]) => {
      hosts = next;
    },
  };
}

function Probe() {
  const { state } = useConversation('h1', 'p1');
  const phase = state.snapshot.phase;
  return (
    <Text testID="phase">{phase.type === 'unavailable' ? phase.reason.kind : phase.type}</Text>
  );
}

describe('ConversationRegistry', () => {
  it('hands out one store per Agent and shows why a conversation is missing', async () => {
    const { registry } = setup(false);
    const store = registry.get('h1', 'p1');
    expect(registry.get('h1', 'p1')).toBe(store);
    await store.step();
    expect(store.getState().snapshot.phase).toMatchObject({
      type: 'unavailable',
      reason: { kind: 'noSession' },
    });
  });

  it('wakes the store when the Console reports another record', async () => {
    const { registry, setRows } = setup(false);
    const store = registry.get('h1', 'p1');
    await store.step();
    setRows([row()]);
    await store.step();
    expect(store.getState().snapshot.phase).toMatchObject({ reason: { kind: 'notFound' } });
  });

  it('drops the stores and cached transcripts of a removed Host', async () => {
    const { registry, setHosts, cache } = setup();
    const store = registry.get('h1', 'p1');
    setHosts([]);
    const retain = jest.spyOn(cache, 'retainHosts');
    await registry.retainHosts();
    expect(retain).toHaveBeenCalledWith(new Set());
    expect(registry.get('h1', 'p1')).not.toBe(store);
  });
});

describe('useConversation', () => {
  it('follows the conversation while mounted', async () => {
    const { registry, files } = setup();
    files.mkdir(`${files.homePath}/.claude/projects`);
    await render(
      <ConversationsProvider registry={registry}>
        <Probe />
      </ConversationsProvider>,
    );
    await act(async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
    });
    expect(screen.getByTestId('phase').props.children).toBe('notFound');
  });

  it('is unavailable without a registry', async () => {
    await render(<Probe />);
    expect(screen.getByTestId('phase').props.children).toBe('unsupportedSession');
  });
});
