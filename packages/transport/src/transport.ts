import {
  type CancelSignal,
  type Clock,
  decodeResult,
  type EventSubscription,
  type EventsTransport,
  failures,
  failWith,
  HERDR_PATH_EXPORT,
  type HerdrEventStream,
  socketPath as herdrSocketPath,
  isQuotableAbsolutePath,
  METHOD_RESULT,
  type MethodResult,
  openEventsChannel,
  type ParamsOf,
  quotedAbsolutePath,
  requestLine,
  TransportFailure,
  type WireMethod,
} from '@openagentspocket/core';
import { SshError, type SshSession, utf8Decode, utf8Encode } from 'agentico-ssh';
import { ChannelAdmission } from './admission';
import { abortable, withDeadline } from './deadline';
import { invalidatesConnection, mapOperationError, operationFailure } from './error-mapping';
import { HerdrApi } from './herdr-api';
import {
  DEFAULT_HOME_COMMAND,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_WAKE_COMMAND,
  HOME_MARKER,
  MAXIMUM_RESPONSE_BYTES,
  type TransportSettings,
} from './settings';
import { SharedOperation } from './shared-operation';

export interface ExecOutcome {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** The last line carrying `prefix`, trimmed of a trailing CR; login-shell noise is harmless. */
export function markerValue(output: string, prefix: string): string | null {
  const lines = output.split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index] as string;
    if (line.startsWith(prefix)) return line.slice(prefix.length).replace(/\r$/, '');
  }
  return null;
}

/**
 * One authenticated connection to a Host and the herdr API behind it. Unix API traffic is a
 * direct-streamlocal exchange per request; the Host's one events channel is a long-lived
 * streamlocal duplex. Satisfies core's `EventsTransport` and `ConsoleTransport`.
 * (Swift `AgenticoSSHTransport`; native Windows Hosts are not ported.)
 */
export class SshTransport extends HerdrApi implements EventsTransport {
  readonly routeId: string | undefined;
  readonly admission = new ChannelAdmission();
  private readonly clock: Clock;
  private readonly requestTimeoutMs: number;
  private readonly home = new SharedOperation<string>(true);
  private readonly wake = new SharedOperation<void>(false);
  private connected = true;
  private eventsOpen = false;
  private requestCounter = 0;
  private readonly requestPrefix = Math.random().toString(36).slice(2, 8);

