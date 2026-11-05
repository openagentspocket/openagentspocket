import type { ConsoleRow } from '@openagentspocket/core';
import { agentMenu, hostMenu } from './entryMenus';

jest.mock('expo-secure-store', () => ({}));
jest.mock('expo-sqlite/kv-store', () => ({}));

const nav = { push: jest.fn() };
const host = { id: 'h1', name: 'Workshop' };

const row = {
  hostId: 'h1',
  hostName: 'Workshop',
  workspaceTabCount: 1,
  tabPaneCount: 1,
  agent: { pane_id: 'p1', workspace_id: 'w1', cwd: '/work/api', agent: 'claude' },
} as unknown as ConsoleRow;

const keys = (items: { key: string }[]) => items.map((item) => item.key);

describe('entry menus', () => {
  beforeEach(() => nav.push.mockClear());

  it('offers New Agent, Terminals, Files and Ports on a Host, and hides the shell ones on Windows', () => {
    expect(keys(hostMenu(host, false, nav))).toEqual(['new-agent', 'terminals', 'files', 'ports']);
    expect(keys(hostMenu(host, true, nav))).toEqual(['new-agent', 'terminals']);
  });

  it('offers Open, Changes, Ports and New Agent here on an Agent', () => {
    const items = agentMenu(row, false, nav);
    expect(keys(items)).toEqual(['open', 'changes', 'ports', 'new-agent-here']);
    items.find((item) => item.key === 'new-agent-here')?.onPress();
    expect(nav.push).toHaveBeenCalledWith({
      pathname: '/new-agent',
      params: { host: 'h1', workspace: 'w1', cwd: '/work/api' },
    });
  });

  it('keeps only Open and New Agent here for a Windows Host', () => {
    expect(keys(agentMenu(row, true, nav))).toEqual(['open', 'new-agent-here']);
  });
});
