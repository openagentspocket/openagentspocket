import type { Clock } from '../hosts/cancellation';
import type { KeyValueStorage } from '../hosts/known-hosts';
import { type ComposerPrompt, ComposerStore } from './store';

const DRAFT_PREFIX = 'composer.draft.';

/** The persisted draft of one Agent (`agentKey`); empty when none was kept. */
export function readDraft(storage: KeyValueStorage, key: string): string {
  return storage.getString(DRAFT_PREFIX + key) ?? '';
}

export interface ComposerRegistryOptions {
  readonly storage: KeyValueStorage;
  readonly clock: Clock;
  readonly notReadyRetryMs?: number;
  readonly notReadyBudgetMs?: number;
}

/**
 * One Composer per Agent, owned above every view that shows it: a rebuilt detail, a surface
 * swap or a reconnect finds the same draft and echoes. Drafts survive restarts.
 */
export class ComposerRegistry {
  private readonly stores = new Map<string, ComposerStore>();

  constructor(private readonly options: ComposerRegistryOptions) {}

  /** The Agent's Composer, created on first use with its saved draft. */
  composerFor(input: {
    key: string;
    target: string;
    prompt: ComposerPrompt;
    status: string;
  }): ComposerStore {
    const existing = this.stores.get(input.key);
    if (existing) return existing;
    const { storage } = this.options;
    const store = new ComposerStore({
      target: input.target,
      prompt: input.prompt,
      clock: this.options.clock,
      initialStatus: input.status,
      initialDraft: readDraft(storage, input.key),
      onDraft: (draft) => storage.set(DRAFT_PREFIX + input.key, draft),
      ...(this.options.notReadyRetryMs === undefined
        ? {}
        : { notReadyRetryMs: this.options.notReadyRetryMs }),
      ...(this.options.notReadyBudgetMs === undefined
        ? {}
        : { notReadyBudgetMs: this.options.notReadyBudgetMs }),
    });
    this.stores.set(input.key, store);
    return store;
  }

  /** Forgets an Agent that closed, with its saved draft. */
  discard(key: string): void {
    this.stores.delete(key);
    this.options.storage.set(DRAFT_PREFIX + key, '');
  }
}
