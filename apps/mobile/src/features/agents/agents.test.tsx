import { OverlayHost, ThemeProvider } from '@openagentspocket/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createDemoConsoleStore, DemoConsoleTransport } from '../../console/demo';
import { ConsoleStoreProvider } from '../../console/hooks';
import { AgentsScreen } from './AgentsScreen';
import { agentActions } from './agentActions';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
class RecordingTransport extends DemoConsoleTransport {
  readonly closed: string[] = [];
  readonly renamed: { target: string; name: string | null }[] = [];

  override async closePane(paneId: string): Promise<void> {
    this.closed.push(paneId);
  }

  readonly workspaces: { workspace_id: string; label: string }[] = [];

  override async renameWorkspace(params: { workspace_id: string; label: string }): Promise<void> {
    this.workspaces.push(params);
  }

  override async renameAgent(params: { target: string; name: string | null }): Promise<void> {
    this.renamed.push(params);
  }
}

async function open(
  prepare?: (store: ReturnType<typeof createDemoConsoleStore>) => void,
): Promise<{ transport: RecordingTransport; store: ReturnType<typeof createDemoConsoleStore> }> {
  const transport = new RecordingTransport();
  const store = createDemoConsoleStore(undefined, transport);
  prepare?.(store);
  await render(
    <ThemeProvider themeId="indigo">
      <ConsoleStoreProvider store={store}>
        <AgentsScreen />
        <OverlayHost />
      </ConsoleStoreProvider>
    </ThemeProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('agent-row-p1')).toBeTruthy());
  return { transport, store };
}

const order = () =>
  screen.getAllByTestId(/^agent-row-/).map((row) => row.props.testID.replace('agent-row-', ''));

async function runAction(pane: string, actionName: string) {
  await fireEvent(screen.getByTestId(`agent-row-${pane}`), 'accessibilityAction', {
    nativeEvent: { actionName },
  });
}

describe('AgentsScreen', () => {
  afterEach(() => mockPush.mockClear());

  it('lists every Agent flat, in Console order', async () => {
    await open();
    expect(order()).toEqual(['p1', 'p4', 'p2', 'p3', 'p5']);
  });

  it('shows the checkout totals and the low-context pill on the rows that have them', async () => {
    await open();
    expect(screen.getAllByTestId('agent-card-diff')).toHaveLength(5);
    expect(screen.getAllByTestId('agent-card-context')).toHaveLength(1);
  });

  it('opens the agent detail route for the tapped Agent', async () => {
    await open();
    await fireEvent.press(screen.getByTestId('agent-row-p2'));
    expect(mockPush).toHaveBeenCalledWith('/agent/demo/p2');
  });

  it('starts from the persisted Host filter', async () => {
    await open((store) => store.listPrefs.setHostId('demo'));
    expect(order()).toHaveLength(5);
  });

  it('searches by text and shows the empty result', async () => {
    await open();
    expect(screen.queryByTestId('agents-search')).toBeNull();
    await act(async () => {
      screen.getByTestId('agents-screen-scroll').props.refreshControl.props.onRefresh();
    });
    await fireEvent.changeText(screen.getByTestId('agents-search'), 'install');
    expect(order()).toEqual(['p3']);
    await fireEvent.changeText(screen.getByTestId('agents-search'), 'zzz');
    expect(screen.queryAllByTestId(/^agent-row-/)).toHaveLength(0);
  });

  it('moves a pinned Agent to the front', async () => {
    await open();
    await runAction('p3', 'pin');
    await waitFor(() => expect(order()[0]).toBe('p3'));
  });

  it('closes the pane only after the confirmation', async () => {
    const { transport } = await open();
    await runAction('p2', 'close');
    await fireEvent.press(await screen.findByTestId('alert-action-confirm'));
    await waitFor(() => expect(transport.closed).toEqual(['p2']));
  });

  it('does not close when the confirmation is cancelled', async () => {
    const { transport } = await open();
    await runAction('p2', 'close');
    await fireEvent.press(await screen.findByTestId('alert-cancel'));
    await waitFor(() => expect(screen.queryByTestId('alert-cancel')).toBeNull());
    expect(transport.closed).toEqual([]);
  });

  it('renames an Agent from the sheet', async () => {
    const { transport } = await open();
    await runAction('p2', 'rename');
    await fireEvent.changeText(await screen.findByTestId('rename-field'), '  Settings  ');
    await fireEvent.press(screen.getByTestId('rename-save'));
    await waitFor(() => expect(transport.renamed).toEqual([{ target: 'p2', name: 'Settings' }]));
  });

  it('renames a Workspace through the same sheet, and refuses an empty label', async () => {
    const { transport, store } = await open();
    const actions = agentActions(store);
    const row = await waitFor(() => {
      const first = store.getState().rows[0];
      if (!first) throw new Error('the demo has rows');
      return first;
    });
    await actions.renameWorkspace(row, '   ');
    await actions.renameWorkspace(row, ' api ');
    expect(transport.workspaces).toEqual([{ workspace_id: row.agent.workspace_id, label: 'api' }]);
  });
});
