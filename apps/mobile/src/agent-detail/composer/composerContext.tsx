import {
  type AgentInterruptOutcome,
  type ComposerPrompt,
  ComposerRegistry,
  type ComposerSnapshot,
  type ComposerStore,
  errorMessage,
  type KeyValueStorage,
} from '@openagentspocket/core';
import { systemClock } from '@openagentspocket/transport';
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
import { releaseAttachmentPreview } from '@/features/composer-tools/composerStaging';
import { ExpoLocalFiles } from '@/files/expoLocalFiles';
import { usePaneAddressing } from '../paneAddressing';

const fallbacks = new WeakMap<KeyValueStorage, ComposerRegistry>();

/** The registry for a storage when none is provided: one per storage, so drafts outlive the screen. */
function defaultRegistry(storage: KeyValueStorage): ComposerRegistry {
  let registry = fallbacks.get(storage);
  if (!registry) {
    registry = new ComposerRegistry({
      storage,
      clock: systemClock,
      releaseAttachment: releaseAttachmentPreview(new ExpoLocalFiles()),
    });
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

/** The registry key of an Agent's Composer (and of its saved draft). */
export const composerKey = (hostId: string, paneId: string): string => `${hostId}/${paneId}`;

/** The Composers in force: the provided registry, else the one kept for this storage. */
export function useComposerRegistry(storage: KeyValueStorage): ComposerRegistry {
  return useContext(RegistryContext) ?? defaultRegistry(storage);
}

/** The slices of the live Transport the Composer uses (`HerdrApi`); the demo Transport has neither. */
interface PromptTransport {
  promptAgent(params: { target: string; text: string }): Promise<unknown>;
}
interface PaneInputTransport {
  sendPaneInput(params: { pane_id: string; text?: string; keys?: string[] }): Promise<void>;
}
interface KeysTransport {
  sendAgentKeys(params: { target: string; keys: string[] }): Promise<void>;
}

function canPrompt(transport: object): transport is PromptTransport {
  return 'promptAgent' in transport && typeof transport.promptAgent === 'function';
}

function canSendPaneInput(transport: object): transport is PaneInputTransport {
  return 'sendPaneInput' in transport && typeof transport.sendPaneInput === 'function';
}

function canSendKeys(transport: object): transport is KeysTransport {
  return 'sendAgentKeys' in transport && typeof transport.sendAgentKeys === 'function';
}

export interface AgentComposer {
  readonly hostId: string;
  readonly paneId: string;
  readonly store: ComposerStore;
  readonly snapshot: ComposerSnapshot;
  /** Presses Esc in the Agent's program (the terminal's Stop; Chat's comes from the program's send policy). */
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
  const registry = useComposerRegistry(storage);
  const addressing = usePaneAddressing(hostId, paneId);
  const byPane = useRef(addressing === 'pane');
  byPane.current = addressing === 'pane';
  const initialStatus = useRef(status);
  const store = useMemo(() => {
    const prompt: ComposerPrompt = (params) =>
      consoleStore.mutate(hostId, async (transport) => {
        // A pane herdr detects no Agent in takes the text and Enter as typed keys.
        if (byPane.current && canSendPaneInput(transport)) {
          await transport.sendPaneInput({
            pane_id: params.target,
            text: params.text,
            keys: ['enter'],
          });
        } else if (canPrompt(transport)) await transport.promptAgent(params);
      });
    return registry.composerFor({
      key: composerKey(hostId, paneId),
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
          if (byPane.current && canSendPaneInput(transport)) {
            await transport.sendPaneInput({ pane_id: paneId, keys: ['esc'] });
            return;
          }
          if (!canSendKeys(transport)) throw new Error('The Host cannot send keys.');
          await transport.sendAgentKeys({ target: paneId, keys: ['esc'] });
        });
        return { kind: 'sent' };
      } catch (error) {
        return { kind: 'failed', message: errorMessage(error) };
      }
    },
    [consoleStore, hostId, paneId],
  );
  return { hostId, paneId, store, snapshot, interrupt };
}
