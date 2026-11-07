import {
  type Clock,
  consoleSubscriptions,
  EventsSession,
  type EventsSessionStatus,
  failWith,
  type Host,
  type HostKeyPolicy,
  hostUsesKey,
  type KeyAccessGate,
  KeyPromptInterrupted,
  type KnownHostsStore,
  type ReconnectPolicy,
} from '@openagentspocket/core';
import {
  connectTransport,
  type HostPlatform,
  hostPlatform,
  type SshTransport,
} from '@openagentspocket/transport';
import type { SshModule, SshSession } from 'agentico-ssh';
import type { ConsoleStore } from '@/console/store';
import type { HostConnection } from '@/features/hosts/HostsModel';
import { hostTitle } from '@/features/hosts/hostRows';
import { type HostSecrets, transportSettingsFor } from './transportSettings';

/** The saved Hosts as the manager reads them; `HostsModel` satisfies it. */
export interface HostSource {
  getSnapshot(): { readonly hosts: readonly Host[] };
  subscribe(listener: () => void): () => void;
}

export interface ConnectionManagerOptions {
  readonly hosts: HostSource;
  readonly store: ConsoleStore<SshTransport>;
  readonly ssh: SshModule;
  /** Alias of the device key; created on first use through `ensureDeviceKey`. */
  readonly keyAlias: string;
  readonly ensureDeviceKey: () => Promise<unknown>;
  /** Asks the owner before a key is used, when Settings requires it. */
  readonly keyAccess?: KeyAccessGate;
  /** Saved passwords and RSA keys, for Hosts that do not use the device key. */
  readonly secrets?: HostSecrets;
  readonly knownHosts: KnownHostsStore;
  /** The Trust this Host? alert. */
  readonly confirmFirstConnect: HostKeyPolicy['confirmFirstConnect'];
  readonly clock: Clock;
  /** Backoff between reconnects of a failing Host (the session applies it). */
  readonly reconnect?: ReconnectPolicy;
  /** Mirrors each Host's state onto the Hosts screens. */
  readonly onConnection?: (hostId: string, state: HostConnection) => void;
  /** Starts active; the app root flips it with AppState. */
  readonly initiallyActive?: boolean;
  readonly connect?: typeof connectTransport;
}

/**
 * How long connections outlive the app leaving the foreground, so Face ID, the app switcher or a
 * quick look elsewhere does not cost a reconnect. iOS may freeze the timer: the return then
 * revalidates the connection instead of trusting it.
 */
export const BACKGROUND_GRACE_MS = 15_000;

/**
 * How long away a connection is still believed on return. iOS freezes the app within seconds, its
 * timers with it, and the socket may be gone without a word: a message sent on it would wait out
 * the whole request timeout. Past this the return dials anew. Face ID and the like take less.
 */
export const TRUSTED_AWAY_MS = 5_000;

/** The Hosts-list state of a session status. */
export function connectionFor(status: EventsSessionStatus | undefined): HostConnection {
  switch (status?.kind) {
    case 'connected':
      return 'connected';
    case 'connecting':
    case 'reconnecting':
      return 'connecting';
    case 'failed':
      return 'cantConnect';
    default:
      return 'notConnected';
  }
}

interface Entry {
  readonly host: Host;
  readonly signature: string;
  readonly session: EventsSession<SshTransport>;
}

/**
 * Owns one `SshTransport` (through one `EventsSession`) per saved Host and feeds each to the
 * Console store. The session reconnects with backoff while active; the manager follows the
 * catalog (add, edit, remove) and the app's foreground state.
 */
export class ConnectionManager {
  private readonly entries = new Map<string, Entry>();
  private active: boolean;
  private transitions: Promise<void> = Promise.resolve();
  private graceTimer: unknown;
  private leftAt = 0;
  private stopped = false;
  private unsubscribe: (() => void) | undefined;
  private unsubscribeStore: (() => void) | undefined;
  private readonly lastState = new Map<string, HostConnection>();
  private readonly platforms = new Map<string, HostPlatform>();
  /** Dials holding for the end of the grace before they ask for the key. */
  private waitingForReturn: (() => void)[] = [];
  /** Hosts whose owner refused the key: failed until Retry, whatever the app does meanwhile. */
  private readonly keyRefused = new Set<string>();

  constructor(private readonly options: ConnectionManagerOptions) {
    this.active = options.initiallyActive ?? true;
  }

