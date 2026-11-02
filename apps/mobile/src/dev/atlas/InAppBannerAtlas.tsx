import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import Index from '@/app/index';
import { BannerLayer } from '@/notifications/InAppBanner';

const noop = () => {};

// iPhone 17 Pro: web has no safe area, so the atlas supplies the device's.
const IPHONE_INSETS = { top: 59, bottom: 34, left: 0, right: 0 };

const BLOCKED = {
  target: { hostId: 'demo', paneId: 'p1' },
  status: 'blocked',
  title: 'agentico · claude',
  body: { key: 'Blocked' },
  question: 'Do you want to make this edit to AgenticoAppModel.swift?',
};

/** The Home console with the in-app banner pinned below the status bar: a blocked Agent's question. */
export function InAppBannerAtlas() {
  return (
    <SafeAreaInsetsContext.Provider value={IPHONE_INSETS}>
      <Index />
      <BannerLayer banner={BLOCKED} animated={false} onPress={noop} onDismiss={noop} />
    </SafeAreaInsetsContext.Provider>
  );
}
