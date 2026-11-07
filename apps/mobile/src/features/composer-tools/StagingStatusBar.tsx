import type { AttachmentCommand, ComposerStagingStore } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Banner, type IconName, type Tone } from '@openagentspocket/ui';
import { useSyncExternalStore } from 'react';
import { toolsText } from './text';

const COMMAND_LABEL = {
  cancel: () => t('Cancel'),
  retry: () => t('Retry'),
  dismiss: () => t('Dismiss'),
} as const satisfies Record<AttachmentCommand, () => string>;

const ICONS: Record<string, IconName> = {
  photo: 'camera',
  doc: 'file',
  'arrow.up.circle': 'arrowUp',
  'exclamationmark.triangle': 'warning',
};

/** staging-status-bar: what the attachment in flight is doing, with the commands that apply. */
export function StagingStatusBar({ store }: { store: ComposerStagingStore }) {
  useSyncExternalStore(
    store.subscribe.bind(store),
    () => store.state,
    () => store.state,
  );
  const shown = store.presentation;
  if (!shown) return null;
  const { state } = store;
  const failed = state.kind === 'failed' || state.kind === 'backgroundInterrupted';
  const tone: Tone = failed ? 'warning' : 'info';
  // Banner has one action and one dismiss: the primary command and Dismiss when offered.
  const primary = shown.commands.find((command) => command !== 'dismiss');
  const dismissible = shown.commands.includes('dismiss');
  return (
    <Banner
      title={toolsText(shown.title)}
      tone={tone}
      icon={ICONS[shown.icon]}
      actionLabel={primary ? COMMAND_LABEL[primary]() : undefined}
      onAction={primary ? () => void store.perform(primary) : undefined}
      onDismiss={dismissible ? () => void store.perform('dismiss') : undefined}
      dismissLabel={t('Dismiss')}
      testID="staging-status-bar"
    />
  );
}
