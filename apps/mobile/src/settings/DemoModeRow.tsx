import { t } from '@openagentspocket/i18n';
import { ToggleRow } from '@openagentspocket/ui';
import { useSyncExternalStore } from 'react';
import {
  isDemoMode,
  isDemoModeForced,
  setDemoModeSetting,
  subscribeDemoMode,
} from '@/connections/mode';

/** The Demo Mode switch: scripted sample data instead of live Hosts. A build flag overrides it. */
export function DemoModeRow() {
  const on = useSyncExternalStore(subscribeDemoMode, isDemoMode);
  const forced = isDemoModeForced();
  return (
    <ToggleRow
      title={t('Demo Mode')}
      subtitle={
        forced
          ? t('Demo mode is set by the EXPO_PUBLIC_DEMO build flag.')
          : t('Show scripted sample data instead of connecting to your Hosts.')
      }
      value={on}
      disabled={forced}
      onValueChange={setDemoModeSetting}
      testID="settings.general.demoMode"
    />
  );
}
