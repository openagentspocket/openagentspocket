import { describe, expect, it } from 'vitest';
import { bytes, find, home, noticeOf, settle, setupStore, tree } from './fixture.test-util';
import { FILE_LIMITS } from './limits';
import type { FileBrowserHost } from './ports';
import { photoUploadName } from './transfers';

describe('downloads', () => {
  const sized = (base: FileBrowserHost, size: number) =>
    Object.assign(Object.create(base) as FileBrowserHost, {
      list: async (path: string) => {
        const listing = await base.list(path);
        return {
          ...listing,
          entries: listing.entries.map((e) => (e.kind === 'file' ? { ...e, size } : e)),
        };
      },
    });

  it('a tapped small file downloads for the viewer, and closing removes the copy', async () => {
    const { store, local } = await setupStore(tree);
    store.start();
    await settle();
    store.open(find(store.getState().items, 'readme.md'));
    await settle();
    const { delivery } = store.getState();
    expect(delivery).toMatchObject({ name: 'readme.md', intent: 'preview' });
    expect(local.files.has(delivery?.uri ?? '')).toBe(true);
    store.close();
    await settle();
    expect([...local.files.keys()].filter((k) => k.includes('browser-1'))).toEqual([]);
  });

  it('finishing a delivery removes its copy', async () => {
    const { store, local } = await setupStore(tree);
    store.start();
    await settle();
    store.requestFile(find(store.getState().items, 'readme.md'), 'share');
    await settle();
    store.finishDelivery();
    await settle();
    expect(store.getState().delivery).toBeNull();
    expect(local.files.size).toBe(0);
  });

  it('refuses huge files and asks before large ones', async () => {
    const { store } = await setupStore(tree, {
      makeHost: (base) => sized(base, FILE_LIMITS.previewBytes + 1),
    });
    store.start();
    await settle();
    const file = find(store.getState().items, 'readme.md');
    store.requestFile(file, 'preview');
    expect(store.getState().pendingDownload?.reason).toBe('large');
    store.confirmPendingDownload('share');
    await settle();
    expect(store.getState().pendingDownload).toBeNull();
    expect(store.getState().delivery?.intent).toBe('share');
    store.finishDelivery();

    store.requestFile({ ...file, size: FILE_LIMITS.downloadBytes + 1 }, 'share');
    expect(store.getState().notice).not.toBeNull();
    expect(store.getState().pendingDownload).toBeNull();
  });

  it('shares and saves above the confirmation cap ask first, previews above it do not', async () => {
    const { store } = await setupStore(tree);
    store.start();
    await settle();
    const file = {
      ...find(store.getState().items, 'readme.md'),
      size: FILE_LIMITS.confirmBytes + 1,
    };
    store.requestFile(file, 'saveToFiles');
    expect(store.getState().pendingDownload?.reason).toBe('largeTransfer');
    store.cancelPendingDownload();
    expect(store.getState().transfer).toBeNull();
  });

  it('secret-looking names ask once before downloading', async () => {
    const { store } = await setupStore({ files: { [`${home}/.env`]: bytes('K=v') } });
    store.start();
    await settle();
    const env = find(store.getState().items, '.env');
    store.open(env);
    expect(store.getState().pendingDownload?.reason).toBe('secret');
    expect(store.getState().transfer).toBeNull();
    store.confirmPendingDownload();
    await settle();
    expect(store.getState().delivery?.name).toBe('.env');
    store.finishDelivery();
    store.open(env);
    expect(store.getState().pendingDownload).toBeNull();
  });

  it('cancelling a download delivers nothing and leaves no copy', async () => {
    const gate: { release?: () => void } = {};
    const { store, local } = await setupStore(tree, {
      makeHost: (base) =>
        Object.assign(Object.create(base) as FileBrowserHost, {
          download: async (...args: Parameters<FileBrowserHost['download']>) => {
            await new Promise<void>((resolve) => {
              gate.release = resolve;
            });
            return base.download(...args);
          },
        }),
    });
    store.start();
    await settle();
    store.open(find(store.getState().items, 'readme.md'));
    await settle();
    expect(store.getState().transfer?.direction).toBe('download');
    store.cancelTransfer();
    gate.release?.();
    await settle();
    expect(store.getState()).toMatchObject({ transfer: null, delivery: null, notice: null });
    expect(local.files.size).toBe(0);
  });

  it('a failed download says why', async () => {
    const { store, session } = await setupStore(tree);
    store.start();
    await settle();
    session.files.delete(`${home}/readme.md`);
    store.open(find(store.getState().items, 'readme.md'));
    await settle();
    expect(store.getState().notice).toEqual(noticeOf('notFound'));
    expect(store.getState().transfer).toBeNull();
  });
});

