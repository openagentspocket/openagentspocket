import { describe, expect, it } from 'vitest';
import { type BlockedPaneApi, herdrScreenIO, isBlockedPaneApi } from './screen-io';

function fakeApi() {
  const calls: unknown[] = [];
  const api: BlockedPaneApi = {
    readAgent: async (params) => {
      calls.push(['read', params]);
      return { text: '\u001b[1mAllow?\u001b[0m\n1. Yes' };
    },
    sendAgentKeys: async (params) => {
      calls.push(['keys', params]);
    },
    sendPaneInput: async (params) => {
      calls.push(['input', params]);
    },
    readPaneWith: async (params) => {
      calls.push(['pane-read', params]);
      return { text: 'shell $' };
    },
  };
  return { api, calls };
}

describe('herdrScreenIO', () => {
  it('reads the visible ANSI screen and decodes it', async () => {
    const { api, calls } = fakeApi();
    const io = herdrScreenIO('p1', (operation) => operation(api));
    const screen = await io.readScreen();
    expect(calls).toEqual([
      ['read', { target: 'p1', source: 'visible', format: 'ansi', strip_ansi: false }],
    ]);
    expect(screen.rows[0]?.text).toContain('Allow?');
  });

  it('sends keys through agent.send_keys and text through pane.send_input, never anything else', async () => {
    const { api, calls } = fakeApi();
    const io = herdrScreenIO('p1', (operation) => operation(api));
    await io.sendKeys(['down', 'enter']);
    await io.paste('note');
    expect(calls).toEqual([
      ['keys', { target: 'p1', keys: ['down', 'enter'] }],
      ['input', { pane_id: 'p1', text: 'note' }],
    ]);
  });

  it('addresses a pane herdr detects no Agent in by the pane: pane.read and pane.send_input', async () => {
    const { api, calls } = fakeApi();
    const io = herdrScreenIO('p1', (operation) => operation(api), 'pane');
    await io.readScreen();
    await io.sendKeys(['esc']);
    expect(calls).toEqual([
      ['pane-read', { pane_id: 'p1', source: 'visible', format: 'ansi', strip_ansi: false }],
      ['input', { pane_id: 'p1', keys: ['esc'] }],
    ]);
  });

  it('lets a failing transport reject so the card can report it', async () => {
    const io = herdrScreenIO('p1', async () => {
      throw new Error('lost');
    });
    await expect(io.sendKeys(['1'])).rejects.toThrow('lost');
  });

  it('recognizes a transport that can answer panes', () => {
    expect(isBlockedPaneApi(fakeApi().api)).toBe(true);
    expect(isBlockedPaneApi({ sessionSnapshot: () => 1 })).toBe(false);
    expect(isBlockedPaneApi(null)).toBe(false);
  });
});
