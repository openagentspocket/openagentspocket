import { describe, expect, it } from 'vitest';
import { renderText, type Text } from '../errors/text';
import { commitRequestKinds, commitRequestText } from './commit-request';
import type { ChangedFile, CheckoutChanges, CheckoutHead } from './types';

const file = (path: string, kind: ChangedFile['kind'] = 'modified'): ChangedFile => ({
  path,
  originalPath: null,
  kind,
  staging: kind === 'modified' ? 'unstaged' : null,
  lineCounts: null,
});

function changes(
  files: readonly ChangedFile[],
  head: Partial<CheckoutHead> = {},
  untracked = 0,
): CheckoutChanges {
  return {
    checkout: { topLevel: '/work/app', isLinkedWorktree: false, displayPath: '~/work/app' },
    head: {
      branch: { kind: 'named', name: 'feature' },
      commit: 'a7d75683c107bbe72aad2574b0ba0e6c47629e08',
      latestCommit: null,
      upstream: { name: 'origin/feature', state: { kind: 'tracking', ahead: 0, behind: 0 } },
      isUnborn: false,
      ...head,
    },
    files,
    totals: {
      trackedFiles: files.length - untracked,
      untrackedItems: untracked,
      added: 0,
      removed: 0,
      linesAreComplete: true,
      linesAreAvailable: true,
    },
    isStatusTruncated: false,
    isMetadataTruncated: false,
  };
}

/** Every catalog key in a Text, nested arguments included. */
function keys(text: Text): string[] {
  if (typeof text === 'string') return [];
  if ('join' in text) return text.join.flatMap(keys);
  return [text.key, ...(text.args ?? []).flatMap(keys)];
}

const dirty = changes([file('a.ts'), file('b.ts', 'untracked')], {}, 1);
const clean = changes([]);

describe('commitRequestKinds', () => {
  it('offers commit and pull request while there is something to commit', () => {
    expect(commitRequestKinds(dirty)).toEqual(['commit', 'pullRequest']);
  });

  it('a clean, pushed Checkout offers nothing', () => {
    expect(commitRequestKinds(clean)).toEqual([]);
  });

  it('a clean Checkout ahead of its upstream, or never pushed, offers the pull request', () => {
    const ahead = changes([], {
      upstream: { name: 'origin/feature', state: { kind: 'tracking', ahead: 2, behind: 0 } },
    });
    expect(commitRequestKinds(ahead)).toEqual(['pullRequest']);
    expect(commitRequestKinds(changes([], { upstream: null }))).toEqual(['pullRequest']);
  });

  it('a clean detached or unborn HEAD offers nothing', () => {
    expect(commitRequestKinds(changes([], { branch: { kind: 'detached' } }))).toEqual([]);
    expect(commitRequestKinds(changes([], { upstream: null, isUnborn: true }))).toEqual([]);
  });

  it('a truncated status is never taken for clean', () => {
    expect(commitRequestKinds({ ...clean, isStatusTruncated: true })).toEqual([
      'commit',
      'pullRequest',
    ]);
  });
});

describe('commitRequestText', () => {
  it('asks to commit with the branch and the count, and forbids rewriting history', () => {
    const text = commitRequestText(dirty, 'commit');
    const rendered = renderText(text);
    expect(rendered).toContain('feature');
    expect(rendered).toContain('2');
    expect(keys(text)).toContain('%@ files changed');
    expect(keys(text)).toContain('Never force-push or rewrite history.');
    expect(keys(text).some((key) => key.includes('pull request'))).toBe(false);
  });

  it('the pull request also asks for a new branch off the default one, a push and the link', () => {
    const commit = keys(commitRequestText(dirty, 'commit'));
    const pr = keys(commitRequestText(dirty, 'pullRequest'));
    expect(pr).toEqual(expect.arrayContaining(commit));
    expect(pr.length).toBe(commit.length + 2);
  });

  it('on a clean Checkout the pull request does not ask to commit', () => {
    const ahead = changes([], { upstream: null });
    const pr = keys(commitRequestText(ahead, 'pullRequest'));
    const dirtyPr = keys(commitRequestText(dirty, 'pullRequest'));
    expect(pr).not.toEqual(expect.arrayContaining(dirtyPr));
    expect(pr).toContain('Never force-push or rewrite history.');
  });

  it('a single file reads in the singular; a detached HEAD has its own wording', () => {
    const one = changes([file('a.ts')], { branch: { kind: 'detached' } });
    const text = keys(commitRequestText(one, 'commit'));
    expect(text).toContain('%@ file changed');
    expect(text).not.toEqual(expect.arrayContaining(keys(commitRequestText(dirty, 'commit'))));
  });

  it('merge conflicts add a request to stop instead of committing', () => {
    const conflicted = changes([file('a.ts', 'conflicted')]);
    const plain = changes([file('a.ts')]);
    expect(keys(commitRequestText(conflicted, 'commit')).length).toBe(
      keys(commitRequestText(plain, 'commit')).length + 1,
    );
  });

  it('is plain language: no slash command', () => {
    for (const kind of ['commit', 'pullRequest'] as const) {
      expect(renderText(commitRequestText(dirty, kind)).startsWith('/')).toBe(false);
    }
  });
});
