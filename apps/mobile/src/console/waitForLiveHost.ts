import type { ConsoleState } from './store';

/** An app opened by an action needs a moment to reach the Host. */
const CONNECT_WAIT_MS = 8_000;
const CONNECT_POLL_MS = 200;

/** Resolves once the Host's link is live, or after the wait: the caller's own read then decides. */
export async function waitForLiveHost(
  store: { getState(): Pick<ConsoleState, 'hosts'> },
  hostId: string,
): Promise<void> {
  const until = Date.now() + CONNECT_WAIT_MS;
  const isLive = () => store.getState().hosts.find((host) => host.id === hostId)?.link === 'live';
  while (!isLive() && Date.now() < until) {
    await new Promise<void>((resolve) => setTimeout(resolve, CONNECT_POLL_MS));
  }
}
