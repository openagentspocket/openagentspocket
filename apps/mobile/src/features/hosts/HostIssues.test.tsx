import { FakeClock, KeyAccessGate, type KeyAccessResult } from '@openagentspocket/core';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { createWorld, HOST_KEY, SAMPLE_HOST } from '@/connections/testWorld';
import { ConsoleStoreProvider } from '@/console/hooks';
import { HostIssues } from './HostIssues';
import { setHostsRuntime } from './hostsRuntime';
import { renderApp } from './hostsTestKit';

jest.mock('expo-secure-store', () => ({}));
jest.mock('expo-sqlite/kv-store', () => ({}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

afterEach(() => setHostsRuntime(null));

describe('HostIssues', () => {
  it('Retry Now takes back a refused key: the prompt comes up again', async () => {
    const gate = { asked: 0, answer: 'cancelled' as KeyAccessResult };
    const keyAccess = new KeyAccessGate({
      isRequired: () => true,
      authenticate: async () => {
        gate.asked += 1;
        return gate.answer;
      },
      clock: new FakeClock(),
    });
    const world = await createWorld(HOST_KEY, { keyAccess });
    setHostsRuntime(world.runtime);
    world.manager.start();
    await world.runtime.model.add(SAMPLE_HOST, null);
    await waitFor(() => expect(world.store.getState().hosts[0]?.status?.kind).toBe('failed'));

    await renderApp(
      <ConsoleStoreProvider store={world.store}>
        <HostIssues />
      </ConsoleStoreProvider>,
    );
    const issue = world.store.getState().hosts[0]?.name;
    await fireEvent.press(await screen.findByTestId(`host-issue-row-${issue}`));
    await fireEvent.press(await screen.findByTestId('host-connection-sheet-primary'));

    await waitFor(() => expect(gate.asked).toBe(2));
    world.manager.stop();
  });
});
