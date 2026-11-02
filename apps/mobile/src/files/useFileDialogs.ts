import {
  type CollisionChoice,
  type FileBrowserState,
  type FileBrowserStore,
  formatBytes,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { confirm } from '@openagentspocket/ui';
import { useEffect } from 'react';
import { renderMessage } from '@/lib/renderText';
import { deliver } from './deliver';

/** Asks about a download that needs the user's word first (secrets, large files, big shares). */
async function askDownload(
  store: FileBrowserStore,
  pending: NonNullable<FileBrowserState['pendingDownload']>,
) {
  const name = pending.item.name;
  const size = formatBytes(pending.item.size ?? 0);
  if (pending.reason === 'secret') {
    const ok = await confirm({
      title: t('"%@" may contain secrets', name),
      message: t('Its name suggests keys or credentials. Download a copy to this device anyway?'),
      confirmLabel: t('Download'),
    });
    return ok ? store.confirmPendingDownload() : store.cancelPendingDownload();
  }
  if (pending.reason === 'large') {
    const choice = await confirm({
      title: t('Download "%@"?', name),
      message: t('%@ is too large to preview. Download it to share it or save it to Files.', size),
      actions: [
        { key: 'share', title: t('Share…') },
        { key: 'saveToFiles', title: t('Save to Files…') },
      ],
    });
    return choice ? store.confirmPendingDownload(choice) : store.cancelPendingDownload();
  }
  const saving = pending.intent === 'saveToFiles';
  const ok = await confirm({
    title: t('Download "%@"?', name),
    message: saving
      ? t('%@ downloads to this device before it is saved to Files.', size)
      : t('%@ downloads to this device before it can be shared.', size),
    confirmLabel: t('Download'),
  });
  return ok ? store.confirmPendingDownload() : store.cancelPendingDownload();
}

async function askCollision(
  store: FileBrowserStore,
  collision: NonNullable<FileBrowserState['pendingCollision']>,
) {
  const detail =
    collision.existingKind === 'directory'
      ? t('A folder has that name. Keep Both uploads it under a new name.')
      : collision.existingKind === 'symlink'
        ? t(
            'A link has that name, and Files never replaces a link. Keep Both uploads it under a new name.',
          )
        : t('Keep Both uploads it under a new name; Replace overwrites the file on the Host.');
  const actions = [
    { key: 'keepBoth', title: t('Keep Both') },
    ...(collision.canReplace ? [{ key: 'replace', title: t('Replace'), destructive: true }] : []),
  ];
  const choice = await confirm({
    title: t('"%@" already exists', collision.upload.name),
    message: detail,
    actions,
  });
  store.resolveCollision((choice ?? 'cancel') as CollisionChoice);
}

/** Presents the store's pending questions, notices and finished downloads, one at a time. */
export function useFileDialogs(store: FileBrowserStore, state: FileBrowserState) {
  const { pendingDownload, pendingCollision, notice, delivery } = state;
  useEffect(() => {
    if (pendingDownload) void askDownload(store, pendingDownload);
  }, [store, pendingDownload]);
  useEffect(() => {
    if (pendingCollision) void askCollision(store, pendingCollision);
  }, [store, pendingCollision]);
  useEffect(() => {
    if (!notice) return;
    void confirm({
      title: t('Files'),
      message: renderMessage(notice),
      cancelLabel: null,
      confirmLabel: t('OK'),
    }).then(() => store.dismissNotice());
  }, [store, notice]);
  useEffect(() => {
    if (delivery) void deliver(delivery).finally(() => store.finishDelivery());
  }, [store, delivery]);
}
