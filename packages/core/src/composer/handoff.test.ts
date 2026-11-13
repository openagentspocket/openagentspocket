import { describe, expect, it } from 'vitest';
import { FakeClock } from '../hosts/cancellation';
import { MemoryStorage } from '../hosts/known-hosts';
import { appendParagraph } from './handoff';
import { ComposerRegistry, readDraft } from './registry';

describe('appendParagraph', () => {
  it('an empty draft becomes the text', () => {
    expect(appendParagraph('', 'Commit this.')).toBe('Commit this.');
    expect(appendParagraph('  \n', 'Commit this.')).toBe('Commit this.');
  });

  it('text goes after what the user typed, as its own paragraph', () => {
    expect(appendParagraph('Also fix the tests', 'Commit this.')).toBe(
      'Also fix the tests\n\nCommit this.',
    );
  });

  it('trailing whitespace folds into one paragraph break', () => {
    expect(appendParagraph('typed  \n\n\n', '  Commit this.\n')).toBe('typed\n\nCommit this.');
  });

  it('blank text leaves the draft untouched', () => {
    expect(appendParagraph('typed ', '   ')).toBe('typed ');
  });
});

const KEY = 'h1/p1';

function setup() {
  const storage = new MemoryStorage();
  const registry = new ComposerRegistry({ storage, clock: new FakeClock() });
  const sent: string[] = [];
  const open = () =>
    registry.composerFor({
      key: KEY,
      target: 'p1',
      status: 'idle',
      prompt: async ({ text }) => {
        sent.push(text);
      },
    });
  return { storage, registry, open, sent };
}

describe('ComposerRegistry.appendToDraft', () => {
  it('with a live Composer goes through its store, so subscribers and persistence see it', () => {
    const { storage, registry, open, sent } = setup();
    const store = open();
    store.replaceDraft('typed');
    let notified = 0;
    store.subscribe(() => notified++);
    registry.appendToDraft(KEY, 'Commit this.');
    expect(store.getSnapshot().draft).toBe('typed\n\nCommit this.');
    expect(notified).toBeGreaterThan(0);
    expect(readDraft(storage, KEY)).toBe('typed\n\nCommit this.');
    expect(sent).toEqual([]);
  });

  it('with no live Composer lands in the saved draft, which the Composer reads on first use', () => {
    const { storage, registry, open, sent } = setup();
    storage.set(`composer.draft.${KEY}`, 'kept');
    registry.appendToDraft(KEY, 'Commit this.');
    expect(readDraft(storage, KEY)).toBe('kept\n\nCommit this.');
    expect(open().getSnapshot().draft).toBe('kept\n\nCommit this.');
    expect(sent).toEqual([]);
  });
});
