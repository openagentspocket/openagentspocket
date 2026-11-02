import {
  AgentStatusClocks,
  type ChatTranscriptCache,
  type Clock,
  type DeviceKeyStore,
  type HostCatalog,
  type HostKeyCandidate,
  type KeyValueStorage,
  type KnownHostsStore,
  ListPreferences,
  type LiveActivityController,
  type NotificationTransportProvider,
  type PairingDeviceKeyLoad,
  PairingScanStore,
  PinnedAgents,
  type RandomBytes,
  VolatileChatTranscriptCache,
} from '@openagentspocket/core';
import type { SshTransport } from '@openagentspocket/transport';
import { pluginConfigFiles } from '@openagentspocket/transport';
import { type AppGroupStore, unavailableAppGroup } from 'agentico-app-group';
import { unavailableLiveActivities } from 'agentico-live-activity';
import type { SshModule } from 'agentico-ssh';
import { ConsoleStore } from '@/console/store';
import { ConversationRegistry } from '@/conversations/ConversationRegistry';
import { TransportChatFiles } from '@/conversations/chatFiles';
import { HostsModel } from '@/features/hosts/HostsModel';
import type { HostsRuntime } from '@/features/hosts/hostsRuntime';
import { ModelPairingCatalog } from '@/features/hosts/pairingAdapters';
import { LiveActivityRuntime } from '@/live-activity/runtime';
import { createLiveNotificationParts } from '@/notifications/liveServices';
import type { NotificationServices } from '@/notifications/services';
import { ConnectionManager } from './ConnectionManager';
import { SshHostProbe } from './SshHostProbe';
import { createModuleConnector, pairingDeviceKey } from './sshPairing';
import { TRUST_TIMEOUT_MS, TrustPromptQueue } from './trustPrompt';
import { newUuid } from './uuid';

/** Everything the live app is built from; the device adapters in production, fakes in tests. */
export interface LiveDeps {
  readonly ssh: SshModule;
  readonly hostCatalog: HostCatalog;
  readonly knownHosts: KnownHostsStore;
  readonly deviceKey: DeviceKeyStore;
  readonly storage: KeyValueStorage;
  readonly clock: Clock;
  /** The alias the device key is kept under. */
  readonly keyAlias: string;
  readonly confirmFirstConnect?: (candidate: HostKeyCandidate) => Promise<boolean>;
  readonly initiallyActive?: boolean;
  readonly trustTimeoutMs?: number;
  /** Where Chat keeps conversations between visits; in memory when absent (tests). */
  readonly chatCache?: ChatTranscriptCache;
  /** The App Group and shared Keychain; unavailable off Apple platforms and in tests. */
  readonly appGroup?: AppGroupStore;
  readonly liveActivities?: LiveActivityController;
  /** Secure bytes for Notification Keys and nonces. */
  readonly randomBytes: RandomBytes;
}

export interface LiveServices {
  readonly runtime: HostsRuntime;
  readonly store: ConsoleStore<SshTransport>;
  readonly manager: ConnectionManager;
  readonly conversations: ConversationRegistry;
  readonly notifications: NotificationServices;
  readonly liveActivity: LiveActivityRuntime;
}

/** Wires the persisted catalog, the SSH transport and the Console store into one app. */
export function createLiveServices(deps: LiveDeps): LiveServices {
  const model = new HostsModel(deps.hostCatalog, deps.knownHosts, newUuid);
  const store = new ConsoleStore<SshTransport>({
    pins: new PinnedAgents(deps.storage),
    listPrefs: new ListPreferences(deps.storage),
    clocks: new AgentStatusClocks(deps.storage),
    clock: deps.clock,
  });
  const ensureDeviceKey = () => deps.deviceKey.publicKey(deps.keyAlias);
  const confirmFirstConnect = deps.confirmFirstConnect ?? new TrustPromptQueue().confirm;
  const manager = new ConnectionManager({
    hosts: model,
    store,
    ssh: deps.ssh,
    keyAlias: deps.keyAlias,
    ensureDeviceKey,
    secrets: deps.hostCatalog,
    knownHosts: deps.knownHosts,
    confirmFirstConnect,
    clock: deps.clock,
    initiallyActive: deps.initiallyActive,
    onConnection: (hostId, state) => {
      if (model.find(hostId)) model.setConnection(hostId, state);
    },
  });
  const loadDeviceKey = async (): Promise<PairingDeviceKeyLoad> => {
    try {
      return { ok: true, key: pairingDeviceKey(await ensureDeviceKey()) };
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
  };
  const connector = createModuleConnector({ ssh: deps.ssh, keyAlias: deps.keyAlias });
  const runtime: HostsRuntime = {
    model,
    probe: new SshHostProbe({
      ssh: deps.ssh,
      keyAlias: deps.keyAlias,
      clock: deps.clock,
      ensureDeviceKey,
      secrets: deps.hostCatalog,
    }),
    connector,
    loadDeviceKey,
    trustTimeoutMs: deps.trustTimeoutMs ?? TRUST_TIMEOUT_MS,
    reconnect: (hostId) => manager.reconnect(hostId),
    createScanStore: () =>
      new PairingScanStore({
        connector,
        catalog: new ModelPairingCatalog(model),
        loadDeviceKey,
      }),
  };
  const conversations = new ConversationRegistry({
    console: store,
    hosts: () => model.getSnapshot().hosts,
    createFiles: (hostId) =>
      new TransportChatFiles((operation) => manager.withTransport(hostId, operation)),
    cache: deps.chatCache ?? new VolatileChatTranscriptCache(),
    clock: deps.clock,
  });
  // A removed Host takes its Chat stores and cached transcripts with it.
  model.subscribe(() => void conversations.retainHosts());
  const transports: NotificationTransportProvider = {
    withTransport: (host, operation) =>
      manager.withTransport(host.id, (transport) => operation(pluginConfigFiles(transport))),
  };
  const parts = createLiveNotificationParts({
    hosts: model,
    transports,
    appGroup: deps.appGroup ?? unavailableAppGroup,
    storage: deps.storage,
    clock: deps.clock,
    randomBytes: deps.randomBytes,
  });
  const liveActivity = new LiveActivityRuntime({
    store,
    hosts: model,
    controller: deps.liveActivities ?? unavailableLiveActivities,
    storage: deps.storage,
    transports,
    keys: parts.keys,
    ceremony: parts.ceremony,
    clock: deps.clock,
    randomBytes: deps.randomBytes,
    deviceToken: parts.deviceToken,
  });
  const notifications: NotificationServices = {
    ...parts.services,
    liveActivity: {
      get activitiesEnabled() {
        return liveActivity.activitiesEnabled;
      },
      isEnabled: (hostId) => liveActivity.isEnabled(hostId),
      setEnabled: (enabled, hostId) => liveActivity.setEnabled(enabled, hostId),
    },
  };
  return { runtime, store, manager, conversations, notifications, liveActivity };
}
