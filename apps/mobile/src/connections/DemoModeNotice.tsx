import { t } from '@openagentspocket/i18n';
import { Banner } from '@openagentspocket/ui';
import { isDemoModeForced, setDemoModeSetting } from './mode';
import { useDemoMode } from './useDemoMode';

/**
 * Says the Agents on screen are sample data while demo mode is on, with the way out (the same
 * remembered switch as Settings › General › Demo Mode). A forced demo (the dev flag the simulator
 * flows and atlases build with, or a test override) draws nothing: the switch cannot change there,
 * and those screenshots stay as they were.
 */
export function DemoModeNotice() {
  const on = useDemoMode();
  if (!on || isDemoModeForced()) return null;
  return (
    <Banner
      look="row"
      tone="info"
      icon="sparkles"
      title={t('Demo Mode')}
      message={t('These Agents and Hosts are sample data.')}
      actionLabel={t('Leave Demo')}
      onAction={() => setDemoModeSetting(false)}
      testID="demo-mode-notice"
    />
  );
}
