import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../hosts/known-hosts';
import {
  makeSnippet,
  SNIPPET_BODY_CHARACTER_LIMIT,
  SnippetValidationFailure,
  snippetDisplaySubtitle,
  snippetDisplayTitle,
} from './snippet';
import { SNIPPETS_STORAGE_KEY, SnippetStore, SnippetStoreError } from './snippet-store';

function validation(run: () => unknown) {
  try {
    run();
  } catch (thrown) {
    if (thrown instanceof SnippetValidationFailure) return thrown.error;
    throw thrown;
  }
  return undefined;
}

describe('makeSnippet', () => {
  it('turns carriage returns into line feeds so a Snippet never carries a submit byte', () => {
    const snippet = makeSnippet({ title: '', body: 'first\r\nsecond\rthird' });
    expect(snippet.body).toBe('first\nsecond\nthird');
  });

  it('keeps tabs and line feeds', () => {
    expect(makeSnippet({ title: '', body: 'run:\n\tmake test' }).body).toBe('run:\n\tmake test');
  });

  it('refuses other control characters', () => {
    for (const code of [0x00, 0x07, 0x08, 0x0b, 0x1b, 0x1f, 0x7f]) {
      const body = `safe${String.fromCharCode(code)}text`;
      expect(validation(() => makeSnippet({ title: '', body }))).toEqual({
        kind: 'unsupportedControlCharacters',
      });
    }
  });

  it('refuses a blank body and one over the limit', () => {
    expect(validation(() => makeSnippet({ title: 'Named', body: '  \n ' }))).toEqual({
      kind: 'emptyBody',
    });
    const limit = SNIPPET_BODY_CHARACTER_LIMIT;
    expect(validation(() => makeSnippet({ title: '', body: 'x'.repeat(limit + 1) }))).toEqual({
      kind: 'bodyTooLong',
      limit,
    });
    expect(validation(() => makeSnippet({ title: '', body: 'x'.repeat(limit) }))).toBeUndefined();
  });

  it('trims the optional title and lets the body stand in for a missing one', () => {
    const named = makeSnippet({ title: '  Review  ', body: 'please review this' });
    expect(named.title).toBe('Review');
    expect(snippetDisplayTitle(named)).toBe('Review');
    expect(snippetDisplaySubtitle(named)).toBe('please review this');
    const unnamed = makeSnippet({ title: '   ', body: '继续' });
    expect(snippetDisplayTitle(unnamed)).toBe('继续');
    expect(snippetDisplaySubtitle(unnamed)).toBeUndefined();
  });
});

const snip = (title: string, body: string) => makeSnippet({ title, body });

describe('SnippetStore', () => {
  it('persists adds across instances in order', () => {
    const storage = new MemoryStorage();
    const store = new SnippetStore(storage);
    store.add(snip('Tests', 'make test'));
    store.add(snip('', '继续'));
    const reloaded = new SnippetStore(storage);
    expect(reloaded.snippets.map((s) => s.body)).toEqual(['make test', '继续']);
    expect(reloaded.catalogLoadError).toBeUndefined();
  });

  it('updates in place and rejects an unknown id', () => {
    const store = new SnippetStore(new MemoryStorage());
    const first = snip('One', 'one');
    store.add(first);
    store.add(snip('Two', 'two'));
    store.update(makeSnippet({ id: first.id, title: 'Uno', body: 'uno' }));
    expect(store.snippets.map((s) => s.title)).toEqual(['Uno', 'Two']);
    expect(() => store.update(snip('Ghost', 'boo'))).toThrow(SnippetStoreError);
  });

  it('removes only the addressed Snippet', () => {
    const storage = new MemoryStorage();
    const store = new SnippetStore(storage);
    const doomed = snip('', 'doomed');
    store.add(snip('', 'kept'));
    store.add(doomed);
    store.remove(doomed.id);
    expect(new SnippetStore(storage).snippets.map((s) => s.body)).toEqual(['kept']);
  });

  it('keeps a manual order across a reload', () => {
    const storage = new MemoryStorage();
    const store = new SnippetStore(storage);
    for (const body of ['a', 'b', 'c']) store.add(snip('', body));
    store.move(2, 0);
    expect(new SnippetStore(storage).snippets.map((s) => s.body)).toEqual(['c', 'a', 'b']);
    store.move(0, 3);
    expect(store.snippets.map((s) => s.body)).toEqual(['a', 'b', 'c']);
  });

  it('searches title and body ignoring case and diacritics', () => {
    const store = new SnippetStore(new MemoryStorage());
    store.add(snip('Review', 'have a look'));
    store.add(snip('Ship', 'please REVIEW and merge'));
    store.add(snip('', 'unrelated café'));
    expect(store.matching('review')).toHaveLength(2);
    expect(store.matching('cafe')).toHaveLength(1);
    expect(store.matching('  ')).toHaveLength(3);
    expect(store.matching('nothing here')).toHaveLength(0);
  });

  it('refuses writes over an unreadable catalog and leaves its bytes alone', () => {
    const storage = new MemoryStorage();
    storage.set(SNIPPETS_STORAGE_KEY, 'not json');
    const store = new SnippetStore(storage);
    expect(store.catalogLoadError?.kind).toBe('catalogUnreadable');
    expect(store.snippets).toHaveLength(0);
    expect(() => store.add(snip('', 'new'))).toThrow(SnippetStoreError);
    expect(storage.getString(SNIPPETS_STORAGE_KEY)).toBe('not json');
  });

  it('notifies subscribers on change', () => {
    const store = new SnippetStore(new MemoryStorage());
    let calls = 0;
    const off = store.subscribe(() => {
      calls += 1;
    });
    store.add(snip('', 'x'));
    off();
    store.add(snip('', 'y'));
    expect(calls).toBe(1);
  });
});
