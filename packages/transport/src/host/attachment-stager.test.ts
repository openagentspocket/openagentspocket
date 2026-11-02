import { AttachmentError, ComposerStagingStore } from '@openagentspocket/core';
import type { FakeSession } from 'agentico-ssh';
import { describe, expect, it } from 'vitest';
import { connected } from '../test-helpers';
import { attachmentStager, type StageableAttachment } from './attachment-stager';
import { cLocale } from './shell';

const parent = '/tmp/agentico.AbCd1234';
const stageExec = {
  [cLocale(
    `/bin/sh -c 'umask 077; directory=$(mktemp -d "\${TMPDIR:-/tmp}/agentico.XXXXXXXX") || exit 1; printf "__AGENTICO_STAGE_DIR__=%s\\n" "$directory"'`,
  )]: { exitCode: 0, stdout: `__AGENTICO_STAGE_DIR__=${parent}\n`, stderr: '' },
};

function attachment(
  bytes: Uint8Array,
  medium: 'image' | 'file',
  removed: string[],
): StageableAttachment {
  return {
    medium,
    byteCount: bytes.length,
    remoteFilename: medium === 'image' ? 'image.png' : 'notes.txt',
    read: async () => bytes,
    remove: () => void removed.push(medium),
  };
}

describe('attachmentStager through the staging store', () => {
  it('uploads an image over SFTP and inserts its Host path into the draft', async () => {
    const { transport, ssh } = await connected(
      () => new Uint8Array(),
      {},
      { exec: stageExec, directories: [parent] },
    );
    const removed: string[] = [];
    const draft: string[] = [];
    const stage = attachmentStager(transport);
    const store = new ComposerStagingStore({
      stage: { image: stage, file: stage },
      clipboard: { copy: () => {} },
      composer: { insertIntoDraft: (text) => draft.push(text) },
    });
    store.begin({
      medium: 'image',
      prepare: async () => attachment(new Uint8Array([9, 8, 7]), 'image', removed),
    });
    await store.settled();
    expect(store.state.kind).toBe('completed');
    const inserted = draft[0] ?? '';
    expect(inserted.endsWith(' ')).toBe(true);
    const path = inserted.trimEnd();
    expect(path.startsWith(`${parent}/stage-`)).toBe(true);
    expect(path.endsWith('/image.png')).toBe(true);
    expect((ssh.sessions[0] as FakeSession).files.get(path)).toEqual(new Uint8Array([9, 8, 7]));
    expect(removed).toEqual(['image']);
  });

  it('turns a Host without a temporary directory into a non-retryable AttachmentError', async () => {
    const { transport } = await connected(() => new Uint8Array());
    const stage = attachmentStager(transport);
    const thrown = await stage(attachment(new Uint8Array([1]), 'file', []), {
      onProgress: () => {},
      signal: { aborted: false, addEventListener: () => {}, removeEventListener: () => {} },
    }).catch((error: unknown) => error);
    expect(thrown).toBeInstanceOf(AttachmentError);
    expect((thrown as AttachmentError).kind).toBe('remoteTemporaryDirectoryFailed');
  });
});
