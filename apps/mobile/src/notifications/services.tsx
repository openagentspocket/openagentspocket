import {
  apnsToken,
  type Clock,
  type DevicePushTokenSource,
  FakeNotificationTransport,
  type Host,
  MemoryNotificationKeyStore,
  MemoryStorage,
  makeHost,
  NotificationPreferencesStore,
  NotificationRegistrationCeremony,
  NotificationRelaySettings,
  type PluginVersion,
  type PushRegistrationState,
  pluginVersion,
} from '@openagentspocket/core';
import { createContext, type ReactNode, useContext, useMemo } from 'react';

/** What the notification screens need; the app wires real implementations around P5.3/P5.4. */
export interface NotificationServices {
  readonly store: NotificationPreferencesStore;
  readonly relay: NotificationRelaySettings;
  readonly pushToken: DevicePushTokenSource;
  /** The Agentico plugin version a Host reported, null while unknown. */
  readonly pluginVersionOf: (hostId: string) => PluginVersion | null;
  /** The per-Host Live Activity opt-in; absent where Live Activities do not run (demo, tests). */
  readonly liveActivity?: LiveActivityToggles;
}

/** What the Settings toggle needs from the Live Activity runtime. */
export interface LiveActivityToggles {
  /** False when the OS has Live Activities turned off for the app. */
  readonly activitiesEnabled: boolean;
  isEnabled(hostId: string): boolean;
  setEnabled(enabled: boolean, hostId: string): void;
}

const systemClock: Clock = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  monotonicMs: () => Date.now(),
};

/** A token source that is granted on `enable()`; stands in until P5.3/P5.4 land. */
class DemoPushTokenSource implements DevicePushTokenSource {
  private current: PushRegistrationState = { kind: 'needsPermission' };

  async state() {
    return this.current;
  }

  async enable() {
    this.current = { kind: 'registered', token: apnsToken('demo-token', 'sandbox') };
    return this.current;
  }
}

/** Offline services over one fake Host: the screens run without SSH or a push token. */
export function createDemoNotificationServices(
  hosts: readonly Host[] = [makeHost('demo', { name: 'Demo Host' })],
  tokenSource: DevicePushTokenSource = new DemoPushTokenSource(),
): NotificationServices {
  const transports = new Map(hosts.map((host) => [host.id, new FakeNotificationTransport()]));
  const keys = new MemoryNotificationKeyStore();
  const relay = new NotificationRelaySettings(new MemoryStorage());
  let current: PushRegistrationState = { kind: 'unknown' };
  const store = new NotificationPreferencesStore({
    transports: {
      withTransport: (host, operation) =>
        operation(transports.get(host.id) ?? new FakeNotificationTransport()),
    },
    // Demo-only randomness: the real key generator needs a secure source (P5.3/P5.4).
    ceremony: new NotificationRegistrationCeremony(keys, (length) =>
      Uint8Array.from({ length }, () => Math.floor(Math.random() * 256)),
    ),
    deviceToken: () => (current.kind === 'registered' ? current.token : null),
    relayBaseURL: () => relay.customBaseURL,
    clock: systemClock,
  });
  store.setHosts(hosts);
  const source: DevicePushTokenSource = {
    state: async () => (current = await tokenSource.state()),
    enable: async () => (current = await tokenSource.enable()),
  };
  return { store, relay, pushToken: source, pluginVersionOf: () => pluginVersion(0, 12, 0) };
}

const NotificationServicesContext = createContext<NotificationServices | null>(null);

export function NotificationServicesProvider({
  services,
  children,
}: {
  services: NotificationServices;
  children: ReactNode;
}) {
  return (
    <NotificationServicesContext.Provider value={services}>
      {children}
    </NotificationServicesContext.Provider>
  );
}

let demoServices: NotificationServices | null = null;

/** The provided services, else a shared demo instance. */
export function useNotificationServices(): NotificationServices {
  const provided = useContext(NotificationServicesContext);
  return useMemo(() => {
    if (provided) return provided;
    demoServices ??= createDemoNotificationServices();
    return demoServices;
  }, [provided]);
}
