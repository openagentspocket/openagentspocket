import { describe, expect, it } from 'vitest';
import { TransportFailure } from '../errors/transport-error';
import { createChangesReaders, type ShellExec } from './exec';
import { FileDiffPresenter, FileDiffStore } from './file-diff-store';
import { changesRecording, headers, NONCE, ordinary, recording } from './fixtures';
import { ExecGate } from './observable';
import { makeFile } from './status';
import {
  type ChangedFile,
  ChangesReadError,
  type CheckoutChanges,
  type CheckoutLocation,
  type FilePatch,
  type FilePatchRequest,
} from './types';

const checkout: CheckoutLocation = { topLevel: '/r', isLinkedWorktree: false, displayPath: '~/r' };
const patchOf = (isTruncated = false): FilePatch => ({ files: [], isTruncated });

interface Call {
  request: FilePatchRequest;
  resolve(patch: FilePatch): void;
  reject(error: unknown): void;
}

function setup(file: ChangedFile = makeFile('a.txt', 'modified', { staging: 'unstaged' })) {
  const calls: Call[] = [];
  const store = new FileDiffStore(file, checkout, {
    read: (request) =>
      new Promise<FilePatch>((resolve, reject) => {
        calls.push({ request, resolve, reject });
      }),
    now: () => 42,
  });
  return { store, calls };
}

const listWith = (files: ChangedFile[], over: Partial<CheckoutChanges> = {}): CheckoutChanges => ({
  checkout,
  head: {
    branch: { kind: 'named', name: 'main' },
    commit: null,
    latestCommit: null,
    upstream: null,
    isUnborn: false,
  },
  files,
  totals: {
    trackedFiles: 0,
    untrackedItems: 0,
    added: 0,
    removed: 0,
    linesAreComplete: true,
    linesAreAvailable: true,
  },
  isStatusTruncated: false,
  isMetadataTruncated: false,
  ...over,
});

describe('FileDiffStore', () => {
  it('reads once on appear and keeps the patch', async () => {
    const { store, calls } = setup();
    const first = store.appear();
    calls[0]?.resolve(patchOf());
    await first;
    expect(store.getState().phase.kind).toBe('loaded');
    expect(store.getState().readAt).toBe(42);
    await store.appear();
    expect(calls).toHaveLength(1);
  });

  it('a first failure shows the message; a refresh failure accompanies the earlier patch', async () => {
    const { store, calls } = setup();
    const first = store.appear();
    calls[0]?.reject(new ChangesReadError({ kind: 'incomplete' }));
    await first;
    expect(store.getState().phase.kind).toBe('failed');
    const retry = store.reload();
    calls[1]?.resolve(patchOf());
    await retry;
    const refresh = store.refresh();
    calls[2]?.reject(new TransportFailure({ kind: 'gitTimedOut' }));
    await refresh;
    expect(store.getState().phase.kind).toBe('loaded');
    expect(store.getState().refreshError).not.toBeNull();
  });

  it('a truncated patch can load more once, then is too large', async () => {
    const { store, calls } = setup();
    const first = store.appear();
    calls[0]?.resolve(patchOf(true));
    await first;
    expect(store.getState().truncation).toBe('canLoadMore');
    const more = store.loadMore();
    expect(calls[1]?.request.limit).toBe('extended');
    calls[1]?.resolve(patchOf(true));
    await more;
    expect(store.getState().truncation).toBe('tooLarge');
    await store.loadMore();
    expect(calls).toHaveLength(2);
    const refresh = store.refresh();
    expect(calls[2]?.request.limit).toBe('initial');
    calls[2]?.resolve(patchOf());
    await refresh;
    expect(store.getState().truncation).toBe('none');
  });

  it('cancel invalidates a reply that lands later', async () => {
    const { store, calls } = setup();
    const first = store.appear();
    store.cancel();
    calls[0]?.resolve(patchOf());
    await first;
    expect(store.getState().phase.kind).toBe('loading');
    const again = store.appear();
    expect(calls).toHaveLength(2);
    calls[1]?.resolve(patchOf());
    await again;
  });

  it('a list refresh never replaces the open patch but notes what changed', async () => {
    const { store, calls } = setup(makeFile('a.txt', 'modified'));
    const first = store.appear();
    calls[0]?.resolve(patchOf());
    await first;
    const same = makeFile('a.txt', 'modified');
    store.noteListRefresh(listWith([same]));
    expect(store.getState().listChange).toBeNull();
    store.noteListRefresh(
      listWith([{ ...same, lineCounts: { kind: 'lines', added: 1, removed: 0 } }]),
    );
    expect(store.getState().listChange).toBe('changed');
    store.noteListRefresh(listWith([]));
    expect(store.getState().listChange).toBe('removed');
    // Reloading a removed file reads it as opened; the notice is not repeated afterwards.
    const reload = store.reload();
    calls[1]?.resolve(patchOf());
    await reload;
    expect(store.getState().listChange).toBeNull();
  });

  it('a capped status or a collapsed untracked directory does not prove a file vanished', async () => {
    const { store, calls } = setup(makeFile('dir/inner.txt', 'untracked'));
    const first = store.appear();
    calls[0]?.resolve(patchOf());
    await first;
    store.noteListRefresh(listWith([makeFile('dir/', 'untracked')]));
    expect(store.getState().listChange).toBeNull();
    store.noteListRefresh(listWith([], { isStatusTruncated: true }));
    expect(store.getState().listChange).toBeNull();
    store.noteListRefresh(listWith([]));
    expect(store.getState().listChange).toBe('removed');
  });

  it('ignores list reads of another Checkout', async () => {
    const { store, calls } = setup();
    const first = store.appear();
    calls[0]?.resolve(patchOf());
    await first;
    store.noteListRefresh({ ...listWith([]), checkout: { ...checkout, topLevel: '/other' } });
    expect(store.getState().listChange).toBeNull();
  });
});

