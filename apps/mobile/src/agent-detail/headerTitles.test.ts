import type { ConsoleRow } from '@openagentspocket/core';
import { headerTitles } from './headerTitles';

const row = {
  hostId: 'h',
  hostName: 'Studio Mac',
  workspaceLabel: 'mobile',
  agent: {
    pane_id: 'p1',
    agent_status: 'working',
    agent: 'claude',
    name: 'attach-polish',
    cwd: '/work/mobile',
  },
} as unknown as ConsoleRow;

describe('the header title block', () => {
  it('names the conversation on Chat, with the program and Host under it', () => {
    expect(headerTitles(row, 'chat', 'Tighten the Attach toolbar')).toEqual({
      title: 'Tighten the Attach toolbar',
      subtitle: 'Claude · Studio Mac',
    });
  });

  it('names the Agent on Chat when its program recorded no title', () => {
    expect(headerTitles(row, 'chat', null).title).toBe('attach-polish');
    expect(headerTitles(row, 'chat', '  ').title).toBe('attach-polish');
  });

  it('keeps the terminal block: Host and program over the Agent', () => {
    const terminal = headerTitles(row, 'terminal', 'Tighten the Attach toolbar');
    expect(terminal.eyebrow).toBe('Studio Mac · claude');
    expect(terminal.title).toBe('attach-polish');
  });
});
