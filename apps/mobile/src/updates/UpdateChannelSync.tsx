import { updateChannel } from '@openagentspocket/core';
import { useEffect } from 'react';
import { useAppUpdates, useSetting } from '@/settings/SettingsProvider';

/**
 * Keeps the update channel in step with Early Updates: at launch and on every toggle. The channel
 * rides on the next update request, so a change takes effect from the next launch. Renders nothing.
 */
export function UpdateChannelSync() {
  const updates = useAppUpdates();
  const [early] = useSetting('earlyUpdates');
  useEffect(() => {
    if (updates.enabled) void updates.setChannel(updateChannel(early));
  }, [updates, early]);
  return null;
}
