import { formatByteCount } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { confirm, ListRow, Text } from '@openagentspocket/ui';
import { useCallback, useEffect, useState } from 'react';
import { useChatCache } from './SettingsProvider';

type State = { kind: 'measuring' } | { kind: 'measured'; bytes: number } | { kind: 'clearing' };

export const CLEAR_CACHE_ANCHOR = 'settings.chat.clearCache';

/** The confirm before Chat's cache is dropped (also what the atlas opens). */
export const confirmClearChatCache = () =>
  confirm({
    title: t('Clear Chat cache?'),
    message: t('Chat reloads messages from each Host the next time you open it.'),
    confirmLabel: t('Clear Cache'),
    destructive: true,
    presentation: 'popover',
    anchorKey: CLEAR_CACHE_ANCHOR,
  });

/** How much Chat keeps on this device, and the confirmed way to drop it. */
export function ChatCacheRows() {
  const cache = useChatCache();
  const [state, setState] = useState<State>({ kind: 'measuring' });

  useEffect(() => {
    let alive = true;
    cache.diskUsage().then((bytes) => {
      if (alive) setState((now) => (now.kind === 'clearing' ? now : { kind: 'measured', bytes }));
    });
    return () => {
      alive = false;
    };
  }, [cache]);

  const clear = useCallback(async () => {
    const ok = await confirmClearChatCache();
    if (!ok) return;
    setState({ kind: 'clearing' });
    await cache.removeAll();
    setState({ kind: 'measured', bytes: await cache.diskUsage() });
  }, [cache]);

  const size = state.kind === 'measured' ? formatByteCount(state.bytes) : null;
  return (
    <>
      <ListRow
        title={t('Cached Messages')}
        trailing={size ? <Text tone="secondary">{`${size.value} ${size.unit}`}</Text> : undefined}
        testID="settings.chat.cacheSize"
      />
      <ListRow
        title={t('Clear Chat Cache')}
        disabled={state.kind !== 'measured' || state.bytes === 0}
        onPress={() => void clear()}
        anchorKey={CLEAR_CACHE_ANCHOR}
        testID="settings.chat.clearCache"
      />
    </>
  );
}
