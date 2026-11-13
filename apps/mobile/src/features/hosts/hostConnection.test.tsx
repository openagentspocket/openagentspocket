import { presentation, renderText } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AgentUnavailable } from '@/agent-detail/AgentUnavailable';
import { ConsoleStoreProvider } from '@/console/hooks';
import { HomeHosts } from '@/home/HomeHosts';
import { hrefs } from '@/navigation/hrefs';
import { HostIssues } from './HostIssues';
import { LINK_CASES, type LinkCase, linkStore } from './hostLinkTestKit';
import { createDemoRuntime, setHostsRuntime } from './hostsRuntime';
import { renderApp } from './hostsTestKit';

const mockRouter = { push: jest.fn() };
jest.mock('expo-secure-store', () => ({}));
jest.mock('expo-sqlite/kv-store', () => ({}));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));

const reconnect = jest.fn(async (_hostId: string) => {});

beforeEach(() => {
  mockRouter.push.mockClear();
  reconnect.mockClear();
  setHostsRuntime(createDemoRuntime({ reconnect }));
});
afterEach(() => setHostsRuntime(null));

async function world(link: LinkCase) {
  const env = linkStore();
  await env.add('lab', link);
  const stop = jest.spyOn(env.store, 'stopConnecting');
  return { ...env, stop };
}

async function renderAgent(link: LinkCase) {
  const env = await world(link);
  await renderApp(
    <ConsoleStoreProvider store={env.store}>
      <AgentUnavailable gone={false} hostId="lab" />
    </ConsoleStoreProvider>,
  );
  return env;
}

describe("the Agent screen while its Host's link is down", () => {
  it('shows the reconnect attempt and why the last one failed', async () => {
    await renderAgent('reconnecting');
    expect(await screen.findByTestId('agent-host-connection')).toBeTruthy();
    expect(screen.getByText(t('Attempt %lld', 3))).toBeTruthy();
    // A dial that timed out: the recovery says the address may have changed.
    const shown = presentation({ kind: 'timedOut' }, { connecting: true });
    expect(screen.getByText(renderText(shown.summary))).toBeTruthy();
    expect(screen.getByText(renderText(shown.recovery ?? ''))).toBeTruthy();
  });

  it("shows a failure's summary with Retry, Stop, Edit and Pair Again", async () => {
    await renderAgent('failed');
    const shown = presentation({ kind: 'authenticationFailed' });
    expect(await screen.findByText(renderText(shown.summary))).toBeTruthy();
    for (const action of ['primary', 'secondary', 'edit', 'pair-again']) {
      expect(screen.getByTestId(`agent-host-connection-${action}`)).toBeTruthy();
    }
  });

  it('offers Connect instead of Stop once the user stopped it', async () => {
    await renderAgent('stopped');
    expect(await screen.findByTestId('agent-host-connection-primary')).toBeTruthy();
    expect(screen.queryByTestId('agent-host-connection-secondary')).toBeNull();
    expect(screen.getByTestId('agent-host-connection-pair-again')).toBeTruthy();
  });

  it('shows the first dial too', async () => {
    await renderAgent('connecting');
    expect(await screen.findByTestId('agent-host-connection')).toBeTruthy();
  });

  it('waits while a live Host has not listed the Agent yet', async () => {
    await renderAgent('live');
    expect(await screen.findByTestId('agent-loading')).toBeTruthy();
    expect(screen.queryByTestId('agent-host-connection')).toBeNull();
  });
});

describe("the Agent screen's actions are the sheet's", () => {
  /** What one press reached: the live reconnect, Stop Connecting, or a navigation. */
  async function pressed(surface: 'panel' | 'sheet', action: string) {
    const env = await world('failed');
    await renderApp(
      <ConsoleStoreProvider store={env.store}>
        {surface === 'panel' ? <AgentUnavailable gone={false} hostId="lab" /> : <HostIssues />}
      </ConsoleStoreProvider>,
    );
    const prefix = surface === 'panel' ? 'agent-host-connection' : 'host-connection-sheet';
    if (surface === 'sheet') fireEvent.press(await screen.findByTestId('host-issue-row-lab'));
    fireEvent.press(await screen.findByTestId(`${prefix}-${action}`));
    await waitFor(() =>
      expect(
        reconnect.mock.calls.length +
          env.stop.mock.calls.length +
          mockRouter.push.mock.calls.length,
      ).toBeGreaterThan(0),
    );
    const calls = {
      reconnect: [...reconnect.mock.calls],
      stop: [...env.stop.mock.calls],
      push: [...mockRouter.push.mock.calls],
    };
    reconnect.mockClear();
    mockRouter.push.mockClear();
    return calls;
  }

  it.each(['primary', 'secondary', 'edit', 'pair-again'])('%s', async (action) => {
    const panel = await pressed('panel', action);
    screen.unmount();
    const sheet = await pressed('sheet', action);
    expect(panel).toEqual(sheet);
  });

  it('Retry goes through the live connections, Pair Again to pairing, Edit to the form', async () => {
    expect((await pressed('panel', 'primary')).reconnect).toEqual([['lab']]);
    screen.unmount();
    expect((await pressed('panel', 'pair-again')).push).toEqual([[hrefs.easyPair()]]);
    screen.unmount();
    expect((await pressed('panel', 'edit')).push).toEqual([[hrefs.hostForm({ edit: 'lab' })]]);
  });
});

describe('Home lists every saved Host whatever its link', () => {
  it.each(LINK_CASES)('a %s Host has a card', async (link) => {
    const env = await world(link);
    const onOpen = jest.fn();
    await renderApp(
      <ConsoleStoreProvider store={env.store}>
        <HomeHosts
          hosts={env.store.getState().hosts}
          rows={[]}
          saved={[]}
          columns={1}
          onOpen={onOpen}
        />
      </ConsoleStoreProvider>,
    );
    fireEvent.press(await screen.findByTestId('host-lab'));
    if (link === 'live') {
      expect(onOpen).toHaveBeenCalledWith('lab');
    } else {
      // A Host whose link is down opens its connection sheet from its card.
      expect(await screen.findByTestId('host-connection-sheet')).toBeTruthy();
      expect(onOpen).not.toHaveBeenCalled();
    }
  });

  it('opens the Hosts list from the summary line of three offline Hosts', async () => {
    const env = linkStore();
    for (const id of ['a', 'b', 'c']) await env.add(id, 'failed');
    await renderApp(
      <ConsoleStoreProvider store={env.store}>
        <HostIssues />
      </ConsoleStoreProvider>,
    );
    fireEvent.press(await screen.findByTestId('host-issue-row-summary'));
    expect(mockRouter.push).toHaveBeenCalledWith('/hosts');
  });
});
