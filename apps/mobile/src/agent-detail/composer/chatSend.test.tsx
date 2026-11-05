import { ComposerRegistry, FakeClock, MemoryStorage } from '@openagentspocket/core';
import { ThemeProvider } from '@openagentspocket/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createDemoConsoleStore, DemoConsoleTransport } from '@/console/demo';
import { ConsoleStoreProvider } from '@/console/hooks';
import { TestSettings } from '@/settings/TestSettings';
import { AgentDetailScreen } from '../AgentDetailScreen';
import { ComposerRegistryProvider } from './composerContext';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));

// Jest runs in node; the app's tsconfig carries no node typings.
declare const __dirname: string;
const { readFileSync } = require('node:fs') as {
  readFileSync(path: string, encoding: 'utf8'): string;
};
const goldenScreen = (stem: string, program: string) =>
  readFileSync(
    `${__dirname}/../../../../../packages/core/goldens/${program}/screens/${stem}.ansi`,
    'utf8',
  );

/** A Host whose panes can be read and answered, with what each call was given. */
class PaneTransport extends DemoConsoleTransport {
  prompts: { target: string; text: string }[] = [];
  keys: { target: string; keys: string[] }[] = [];
  reads = 0;
  text = '';

  async readAgent(): Promise<{ text: string }> {
    this.reads += 1;
    return { text: this.text };
  }
  async sendAgentKeys(params: { target: string; keys: string[] }): Promise<void> {
    this.keys.push(params);
  }
  async sendPaneInput(): Promise<void> {}
  async promptAgent(params: { target: string; text: string }): Promise<void> {
    this.prompts.push(params);
  }
}

function renderDetail(paneId: string, transport: PaneTransport) {
  const storage = new MemoryStorage();
  const registry = new ComposerRegistry({ storage, clock: new FakeClock() });
  render(
    <ThemeProvider themeId="indigo">
      <TestSettings>
        <ConsoleStoreProvider store={createDemoConsoleStore(undefined, transport)}>
          <ComposerRegistryProvider registry={registry}>
            <AgentDetailScreen
              hostId="demo"
              paneId={paneId}
              storage={storage}
              onSwitch={jest.fn()}
            />
          </ComposerRegistryProvider>
        </ConsoleStoreProvider>
      </TestSettings>
    </ThemeProvider>,
  );
}

const type = async (text: string) => {
  await waitFor(() => expect(screen.getByTestId('composer-input')).toBeTruthy());
  fireEvent.changeText(screen.getByTestId('composer-input'), text);
  await waitFor(() => expect(screen.getByTestId('composer-input').props.value).toBe(text));
};

describe('Chat send through the program send policy', () => {
  it("reads the Agent's screen and sends into an empty input box", async () => {
    const transport = new PaneTransport();
    transport.text = goldenScreen('claude-01-ready', 'claude');
    renderDetail('p5', transport);
    await type('hello');
    fireEvent.press(screen.getByTestId('composer-send'));
    await waitFor(() => expect(transport.prompts).toEqual([{ target: 'p5', text: 'hello ' }]));
    expect(transport.reads).toBeGreaterThan(0);
  });

  it('holds the message, and keeps the draft, when the box already has text', async () => {
    const transport = new PaneTransport();
    transport.text = goldenScreen('claude-02-c1-bash-blocked', 'claude');
    renderDetail('p5', transport);
    await type('hello');
    fireEvent.press(screen.getByTestId('composer-send'));
    await waitFor(() => expect(screen.getByTestId('composer-notice')).toBeTruthy());
    expect(transport.prompts).toEqual([]);
    expect(screen.getByTestId('composer-input').props.value).toBe('hello');
  });

  it('refuses a draft the program rules refuse, before any screen read', async () => {
    const transport = new PaneTransport();
    renderDetail('p5', transport);
    await type('!ls');
    fireEvent.press(screen.getByTestId('composer-send'));
    await waitFor(() => expect(screen.getByTestId('composer-notice')).toBeTruthy());
    expect(transport.reads).toBe(0);
    expect(transport.prompts).toEqual([]);
  });

  it("offers the program's `/` menu and completes a command without sending it", async () => {
    const transport = new PaneTransport();
    renderDetail('p5', transport);
    await type('/co');
    await waitFor(() => expect(screen.getByTestId('composer-skill-/compact')).toBeTruthy());
    fireEvent.press(screen.getByTestId('composer-skill-/compact'));
    await waitFor(() => expect(screen.getByTestId('composer-input').props.value).toBe('/compact '));
    expect(transport.prompts).toEqual([]);
  });

  it("presses the program's own Stop keys through agent.send_keys", async () => {
    const transport = new PaneTransport();
    renderDetail('p2', transport);
    await waitFor(() => expect(screen.getByTestId('composer-stop')).toBeTruthy());
    fireEvent.press(screen.getByTestId('composer-stop'));
    await waitFor(() => expect(transport.keys).toEqual([{ target: 'p2', keys: ['esc'] }]));
  });
});
