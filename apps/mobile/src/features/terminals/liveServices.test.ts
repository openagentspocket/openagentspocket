import { FakeClock } from '@openagentspocket/core';
import type { HerdrApi } from '@openagentspocket/transport';
import { createLiveShellServices, type ShellConsole } from './liveServices';

const pane = { pane_id: 'p1', tab_id: 't1', terminal_id: 'x1' };

function setup() {
  const createTab = jest.fn(async () => ({ root_pane: pane }));
  const closeTab = jest.fn(async () => undefined);
  const sessionSnapshot = jest.fn(async () => ({ panes: [pane] }));
  const api = { createTab, closeTab, sessionSnapshot } as unknown as HerdrApi;
  const console = {
    mutate: (_hostId, operation) => operation(api),
    withTerminalTransport: jest.fn(),
    transportGeneration: () => 3,
  } as ShellConsole;
  const services = createLiveShellServices({
    console,
    clock: new FakeClock(),
    hostName: () => 'Host',
  });
  return { services, createTab, closeTab };
}

describe('live shell services', () => {
  it('opens a tab on the Host and names the pane it made', async () => {
    const { services, createTab } = setup();
    const identity = await services.remote('h').create({ workspaceId: 'w', cwd: '/srv' });
    expect(identity).toEqual({ paneId: 'p1', tabId: 't1', terminalId: 'x1' });
    expect(createTab).toHaveBeenCalledWith({ workspace_id: 'w', cwd: '/srv', label: null });
  });

  it('a pane still on the Host verifies; a gone one does not', async () => {
    const remote = setup().services.remote('h');
    const identity = { paneId: 'p1', tabId: 't1', terminalId: 'x1' };
    expect(await remote.verify(identity)).toBe(true);
    expect(await remote.verify({ ...identity, paneId: 'gone' })).toBe(false);
  });

  it('remembers a tab per Host and key', () => {
    const { services } = setup();
    const identity = { paneId: 'p1', tabId: 't1', terminalId: 'x1' };
    services.memory('h', 'w').remember(identity);
    expect(services.memory('h', 'w').recall()).toEqual(identity);
    expect(services.memory('other', 'w').recall()).toBeUndefined();
    services.memory('h', 'w').forget();
    expect(services.memory('h', 'w').recall()).toBeUndefined();
  });
});
