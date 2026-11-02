import type { FileBrowserItem, FileBrowserStore } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { type ActionMenuItem, confirm, prompt } from '@openagentspocket/ui';
import { rowDetail } from './FileRow';
import { pickDocument, pickPhoto } from './pickers';

/** files.delete-confirm: the host has no trash, so the notes say what goes and that it stays gone. */
export async function confirmDelete(store: FileBrowserStore, item: FileBrowserItem) {
  const notes = [
    rowDetail(item),
    item.kind === 'directory' ? t('Only an empty folder can be deleted.') : undefined,
    item.kind === 'symlink' ? t('Only the link is deleted, not what it points to.') : undefined,
    t('The Host has no trash: this cannot be undone.'),
  ].filter(Boolean);
  const ok = await confirm({
    title: t('Delete "%@"?', item.name),
    message: notes.join(' '),
    confirmLabel: t('Delete'),
    destructive: true,
  });
  if (ok) store.delete(item);
}

/** files.rename-alert: a centered alert with the name in a field; an existing name is never replaced. */
export async function promptRename(store: FileBrowserStore, item: FileBrowserItem) {
  const name = await prompt({
    title: t('Rename'),
    message: t('A new name for "%@". An existing name is never replaced.', item.name),
    initial: item.name,
    confirmLabel: t('Rename'),
    cancelLabel: t('Cancel'),
    testID: 'rename-field',
  });
  if (name !== null) store.rename(item, name);
}

/** The folder-level menu (uploads, refresh) and each row's long-press menu. */
export function fileMenus(store: FileBrowserStore) {
  const upload = async (pick: typeof pickDocument, asPhoto: boolean) => {
    const picked = await pick();
    if (!picked) return;
    if (asPhoto) store.importPhoto(picked.uri, picked.extension);
    else store.importFile(picked.uri, picked.name, picked.extension);
  };
  const folder: ActionMenuItem[] = [
    {
      key: 'file',
      title: t('Upload File'),
      icon: 'attach',
      onPress: () => void upload(pickDocument, false),
    },
    {
      key: 'photo',
      title: t('Upload Photo'),
      icon: 'add',
      onPress: () => void upload(pickPhoto, true),
    },
    { key: 'refresh', title: t('Refresh'), icon: 'refresh', onPress: () => store.refresh() },
  ];
  const row = (item: FileBrowserItem): ActionMenuItem[] => [
    ...(item.kind === 'directory'
      ? []
      : ([
          {
            key: 'share',
            title: t('Share…'),
            icon: 'send',
            onPress: () => store.requestFile(item, 'share'),
          },
          {
            key: 'save',
            title: t('Save to Files…'),
            icon: 'arrowDown',
            onPress: () => store.requestFile(item, 'saveToFiles'),
          },
        ] satisfies ActionMenuItem[])),
    {
      key: 'rename',
      title: t('Rename…'),
      icon: 'edit',
      disabled: !store.canRename(item),
      onPress: () => void promptRename(store, item),
    },
    {
      key: 'delete',
      title: t('Delete…'),
      icon: 'trash',
      destructive: true,
      disabled: !store.canDelete(item),
      onPress: () => void confirmDelete(store, item),
    },
  ];
  return { folder, row };
}
