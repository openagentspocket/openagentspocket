import { describe, expect, it } from 'vitest';
import { FileBrowserDownloads } from './downloads';
import { FilePreparationError } from './errors';
import { FakeLocalFiles } from './fake-local';
import { bytes } from './fixture.test-util';
import { FilePreparer } from './preparer';

const preparer = (local: FakeLocalFiles, maxBytes = 10) =>
  new FilePreparer(local, { maxBytes, newId: () => 'rand' });

describe('FilePreparer', () => {
  it('copies into private storage under a random name with a safe extension', async () => {
    const local = new FakeLocalFiles();
    local.put('local://picked/Résumé.PDF', bytes('hello'));
    const prepared = await preparer(local).prepare('local://picked/Résumé.PDF', 'PDF');
    expect(prepared).toEqual({ uri: 'local://prepared/rand.pdf', extension: 'pdf', byteCount: 5 });
    expect(local.files.has('local://picked/Résumé.PDF')).toBe(true);
  });

  it('drops an unsafe extension from the local name', async () => {
    const local = new FakeLocalFiles();
    local.put('local://p/a', bytes('x'));
    expect((await preparer(local).prepare('local://p/a', '../etc')).uri).toBe(
      'local://prepared/rand',
    );
  });

  it('rejects a file above the limit without leaving a copy', async () => {
    const local = new FakeLocalFiles();
    local.put('local://p/big', new Uint8Array(11));
    await expect(preparer(local).prepare('local://p/big', 'bin')).rejects.toMatchObject({
      kind: 'sourceTooLarge',
    });
    expect([...local.files.keys()]).toEqual(['local://p/big']);
  });

  it('rejects a missing or empty selection', async () => {
    const local = new FakeLocalFiles();
    local.put('local://p/empty', new Uint8Array(0));
    await expect(preparer(local).prepare('local://p/none', '')).rejects.toBeInstanceOf(
      FilePreparationError,
    );
    await expect(preparer(local).prepare('local://p/empty', '')).rejects.toMatchObject({
      kind: 'selectionUnavailable',
    });
    expect([...local.files.keys()]).toEqual(['local://p/empty']);
  });

  it('sweeps leftovers', async () => {
    const local = new FakeLocalFiles();
    local.put('local://prepared/old', bytes('x'));
    await preparer(local).cleanupRemnants();
    expect(local.files.size).toBe(0);
  });
});

describe('FileBrowserDownloads', () => {
  it('keeps same-named downloads apart and removes only its own', async () => {
    const local = new FakeLocalFiles();
    const mine = new FileBrowserDownloads(local, 'a');
    const other = new FileBrowserDownloads(local, 'b');
    const one = await mine.makeDestination('f.txt');
    const two = await mine.makeDestination('f.txt');
    expect(one).not.toBe(two);
    for (const uri of [one, two, await other.makeDestination('f.txt')]) local.put(uri, bytes('x'));
    await mine.remove(one);
    expect(local.files.has(one)).toBe(false);
    expect(local.files.has(two)).toBe(true);
    await mine.removeAll();
    expect([...local.files.keys()].filter((k) => k.startsWith('local://a/'))).toEqual([]);
    expect([...local.files.keys()].filter((k) => k.startsWith('local://b/')).length).toBe(1);
  });
});
