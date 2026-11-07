import {
  ApprovalLedger,
  type Clock,
  type DevicePushTokenSource,
  type KeyValueStorage,
  MemoryNotificationKeyStore,
  MirroredApprovalOptIns,
  MirroredNotificationKeyStore,
  type NotificationKeyStore,
  NotificationPreferencesStore,
  NotificationRegistrationCeremony,
  NotificationRelaySettings,
  type NotificationTransportProvider,
  type PushDeviceToken,
  type PushRegistrationState,
  type RandomBytes,
  unavailablePushTokenSource,
} from '@openagentspocket/core';
import type { AppGroupStore } from 'agentico-app-group';
import type { HostCatalogSource } from '@/live-activity/runtime';
import { KeychainNotificationKeyStore } from './keychainKeyStore';
import type { NotificationServices } from './services';

export interface LiveNotificationDeps {
  readonly hosts: HostCatalogSource;
  readonly transports: NotificationTransportProvider;
  readonly appGroup: AppGroupStore;
  readonly storage: KeyValueStorage;
  readonly clock: Clock;
  readonly randomBytes: RandomBytes;
  /** The APNs/FCM implementation; the unavailable stub until a token can be fetched. */
  readonly tokenSource?: DevicePushTokenSource;
}

export interface LiveNotificationParts {
  readonly services: Omit<NotificationServices, 'liveActivity' | 'approvals'> & {
    readonly approvals: NonNullable<NotificationServices['approvals']>;
  };
  readonly keys: MirroredNotificationKeyStore;
  readonly ceremony: NotificationRegistrationCeremony;
  readonly deviceToken: () => PushDeviceToken | null;
}

/**
 * Notification Keys in the shared Keychain (read by the iOS notification services), mirrored to
 * `notification-keys.json` in the App Group whenever they change. Without a Keychain (non-Apple
 * platforms) keys stay in memory for the session.
 */
export function createLiveNotificationParts(deps: LiveNotificationDeps): LiveNotificationParts {
  const { notificationKeychain } = deps.appGroup;
  const inner: NotificationKeyStore = notificationKeychain
    ? new KeychainNotificationKeyStore(notificationKeychain)
    : new MemoryNotificationKeyStore();
  const keys = new MirroredNotificationKeyStore(inner, (name, text) =>
    deps.appGroup.writeFile(name, text),
  );
  const ceremony = new NotificationRegistrationCeremony(keys, deps.randomBytes);
  const relay = new NotificationRelaySettings(deps.storage);
  const source = deps.tokenSource ?? unavailablePushTokenSource;
  let current: PushRegistrationState = { kind: 'unknown' };
  const deviceToken = () => (current.kind === 'registered' ? current.token : null);
  const approvalOptIns = new MirroredApprovalOptIns(deps.storage, (name, text) =>
    deps.appGroup.writeFile(name, text),
  );
  const store = new NotificationPreferencesStore({
    approvalOptIns,
    transports: deps.transports,
    ceremony,
    deviceToken,
    relayBaseURL: () => relay.customBaseURL,
    clock: deps.clock,
  });
  const follow = () => store.setHosts(deps.hosts.getSnapshot().hosts);
  follow();
  deps.hosts.subscribe(follow);
  const pushToken: DevicePushTokenSource = {
    state: async () => (current = await source.state()),
    enable: async () => (current = await source.enable()),
  };
  void keys.sync();
  void approvalOptIns.sync();
  return {
    services: {
      store,
      relay,
      pushToken,
      pluginVersionOf: () => null,
      approvals: { keys, optIns: approvalOptIns, ledger: new ApprovalLedger(deps.storage) },
    },
    keys,
    ceremony,
    deviceToken,
  };
}
