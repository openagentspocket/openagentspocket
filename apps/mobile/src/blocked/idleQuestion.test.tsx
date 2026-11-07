import {
  type ChatPendingRequest,
  ComposerRegistry,
  type ConversationState,
  type ConversationStore,
  FakeClock,
  initialSnapshot,
  MemoryStorage,
} from '@openagentspocket/core';
import { ThemeProvider } from '@openagentspocket/ui';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { AgentDetailScreen } from '@/agent-detail/AgentDetailScreen';
import { ComposerRegistryProvider } from '@/agent-detail/composer/composerContext';
import { createDemoConsoleStore, DemoConsoleTransport } from '@/console/demo';
import { ConsoleStoreProvider } from '@/console/hooks';
import type { ConversationRegistry } from '@/conversations/ConversationRegistry';
import { ConversationsProvider } from '@/conversations/useConversation';
import { TestSettings } from '@/settings/TestSettings';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-clipboard', () => ({ getStringAsync: async () => '' }));

// Jest runs in node; the app's tsconfig carries no node typings.
declare const __dirname: string;
const { readFileSync } = require('node:fs') as {
  readFileSync(path: string, encoding: 'utf8'): string;
};
const goldenScreen = (stem: string) =>
  readFileSync(
    `${__dirname}/../../../../packages/core/goldens/claude/screens/${stem}.ansi`,
    'utf8',
  );

class PaneTransport extends DemoConsoleTransport {
  keys: string[][] = [];
  prompts: string[] = [];
  text = '';
  async readAgent(): Promise<{ text: string }> {
    return { text: this.text };
  }
  async sendAgentKeys(params: { target: string; keys: string[] }): Promise<void> {
    this.keys.push(params.keys);
  }
  async sendPaneInput(): Promise<void> {}
  async promptAgent(params: { target: string; text: string }): Promise<void> {
    this.prompts.push(params.text);
  }
}

const OPEN: ChatPendingRequest = {
  entryID: 'e1',
  callID: 'call-1',
  kind: 'question',
  toolName: 'AskUserQuestion',
  summary: 'Which?',
  detail: null,
  questions: [],
  planFilePath: null,
};

/** A conversation whose question stands open, for an Agent herdr reports idle. */
function registryWithOpenQuestion(): ConversationRegistry {
  const state: ConversationState = {
    snapshot: {
      ...initialSnapshot(),
      phase: { type: 'following', path: '/demo/session' },
      openQuestions: [OPEN],
    },
    workflowProgress: {},
    outputs: new Map(),
    version: 1,
  };
  const store = {
    subscribe: () => () => undefined,
    getState: () => state,
    show: () => undefined,
    hide: () => undefined,
    updateSends: () => undefined,
    sendConcern: () => null,
    inputBoxWasRead: () => undefined,
    confirmSessionBeforeSend: async () => null,
  } as unknown as ConversationStore;
  return { get: () => store } as unknown as ConversationRegistry;
}

function renderDetail(transport: PaneTransport) {
  const storage = new MemoryStorage();
  const registry = new ComposerRegistry({ storage, clock: new FakeClock() });
  render(
    <ThemeProvider themeId="indigo">
      <TestSettings>
        <ConsoleStoreProvider store={createDemoConsoleStore(undefined, transport)}>
          <ConversationsProvider registry={registryWithOpenQuestion()}>
            <ComposerRegistryProvider registry={registry}>
              <AgentDetailScreen hostId="demo" paneId="p5" storage={storage} onSwitch={jest.fn()} />
            </ComposerRegistryProvider>
          </ConversationsProvider>
        </ConsoleStoreProvider>
      </TestSettings>
    </ThemeProvider>,
  );
}

describe('a question herdr reports idle', () => {
  const asking = () => {
    const transport = new PaneTransport();
    transport.text = goldenScreen('claude-39-c8-phone-question-titled-rule');
    renderDetail(transport);
    return transport;
  };

  it('stands as a card read from the screen, and a tap sends the verified digit', async () => {
    const transport = asking();
    await waitFor(() => expect(screen.getByTestId('blocked-option-1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('blocked-option-1'));
    await waitFor(() => expect(transport.keys).toEqual([['1']]));
  });

  it('refuses a message by saying an answer waits, with the way to the terminal', async () => {
    const transport = asking();
    await waitFor(() => expect(screen.getByTestId('composer-input')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('composer-input'), 'hello');
    await waitFor(() => expect(screen.getByTestId('composer-input').props.value).toBe('hello'));
    fireEvent.press(screen.getByTestId('composer-send'));
    await waitFor(() => expect(screen.getByTestId('composer-notice')).toBeTruthy());
    expect(transport.prompts).toEqual([]);
    fireEvent.press(within(screen.getByTestId('composer-notice')).getByText('Show Terminal'));
    await waitFor(() => expect(screen.getByTestId('slot-terminal')).toBeTruthy());
  });
});
