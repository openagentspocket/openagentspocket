import type { ConsoleRow } from '@openagentspocket/core';
import { attachTargetOf, paneAddressing } from './paneAddressing';

const row = (agent: string | null): ConsoleRow =>
  ({
    hostId: 'h',
    agent: { pane_id: 'wH:p7', terminal_id: 'term_7', agent },
  }) as unknown as ConsoleRow;

describe('addressing a pane', () => {
  it('goes through the Agent herdr detects', () => {
    expect(paneAddressing(row('claude'))).toBe('agent');
    expect(attachTargetOf(row('claude'), 'wH:p7')).toEqual({ kind: 'agentPane', id: 'wH:p7' });
  });

  it('goes through the pane and its terminal when herdr detects no Agent', () => {
    expect(paneAddressing(row(null))).toBe('pane');
    expect(attachTargetOf(row(null), 'wH:p7')).toEqual({ kind: 'terminal', id: 'term_7' });
  });

  it('assumes an Agent before the row is known', () => {
    expect(paneAddressing(undefined)).toBe('agent');
  });
});
