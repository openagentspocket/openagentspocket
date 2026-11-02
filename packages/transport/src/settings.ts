import type {
  CancelSignal,
  Clock,
  HerdrEndpoint,
  HerdrSocketLocation,
  HostKeyPolicy,
  HostKeyTrust,
  SSHRoute,
} from '@openagentspocket/core';
import type { SshCredentialSource } from 'agentico-ssh';

export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
export const DEFAULT_CONNECT_TIMEOUT_MS = 15_000;
/** The response bound of one herdr API exchange (1 MiB). */
export const MAXIMUM_RESPONSE_BYTES = 1_048_576;
/** A fresh pane's shell may be busy; `agent.start` is resent within this budget. */
export const SHELL_READINESS_BUDGET_MS = 10_000;
export const SHELL_READINESS_RETRY_MS = 500;

/** Prints a marker-delimited home directory under POSIX sh (login shells differ in syntax). */
export const DEFAULT_HOME_COMMAND = `/bin/sh -c 'printf "__AGENTICO_HOME__=%s\\n" "$HOME"'`;
export const HOME_MARKER = '__AGENTICO_HOME__=';
/** `herdr remote-client-bridge` ensures the server runs (spawn, wait for the socket), then bridges. */
export const DEFAULT_WAKE_COMMAND = 'herdr remote-client-bridge';

/** How to reach one Host, authenticate against it, and find its herdr socket. */
export interface TransportSettings {
  /** In the user's order; never empty. Several routes race (core `raceRoutes`). */
  readonly routes: readonly SSHRoute[];
  readonly username: string;
  /** Alias of the device key kept natively; the same alias for every Host. */
  readonly keyAlias?: string;
  /**
   * What authenticates instead of the device key (password, RSA key). A function is resolved
   * only once the Host Key was accepted, so secrets are read for a trusted Host only.
   */
  readonly credential?: SshCredentialSource;
  readonly hostKeyPolicy: HostKeyPolicy;
  /** Where the Host's key is trusted; defaults to the endpoint dialled. */
  readonly hostKeyTrust?: HostKeyTrust;
  readonly socket: HerdrSocketLocation;
  /** A Pairing Code v2 endpoint: the wake runs its launcher instead of the PATH's `herdr`. */
  readonly endpoint?: HerdrEndpoint | null;
  readonly clock: Clock;
  readonly requestTimeoutMs?: number;
  readonly connectTimeoutMs?: number;
  readonly routeStaggerMs?: number;
  readonly homeCommand?: string;
  readonly wakeCommand?: string;
  /** Injectable attach commands (fixtures); default `herdr agent attach` / `herdr terminal attach`. */
  readonly attachCommand?: string;
  readonly terminalAttachCommand?: string;
  /** Aborts the connect (the user cancelled). */
  readonly signal?: CancelSignal;
}
