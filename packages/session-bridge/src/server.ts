import { chmodSync, mkdirSync, rmSync } from 'node:fs';
import { createServer, type Socket } from 'node:net';
import { dirname } from 'node:path';
import { handleLine } from './handler.js';
import { listPanes, type TmuxPane, type TmuxRunner } from './tmux.js';

const DEFAULT_POLL_MS = 2000;

export interface Bridge {
  close(): Promise<void>;
}

interface BridgeOptions {
  socketPath: string;
  tmux: TmuxRunner;
  version: string;
  pollMs?: number;
}

/** What makes the app's lists stale. A title changes all the time and comes with the next read. */
const shapeOf = (panes: readonly TmuxPane[]) =>
  panes
    .map((p) => [p.sessionName, p.windowId, p.windowName, p.paneId, p.command, p.cwd].join('|'))
    .join('\n');

/** `pane.created` makes the app read a fresh snapshot: the poll knows only that something changed. */
const CHANGED_EVENT = `${JSON.stringify({ event: 'pane_created', data: {} })}\n`;

function subscribeId(line: string): string | null {
  try {
    const { id, method } = JSON.parse(line) as { id?: unknown; method?: unknown };
    return method === 'events.subscribe' && typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}

/**
 * Serves the session protocol on a Unix socket: one request per connection, as herdr does, except
 * `events.subscribe`, whose connection stays open for events. tmux pushes nothing to a poller, so
 * a change is found by polling, and only while someone is subscribed.
 */
export async function startBridge(options: BridgeOptions): Promise<Bridge> {
  const { socketPath, tmux, version, pollMs = DEFAULT_POLL_MS } = options;
  const subscribers = new Set<Socket>();
  let shape: string | null = null;

  const serve = (socket: Socket, line: string) => {
    const id = subscribeId(line);
    if (id !== null) {
      socket.write(`${JSON.stringify({ id, result: { type: 'subscription_started' } })}\n`);
      subscribers.add(socket);
      socket.on('close', () => subscribers.delete(socket));
      return;
    }
    void handleLine(tmux, version, line).then((response) => socket.end(response));
  };

  // Half open: a client may finish writing before the answer is ready, and over a forwarded channel
  // that end arrives as soon as the request does.
  const server = createServer({ allowHalfOpen: true }, (socket) => {
    let pending = '';
    let served = false;
    socket.on('error', () => socket.destroy());
    socket.on('data', (chunk) => {
      if (served) return;
      pending += chunk.toString('utf8');
      const end = pending.indexOf('\n');
      if (end === -1) return;
      served = true;
      serve(socket, pending.slice(0, end));
    });
  });

  const poll = async () => {
    if (subscribers.size === 0) {
      shape = null;
      return;
    }
    const panes = await listPanes(tmux).catch(() => []);
    const next = `${shapeOf(panes)}\n${JSON.stringify([...(tmux.records?.() ?? [])])}`;
    if (shape !== null && next !== shape)
      for (const socket of subscribers) socket.write(CHANGED_EVENT);
    shape = next;
  };
  const timer = setInterval(() => void poll(), pollMs);

  mkdirSync(dirname(socketPath), { recursive: true, mode: 0o700 });
  rmSync(socketPath, { force: true });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
  });
  chmodSync(socketPath, 0o600);

  return {
    close: async () => {
      clearInterval(timer);
      for (const socket of subscribers) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