describe('FileDiffPresenter', () => {
  const presenter = () => new FileDiffPresenter({ read: () => new Promise<FilePatch>(() => {}) });

  it('opens a file once, replaces another, and ignores untracked directories', () => {
    const p = presenter();
    p.open(makeFile('dir/', 'untracked'), checkout);
    expect(p.current).toBeNull();
    p.open(makeFile('a', 'modified'), checkout);
    const first = p.current;
    p.open(makeFile('a', 'modified'), checkout);
    expect(p.current).toBe(first);
    p.open(makeFile('b', 'modified'), checkout);
    expect(p.current).not.toBe(first);
    p.close();
    expect(p.current).toBeNull();
  });

  it('closes when a list read resolves another Checkout', () => {
    const p = presenter();
    p.open(makeFile('a', 'modified'), checkout);
    p.listDidRefresh(listWith([makeFile('a', 'modified')]));
    expect(p.current).not.toBeNull();
    p.listDidRefresh({ ...listWith([]), checkout: { ...checkout, topLevel: '/other' } });
    expect(p.current).toBeNull();
  });
});

describe('ExecGate', () => {
  it('runs one operation at a time in order and drops a cancelled waiter', async () => {
    const gate = new ExecGate();
    const order: string[] = [];
    let release: () => void = () => {};
    const first = gate.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
          order.push('first');
        }),
    );
    let aborted = false;
    const listeners = new Set<() => void>();
    const signal = {
      get aborted() {
        return aborted;
      },
      addEventListener: (_: 'abort', l: () => void) => listeners.add(l),
      removeEventListener: (_: 'abort', l: () => void) => listeners.delete(l),
    };
    const dropped = gate.run(async () => order.push('dropped'), signal);
    const last = gate.run(async () => order.push('last'));
    await Promise.resolve();
    aborted = true;
    for (const l of listeners) l();
    await expect(dropped).rejects.toThrow('cancelled');
    release();
    await first;
    await last;
    expect(order).toEqual(['first', 'last']);
  });
});

describe('exec readers', () => {
  const never = { aborted: false, addEventListener: () => {}, removeEventListener: () => {} };

  it('runs the script on stdin of one fixed shell and parses the framed reply', async () => {
    const commands: string[] = [];
    const inputs: number[] = [];
    const exec: ShellExec = async (command, options) => {
      commands.push(command);
      inputs.push(options.input.length);
      return {
        exitCode: 0,
        ...changesRecording({ status: headers() + ordinary('.M', 'a.txt') }),
      };
    };
    const readers = createChangesReaders(exec, { nonce: () => NONCE });
    const read = await readers.read({ directory: '/home/dev/src/app' }, never);
    expect(commands).toEqual(['/bin/sh -s']);
    expect(inputs[0]).toBeGreaterThan(100);
    expect(read.changes.files).toHaveLength(1);
  });

  it('maps an SSH timeout to the git deadline and cancellation to cancelled', async () => {
    const failWith =
      (code: string): ShellExec =>
      async () => {
        throw Object.assign(new Error(code), { code });
      };
    const timed = createChangesReaders(failWith('timedOut'));
    await expect(timed.read({ directory: '/x' }, never)).rejects.toMatchObject({
      error: { kind: 'gitTimedOut' },
    });
    const cancelled = createChangesReaders(failWith('cancelled'));
    await expect(cancelled.read({ directory: '/x' }, never)).rejects.toMatchObject({
      error: { kind: 'cancelled' },
    });
  });

  it('reads patches and directory listings through the same seam', async () => {
    const exec: ShellExec = async (_command, options) => {
      const script = String.fromCharCode(...options.input);
      const name = script.includes(' patch g ') ? 'patch' : 'untracked';
      const body = name === 'patch' ? 'diff --git a/a b/a\nnew file mode 100644\n' : '? d/x\0';
      return { exitCode: 0, ...recording([{ name, body }]) };
    };
    const readers = createChangesReaders(exec, { nonce: () => NONCE });
    const patch = await readers.readPatch(
      { topLevel: '/r', path: 'a', originalPath: null, isUntracked: false, limit: 'initial' },
      never,
    );
    expect(patch.files).toHaveLength(1);
    const listing = await readers.listUntrackedDirectory(
      { topLevel: '/r', directory: 'd/' },
      never,
    );
    expect(listing.entries.map((e) => e.path)).toEqual(['d/x']);
  });

  it('does not run when already cancelled', async () => {
    const exec: ShellExec = async () => {
      throw new Error('should not run');
    };
    const readers = createChangesReaders(exec);
    await expect(readers.read({ directory: '/x' }, { ...never, aborted: true })).rejects.toThrow(
      'cancelled',
    );
  });
});
