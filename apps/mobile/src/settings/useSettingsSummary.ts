import { t } from '@openagentspocket/i18n';
import { useEffect, useState } from 'react';
import { useHosts } from '@/features/hosts/useHosts';
import { useNotificationServices } from '@/notifications/services';

export interface SettingsSummary {
  /** On, Off or Failed: the value of the Notifications row. */
  notifications?: string;
  hostCount: number;
}

/** The live values the root rows show on their right edge. */
export function useSettingsSummary(): SettingsSummary {
  const { pushToken } = useNotificationServices();
  const hosts = useHosts();
  const [notifications, setNotifications] = useState<string>();
  useEffect(() => {
    let live = true;
    void pushToken.state().then((state) => {
      if (!live) return;
      if (state.kind === 'registered') setNotifications(t('On'));
      else if (state.kind === 'failed') setNotifications(t('Failed'));
      else if (state.kind === 'needsPermission' || state.kind === 'denied')
        setNotifications(t('Off'));
    });
    return () => {
      live = false;
    };
  }, [pushToken]);
  return { notifications, hostCount: hosts.hosts.length };
}
