import type { StagedAttachment } from '../attachments/types';
import type { Clock } from '../hosts/cancellation';
import type { KeyValueStorage } from '../hosts/known-hosts';
import { appendParagraph } from './handoff';
import { type ComposerPrompt, ComposerStore } from './store';

const DRAFT_PREFIX = 'composer.draft.';
const ATTACHMENTS_PREFIX = 'composer.attachments.';

/** The persisted draft of one Agent (`agentKey`); empty when none was kept. */
export function readDraft(storage: KeyValueStorage, key: string): string {
  return storage.getString(DRAFT_PREFIX + key) ?? '';
}

const isStaged = (value: Partial<StagedAttachment> | null): value is StagedAttachment =>
  (value?.medium === 'image' || value?.medium === 'file') &&
  typeof value.name === 'string' &&
  typeof value.hostPath === 'string';

/** The attachments an Agent's draft kept; an unreadable record reads as none. */
function readAttachments(storage: KeyValueStorage, key: string): StagedAttachment[] {
  try {
    const stored: unknown = JSON.parse(storage.getString(ATTACHMENTS_PREFIX + key) ?? '[]');
    return Array.isArray(stored) ? stored.filter(isStaged) : [];
  } catch {
    return [];
  }
}

export interface ComposerRegistryOptions {
  readonly storage: KeyValueStorage;
  readonly clock: Clock;
  readonly notReadyRetryMs?: number;
  readonly notReadyBudgetMs?: number;
  /** An attachment is done with; its local preview can go. */
  readonly releaseAttachment?: (attachment: StagedAttachment) => void;
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
      initialAttachments: readAttachments(storage, input.key),
      onAttachments: (attachments) =>
        storage.set(ATTACHMENTS_PREFIX + input.key, JSON.stringify(attachments)),
      ...(this.options.releaseAttachment === undefined
        ? {}
        : { releaseAttachment: this.options.releaseAttachment }),
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

  /**
   * Adds text to an Agent's draft as its own paragraph (`appendParagraph`), whether or not its
   * Composer is live: a live store takes it (its subscribers and persistence see it), otherwise the
   * saved draft does and `composerFor` reads it on first use. Never sends.
   */
  appendToDraft(key: string, text: string): void {
    const live = this.stores.get(key);
    if (live) {
      live.replaceDraft(appendParagraph(live.getSnapshot().draft, text));
      return;
    }
    const { storage } = this.options;
    storage.set(DRAFT_PREFIX + key, appendParagraph(readDraft(storage, key), text));
  }

  /** Forgets an Agent that closed, with its saved draft and attachments. */
  discard(key: string): void {
    this.stores.get(key)?.releaseAttachments();
    this.stores.delete(key);
    this.options.storage.set(DRAFT_PREFIX + key, '');
    this.options.storage.set(ATTACHMENTS_PREFIX + key, '[]');
  }
}
