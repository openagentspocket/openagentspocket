import {
  type AgentInterruptOutcome,
  type ComposerPrompt,
  ComposerRegistry,
  type ComposerSnapshot,
  type ComposerStore,
  type KeyValueStorage,
} from '@openagentspocket/core';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import { useConsoleStore } from '@/console/hooks';
import { systemClock } from '@/console/systemClock';

const fallbacks = new WeakMap<KeyValueStorage, ComposerRegistry>();

/** The registry for a storage when none is provided: one per storage, so drafts outlive the screen. */
function defaultRegistry(storage: KeyValueStorage): ComposerRegistry {
  let registry = fallbacks.get(storage);
  if (!registry) {
    registry = new ComposerRegistry({ storage, clock: systemClock });
    fallbacks.set(storage, registry);
  }
  return registry;
}

const RegistryContext = createContext<ComposerRegistry | undefined>(undefined);

/** Supplies the Composers (one per Agent); tests and previews pass their own registry. */
export function ComposerRegistryProvider({
  registry,
  children,
}: {
  registry: ComposerRegistry;
  children: ReactNode;
}) {
  return <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>;
}

/** The slices of the live Transport the Composer uses (`HerdrApi`); the demo Transport has neither. */
interface PromptTransport {
  promptAgent(params: { target: string; text: string }): Promise<unknown>;
}
interface KeysTransport {
  sendAgentKeys(params: { target: string; keys: string[] }): Promise<void>;
}

function canPrompt(transport: object): transport is PromptTransport {
  return 'promptAgent' in transport && typeof transport.promptAgent === 'function';
}

function canSendKeys(transport: object): transport is KeysTransport {
  return 'sendAgentKeys' in transport && typeof transport.sendAgentKeys === 'function';
}

export interface AgentComposer {
  readonly store: ComposerStore;
  readonly snapshot: ComposerSnapshot;
  /** Presses Esc in the Agent's program. */
  readonly interrupt: () => Promise<AgentInterruptOutcome>;
}

/**
 * The Agent's Composer, kept across detail rebuilds, with Agent Status fed in as it changes.
 * Delivery goes through the Host's Transport; a Transport without `agent.prompt` (the demo)
 * accepts the text.
 */
export function useAgentComposer(
  hostId: string,
  paneId: string,
  status: string,
  storage: KeyValueStorage,
): AgentComposer {
  const consoleStore = useConsoleStore();
  const registry = useContext(RegistryContext) ?? defaultRegistry(storage);
  const initialStatus = useRef(status);
  const store = useMemo(() => {
    const prompt: ComposerPrompt = (params) =>
      consoleStore.mutate(hostId, async (transport) => {
        if (canPrompt(transport)) await transport.promptAgent(params);
      });
    return registry.composerFor({
      key: `${hostId}/${paneId}`,
      target: paneId,
      prompt,
      status: initialStatus.current,
    });
  }, [registry, consoleStore, hostId, paneId]);
  useEffect(() => store.agentStatusDidChange(status), [store, status]);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const interrupt = useMemo(
    () => async (): Promise<AgentInterruptOutcome> => {
      try {
        await consoleStore.mutate(hostId, async (transport) => {
          if (!canSendKeys(transport)) throw new Error('The Host cannot send keys.');
          await transport.sendAgentKeys({ target: paneId, keys: ['esc'] });
        });
        return { kind: 'sent' };
      } catch (error) {
        return { kind: 'failed', message: error instanceof Error ? error.message : String(error) };
      }
    },
    [consoleStore, hostId, paneId],
  );
  return { store, snapshot, interrupt };
}
