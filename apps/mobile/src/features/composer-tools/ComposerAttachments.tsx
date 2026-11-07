import {
  type ComposerAttachment,
  type ComposerStagingStore,
  type ComposerStore,
  isBusy,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { type ComposerAttachmentItem, ComposerAttachmentStrip } from '@openagentspocket/ui';
import { useSyncExternalStore } from 'react';

const PENDING_ID = 'pending';

interface Props {
  store: ComposerStore;
  attachments: readonly ComposerAttachment[];
  staging: ComposerStagingStore;
}

/** What goes with the next message: the standing attachments, then the one still on its way. */
export function ComposerAttachments({ store, attachments, staging }: Props) {
  useSyncExternalStore(
    staging.subscribe.bind(staging),
    () => staging.state,
    () => staging.state,
  );
  const busy = isBusy(staging.state);
  const { pending } = staging;
  const items: ComposerAttachmentItem[] = [...attachments];
  if (pending) {
    items.push({ ...pending, id: PENDING_ID, state: busy ? 'uploading' : 'failed' });
  }
  return (
    <ComposerAttachmentStrip
      items={items}
      onRemove={(id) => {
        if (id === PENDING_ID) void staging.perform(busy ? 'cancel' : 'dismiss');
        else store.removeAttachment(id);
      }}
      removeLabel={(name) => t('Remove %@', name)}
    />
  );
}
