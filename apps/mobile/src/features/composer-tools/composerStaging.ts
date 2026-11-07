import {
  type AttachmentSource,
  type AttachmentStager,
  type ComposerDraftPort,
  ComposerStagingStore,
} from '@openagentspocket/core';
import * as Clipboard from 'expo-clipboard';
import type { Picked } from '@/files/pickers';
import { type AttachmentLocalFiles, attachmentSource } from './attachmentSources';

/** Where the attachment's bytes go: the Host's transport at upload time (the live app stages over SFTP). */
export type StageOnHost = AttachmentStager;

const stagings = new WeakMap<ComposerDraftPort, ComposerStagingStore>();

/**
 * The Agent's staging workflow, kept as long as its Composer: a rebuilt detail finds the same
 * in-flight upload, and the staged Host path lands in the same draft. One store per draft port.
 */
export function stagingFor(composer: ComposerDraftPort, stage: StageOnHost): ComposerStagingStore {
  let store = stagings.get(composer);
  if (!store) {
    store = new ComposerStagingStore({
      stage: { image: stage, file: stage },
      clipboard: { copy: (text) => Clipboard.setStringAsync(text).then(() => undefined) },
      composer,
    });
    stagings.set(composer, store);
  }
  return store;
}

export interface AttachmentPickers {
  pickPhoto(): Promise<Picked | null>;
  pickDocument(): Promise<Picked | null>;
  /** What the user made of a picked photo; null drops it. Absent: it goes as picked. */
  reviewImage?(picked: Picked): Promise<Picked | null>;
}

/** "Add Image" and "Add File": pick, then stage; a cancelled pick starts nothing. */
export function attachmentActions(
  staging: Pick<ComposerStagingStore, 'begin' | 'canBegin'>,
  pickers: AttachmentPickers,
  files: AttachmentLocalFiles,
): { addImage: () => void; addFile: () => void } {
  const run = (medium: 'image' | 'file', pick: () => Promise<Picked | null>) => () => {
    if (!staging.canBegin) return;
    void pick().then((picked) => {
      if (picked) staging.begin(attachmentSource(medium, picked, files) satisfies AttachmentSource);
    });
  };
  return {
    addImage: run('image', async () => {
      const picked = await pickers.pickPhoto();
      return picked && pickers.reviewImage ? pickers.reviewImage(picked) : picked;
    }),
    addFile: run('file', pickers.pickDocument),
  };
}
