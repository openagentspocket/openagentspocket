import {
  type AttachmentSource,
  type AttachmentStager,
  type ComposerAttachmentPort,
  ComposerStagingStore,
  type LocalFiles,
  type StagedAttachment,
} from '@openagentspocket/core';
import type { Picked } from '@/files/pickers';
import { type AttachmentLocalFiles, attachmentSource } from './attachmentSources';

/** Where the attachment's bytes go: the Host's transport at upload time (the live app stages over SFTP). */
export type StageOnHost = AttachmentStager;

const stagings = new WeakMap<ComposerAttachmentPort, ComposerStagingStore>();

/**
 * The Agent's staging workflow, kept as long as its Composer: a rebuilt detail finds the same
 * in-flight upload, and the staged attachment joins the same Composer. One store per Composer.
 */
export function stagingFor(
  composer: ComposerAttachmentPort,
  stage: StageOnHost,
): ComposerStagingStore {
  let store = stagings.get(composer);
  if (!store) {
    store = new ComposerStagingStore({
      stage: { image: stage, file: stage },
      composer,
    });
    stagings.set(composer, store);
  }
  return store;
}

/** Deletes an attachment's local preview once the Composer is done with it. */
export function releaseAttachmentPreview(files: Pick<LocalFiles, 'remove'>) {
  return ({ previewUri }: StagedAttachment): void => {
    // A leftover copy lives in the app's cache, which the system trims.
    if (previewUri !== undefined) void Promise.resolve(files.remove(previewUri)).catch(() => {});
  };
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
