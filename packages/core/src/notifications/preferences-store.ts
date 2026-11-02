import { asTransportError, type Text, TransportFailure } from '../errors';
import { message } from '../errors/text';
import type { Clock } from '../hosts/cancellation';
import type { Host } from '../hosts/host';
import type { NotificationRegistrationCeremony } from './ceremony';
import { NotificationRegistrationError } from './errors';
import type { PushDeviceToken } from './push-token';
import {
  type NotificationRegistrationFile,
  type NotificationTriggerPreferences,
  triggerPreferences,
} from './registration-file';
import type { NotificationTransport } from './transport';

/** One Host's confirmed registration state, as its file last reported it. */
export interface HostNotificationSettings {
  readonly isRegistered: boolean;
  /** Meaningful only while registered. */
  readonly notify: NotificationTriggerPreferences;
}

export type HostNotificationState =
  | { readonly kind: 'loading' }
  /** The Host's truth is unknown: unreachable, plugin missing, or no push token yet. */
  | { readonly kind: 'unavailable'; readonly message: Text }
  | { readonly kind: 'idle'; readonly settings: HostNotificationSettings }
  /** A write is in flight; `settings` stays the last confirmed truth until the Host acknowledges. */
  | { readonly kind: 'updating'; readonly settings: HostNotificationSettings }
  /** A write failed; `settings` is still the Host's truth (the replace is atomic). */
  | {
      readonly kind: 'failed';
      readonly message: Text;
      readonly settings: HostNotificationSettings;
    };

/** Borrows a Host's connection for one registration operation; unreachable Hosts throw. */
export interface NotificationTransportProvider {
  withTransport<T>(
    host: Host,
    operation: (transport: NotificationTransport) => Promise<T>,
  ): Promise<T>;
}

/**
 * The local copy of each Host's approval opt-in, so an approval action can check it without SSH.
 * Follows every state the Host confirmed, and goes off as soon as the user turns it off.
 */
export interface ApprovalOptIns {
  setEnabled(enabled: boolean, hostId: string): void;
  hostIds(): string[];
}

export interface PreferencesStoreOptions {
  readonly transports: NotificationTransportProvider;
  readonly ceremony: NotificationRegistrationCeremony;
  readonly deviceToken: () => PushDeviceToken | null;
  /** Read at write time, so a Settings change lands on the next Host the user registers. */
  readonly relayBaseURL?: () => string | null;
  readonly approvalOptIns?: ApprovalOptIns;
  /** Times the revoke deadline. */
  readonly clock: Clock;
}

const NO_TOKEN: Text = message('Waiting for push registration on this device.');
const UNREGISTERED: HostNotificationSettings = {
  isRegistered: false,
  notify: triggerPreferences(),
};

/** What a toggle failure says, from the closed registration and transport taxonomies. */
export function registrationErrorText(thrown: unknown): Text {
  if (thrown instanceof NotificationRegistrationError) {
    switch (thrown.failure.kind) {
      case 'pluginNotInstalled':
        return message(
          "The Agentico plugin is missing or turned off on this Host. See this Host's page in Hosts, then check again.",
        );
      case 'pluginProbeFailed':
        return message(
          'Could not check the Agentico plugin on this Host. Check the connection and try again.',
        );
      case 'readFailed':
        return message(
          'Could not read notification settings from this Host. Check the connection and try again.',
        );
      case 'writeFailed':
        return message(
          'Could not update notification settings on this Host. Check the connection and try again.',
        );
      case 'unsupportedFileVersion':
        return message('This Host was registered by a newer app version. Update the app.');
      case 'deviceNotRegistered':
        return message('Register this device for notifications on this Host first.');
    }
  }
  if (thrown instanceof TransportFailure) {
    switch (asTransportError(thrown).kind) {
      case 'sshUnreachable':
        return message('The Host is not connected.');
      case 'timedOut':
        return message('The Host did not answer in time.');
      default:
        return message('The connection to the Host failed.');
    }
  }
  return message('Could not update notification settings. Try again.');
}

/**
 * Per-Host Agent Notification preferences: the on/off registration toggle, the Done flag and the
 * approvals flag, persisted in the Host's registration file and filtered at the source by the
 * plugin. The displayed value is always the last state the Host confirmed: a toggle never flips
 * optimistically, a failed write surfaces its error and snaps back, and `refresh` re-reads the
 * file so the screen shows the Host's truth, not a local mirror. Framework-free; UIs subscribe.
 */
