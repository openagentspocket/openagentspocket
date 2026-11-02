import type { FileBrowserItem, FileBrowserStore } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { type ActionMenuItem, confirm } from '@openagentspocket/ui';
import { rowDetail } from './FileRow';
import { pickDocument, pickPhoto } from './pickers';

async function confirmDelete(store: FileBrowserStore, item: FileBrowserItem) {
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

/** The folder-level menu (uploads, refresh) and each row's long-press menu. */
export function fileMenus(store: FileBrowserStore, rename: (item: FileBrowserItem) => void) {
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
      onPress: () => rename(item),
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
