import type { KeyValueStorage } from '../hosts/known-hosts';
import { foldedContains, type Snippet } from './snippet';

export type SnippetStoreErrorKind = 'unknownSnippet' | 'catalogUnreadable';

export class SnippetStoreError extends Error {
  override readonly name = 'SnippetStoreError';
  constructor(readonly kind: SnippetStoreErrorKind) {
    super(`SnippetStoreError.${kind}`);
  }
}

export const SNIPPETS_STORAGE_KEY = 'snippets';
const CATALOG_VERSION = 1;

function decode(raw: string): Snippet[] {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) throw new Error('not a catalog');
  const { version, snippets } = parsed as { version?: unknown; snippets?: unknown };
  if (version !== CATALOG_VERSION || !Array.isArray(snippets)) throw new Error('bad catalog');
  return snippets.map((entry: unknown) => {
    const { id, title, body } = (entry ?? {}) as Record<string, unknown>;
    if (typeof id !== 'string' || typeof title !== 'string' || typeof body !== 'string') {
      throw new Error('bad snippet');
    }
    return { id, title, body };
  });
}

/**
 * Owns the Snippet catalog: add, edit, remove, reorder and persistence. One global set, not
 * scoped to a Host or Agent. Order is the user's, never usage-derived. An unreadable stored
 * catalog is left untouched and refuses writes, so a recoverable catalog never becomes loss.
 */
export class SnippetStore {
  private items: readonly Snippet[] = [];
  private loadError: SnippetStoreError | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly storage: KeyValueStorage) {
    const raw = storage.getString(SNIPPETS_STORAGE_KEY);
    if (raw === undefined) return;
    try {
      this.items = decode(raw);
    } catch {
      this.loadError = new SnippetStoreError('catalogUnreadable');
    }
  }

  get snippets(): readonly Snippet[] {
    return this.items;
  }

  get catalogLoadError(): SnippetStoreError | undefined {
    return this.loadError;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  add(snippet: Snippet): void {
    this.commit([...this.writable(), snippet]);
  }

  update(snippet: Snippet): void {
    const items = [...this.writable()];
    const index = items.findIndex((item) => item.id === snippet.id);
    if (index < 0) throw new SnippetStoreError('unknownSnippet');
    items[index] = snippet;
    this.commit(items);
  }

  remove(id: string): void {
    const items = [...this.writable()];
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) throw new SnippetStoreError('unknownSnippet');
    items.splice(index, 1);
    this.commit(items);
  }

  /** Moves the item at `from` so it lands before the item currently at `to` (insertion index). */
  move(from: number, to: number): void {
    const items = [...this.writable()];
    const [moved] = items.splice(from, 1);
    if (!moved) return;
    items.splice(to > from ? to - 1 : to, 0, moved);
    this.commit(items);
  }

  /** Matches title and body, ignoring case and diacritics; a blank query lists everything. */
  matching(query: string): readonly Snippet[] {
    const trimmed = query.trim();
    if (trimmed === '') return this.items;
    return this.items.filter(
      (item) => foldedContains(item.title, trimmed) || foldedContains(item.body, trimmed),
    );
  }

  private writable(): readonly Snippet[] {
    if (this.loadError) throw new SnippetStoreError('catalogUnreadable');
    return this.items;
  }

  private commit(items: readonly Snippet[]): void {
    this.storage.set(
      SNIPPETS_STORAGE_KEY,
      JSON.stringify({ version: CATALOG_VERSION, snippets: items }),
    );
    this.items = items;
    for (const listener of this.listeners) listener();
  }
}
