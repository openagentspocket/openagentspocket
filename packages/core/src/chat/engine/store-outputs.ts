// Reads a tool's output again for an expanded row (the store's `loadOutput`): once the transcript is
// open and the Host connected, so a row expanded earlier waits and is read then.

import type { ChatToolActivity } from '../model/types';
import type { ConversationEngineRef } from './store-engine';
import type { ChatOutputState, ConversationState } from './store-types';

interface Host {
  readonly state: () => ConversationState;
  readonly engine: () => ConversationEngineRef | null;
  readonly generation: () => number;
  readonly set: (id: string, output: ChatOutputState) => void;
}

export class ToolOutputLoader {
  private readonly waiting = new Set<string>();
  private connected = true;

  constructor(private readonly host: Host) {}

  load(entryId: string): void {
    const state = this.host.state();
    const entry = [...state.snapshot.transcript.entries].reverse().find((e) => e.id === entryId);
    if (entry?.content.type !== 'tool') return;
    const tool: ChatToolActivity = entry.content.value;
    const current = state.outputs.get(entryId);
    if (!tool.output || current?.type === 'loading' || current?.type === 'loaded') return;
    const engine = this.host.engine();
    if (state.snapshot.phase.type !== 'following' || !this.connected || !engine) {
      this.waiting.add(entryId);
      return;
    }
    this.waiting.delete(entryId);
    this.host.set(entryId, { type: 'loading' });
    const generation = this.host.generation();
    void engine.output(tool).then((result) => {
      if (generation !== this.host.generation()) return;
      this.host.set(
        entryId,
        result.ok
          ? { type: 'loaded', output: result.output }
          : { type: 'failed', failure: result.failure },
      );
    });
  }

  /** The Console's Host status changed. Rows expanded while it was not connected are read once it is. */
  hostConnectionChanged(connected: boolean): void {
    if (connected === this.connected) return;
    this.connected = connected;
    if (connected) this.flush();
  }

  /** Reads every row that waited, now that the transcript is open. */
  flush(): void {
    for (const id of [...this.waiting]) this.load(id);
  }

  clear(): void {
    this.waiting.clear();
  }
}