  /** Connects every saved Host and keeps following the catalog. */
  start(): void {
    if (this.unsubscribe || this.stopped) return;
    this.unsubscribe = this.options.hosts.subscribe(() => this.sync());
    this.unsubscribeStore = this.options.store.subscribe(() => this.reportConnections());
    this.sync();
  }

  stop(): void {
    this.stopped = true;
    this.cancelGrace();
    this.unsubscribe?.();
    this.unsubscribeStore?.();
    for (const id of [...this.entries.keys()]) this.drop(id);
  }

  get isActive(): boolean {
    return this.active;
  }

  hostIds(): string[] {
    return [...this.entries.keys()];
  }

  /**
   * Foreground resumes (or re-proves) every Host; leaving it suspends them once the grace has
   * passed, or at once with `immediately`.
   */
  async setActive(active: boolean, options?: { readonly immediately?: boolean }): Promise<void> {
    if (this.stopped) return;
    if (this.active === active) {
      if (!active && options?.immediately && this.cancelGrace()) await this.transition(false);
      return;
    }
    if (active && this.graceTimer !== undefined && this.awayTooLong()) {
      // Still away for what it winds down: a dial held for the return must not go ahead.
      this.cancelGrace();
      await this.transition(false);
    }
    this.active = active;
    this.cancelGrace();
    if (active || options?.immediately) {
      await this.transition(active);
      return;
    }
    this.leftAt = this.options.clock.monotonicMs();
    this.graceTimer = this.options.clock.setTimeout(() => {
      this.cancelGrace();
      void this.transition(false);
    }, BACKGROUND_GRACE_MS);
  }

  private awayTooLong(): boolean {
    return this.options.clock.monotonicMs() - this.leftAt >= TRUSTED_AWAY_MS;
  }

  private cancelGrace(): boolean {
    if (this.graceTimer === undefined) return false;
    this.options.clock.clearTimeout(this.graceTimer);
    this.graceTimer = undefined;
    const waiting = this.waitingForReturn;
    this.waitingForReturn = [];
    for (const wake of waiting) wake();
    return true;
  }

  private async transition(active: boolean): Promise<void> {
    // Serialized: a foreground return must see the state the background suspend left, not the
    // one before it. Reading the status while the suspend was still winding down made the resume
    // a plain revalidate, and the Host then settled on `suspended` for good.
    const run = this.transitions.then(() =>
      Promise.all([...this.entries.values()].map((entry) => this.applyActive(entry, active))),
    );
    this.transitions = run.then(
      () => undefined,
      () => undefined,
    );
    await run;
  }

  /**
   * The phone moved to another network. Live Hosts drop a connection that may be dead, and a failed
   * one tries again; a Host the owner refused stays. Away from the app, the return decides.
   */
  async networkDidChange(): Promise<void> {
    if (this.stopped || !this.active) return;
    const { store } = this.options;
    await Promise.all(
      [...this.entries.values()].map(async ({ host, session }) => {
        if (this.keyRefused.has(host.id)) return;
        const status = store.getState().hosts.find((row) => row.id === host.id)?.status;
        if (status?.kind === 'failed') await store.revalidate(host.id);
        else await session.replaceLink();
      }),
    );
  }

  /**
   * Runs `operation` on the Host's live transport (waiting for a replacement while it
   * reconnects). Rejects when the Host is not in the catalog.
   */
  withTransport<V>(hostId: string, operation: (transport: SshTransport) => Promise<V>): Promise<V> {
    const entry = this.entries.get(hostId);
    if (!entry) return Promise.reject(new Error('The Host is not listed.'));
    return entry.session.withTransport(operation);
  }

  /**
   * The operating system family the Host last answered as; undefined before the first
   * connection. Entry points that need a POSIX shell hide for `nativeWindows`.
   */
  platformOf(hostId: string): HostPlatform | undefined {
    return this.platforms.get(hostId);
  }

  /**
   * A second SSH session to the Host for a surface that must not share the Console's (the
   * Ports preview). It trusts only keys already pinned: it never prompts.
   */
  async connectDedicated(hostId: string): Promise<SshSession> {
    const entry = this.entries.get(hostId);
    if (!entry) throw new Error('The Host is not listed.');
    const transport = await this.dial(entry.host, { dedicated: true });
    return transport.session;
  }

  /** A user-requested retry, for example after trusting a changed key. */
  async reconnect(hostId: string): Promise<void> {
    const entry = this.entries.get(hostId);
    if (!entry || this.stopped) return;
    if (!this.active) return;
    this.keyRefused.delete(hostId);
    await this.options.store.retry(hostId);
  }

