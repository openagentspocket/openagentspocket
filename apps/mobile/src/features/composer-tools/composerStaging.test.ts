import type { ComposerDraftPort, ComposerStagingStore } from '@openagentspocket/core';
import { attachmentActions, stagingFor } from './composerStaging';

jest.mock('expo-clipboard', () => ({ setStringAsync: async () => true }));

const picked = { uri: 'file:///cache/p.jpg', name: 'p.jpg', extension: 'jpg' };
const files = {
  size: async () => 10,
  readAll: async () => new Uint8Array(10),
  remove: async () => {},
};

describe('attachment actions', () => {
  it('picks a photo, stages it and inserts the Host path into the draft', async () => {
    const draft: string[] = [];
    const composer: ComposerDraftPort = { insertIntoDraft: (text) => draft.push(text) };
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
    expect(draft).toEqual(['/tmp/agentico/image.jpg ']);
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
});
