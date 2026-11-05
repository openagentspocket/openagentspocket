import {
  type AnsiScreen,
  type ChatAgentView,
  type ChatHostFiles,
  type ChatTranscriptCache,
  type ClaudeSubagentOutcome,
  type ClaudeSubagentRoute,
  type Clock,
  type ConsoleRow,
  ConversationStore,
  chatHerdrSession,
  type Host,
  readSubagentTranscript,
  subagentRoute,
} from '@openagentspocket/core';
import { chatAgentView } from './agentView';

/** The slice of the Console store the registry reads. */
export interface ConversationConsole {
  getState(): {
    readonly rows: readonly ConsoleRow[];
    readonly hosts: readonly { readonly id: string; readonly status?: { readonly kind: string } }[];
  };
  subscribe(listener: () => void): () => void;
}

export interface ChatFilesHandle extends ChatHostFiles {
  close?(): Promise<void>;
}

export interface ConversationRegistryDeps {
  readonly console: ConversationConsole;
  /** The saved Hosts (their herdr session keys the cache, and a removed Host drops its stores). */
  readonly hosts: () => readonly Host[];
  /** The Host's file port, built once per Host. */
  readonly createFiles: (hostId: string) => ChatFilesHandle;
  readonly cache: ChatTranscriptCache;
  readonly clock: Clock;
  /** The Agent's screen through `agent.read`, which Chat's sends are checked against. */
  readonly readScreen?: (hostId: string, paneId: string) => Promise<AnsiScreen>;
  /** The Agent's record read now (`agent.get`); absent where the transport cannot, which skips the checks that need it. */
  readonly agentInfo?: (hostId: string, paneId: string) => Promise<ChatAgentView>;
}

interface Entry {
  readonly store: ConversationStore;
  lastView: string;
}

const key = (hostId: string, paneId: string) => `${hostId}\u0000${paneId}`;

/**
 * One `ConversationStore` per Agent, created on first use. It keeps each store informed of the
 * Console (a changed record wakes the store's loop) and drops the stores, files and cached
 * transcripts of a Host that was removed.
 */
export class ConversationRegistry {
  private readonly entries = new Map<string, Entry>();
  private readonly files = new Map<string, ChatFilesHandle>();
  private readonly unsubscribe: () => void;
  private active = true;

  constructor(private readonly deps: ConversationRegistryDeps) {
    this.unsubscribe = deps.console.subscribe(() => this.consoleChanged());
  }

  /** The Agent's store, followed only while a view shows it (`show`/`hide`). */
  get(hostId: string, paneId: string): ConversationStore {
    const id = key(hostId, paneId);
    const existing = this.entries.get(id);
    if (existing) return existing.store;
    const store = new ConversationStore({
      hostId,
      herdrSession: chatHerdrSession(this.deps.hosts().find((host) => host.id === hostId)),
      agent: () => this.viewOf(hostId, paneId),
      files: this.filesOf(hostId),
      cache: this.deps.cache,
      clock: this.deps.clock,
      readScreen: this.deps.readScreen
        ? () => (this.deps.readScreen as NonNullable<typeof this.deps.readScreen>)(hostId, paneId)
        : undefined,
      agentInfo: this.deps.agentInfo
        ? () => (this.deps.agentInfo as NonNullable<typeof this.deps.agentInfo>)(hostId, paneId)
        : undefined,
    });
    store.hostConnectionChanged(this.isConnected(hostId));
    if (!this.active) store.suspend();
    this.entries.set(id, { store, lastView: JSON.stringify(this.viewOf(hostId, paneId) ?? null) });
    return store;
  }

  /**
   * One Subagent's own transcript, read once and read-only: the call that reported `agentID` among
   * the Agent's loaded messages gives its file. A call not loaded (an older page) or a session whose
   * file is unknown reads as missing.
   */
  async readSubagent(
    hostId: string,
    paneId: string,
    agentID: string,
  ): Promise<{ route: ClaudeSubagentRoute | null; outcome: ClaudeSubagentOutcome }> {
    const { snapshot } = this.get(hostId, paneId).getState();
    const path = snapshot.phase.type === 'following' ? snapshot.phase.path : null;
    const route = subagentRoute(agentID, path, snapshot.transcript.entries);
    if (route === null) return { route, outcome: { type: 'missing' } };
    return { route, outcome: await readSubagentTranscript(this.filesOf(hostId), route.path) };
  }

  /** Ends the stores of Hosts that are no longer saved and removes their cached transcripts. */
  async retainHosts(): Promise<void> {
    const kept = new Set(this.deps.hosts().map((host) => host.id));
    for (const [id, entry] of [...this.entries]) {
      if (!kept.has(id.split('\u0000')[0] ?? '')) {
        entry.store.end();
        this.entries.delete(id);
      }
    }
    for (const [hostId, files] of [...this.files]) {
      if (kept.has(hostId)) continue;
      this.files.delete(hostId);
      await files.close?.();
    }
    await this.deps.cache.retainHosts(kept);
  }

  /** The app went to the background (or came back): every store stops reading (or starts again). */
  setActive(active: boolean): void {
    for (const { store } of this.entries.values()) {
      if (active) store.resume();
      else store.suspend();
    }
    this.active = active;
  }

  dispose(): void {
    this.unsubscribe();
    for (const entry of this.entries.values()) entry.store.end();
    this.entries.clear();
  }

  private filesOf(hostId: string): ChatFilesHandle {
    let files = this.files.get(hostId);
    if (!files) {
      files = this.deps.createFiles(hostId);
      this.files.set(hostId, files);
    }
    return files;
  }

  private viewOf(hostId: string, paneId: string): ChatAgentView | undefined {
    const row = this.deps.console
      .getState()
      .rows.find((candidate) => candidate.hostId === hostId && candidate.agent.pane_id === paneId);
    return row ? chatAgentView(row) : undefined;
  }

  private isConnected(hostId: string): boolean {
    return (
      this.deps.console.getState().hosts.find((host) => host.id === hostId)?.status?.kind ===
      'connected'
    );
  }

  private consoleChanged(): void {
    for (const [id, entry] of this.entries) {
      const [hostId = '', paneId = ''] = id.split('\u0000');
      entry.store.hostConnectionChanged(this.isConnected(hostId));
      const view = JSON.stringify(this.viewOf(hostId, paneId) ?? null);
      if (view === entry.lastView) continue;
      entry.lastView = view;
      entry.store.agentChanged();
    }
  }
}
