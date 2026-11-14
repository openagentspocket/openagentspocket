import type { Host } from '../hosts/host';
import type { KeyValueStorage } from '../hosts/known-hosts';
import { NotificationRegistrationError } from './errors';
import type {
  NotificationPreferencesStore,
  NotificationTransportProvider,
} from './preferences-store';
import type { DevicePushTokenSource, PushRegistrationState } from './push-token';

export const PRIMER_SETTING_KEY = 'notificationPrimer';

/**
 * Where the once-per-install notification primer stands. `pending`: not asked yet. `declined`:
 * Not Now, one reminder left. `reminding`: the reminder banner is up. `done`: never again.
 */
export type PrimerPhase = 'pending' | 'declined' | 'reminding' | 'done';

/** Whether a connected Host's plugin can deliver notices; `unknown` until it was asked. */
export type HostDelivery = 'yes' | 'no' | 'unknown';

/** Everything the primer decides on, gathered by the app each time one of them changes. */
export interface PrimerFacts {
  readonly phase: PrimerPhase;
  /** False when the app already had Hosts before the primer existed (an update, not a new install). */
  readonly freshInstall: boolean;
  readonly demo: boolean;
  /** A Host is connected and Home lists it. */
  readonly hostConnected: boolean;
  /** Home is the screen in front, the app is in the foreground and no sheet or alert is up. */
  readonly homeIdle: boolean;
  readonly permission: PushRegistrationState['kind'];
  /** The best answer among the connected Hosts. */
  readonly delivery: HostDelivery;
  /** An Agent needs the user right now. */
  readonly agentBlocked: boolean;
}

/**
 * What the app does next. `probe`: ask the connected Hosts whether they can deliver. `register`:
 * the permission is already there, so do what Settings would (fetch the token, register the Hosts)
 * and finish. `finish`: never ask (denied, or nothing left to do). `remind`: start the reminder.
 */
export type PrimerStep =
  | { readonly kind: 'wait' }
  | { readonly kind: 'probe' }
  | { readonly kind: 'showSheet' }
  | { readonly kind: 'register' }
  | { readonly kind: 'finish' }
  | { readonly kind: 'remind' }
  | { readonly kind: 'showBanner' };

const step = <K extends PrimerStep['kind']>(kind: K) => ({ kind }) as const;

/** A permission state the OS has answered (not still being read). */
function settled(permission: PrimerFacts['permission']): boolean {
  return permission !== 'unknown' && permission !== 'waitingForToken';
}

/** The pure decision: one step from the facts, with no side effect. */
export function primerStep(facts: PrimerFacts): PrimerStep {
  const { phase, permission } = facts;
  if (facts.demo || phase === 'done') return step('wait');
  if (!settled(permission)) return step('wait');
  if (phase === 'reminding')
    return permission === 'needsPermission' ? step('showBanner') : step('finish');
  if (phase === 'declined') {
    if (permission !== 'needsPermission') return step('finish');
    return facts.agentBlocked && facts.homeIdle ? step('remind') : step('wait');
  }
  if (!facts.hostConnected || !facts.homeIdle) return step('wait');
  if (permission === 'denied' || permission === 'failed') return step('finish');
  if (permission === 'registered') return facts.freshInstall ? step('register') : step('finish');
  if (facts.delivery === 'yes') return step('showSheet');
  // A Host that cannot deliver: no point asking yet. The next one that can brings the sheet.
  return facts.delivery === 'unknown' ? step('probe') : step('wait');
}

/**
 * The connected Hosts' answers as one (`undefined`: that Host was not asked yet). One Host that
 * can deliver is enough; one not asked yet asks; otherwise `no`, and a Host whose answer was
 * unknown (or is still on its way) waits for its next connection.
 */
export function combinedDelivery(answers: readonly (HostDelivery | undefined)[]): HostDelivery {
  if (answers.includes('yes')) return 'yes';
  return answers.includes(undefined) ? 'unknown' : 'no';
}

/**
 * Asks one Host whether its plugin can deliver notices, without a push token: reading the
 * registration file resolves the plugin's config dir, which fails when the plugin is missing or off.
 */
export async function hostDelivery(
  transports: NotificationTransportProvider,
  host: Host,
): Promise<HostDelivery> {
  try {
    await transports.withTransport(host, (transport) => transport.readRegistration());
    return 'yes';
  } catch (thrown) {
    const missing =
      thrown instanceof NotificationRegistrationError &&
      thrown.failure.kind === 'pluginNotInstalled';
    return missing ? 'no' : 'unknown';
  }
}

/**
 * Turns notifications on for every Host whose file confirms this device is not registered, the
 * same write as the Settings toggle. One at a time: Hosts of one remote user share a file.
 */
export async function registerUnregisteredHosts(
  store: NotificationPreferencesStore,
): Promise<void> {
  await store.refresh();
  for (const host of store.hosts) {
    const state = store.states.get(host.id);
    if (state?.kind === 'idle' && !state.settings.isRegistered) {
      await store.setNotificationsEnabled(true, host);
    }
  }
}

/**
 * The primer's Turn On: the permission request Settings makes (the system prompt when it was never
 * asked), then this device registered with every Host that is not yet, so notices start arriving.
 */
export async function turnOnNotifications(
  pushToken: DevicePushTokenSource,
  store: NotificationPreferencesStore,
): Promise<PushRegistrationState> {
  const state = await pushToken.enable();
  if (state.kind === 'registered') await registerUnregisteredHosts(store);
  return state;
}

interface PrimerRecord {
  readonly phase: PrimerPhase;
  readonly fresh: boolean;
}

const PHASES: readonly PrimerPhase[] = ['pending', 'declined', 'reminding', 'done'];

function parseRecord(text: string | undefined): PrimerRecord | null {
  if (text === undefined) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null) return null;
    const { phase, fresh } = value as Record<string, unknown>;
    if (!PHASES.includes(phase as PrimerPhase) || typeof fresh !== 'boolean') return null;
    return { phase: phase as PrimerPhase, fresh };
  } catch {
    return null;
  }
}

/**
 * The primer's remembered phase, in the app's key-value store. The first read decides whether
 * this is a new install: an app that already had Hosts is an update, and its Hosts are never
 * registered without the owner asking.
 */
export class NotificationPrimerRecord {
  private record: PrimerRecord;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly storage: KeyValueStorage,
    hadHosts: () => boolean,
  ) {
    const stored = parseRecord(storage.getString(PRIMER_SETTING_KEY));
    this.record = stored ?? { phase: 'pending', fresh: !hadHosts() };
    if (!stored) this.write();
  }

  get phase(): PrimerPhase {
    return this.record.phase;
  }

  get freshInstall(): boolean {
    return this.record.fresh;
  }

  /** Moves to `phase`; `done` is final. */
  set(phase: PrimerPhase): void {
    if (this.record.phase === phase || this.record.phase === 'done') return;
    this.record = { ...this.record, phase };
    this.write();
    for (const listener of [...this.listeners]) listener();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private write(): void {
    this.storage.set(PRIMER_SETTING_KEY, JSON.stringify(this.record));
  }
}
