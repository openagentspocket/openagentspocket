import type {
  ComposerAttachmentPort,
  ComposerStagingStore,
  StagedAttachment,
} from '@openagentspocket/core';
import { attachmentActions, releaseAttachmentPreview, stagingFor } from './composerStaging';

const picked = { uri: 'file:///cache/p.jpg', name: 'p.jpg', extension: 'jpg' };
const files = {
  size: async () => 10,
  readAll: async () => new Uint8Array(10),
  remove: async () => {},
};

describe('attachment actions', () => {
  it('picks a photo, stages it and hands the Composer the attachment with its preview', async () => {
    const attached: StagedAttachment[] = [];
    const composer: ComposerAttachmentPort = { attach: (item) => attached.push(item) };
    const stage = jest.fn(async () => '/tmp/agentico/image.jpg');
    const staging = stagingFor(composer, stage);
    expect(stagingFor(composer, stage)).toBe(staging);
    const pickPhoto = jest.fn(async () => picked);
    const { addImage } = attachmentActions(staging, { pickPhoto, pickDocument: jest.fn() }, files);
    addImage();
    // The pick resolves first, then the staging begins.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await staging.settled();
    expect(pickPhoto).toHaveBeenCalledTimes(1);
    expect(stage).toHaveBeenCalledTimes(1);
    expect(attached).toEqual([
      {
        medium: 'image',
        name: 'p.jpg',
        previewUri: picked.uri,
        hostPath: '/tmp/agentico/image.jpg',
      },
    ]);
  });

  it('starts nothing when the pick is cancelled or one attachment is already in flight', async () => {
    const stage = jest.fn(async () => '/tmp/x');
    const staging: Pick<ComposerStagingStore, 'begin' | 'canBegin'> = {
      begin: jest.fn(() => 1),
      canBegin: true,
    };
    const cancelled = attachmentActions(
      staging,
      { pickPhoto: async () => null, pickDocument: async () => null },
      files,
    );
    cancelled.addFile();
    await Promise.resolve();
    expect(staging.begin).not.toHaveBeenCalled();
    const busy = attachmentActions(
      { begin: jest.fn(), canBegin: false },
      { pickPhoto: jest.fn(), pickDocument: jest.fn() },
      files,
    );
    busy.addImage();
    expect(stage).not.toHaveBeenCalled();
  });

  it("deletes a released preview, and a failed delete is nobody's problem", async () => {
    const remove = jest.fn(async () => {
      throw new Error('gone');
    });
    const release = releaseAttachmentPreview({ remove });
    release({ medium: 'file', name: 'a.md', hostPath: '/tmp/a.md' });
    expect(remove).not.toHaveBeenCalled();
    release({ medium: 'image', name: 'a', hostPath: '/tmp/a', previewUri: 'file:///a.jpg' });
    expect(remove).toHaveBeenCalledWith('file:///a.jpg');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
});