describe('uploads', () => {
  it('goes to the folder on screen and reloads it', async () => {
    const { store, local, session } = await setupStore(tree);
    store.start();
    await settle();
    local.put('local://picked/doc', bytes('abc'));
    store.importFile('local://picked/doc', 'doc.txt', 'txt');
    await settle();
    expect(session.files.has(`${home}/doc.txt`)).toBe(true);
    expect(store.getState().items.map((i) => i.name)).toContain('doc.txt');
    expect(store.getState()).toMatchObject({ transfer: null, isMutating: false });
    expect([...local.files.keys()].filter((k) => k.startsWith('local://prepared'))).toEqual([]);
  });

  it('a taken name offers keep both, replace and cancel', async () => {
    const { store, local, session } = await setupStore(tree);
    store.start();
    await settle();
    for (const choice of ['keepBoth', 'replace', 'cancel'] as const) {
      local.put('local://picked/doc', bytes(choice));
      store.importFile('local://picked/doc', 'readme.md', 'md');
      await settle();
      expect(store.getState().pendingCollision).toMatchObject({
        existingKind: 'file',
        canReplace: true,
      });
      store.resolveCollision(choice);
      await settle();
    }
    expect(session.files.has(`${home}/readme 2.md`)).toBe(true);
    expect(new TextDecoder().decode(session.files.get(`${home}/readme.md`))).toBe('replace');
    expect(store.getState().pendingCollision).toBeNull();
    expect([...local.files.keys()].filter((k) => k.startsWith('local://prepared'))).toEqual([]);
  });

  it('a folder is never replaced by an upload', async () => {
    const { store, local, session } = await setupStore(tree);
    store.start();
    await settle();
    local.put('local://picked/doc', bytes('abc'));
    store.importFile('local://picked/doc', 'proj', '');
    await settle();
    expect(store.getState().pendingCollision).toMatchObject({
      existingKind: 'directory',
      canReplace: false,
    });
    store.resolveCollision('replace');
    expect(store.getState().notice).not.toBeNull();
    expect(session.directories.has(`${home}/proj`)).toBe(true);
  });

  it('a stale listing collision asks again keeping the local copy', async () => {
    const { store, local, session } = await setupStore(tree);
    store.start();
    await settle();
    session.files.set(`${home}/late.txt`, bytes('there'));
    local.put('local://picked/doc', bytes('abc'));
    store.importFile('local://picked/doc', 'late.txt', 'txt');
    await settle();
    const collision = store.getState().pendingCollision;
    expect(collision?.existingKind).toBeNull();
    expect(local.files.has(collision?.upload.source ?? '')).toBe(true);
    store.resolveCollision('cancel');
    await settle();
    expect([...local.files.keys()].filter((k) => k.startsWith('local://prepared'))).toEqual([]);
  });

  it('rejects an oversize pick and an unusable name with a notice', async () => {
    const { store, local } = await setupStore(tree);
    store.start();
    await settle();
    local.put('local://picked/big', new Uint8Array(8));
    store.importFile('local://picked/big', 'a/b', 'txt');
    await settle();
    expect(store.getState().notice).not.toBeNull();
    expect(store.getState().pendingCollision).toBeNull();
    store.dismissNotice();
    store.importFile('local://picked/missing', 'x', '');
    await settle();
    expect(store.getState().notice).not.toBeNull();
  });

  it('names a picked photo by its local date and time', () => {
    expect(photoUploadName(new Date(2026, 9, 31, 14, 5, 9), 'jpg')).toBe(
      'Photo 2026-10-31 14.05.09.jpg',
    );
  });
});