export class NotificationPreferencesStore {
  private hostList: readonly Host[] = [];
  private stateMap: ReadonlyMap<string, HostNotificationState> = new Map();
  private readonly listeners = new Set<() => void>();
  /** Fires after a registration write the Host confirmed. */
  onRegistered: ((hostId: string) => void) | null = null;

  constructor(private readonly options: PreferencesStoreOptions) {}

  get hosts(): readonly Host[] {
    return this.hostList;
  }

  /** A new map object on every change, for `useSyncExternalStore`. */
  get states(): ReadonlyMap<string, HostNotificationState> {
    return this.stateMap;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Aligns with the Host catalog; a removed Host drops its state and its approval opt-in. */
  setHosts(hosts: readonly Host[]): void {
    this.hostList = hosts;
    const known = new Set(hosts.map((host) => host.id));
    this.stateMap = new Map([...this.stateMap].filter(([id]) => known.has(id)));
    for (const id of this.options.approvalOptIns?.hostIds() ?? []) {
      if (!known.has(id)) this.options.approvalOptIns?.setEnabled(false, id);
    }
    this.emit();
  }

  /** Re-reads every Host's registration file so the toggles reflect what each Host holds. */
  async refresh(): Promise<void> {
    await Promise.all(this.hostList.map((host) => this.load(host)));
  }

  /**
   * The per-Host on/off. Enabling registers this device with both triggers on; disabling removes
   * its entry and drops the local key, and stops this device approving at once.
   */
  async setNotificationsEnabled(enabled: boolean, host: Host): Promise<void> {
    const settings = this.confirmedSettings(host.id);
    if (!settings || settings.isRegistered === enabled) return;
    if (!enabled) this.options.approvalOptIns?.setEnabled(false, host.id);
    const relay = this.relay();
    await this.write(host, settings, enabled, async (token, transport) => {
      if (enabled) {
        const notify = triggerPreferences();
        await this.options.ceremony.register({
          host,
          deviceToken: token,
          notify,
          relayBaseURL: relay,
          transport,
        });
        return { isRegistered: true, notify };
      }
      await this.options.ceremony.remove(host, token, transport);
      return UNREGISTERED;
    });
  }

  /** The separate Done flag: re-registration rewrites this Host's entry reusing its key. */
  setDoneEnabled(enabled: boolean, host: Host): Promise<void> {
    return this.setFlag(host, 'done', enabled);
  }

  /**
   * Approve and Deny from Blocked notifications. Turning it off clears the local opt-in first, so
   * this device stops approving even when the Host never confirms; turning it on waits.
   */
  setApprovalsEnabled(enabled: boolean, host: Host): Promise<void> {
    return this.setFlag(host, 'approve', enabled);
  }

  /** The Host's confirmed notify flags; null while unregistered or its truth is unknown. */
  confirmedTriggers(hostId: string): NotificationTriggerPreferences | null {
    const settings = this.confirmedSettings(hostId);
    return settings?.isRegistered ? settings.notify : null;
  }

  /** Whether this device holds a Notification Key for the Host, i.e. removing it deletes one. */
  hasNotificationKey(hostId: string): boolean {
    try {
      return this.options.ceremony.keys.record(hostId) !== null;
    } catch {
      return true;
    }
  }

  /**
   * Best effort, before a Host is removed: drops this device's entries from the Host's file so
   * its plugin stops pushing here, keeping the key. Only a connected Host with a stored key is
   * asked, and a revoke that does not finish within `timeoutMs` is abandoned. Failures are
   * swallowed; the removal goes ahead either way.
   */
  async revokeRegistration(host: Host, isConnected: boolean, timeoutMs = 6000): Promise<void> {
    if (!isConnected || !this.hasStoredKey(host.id)) return;
    const revoke = this.options.transports.withTransport(host, (transport) =>
      this.options.ceremony.revoke(host, transport),
    );
    const { clock } = this.options;
    let timer: unknown;
    const deadline = new Promise<'timeout'>((resolve) => {
      timer = clock.setTimeout(() => resolve('timeout'), timeoutMs);
    });
    try {
      if ((await Promise.race([revoke.then(() => 'done' as const), deadline])) === 'timeout')
        return;
    } catch {
      return;
    } finally {
      clock.clearTimeout(timer);
    }
    this.markUnregistered(host.id);
  }

  /** Deletes the Host's key record as part of its removal; the Host then reads unregistered. */
  forgetNotificationKey(hostId: string): void {
    this.options.ceremony.keys.removeRecord(hostId);
    this.markUnregistered(hostId);
  }

  private hasStoredKey(hostId: string): boolean {
    try {
      return this.options.ceremony.keys.record(hostId) !== null;
    } catch {
      return false;
    }
  }

  private relay(): string | null {
    return this.options.relayBaseURL?.() ?? null;
  }

  private async setFlag(host: Host, flag: 'done' | 'approve', enabled: boolean): Promise<void> {
    const settings = this.confirmedSettings(host.id);
    if (!settings?.isRegistered || settings.notify[flag] === enabled) return;
    if (flag === 'approve' && !enabled) this.options.approvalOptIns?.setEnabled(false, host.id);
    const notify = { ...settings.notify, [flag]: enabled };
    const relay = this.relay();
    await this.write(host, settings, true, async (token, transport) => {
      await this.options.ceremony.register({
        host,
        deviceToken: token,
        notify,
        relayBaseURL: relay,
        transport,
      });
      return { isRegistered: true, notify };
    });
  }

  private markUnregistered(hostId: string): void {
    this.options.approvalOptIns?.setEnabled(false, hostId);
    if (this.confirmedSettings(hostId))
      this.setState(hostId, { kind: 'idle', settings: UNREGISTERED });
  }

  private confirm(settings: HostNotificationSettings, hostId: string): void {
    this.setState(hostId, { kind: 'idle', settings });
    this.options.approvalOptIns?.setEnabled(
      settings.isRegistered && settings.notify.approve,
      hostId,
    );
  }

  private async load(host: Host): Promise<void> {
    if (this.stateMap.get(host.id)?.kind === 'updating') return;
    const token = this.options.deviceToken();
    if (!token) {
      this.setState(host.id, { kind: 'unavailable', message: NO_TOKEN });
      return;
    }
    this.setState(host.id, { kind: 'loading' });
    try {
      let file = await this.options.transports.withTransport(host, (transport) =>
        this.options.ceremony.read(transport),
      );
      // Only an entry carrying this Host's key is its own: Hosts of one remote user share a file.
      const owner = this.options.ceremony.registrationOwner(host, token);
      if (owner && !file.normalized(owner).equals(file))
        file = await this.migrate(host, token, file);
      const preferences = owner ? file.preferences(owner) : null;
      this.confirm(
        preferences ? { isRegistered: true, notify: preferences } : UNREGISTERED,
        host.id,
      );
    } catch (thrown) {
      this.setState(host.id, { kind: 'unavailable', message: registrationErrorText(thrown) });
    }
  }

  /** Best effort: a failed write leaves the state derived from the plain read; the next refresh retries. */
  private async migrate(
    host: Host,
    token: PushDeviceToken,
    fallback: NotificationRegistrationFile,
  ): Promise<NotificationRegistrationFile> {
    try {
      return await this.options.transports.withTransport(host, (transport) =>
        this.options.ceremony.migrate(host, token, transport),
      );
    } catch {
      return fallback;
    }
  }

  /** Holds the confirmed settings while the ceremony runs, then publishes the new truth or snaps back. */
  private async write(
    host: Host,
    settings: HostNotificationSettings,
    registers: boolean,
    operation: (
      token: PushDeviceToken,
      transport: NotificationTransport,
    ) => Promise<HostNotificationSettings>,
  ): Promise<void> {
    const token = this.options.deviceToken();
    if (!token) {
      this.setState(host.id, { kind: 'unavailable', message: NO_TOKEN });
      return;
    }
    this.setState(host.id, { kind: 'updating', settings });
    try {
      const confirmed = await this.options.transports.withTransport(host, (transport) =>
        operation(token, transport),
      );
      this.confirm(confirmed, host.id);
      if (registers) {
        this.onRegistered?.(host.id);
        await this.reloadRegisteredHosts(host.id);
      }
    } catch (thrown) {
      this.setState(host.id, { kind: 'failed', message: registrationErrorText(thrown), settings });
    }
  }

  /** A registration takes over its session's entry, so a sibling Host may have just lost its own. */
  private async reloadRegisteredHosts(exceptHostId: string): Promise<void> {
    const affected = this.hostList.filter(
      (host) => host.id !== exceptHostId && this.confirmedSettings(host.id)?.isRegistered === true,
    );
    await Promise.all(affected.map((host) => this.load(host)));
  }

  private confirmedSettings(hostId: string): HostNotificationSettings | null {
    const state = this.stateMap.get(hostId);
    return state?.kind === 'idle' || state?.kind === 'failed' ? state.settings : null;
  }

  private setState(hostId: string, state: HostNotificationState): void {
    this.stateMap = new Map(this.stateMap).set(hostId, state);
    this.emit();
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
