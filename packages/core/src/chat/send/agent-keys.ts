// Chat's Agent controls: keys pressed in the Agent's program through `agent.send_keys` (ADR 0024),
// never through the Attach PTY. One request at a time, in the order pressed, as typed keys would
// arrive (Swift ChatAgentKeysStore).

/** What became of keys queued with `deliver`. */
export type KeyDelivery =
  | { readonly kind: 'sent' }
  /** The check gave this reason, so nothing was sent. */
  | { readonly kind: 'withheld'; readonly reason: string }
  /** The request failed, so the keys may not have arrived. */
  | { readonly kind: 'failed' };

export const KEYS_UNREACHABLE = "Couldn't reach the Agent, so the key may not have gone.";

export class AgentKeysQueue {
  /** Why the last key may not have arrived; cleared once one does. */
  failure: string | null = null;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly send: (names: readonly string[]) => Promise<void>) {}

  /**
   * Queues `names` behind the keys still on their way and sends them in one `agent.send_keys`.
   * `check`, when given, runs once those earlier keys have gone, so it sees their effect; a reason
   * from it sends nothing and leaves `failure` alone. `[]` sends nothing and returns `failed`.
   */
  deliver(names: readonly string[], check?: () => Promise<string | null>): Promise<KeyDelivery> {
    if (names.length === 0) return Promise.resolve({ kind: 'failed' });
    const task = this.tail.then(async (): Promise<KeyDelivery> => {
      if (check) {
        const reason = await check();
        if (reason !== null) return { kind: 'withheld', reason };
      }
      try {
        await this.send(names);
        this.failure = null;
        return { kind: 'sent' };
      } catch {
        this.failure = KEYS_UNREACHABLE;
        return { kind: 'failed' };
      }
    });
    this.tail = task;
    return task;
  }
}
