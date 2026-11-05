import { mkdtempSync, rmSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  decodeResult,
  type EventsDuplex,
  isResyncEvent,
  openEventsChannel,
  PROGRAM_KINDS,
} from '@openagentspocket/core';
import { afterEach, describe, expect, it } from 'vitest';
import { agentExecutables } from './agents.js';
import { type Bridge, startBridge } from './server.js';
import type { TmuxRunner } from './tmux.js';

const paneLine = (pane: string) =>
  ['$0', 'work', '@1', '0', 'api', pane, '1', '1', '1', 'zsh', '/srv', 't'].join('|oap|');

let dir: string;
let bridge: Bridge | undefined;

afterEach(async () => {
  await bridge?.close();
  bridge = undefined;
  rmSync(dir, { recursive: true, force: true });
});

async function start(panes: { text: string }) {
  dir = mkdtempSync(join(tmpdir(), 'oap-'));
  const socketPath = join(dir, 'herdr', 'herdr.sock');
  const tmux: TmuxRunner = { run: async () => panes.text };
  bridge = await startBridge({ socketPath, tmux, version: 'test', pollMs: 20 });
  return socketPath;
}

function ask(socketPath: string, line: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let out = '';
    const socket = connect(socketPath, () => socket.write(line));
    socket.on('data', (chunk) => {
      out += chunk.toString();
    });
    socket.on('end', () => resolve(out));
    socket.on('error', reject);
  });
}

function duplexTo(socketPath: string): Promise<EventsDuplex> {
  return new Promise((resolve) => {
    const socket = connect(socketPath, () =>
      resolve({
        write: async (data) => void socket.write(data),
        onData: (listener) => {
          socket.on('data', listener);
          return () => socket.off('data', listener);
        },
        onClose: (listener) => {
          socket.on('close', () => listener());
          return () => {};
        },
        close: async () => void socket.destroy(),
      }),
    );
  });
}

describe('the bridge socket', () => {
  it('answers one request per connection and closes it, as the app expects', async () => {
    const socketPath = await start({ text: paneLine('%1') });
    const out = await ask(socketPath, '{"id":"1","method":"ping","params":{}}\n');
    expect(decodeResult(out, '1', 'pong').version).toBe('test');
  });

  it('still answers a client that ended its side right after the request', async () => {
    const socketPath = await start({ text: paneLine('%1') });
    const out = await new Promise<string>((resolve) => {
      let text = '';
      const socket = connect(socketPath, () => socket.end('{"id":"1","method":"ping"}\n'));
      socket.on('data', (chunk) => {
        text += chunk.toString();
      });
      socket.on('close', () => resolve(text));
    });
    expect(decodeResult(out, '1', 'pong').version).toBe('test');
  });

  it('tells the app’s own events channel when panes change', async () => {
    const panes = { text: paneLine('%1') };
    const socketPath = await start(panes);
    const channel = await openEventsChannel(await duplexTo(socketPath), {
      subscriptions: [{ kind: 'pane.created' }],
      requestId: '9',
      clock: {
        setTimeout: (run, ms) => setTimeout(run, ms),
        clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
        monotonicMs: () => Date.now(),
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 60));
    panes.text = `${paneLine('%1')}\n${paneLine('%2')}`;
    const { value } = await channel.events[Symbol.asyncIterator]().next();
    expect(isResyncEvent(value.kind)).toBe(true);
    await channel.end();
  });
});

describe('agent names', () => {
  it('knows every program core knows', () => {
    const expected = PROGRAM_KINDS.map((info) => info.executable ?? info.kind).sort();
    expect([...agentExecutables()].sort()).toEqual(expected);
  });
});