  private async applyActive(entry: Entry, active: boolean): Promise<void> {
    const { store } = this.options;
    if (!active) {
      // Nothing of a refused Host is live, and suspended would read as resuming: it stays failed.
      if (!this.keyRefused.has(entry.host.id)) await entry.session.suspend();
      return;
    }
    const status = store.getState().hosts.find((host) => host.id === entry.host.id)?.status;
    if (!status || status.kind === 'suspended') await entry.session.resume();
    else if (status.kind !== 'failed' || !this.keyRefused.has(entry.host.id)) {
      await store.revalidate(entry.host.id);
    }
  }

  private signatureOf(host: Host): string {
    return JSON.stringify(host);
  }

  private sync(): void {
    if (this.stopped) return;
    const hosts = this.options.hosts.getSnapshot().hosts;
    const wanted = new Map(hosts.map((host) => [host.id, host]));
    for (const [id, entry] of [...this.entries]) {
      const host = wanted.get(id);
      if (!host || this.signatureOf(host) !== entry.signature) this.drop(id);
    }
    for (const host of hosts) if (!this.entries.has(host.id)) this.add(host);
  }

  private add(host: Host): void {
    const session = new EventsSession<SshTransport>({
      subscriptions: consoleSubscriptions([]),
      connect: () => this.dial(host),
      clock: this.options.clock,
      reconnect: this.options.reconnect,
    });
    this.entries.set(host.id, { host, signature: this.signatureOf(host), session });
    this.options.store.addHost(
      { id: host.id, name: hostTitle(host), username: host.username },
      session,
      this.active,
    );
  }

  private drop(id: string): void {
    this.entries.delete(id);
    this.lastState.delete(id);
    this.platforms.delete(id);
    this.keyRefused.delete(id);
    // Ends the projection, which ends its session.
    this.options.store.removeHost(id);
    this.options.onConnection?.(id, 'notConnected');
  }

  /** `dedicated`: a side connection, not the Host's session (see `connectDedicated`). */
  private async dial(host: Host, { dedicated = false } = {}): Promise<SshTransport> {
    const { options } = this;
    if (hostUsesKey(host)) await this.authorizeKey(host, dedicated);
    await options.ensureDeviceKey();
    const settings = transportSettingsFor(host, {
      keyAlias: options.keyAlias,
      clock: options.clock,
      secrets: options.secrets,
      policy: {
        knownHosts: options.knownHosts,
        confirmFirstConnect: dedicated ? async () => false : options.confirmFirstConnect,
      },
    });
    const transport = await (options.connect ?? connectTransport)(options.ssh, settings);
    this.platforms.set(host.id, hostPlatform(transport));
    return transport;
  }

  /**
   * Asks for the key only with a window to ask in: iOS refuses a prompt without one, and nobody
   * saw it. A redial during the grace holds here, still `reconnecting`, until the app returns.
   * A refusal stands until `reconnect`; one on a side connection says nothing of the session.
   */
  private async authorizeKey(host: Host, dedicated: boolean): Promise<void> {
    const gate = this.options.keyAccess;
    if (!gate) return;
    if (this.keyRefused.has(host.id)) throw failWith({ kind: 'keyAccessNotConfirmed' });
    for (;;) {
      while (!this.active && gate.wouldAsk()) {
        // Past the grace the Host is suspended, and its resume dials again.
        if (this.graceTimer === undefined) throw failWith({ kind: 'cancelled' });
        await new Promise<void>((wake) => this.waitingForReturn.push(wake));
      }
      if (this.entries.get(host.id)?.host !== host) throw failWith({ kind: 'cancelled' });
      try {
        await gate.authorize();
        return;
      } catch (error) {
        // Leaving cuts a prompt short, and that is not the owner's answer.
        if (!this.active) continue;
        const current = this.entries.get(host.id)?.host === host;
        if (current && !dedicated && !(error instanceof KeyPromptInterrupted)) {
          this.keyRefused.add(host.id);
        }
        throw error;
      }
    }
  }

  private reportConnections(): void {
    const report = this.options.onConnection;
    if (!report) return;
    for (const summary of this.options.store.getState().hosts) {
      if (!this.entries.has(summary.id)) continue;
      const state = connectionFor(summary.status);
      if (this.lastState.get(summary.id) === state) continue;
      this.lastState.set(summary.id, state);
      report(summary.id, state);
    }
  }
}
