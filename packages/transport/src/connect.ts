import {
  asTransportError,
  CancelledError,
  type CancelSignal,
  createCancellation,
  failWith,
  HostKeyVerificationGate,
  RouteRaceFailure,
  raceRoutes,
  routeFailures,
  type SSHRoute,
  type TransportError,
} from '@openagentspocket/core';
import { SshError, type SshModule, type SshSession } from 'agentico-ssh';
import { mapConnectError } from './error-mapping';
import { checkPresentedHostKey } from './host-key';
import { JUMP_LOCAL_HOST, openJumpHop, sessionThroughHop } from './jump';
import { DEFAULT_CONNECT_TIMEOUT_MS, type TransportSettings } from './settings';
import { SshTransport } from './transport';

function validEndpoint(route: SSHRoute): boolean {
  return (
    route.host !== '' && Number.isInteger(route.port) && route.port >= 1 && route.port <= 65535
  );
}

/**
 * Connects to a Host. With several routes they race only as far as a verified host key: the
 * first route whose Host presents a trusted key claims the race and is the only one that
 * authenticates; the others are told to stop. A Jump Host route logs in to the Jump Host first
 * and reaches the Host over a local forward; the Host's key is still checked by its own address.
 */
export async function connectTransport(
  ssh: SshModule,
  settings: TransportSettings,
): Promise<SshTransport> {
  const { routes } = settings;
  const gate = new HostKeyVerificationGate();
  let claimed: number | null = null;
  let claimedFailure: TransportError | null = null;
  const claim = (index: number) => {
    if (claimed === null) claimed = index;
    return claimed === index;
  };

  const attempt = async (route: SSHRoute, signal: CancelSignal): Promise<SshSession> => {
    if (!validEndpoint(route)) {
      throw failWith({ kind: 'sshUnreachable', detail: 'Invalid SSH endpoint.' });
    }
    const hop = route.jump
      ? await openJumpHop(ssh, route, route.jump, settings, gate, signal)
      : null;
    const index = routes.indexOf(route);
    let refusal: TransportError | null = null;
    let lost = false;
    try {
      const session = await ssh.connect({
        host: hop ? JUMP_LOCAL_HOST : route.host,
        port: hop ? hop.localPort : route.port,
        username: settings.username,
        keyAlias: settings.keyAlias,
        credential: settings.credential,
        timeoutMs: settings.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
        confirmHostKey: async (key) => {
          try {
            refusal = await checkPresentedHostKey(
              {
                host: route.host,
                port: route.port,
                trust: settings.hostKeyTrust ?? { kind: 'endpoint' },
                policy: settings.hostKeyPolicy,
                gate,
                signal,
              },
              key,
            );
          } catch (error) {
            if (error instanceof CancelledError) {
              lost = true;
              return false;
            }
            throw error;
          }
          if (refusal) return false;
          if (signal.aborted || !claim(index)) {
            lost = true;
            return false;
          }
          return true;
        },
      });
      return hop ? sessionThroughHop(session, hop) : session;
    } catch (error) {
      await hop?.close();
      const mapped: TransportError =
        refusal ??
        (lost && error instanceof SshError && error.code === 'hostKeyRejected'
          ? { kind: 'cancelled' }
          : mapConnectError(error));
      // Only the claimant authenticated: its failure is the connect's failure.
      if (claimed === index) claimedFailure = mapped;
      throw failWith(mapped);
    }
  };

  const session = await (async (): Promise<{ session: SshSession; route: SSHRoute }> => {
    const [only] = routes;
    if (routes.length === 1 && only) {
      return { session: await attempt(only, createCancellation().signal), route: only };
    }
    try {
      const won = await raceRoutes(routes, {
        clock: settings.clock,
        staggerMs: settings.routeStaggerMs,
        signal: settings.signal,
        attempt,
        discard: (late) => late.disconnect().catch(() => undefined),
      });
      return { session: won.value, route: routes[won.index] as SSHRoute };
    } catch (error) {
      if (error instanceof CancelledError) throw failWith({ kind: 'cancelled' });
      if (error instanceof RouteRaceFailure) {
        if (claimedFailure) throw failWith(claimedFailure);
        throw failWith({
          kind: 'noRouteReached',
          failures: routeFailures(routes, error.failures.map(asTransportError)),
        });
      }
      throw error;
    }
  })();

  return new SshTransport(session.session, settings, session.route.id);
}