  constructor(
    /** The authenticated SSH session; host services (exec, SFTP) build on it. */
    readonly session: SshSession,
    readonly settings: TransportSettings,
    routeId: string | null,
  ) {
    super();
    this.routeId = routeId ?? undefined;
    this.clock = settings.clock;
    this.requestTimeoutMs = settings.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  async isConnected(): Promise<boolean> {
    if (!this.connected) return false;
    return this.session.isConnected().catch(() => false);
  }

  async close(): Promise<void> {
    if (!this.connected) return;
    this.connected = false;
    this.admission.rejectWaiters(failWith(failures.cancelled()));
    try {
      await this.session.disconnect();
    } catch (error) {
      throw operationFailure(error);
    }
  }

  /** Runs `command` on the Host over an admitted exec channel, mapping failures. */
  runExec(command: string, timeoutMs?: number, input?: Uint8Array): Promise<ExecOutcome> {
    return this.admission.withChannel('ordinarySession', async () => {
      try {
        return await this.session.exec(command, {
          timeoutMs: timeoutMs ?? this.requestTimeoutMs,
          input,
        });
      } catch (error) {
        throw this.fail(error);
      }
    });
  }

  /** The thrown carrier of an operation failure; a dead connection stops being reused. */
  fail(error: unknown): TransportFailure {
    if (invalidatesConnection(error)) this.connected = false;
    return operationFailure(error);
  }

  async request<M extends WireMethod>(method: M, params?: ParamsOf<M>): Promise<MethodResult<M>> {
    return this.withColdStartWake(() => this.performRequest(method, params));
  }

  private nextRequestId(): string {
    this.requestCounter += 1;
    return `${this.requestPrefix}-${this.requestCounter}`;
  }

  private async performRequest<M extends WireMethod>(
    method: M,
    params: ParamsOf<M> | undefined,
  ): Promise<MethodResult<M>> {
    this.requireConnected();
    const id = this.nextRequestId();
    const line = requestLine(id, method, params);
    const response = await withDeadline(this.clock, this.requestTimeoutMs, async (signal) => {
      const path = await this.resolvedSocketPath(signal);
      return this.admission.withChannel(
        'ordinaryForwarding',
        async () => {
          try {
            return await abortable(
              signal,
              this.session.exchangeStreamLocal(path, utf8Encode(line), {
                maxResponseBytes: MAXIMUM_RESPONSE_BYTES,
                timeoutMs: this.requestTimeoutMs,
              }),
            );
          } catch (error) {
            if (error instanceof SshError && error.code === 'streamLocalOpenFailed') {
              throw failWith(await this.classifyStreamLocalOpenFailure(path));
            }
            throw this.fail(error);
          }
        },
        signal,
      );
    });
    return decodeResult(utf8Decode(response), id, METHOD_RESULT[method]);
  }

  private requireConnected(): void {
    if (!this.connected) throw failWith(failures.sshUnreachable('The SSH connection is closed.'));
  }

  /** A stopped herdr refuses its socket: wake it once, then repeat the operation once. */
  private async withColdStartWake<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof TransportFailure) || error.error.kind !== 'streamLocalOpenFailed') {
        throw error;
      }
      const { path } = error.error;
      try {
        await this.wakeServer(path);
      } catch (wakeError) {
        // The wake is a recovery attempt, not a diagnostic: a failed wake says nothing new
        // about the socket, so the original classification stands (timeouts and cancels pass).
        const kind = wakeError instanceof TransportFailure ? wakeError.error.kind : null;
        if (kind === 'cancelled' || kind === 'timedOut') throw wakeError;
        throw error;
      }
      return operation();
    }
  }

  private wakeServer(path: string): Promise<void> {
    return withDeadline(this.clock, this.requestTimeoutMs, (signal) =>
      this.wake.value(async () => {
        const result = await this.runExec(this.wakeExecCommand(path));
        if (result.exitCode !== 0) {
          throw failWith(
            failures.channelFailed(`herdr wake command failed: ${result.stderr.slice(0, 200)}`),
          );
        }
      }, signal),
    );
  }

  /**
   * The exec that wakes a stopped herdr server. A named session scopes the wake to its own
   * state directory; a paired endpoint runs its launcher with its socket.
   */
  wakeExecCommand(path: string): string {
    const socket = quotedAbsolutePath(path);
    if (!socket)
      throw failWith(failures.channelFailed('The remote socket path cannot be quoted safely.'));
    const { endpoint, socket: location } = this.settings;
    const wake = this.settings.wakeCommand ?? DEFAULT_WAKE_COMMAND;
    const executable = endpoint ? quotedAbsolutePath(endpoint.executablePath) : null;
    if (endpoint && executable) {
      return `LC_ALL=C /bin/sh -c 'export HERDR_SOCKET_PATH="$1"; exec "$2" remote-client-bridge < /dev/null' wake ${socket} ${executable}`;
    }
    if (location.kind === 'namedSession') {
      return `LC_ALL=C /bin/sh -c '${HERDR_PATH_EXPORT}; export HERDR_SOCKET_PATH="$1"; export HERDR_SESSION="$2"; ${wake} < /dev/null' wake ${socket} ${location.name}`;
    }
    return `LC_ALL=C /bin/sh -c '${HERDR_PATH_EXPORT}; export HERDR_SOCKET_PATH="$1"; ${wake} < /dev/null' wake ${socket}`;
  }

  /** `socketNotFound` when `test -S` says the path is no socket, else the ambiguous open failure. */
  async classifyStreamLocalOpenFailure(path: string) {
    const quoted = quotedAbsolutePath(path);
    if (!quoted) return { kind: 'socketNotFound', path } as const;
    try {
      const result = await this.runExec(`/bin/sh -c 'test -S "$1"' agentico ${quoted}`);
      return result.exitCode === 1
        ? ({ kind: 'socketNotFound', path } as const)
        : ({ kind: 'streamLocalOpenFailed', path } as const);
    } catch (error) {
      const kind = error instanceof TransportFailure ? error.error.kind : null;
      if (kind === 'cancelled' || kind === 'timedOut') throw error;
      return { kind: 'streamLocalOpenFailed', path } as const;
    }
  }

  /** The herdr socket's absolute path; HOME is probed once, and only a relative location needs it. */
  async resolvedSocketPath(signal?: CancelSignal): Promise<string> {
    const { socket } = this.settings;
    if (socket.kind === 'absolutePath' && socket.path.startsWith('/')) return socket.path;
    const home = await this.homeDirectory(signal);
    return herdrSocketPath(socket, home);
  }

  /** The Host account's home directory, probed once per connection (host services build on it). */
  homeDirectory(signal?: CancelSignal): Promise<string> {
    return this.home.value(() => this.probeHome(), signal);
  }

  /** The per-request budget host services run their execs and SFTP operations under. */
  get requestBudgetMs(): number {
    return this.requestTimeoutMs;
  }

  private async probeHome(): Promise<string> {
    const command = `LC_ALL=C ${this.settings.homeCommand ?? DEFAULT_HOME_COMMAND}`;
    const result = await this.runExec(command);
    const home = result.exitCode === 0 ? markerValue(result.stdout, HOME_MARKER) : null;
    if (home && isQuotableAbsolutePath(home)) return home;
    throw failWith({
      kind: 'homeDirectoryUnresolvable',
      detail: 'The home directory probe did not return an absolute path.',
    });
  }

  async subscribeToEvents(subscriptions: readonly EventSubscription[]): Promise<HerdrEventStream> {
    if (this.eventsOpen) throw failWith(failures.eventsChannelAlreadyOpen());
    this.requireConnected();
    this.eventsOpen = true;
    let released = false;
    let lease: { release(): void } | undefined;
    const release = () => {
      if (released) return;
      released = true;
      lease?.release();
      this.eventsOpen = false;
    };
    try {
      lease = await this.admission.acquire('events');
      const duplex = await this.withColdStartWake(() => this.openEventsDuplex());
      duplex.onClose(release);
      const stream = await openEventsChannel(duplex, {
        subscriptions,
        requestId: this.nextRequestId(),
        clock: this.clock,
        requestTimeoutMs: this.requestTimeoutMs,
      });
      return {
        events: stream.events,
        end: async () => {
          try {
            await stream.end();
          } finally {
            release();
          }
        },
      };
    } catch (error) {
      release();
      throw error instanceof TransportFailure ? error : this.fail(error);
    }
  }

  private openEventsDuplex() {
    return withDeadline(this.clock, this.requestTimeoutMs, async (signal) => {
      const path = await this.resolvedSocketPath(signal);
      try {
        return await this.session.openStreamLocal(path, { timeoutMs: this.requestTimeoutMs });
      } catch (error) {
        if (error instanceof SshError && error.code === 'streamLocalOpenFailed') {
          throw failWith(await this.classifyStreamLocalOpenFailure(path));
        }
        throw this.fail(error);
      }
    });
  }
}

export { mapOperationError };
